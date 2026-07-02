import * as db from "./db_json";
import * as pg from "./pg";
import type { TelemetryEvent } from "../types/telemetry";
import type {
  TelemetryOutboxDeadLetterPruneOptions,
  TelemetryOutboxRecord,
} from "./outboxTypes";
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
    console.warn("Postgres unavailable, falling back to JSON storage with outbox:", err);
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
    console.warn("Postgres unavailable, claiming outbox from JSON storage:", err);
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
    console.warn("Postgres unavailable, marking JSON outbox as published:", err);
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
    console.warn("Postgres unavailable, rescheduling JSON outbox:", err);
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
    console.warn("Postgres unavailable, marking JSON outbox dead:", err);
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
    console.warn("Postgres unavailable, summarizing JSON outbox:", err);
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
    console.warn("Postgres unavailable, pruning JSON outbox dead letters:", err);
    return db.pruneDeadOutboxLetters(options, "json_fallback");
  }
}
