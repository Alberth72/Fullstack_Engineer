import * as db from "./db_json";
import * as pg from "./pg";
import type { TelemetryEvent } from "../types/telemetry";
import type {
  TelemetryOutboxDeadLetterPruneOptions,
  TelemetryOutboxRecord,
} from "./outboxTypes";
import { logger } from "../observability/logger";
import { usePostgresStorage } from "./storageMode";

function isStorageFailure(err: unknown) {
  return err instanceof Error && !String(err.message || "").includes("invalid");
}

export async function saveEventsWithOutbox(events: TelemetryEvent[]) {
  if (!usePostgresStorage) {
    return db.saveEventsWithOutbox(events);
  }

  try {
    return await pg.saveEventsWithOutbox(events);
  } catch (err) {
    if (!isStorageFailure(err)) {
      throw err;
    }
    logger.warn("postgres_fallback_to_json", {
      component: "telemetry_outbox",
      operation: "save_events_with_outbox",
      eventCount: events.length,
      error: logger.serializeError(err),
    });
    const result = db.saveEventsWithOutbox(events);
    return {
      ...result,
      storage: "json_fallback" as const,
    };
  }
}

export async function claimPendingOutbox(
  limit: number,
  lockTimeoutMs: number
): Promise<TelemetryOutboxRecord[]> {
  if (!usePostgresStorage) {
    return db.claimPendingOutbox(limit, lockTimeoutMs);
  }

  try {
    return await pg.claimPendingOutbox(limit, lockTimeoutMs);
  } catch (err) {
    logger.warn("postgres_fallback_to_json", {
      component: "telemetry_outbox",
      operation: "claim_pending",
      limit,
      error: logger.serializeError(err),
    });
    return db.claimPendingOutbox(limit, lockTimeoutMs);
  }
}

export async function markOutboxPublished(ids: string[]) {
  if (!ids.length) return;

  if (!usePostgresStorage) {
    return db.markOutboxPublished(ids);
  }

  try {
    await pg.markOutboxPublished(ids);
  } catch (err) {
    logger.warn("postgres_fallback_to_json", {
      component: "telemetry_outbox",
      operation: "mark_published",
      count: ids.length,
      error: logger.serializeError(err),
    });
    db.markOutboxPublished(ids);
  }
}

export async function markOutboxRetry(record: TelemetryOutboxRecord, error: string, delayMs: number) {
  if (!usePostgresStorage) {
    return db.markOutboxRetry(record.id, error, delayMs, record.attempts, record.maxAttempts);
  }

  try {
    await pg.markOutboxRetry(record.id, error, delayMs, record.attempts, record.maxAttempts);
  } catch (err) {
    logger.warn("postgres_fallback_to_json", {
      component: "telemetry_outbox",
      operation: "mark_retry",
      outboxId: record.id,
      error: logger.serializeError(err),
    });
    db.markOutboxRetry(record.id, error, delayMs, record.attempts, record.maxAttempts);
  }
}

export async function markOutboxDead(record: TelemetryOutboxRecord, error: string) {
  if (!usePostgresStorage) {
    return db.markOutboxDead(record.id, error, record.attempts);
  }

  try {
    await pg.markOutboxDead(record.id, error, record.attempts);
  } catch (err) {
    logger.warn("postgres_fallback_to_json", {
      component: "telemetry_outbox",
      operation: "mark_dead",
      outboxId: record.id,
      error: logger.serializeError(err),
    });
    db.markOutboxDead(record.id, error, record.attempts);
  }
}

export async function getOutboxSummary() {
  if (!usePostgresStorage) {
    return db.getOutboxSummary("json");
  }

  try {
    return await pg.getOutboxSummary();
  } catch (err) {
    logger.warn("postgres_fallback_to_json", {
      component: "telemetry_outbox",
      operation: "get_summary",
      error: logger.serializeError(err),
    });
    return db.getOutboxSummary("json_fallback");
  }
}

export async function pruneDeadOutboxLetters(options: TelemetryOutboxDeadLetterPruneOptions) {
  if (!usePostgresStorage) {
    return db.pruneDeadOutboxLetters(options, "json");
  }

  try {
    return await pg.pruneDeadOutboxLetters(options);
  } catch (err) {
    logger.warn("postgres_fallback_to_json", {
      component: "telemetry_outbox",
      operation: "prune_dead_letters",
      olderThanDays: options.olderThanDays,
      dryRun: options.dryRun,
      error: logger.serializeError(err),
    });
    return db.pruneDeadOutboxLetters(options, "json_fallback");
  }
}
