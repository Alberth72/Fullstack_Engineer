-- Formal TimescaleDB migration for telemetry_events.
--
-- Goal:
-- - Keep telemetry_events as the time-series table.
-- - Make telemetry_events compatible with TimescaleDB hypertables by using
--   PRIMARY KEY (id, timestamp), because Timescale unique indexes must include
--   the partitioning time column.
-- - Preserve idempotency by event id through telemetry_event_ingest_ids.
-- - Migrate existing data without dropping telemetry payload rows.
--
-- Recommended validation before running:
--   GET /api/telemetry/admin/storage/readiness
--
-- Recommended validation after running:
--   SELECT * FROM timescaledb_information.hypertables
--   WHERE hypertable_name = 'telemetry_events';
--
-- Rollback note:
-- - Do not blindly recreate PRIMARY KEY (id) after the table becomes a
--   hypertable; TimescaleDB will reject unique indexes that omit timestamp.
-- - If rollback is required, restore from backup or keep PostgreSQL table mode.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS telemetry_event_ingest_ids (
  id TEXT PRIMARY KEY,
  event_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO telemetry_event_ingest_ids (id, event_timestamp)
SELECT DISTINCT ON (id) id, timestamp
FROM telemetry_events
ORDER BY id, timestamp DESC
ON CONFLICT (id) DO UPDATE
SET event_timestamp = EXCLUDED.event_timestamp,
    updated_at = NOW();

DO $$
DECLARE
  pk_name TEXT;
  pk_columns TEXT[];
BEGIN
  SELECT con.conname, array_agg(att.attname ORDER BY key.ordinality)
  INTO pk_name, pk_columns
  FROM pg_constraint con
  JOIN unnest(con.conkey) WITH ORDINALITY AS key(attnum, ordinality)
    ON TRUE
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum = key.attnum
  WHERE con.conrelid = 'telemetry_events'::regclass
    AND con.contype = 'p'
  GROUP BY con.conname;

  IF pk_name IS NOT NULL AND pk_columns = ARRAY['id'] THEN
    EXECUTE format('ALTER TABLE telemetry_events DROP CONSTRAINT %I', pk_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'telemetry_events'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE telemetry_events
    ADD CONSTRAINT telemetry_events_pkey PRIMARY KEY (id, timestamp);
  END IF;
END $$;

SELECT create_hypertable(
  'telemetry_events',
  'timestamp',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_vehicle_ts
ON telemetry_events (vehicle_id, timestamp DESC);

DO $$
BEGIN
  PERFORM remove_retention_policy('telemetry_events', if_exists => TRUE);
  PERFORM add_retention_policy('telemetry_events', INTERVAL '30 days', if_not_exists => TRUE);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_function THEN
    NULL;
END $$;
