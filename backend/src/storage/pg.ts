import { Pool } from "pg";
import type { AgentTraceRecord } from "./agentAuditTypes";
import { FleetVehicleState, TelemetryEvent } from "../types/telemetry";
import { CircuitBreaker, withRetry } from "../utils/resilience";
import type {
  TelemetryOutboxRecord,
  TelemetryOutboxStatus,
  TelemetryOutboxSummary,
} from "./outboxTypes";
import { getAgentAuditConfig } from "../agent/agentAuditConfig";
import {
  dedupeTelemetryEventsById,
  emptyTelemetryWriteResult,
  type TelemetryWriteResult,
} from "./telemetryWriteStats";

const connectionString =
  process.env.DATABASE_URL || "postgres://fleet:fleet@localhost:5432/fleet";

const pool = new Pool({
  connectionString,
  max: 10,
});

const dbBreaker = new CircuitBreaker(
  parseInt(process.env.DB_BREAKER_THRESHOLD || "3", 10),
  parseInt(process.env.DB_BREAKER_COOLDOWN_MS || "10000", 10)
);

const INSERT_CHUNK_SIZE = Math.max(
  1,
  parseInt(process.env.TELEMETRY_INSERT_CHUNK_SIZE || "1000", 10) || 1000
);

let initialized = false;

async function ensureSchema() {
  if (initialized) return;

  await pool.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`).catch(() => null);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      latitude DOUBLE PRECISION NULL,
      longitude DOUBLE PRECISION NULL,
      speed DOUBLE PRECISION NULL,
      status TEXT NULL,
      timestamp TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_vehicle_ts
    ON telemetry_events (vehicle_id, timestamp DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS telemetry_outbox (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 8,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ NULL,
      last_error TEXT NULL,
      published_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_outbox_pending
    ON telemetry_outbox (status, next_attempt_at, created_at);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_traces (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      specialist TEXT NOT NULL,
      mode TEXT NOT NULL,
      question TEXT NOT NULL,
      answer JSONB NOT NULL,
      tool TEXT NULL,
      tools JSONB NOT NULL DEFAULT '[]'::jsonb,
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      history JSONB NOT NULL DEFAULT '[]'::jsonb,
      error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_agent_traces_conversation_created
    ON agent_traces (conversation_id, created_at DESC);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'timescaledb'
      ) THEN
        BEGIN
          PERFORM create_hypertable('telemetry_events', 'timestamp', if_not_exists => TRUE);
        EXCEPTION
          WHEN duplicate_table THEN
            NULL;
          WHEN undefined_function THEN
            NULL;
        END;

        BEGIN
          PERFORM add_retention_policy('telemetry_events', INTERVAL '30 days', if_not_exists => TRUE);
        EXCEPTION
          WHEN duplicate_object THEN
            NULL;
          WHEN undefined_function THEN
            NULL;
        END;
      END IF;
    END $$;
  `).catch(() => null);

  initialized = true;
}

async function executeDb<T>(fn: () => Promise<T>): Promise<T> {
  if (!dbBreaker.canExecute()) {
    throw new Error("db_circuit_open");
  }

  try {
    const result = await withRetry(fn, {
      attempts: parseInt(process.env.DB_RETRY_ATTEMPTS || "3", 10),
      baseDelayMs: parseInt(process.env.DB_RETRY_BASE_DELAY_MS || "150", 10),
      maxDelayMs: parseInt(process.env.DB_RETRY_MAX_DELAY_MS || "1200", 10),
    });
    dbBreaker.success();
    return result;
  } catch (err) {
    dbBreaker.failure();
    throw err;
  }
}

export async function insertEvent(event: TelemetryEvent) {
  return insertEvents([event]);
}

function buildInsertStatement(events: TelemetryEvent[]) {
  const values: unknown[] = [];
  const rows = events
    .map((event, index) => {
      const base = index * 7;
      values.push(
        event.id,
        event.vehicle_id,
        event.latitude,
        event.longitude,
        event.speed,
        event.status,
        event.timestamp
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, to_timestamp($${base + 7} / 1000.0))`;
    })
    .join(", ");

  return { values, rows };
}

function chunkEvents(events: TelemetryEvent[], chunkSize: number) {
  const chunks: TelemetryEvent[][] = [];

  for (let index = 0; index < events.length; index += chunkSize) {
    chunks.push(events.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function insertEvents(events: TelemetryEvent[]) {
  if (!events.length) return;
  const { uniqueEvents } = dedupeTelemetryEventsById(events);

  return executeDb(async () => {
    await ensureSchema();
    for (const chunk of chunkEvents(uniqueEvents, INSERT_CHUNK_SIZE)) {
      const { values, rows } = buildInsertStatement(chunk);
      await pool.query(
        `
        INSERT INTO telemetry_events (id, vehicle_id, latitude, longitude, speed, status, timestamp)
        VALUES ${rows}
        ON CONFLICT (id) DO UPDATE
        SET vehicle_id = EXCLUDED.vehicle_id,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            speed = EXCLUDED.speed,
            status = EXCLUDED.status,
            timestamp = EXCLUDED.timestamp
        `,
        values
      );
    }
  });
}

export async function saveEventsWithOutbox(
  events: TelemetryEvent[]
): Promise<TelemetryWriteResult> {
  if (!events.length) return emptyTelemetryWriteResult("postgres");

  const { uniqueEvents, duplicateInBatch } = dedupeTelemetryEventsById(events);

  return executeDb(async () => {
    await ensureSchema();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const uniqueIds = uniqueEvents.map((event) => event.id);
      const existing = await client.query<{ id: string }>(
        `
        SELECT id
        FROM telemetry_events
        WHERE id = ANY($1::text[])
        `,
        [uniqueIds]
      );
      const existingIds = new Set(existing.rows.map((row) => row.id));
      let outboxCreated = 0;

      for (const chunk of chunkEvents(uniqueEvents, INSERT_CHUNK_SIZE)) {
        const { values, rows } = buildInsertStatement(chunk);
        await client.query(
          `
          INSERT INTO telemetry_events (id, vehicle_id, latitude, longitude, speed, status, timestamp)
          VALUES ${rows}
          ON CONFLICT (id) DO UPDATE
          SET vehicle_id = EXCLUDED.vehicle_id,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              speed = EXCLUDED.speed,
              status = EXCLUDED.status,
              timestamp = EXCLUDED.timestamp
          `,
          values
        );

        const outboxValues: unknown[] = [];
        const outboxRows = chunk
          .map((event, index) => {
            const base = index * 2;
            outboxValues.push(event.id, JSON.stringify(event));
            return `($${base + 1}, $${base + 2}::jsonb)`;
          })
          .join(", ");

        await client.query(
          `
          INSERT INTO telemetry_outbox (id, payload)
          VALUES ${outboxRows}
          ON CONFLICT (id) DO NOTHING
          RETURNING id
          `,
          outboxValues
        ).then((result) => {
          outboxCreated += result.rowCount ?? 0;
        });
      }

      await client.query("COMMIT");
      return {
        storage: "postgres",
        received: events.length,
        unique: uniqueEvents.length,
        inserted: uniqueEvents.length - existingIds.size,
        updated: existingIds.size,
        duplicateInBatch,
        outboxCreated,
        outboxSkipped: uniqueEvents.length - outboxCreated,
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => null);
      throw err;
    } finally {
      client.release();
    }
  });
}

export async function getFleetState(): Promise<FleetVehicleState[]> {
  return executeDb(async () => {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      vehicle_id: string;
      latitude: number | null;
      longitude: number | null;
      speed: number | null;
      status: string | null;
      timestamp_ms: string;
    }>(
      `
      SELECT DISTINCT ON (vehicle_id)
        id,
        vehicle_id,
        latitude,
        longitude,
        speed,
        status,
        (EXTRACT(EPOCH FROM timestamp) * 1000)::bigint::text AS timestamp_ms
      FROM telemetry_events
      ORDER BY vehicle_id, timestamp DESC
      `
    );

    return result.rows.map((row) => ({
      vehicle_id: row.vehicle_id,
      latitude: row.latitude,
      longitude: row.longitude,
      speed: row.speed,
      status: row.status,
      lastSeen: Number(row.timestamp_ms),
    }));
  });
}

export async function getEventsForVehicle(
  vehicle_id: string,
  limit = 100
): Promise<TelemetryEvent[]> {
  return executeDb(async () => {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      vehicle_id: string;
      latitude: number | null;
      longitude: number | null;
      speed: number | null;
      status: string | null;
      timestamp_ms: string;
    }>(
      `
      SELECT
        id,
        vehicle_id,
        latitude,
        longitude,
        speed,
        status,
        (EXTRACT(EPOCH FROM timestamp) * 1000)::bigint::text AS timestamp_ms
      FROM telemetry_events
      WHERE vehicle_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
      `,
      [vehicle_id, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      vehicle_id: row.vehicle_id,
      latitude: row.latitude,
      longitude: row.longitude,
      speed: row.speed,
      status: row.status,
      timestamp: Number(row.timestamp_ms),
    }));
  });
}

export async function getFastestVehicles(minSpeed = 0, limit = 5) {
  return executeDb(async () => {
    await ensureSchema();
    const result = await pool.query<{
      vehicle_id: string;
      max_speed: number;
      max_speed_at_ms: string | null;
      last_seen_ms: string | null;
      event_count: string;
    }>(
      `
      WITH per_vehicle AS (
        SELECT
          vehicle_id,
          MAX(speed) AS max_speed,
          COUNT(*)::text AS event_count,
          MAX(timestamp) AS last_seen
        FROM telemetry_events
        WHERE speed IS NOT NULL
        GROUP BY vehicle_id
      )
      SELECT
        vehicle_id,
        max_speed,
        (EXTRACT(EPOCH FROM last_seen) * 1000)::bigint::text AS last_seen_ms,
        NULL::text AS max_speed_at_ms,
        event_count
      FROM per_vehicle
      WHERE max_speed >= $1
      ORDER BY max_speed DESC, last_seen DESC, vehicle_id ASC
      LIMIT $2
      `,
      [minSpeed, limit]
    );

    return {
      minSpeed,
      vehicles: result.rows.map((row) => ({
        vehicle_id: row.vehicle_id,
        maxSpeed: Number(row.max_speed),
        maxSpeedAt: row.max_speed_at_ms ? Number(row.max_speed_at_ms) : null,
        lastSeen: row.last_seen_ms ? Number(row.last_seen_ms) : null,
        eventCount: Number(row.event_count),
      })),
    };
  });
}

export async function getTelemetryStats() {
  return executeDb(async () => {
    await ensureSchema();
    const result = await pool.query<{
      total_events: string;
      total_vehicles: string;
      last_event_at: string | null;
    }>(
      `
      SELECT
        COUNT(*)::text AS total_events,
        COUNT(DISTINCT vehicle_id)::text AS total_vehicles,
        (EXTRACT(EPOCH FROM MAX(timestamp)) * 1000)::bigint::text AS last_event_at
      FROM telemetry_events
      `
    );

    return {
      totalEvents: Number(result.rows[0]?.total_events ?? 0),
      totalVehicles: Number(result.rows[0]?.total_vehicles ?? 0),
      lastEventAt: result.rows[0]?.last_event_at ? Number(result.rows[0].last_event_at) : null,
    };
  });
}

export async function claimPendingOutbox(limit: number, lockTimeoutMs: number) {
  return executeDb(async () => {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      payload: TelemetryEvent;
      attempts: number;
      max_attempts: number;
      status: string;
      next_attempt_at_ms: string;
      locked_at_ms: string | null;
      last_error: string | null;
      published_at_ms: string | null;
    }>(
      `
      WITH due AS (
        SELECT id
        FROM telemetry_outbox
        WHERE status IN ('pending', 'retry', 'processing')
          AND next_attempt_at <= NOW()
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE telemetry_outbox outbox
      SET status = 'processing',
          attempts = outbox.attempts + 1,
          locked_at = NOW(),
          next_attempt_at = NOW() + ($2 * INTERVAL '1 millisecond'),
          updated_at = NOW()
      FROM due
      WHERE outbox.id = due.id
      RETURNING
        outbox.id,
        outbox.payload,
        outbox.attempts,
        outbox.max_attempts,
        outbox.status,
        (EXTRACT(EPOCH FROM outbox.next_attempt_at) * 1000)::bigint::text AS next_attempt_at_ms,
        (EXTRACT(EPOCH FROM outbox.locked_at) * 1000)::bigint::text AS locked_at_ms,
        outbox.last_error,
        CASE
          WHEN outbox.published_at IS NULL THEN NULL
          ELSE (EXTRACT(EPOCH FROM outbox.published_at) * 1000)::bigint::text
        END AS published_at_ms
      `,
      [limit, lockTimeoutMs]
    );

    return result.rows.map((row) => ({
      id: row.id,
      payload: row.payload,
      status: row.status as TelemetryOutboxRecord["status"],
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextAttemptAt: Number(row.next_attempt_at_ms),
      lockedAt: row.locked_at_ms ? Number(row.locked_at_ms) : null,
      lastError: row.last_error,
      publishedAt: row.published_at_ms ? Number(row.published_at_ms) : null,
    }));
  });
}

export async function markOutboxPublished(ids: string[]) {
  if (!ids.length) return;

  return executeDb(async () => {
    await ensureSchema();
    await pool.query(
      `
      UPDATE telemetry_outbox
      SET status = 'published',
          published_at = NOW(),
          locked_at = NULL,
          last_error = NULL,
          updated_at = NOW()
      WHERE id = ANY($1::text[])
      `,
      [ids]
    );
  });
}

export async function markOutboxRetry(
  id: string,
  error: string,
  delayMs: number,
  attempts: number,
  maxAttempts: number
) {
  return executeDb(async () => {
    await ensureSchema();
    const shouldDead = attempts >= maxAttempts;
    await pool.query(
      `
      UPDATE telemetry_outbox
      SET status = $2,
          last_error = $3,
          locked_at = NULL,
          next_attempt_at = CASE
            WHEN $2 = 'dead' THEN NOW()
            ELSE NOW() + ($4 * INTERVAL '1 millisecond')
          END,
          published_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [id, shouldDead ? "dead" : "retry", error, delayMs]
    );
  });
}

export async function markOutboxDead(id: string, error: string, attempts: number) {
  return markOutboxRetry(id, error, 0, attempts, attempts);
}

function buildEmptyOutboxStatusCounts(): Record<TelemetryOutboxStatus, number> {
  return {
    pending: 0,
    processing: 0,
    retry: 0,
    published: 0,
    dead: 0,
  };
}

export async function getOutboxSummary(): Promise<TelemetryOutboxSummary> {
  return executeDb(async () => {
    await ensureSchema();
    const generatedAt = Date.now();
    const summary = await pool.query<{
      total: string;
      pending_count: string;
      processing_count: string;
      retry_count: string;
      published_count: string;
      dead_count: string;
      ready_to_publish: string;
      blocked_until_later: string;
      oldest_pending_at_ms: string | null;
      next_attempt_at_ms: string | null;
      latest_published_at_ms: string | null;
    }>(
      `
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_count,
        COUNT(*) FILTER (WHERE status = 'processing')::text AS processing_count,
        COUNT(*) FILTER (WHERE status = 'retry')::text AS retry_count,
        COUNT(*) FILTER (WHERE status = 'published')::text AS published_count,
        COUNT(*) FILTER (WHERE status = 'dead')::text AS dead_count,
        COUNT(*) FILTER (
          WHERE status IN ('pending', 'processing', 'retry')
            AND next_attempt_at <= NOW()
        )::text AS ready_to_publish,
        COUNT(*) FILTER (
          WHERE status IN ('pending', 'processing', 'retry')
            AND next_attempt_at > NOW()
        )::text AS blocked_until_later,
        (
          EXTRACT(EPOCH FROM MIN(next_attempt_at) FILTER (
            WHERE status IN ('pending', 'processing', 'retry')
          )) * 1000
        )::bigint::text AS oldest_pending_at_ms,
        (
          EXTRACT(EPOCH FROM MIN(next_attempt_at) FILTER (
            WHERE status IN ('pending', 'processing', 'retry')
              AND next_attempt_at > NOW()
          )) * 1000
        )::bigint::text AS next_attempt_at_ms,
        (
          EXTRACT(EPOCH FROM MAX(published_at) FILTER (
            WHERE published_at IS NOT NULL
          )) * 1000
        )::bigint::text AS latest_published_at_ms
      FROM telemetry_outbox
      `
    );
    const errorSamples = await pool.query<{
      id: string;
      vehicle_id: string | null;
      status: TelemetryOutboxStatus;
      attempts: number;
      max_attempts: number;
      next_attempt_at_ms: string;
      last_error: string | null;
    }>(
      `
      SELECT
        id,
        payload->>'vehicle_id' AS vehicle_id,
        status,
        attempts,
        max_attempts,
        (EXTRACT(EPOCH FROM next_attempt_at) * 1000)::bigint::text AS next_attempt_at_ms,
        last_error
      FROM telemetry_outbox
      WHERE status IN ('dead', 'retry')
        AND last_error IS NOT NULL
      ORDER BY updated_at DESC, id ASC
      LIMIT 5
      `
    );

    const row = summary.rows[0];
    const byStatus = buildEmptyOutboxStatusCounts();
    byStatus.pending = Number(row?.pending_count ?? 0);
    byStatus.processing = Number(row?.processing_count ?? 0);
    byStatus.retry = Number(row?.retry_count ?? 0);
    byStatus.published = Number(row?.published_count ?? 0);
    byStatus.dead = Number(row?.dead_count ?? 0);

    return {
      generatedAt,
      storage: "postgres",
      total: Number(row?.total ?? 0),
      byStatus,
      readyToPublish: Number(row?.ready_to_publish ?? 0),
      blockedUntilLater: Number(row?.blocked_until_later ?? 0),
      oldestPendingAt: row?.oldest_pending_at_ms ? Number(row.oldest_pending_at_ms) : null,
      nextAttemptAt: row?.next_attempt_at_ms ? Number(row.next_attempt_at_ms) : null,
      latestPublishedAt: row?.latest_published_at_ms
        ? Number(row.latest_published_at_ms)
        : null,
      deadLetterCount: byStatus.dead,
      retryCount: byStatus.retry,
      processingCount: byStatus.processing,
      errorSamples: errorSamples.rows.map((entry) => ({
        id: entry.id,
        vehicle_id: entry.vehicle_id ?? "unknown",
        status: entry.status,
        attempts: entry.attempts,
        maxAttempts: entry.max_attempts,
        nextAttemptAt: Number(entry.next_attempt_at_ms),
        lastError: entry.last_error,
      })),
    };
  });
}

export async function isConnected() {
  try {
    await executeDb(async () => {
      await ensureSchema();
      await pool.query("SELECT 1");
    });
    return true;
  } catch {
    return false;
  }
}

export async function appendAgentTrace(trace: AgentTraceRecord) {
  return executeDb(async () => {
    await ensureSchema();
    const { traceRetentionDays } = getAgentAuditConfig();
    if (Number.isFinite(traceRetentionDays) && traceRetentionDays > 0) {
      await pool.query(
        `
        DELETE FROM agent_traces
        WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
        `,
        [traceRetentionDays]
      );
    }

    await pool.query(
      `
      INSERT INTO agent_traces (
        id,
        conversation_id,
        turn_index,
        specialist,
        mode,
        question,
        answer,
        tool,
        tools,
        context,
        history,
        error,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, to_timestamp($13 / 1000.0)
      )
      ON CONFLICT (id) DO UPDATE
      SET conversation_id = EXCLUDED.conversation_id,
          turn_index = EXCLUDED.turn_index,
          specialist = EXCLUDED.specialist,
          mode = EXCLUDED.mode,
          question = EXCLUDED.question,
          answer = EXCLUDED.answer,
          tool = EXCLUDED.tool,
          tools = EXCLUDED.tools,
          context = EXCLUDED.context,
          history = EXCLUDED.history,
          error = EXCLUDED.error,
          created_at = EXCLUDED.created_at
      `,
      [
        trace.id,
        trace.conversationId,
        trace.turnIndex,
        trace.specialist,
        trace.mode,
        trace.question,
        JSON.stringify(trace.answer),
        trace.tool,
        JSON.stringify(trace.tools),
        JSON.stringify(trace.context),
        JSON.stringify(trace.history),
        trace.error,
        trace.createdAt,
      ]
    );
  });
}

export async function getAgentConversation(conversationId: string, limit = 6) {
  return executeDb(async () => {
    await ensureSchema();
    const result = await pool.query<{
      turn_index: number;
      question: string;
      answer: AgentTraceRecord["answer"];
      created_at_ms: string;
    }>(
      `
      SELECT
        turn_index,
        question,
        answer,
        (EXTRACT(EPOCH FROM created_at) * 1000)::bigint::text AS created_at_ms
      FROM agent_traces
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [conversationId, limit]
    );

    return result.rows
      .map((row) => ({
        turnIndex: row.turn_index,
        question: row.question,
        answer: row.answer,
        createdAt: Number(row.created_at_ms),
      }))
      .reverse();
  });
}

export async function listAgentTraces(conversationId: string, limit = 20) {
  return executeDb(async () => {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      conversation_id: string;
      turn_index: number;
      specialist: AgentTraceRecord["specialist"];
      mode: AgentTraceRecord["mode"];
      question: string;
      answer: AgentTraceRecord["answer"];
      tool: string | null;
      tools: string[];
      context: AgentTraceRecord["context"];
      history: AgentTraceRecord["history"];
      error: string | null;
      created_at_ms: string;
    }>(
      `
      SELECT
        id,
        conversation_id,
        turn_index,
        specialist,
        mode,
        question,
        answer,
        tool,
        tools,
        context,
        history,
        error,
        (EXTRACT(EPOCH FROM created_at) * 1000)::bigint::text AS created_at_ms
      FROM agent_traces
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [conversationId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      turnIndex: row.turn_index,
      specialist: row.specialist,
      mode: row.mode,
      question: row.question,
      answer: row.answer,
      tool: row.tool,
      tools: row.tools,
      context: row.context,
      history: row.history,
      error: row.error,
      createdAt: Number(row.created_at_ms),
    }));
  });
}
