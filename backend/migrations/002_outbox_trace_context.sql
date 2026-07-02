-- Adds lightweight distributed trace metadata to the telemetry outbox.
-- Runtime bootstrap also applies this column defensively for local/dev stacks.

ALTER TABLE telemetry_outbox
ADD COLUMN IF NOT EXISTS trace_context JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_telemetry_outbox_trace_id
ON telemetry_outbox ((trace_context->>'traceId'))
WHERE trace_context IS NOT NULL;
