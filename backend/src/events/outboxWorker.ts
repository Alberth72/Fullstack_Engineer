import { incrementCounter } from "../observability/metrics";
import type { TelemetryOutboxRecord } from "../storage/outboxTypes";
import {
  claimPendingOutbox,
  markOutboxDead,
  markOutboxPublished,
  markOutboxRetry,
} from "../storage/telemetryOutbox";
import { publishTelemetryBatchStrict } from "./broadcaster";
import { withRetry } from "../utils/resilience";
import { logger } from "../observability/logger";
import {
  getTelemetryOutboxRetryDelayMs,
  getTelemetryOutboxWorkerConfig,
} from "./outboxWorkerConfig";

let started = false;
let running = false;
let timer: NodeJS.Timeout | null = null;

function describeError(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function publishRecord(record: TelemetryOutboxRecord) {
  const { publishRetry } = getTelemetryOutboxWorkerConfig();
  await withRetry(
    async () => {
      await publishTelemetryBatchStrict([record.payload]);
    },
    {
      attempts: publishRetry.attempts,
      baseDelayMs: publishRetry.baseDelayMs,
      maxDelayMs: publishRetry.maxDelayMs,
    }
  );
}

async function publishRecords(records: TelemetryOutboxRecord[]) {
  const { publishRetry } = getTelemetryOutboxWorkerConfig();
  await withRetry(
    async () => {
      await publishTelemetryBatchStrict(records.map((record) => record.payload));
    },
    {
      attempts: publishRetry.attempts,
      baseDelayMs: publishRetry.baseDelayMs,
      maxDelayMs: publishRetry.maxDelayMs,
    }
  );
}

async function processRecord(record: TelemetryOutboxRecord) {
  try {
    await publishRecord(record);
    await markOutboxPublished([record.id]);
    incrementCounter("telemetryOutboxPublished");
    logger.info("outbox_published", {
      outboxId: record.id,
      vehicleId: record.payload.vehicle_id,
      attempts: record.attempts,
    });
  } catch (err) {
    const error = describeError(err);
    if (record.attempts >= record.maxAttempts) {
      await markOutboxDead(record, error);
      incrementCounter("telemetryOutboxDead");
      logger.warn("outbox_dead_lettered", {
        outboxId: record.id,
        vehicleId: record.payload.vehicle_id,
        error,
      });
      return;
    }

    const delayMs = getTelemetryOutboxRetryDelayMs(record.attempts);
    await markOutboxRetry(record, error, delayMs);
    incrementCounter("telemetryOutboxRetryScheduled");
    logger.warn("outbox_retry_scheduled", {
      outboxId: record.id,
      vehicleId: record.payload.vehicle_id,
      delayMs,
      error,
    });
  }
}

async function processRecords(records: TelemetryOutboxRecord[]) {
  if (records.length === 1) {
    await processRecord(records[0]!);
    return;
  }

  try {
    await publishRecords(records);
    await markOutboxPublished(records.map((record) => record.id));
    incrementCounter("telemetryOutboxPublished", records.length);
    logger.info("outbox_batch_published", {
      count: records.length,
      firstOutboxId: records[0]?.id ?? null,
    });
  } catch (err) {
    logger.warn("outbox_batch_publish_failed_fallback", {
      count: records.length,
      error: describeError(err),
    });
    for (const record of records) {
      await processRecord(record);
    }
  }
}

async function runOnce() {
  if (running) return;
  running = true;

  try {
    const { claimLimit, lockTimeoutMs } = getTelemetryOutboxWorkerConfig();
    const records = await claimPendingOutbox(claimLimit, lockTimeoutMs);
    if (!records.length) return;

    incrementCounter("telemetryOutboxClaimed", records.length);
    await processRecords(records);
  } catch (err) {
    logger.error("outbox_worker_tick_failed", err);
  } finally {
    running = false;
  }
}

export async function runTelemetryOutboxCycle() {
  return runOnce();
}

export function startTelemetryOutboxWorker() {
  if (started) {
    return () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      started = false;
    };
  }

  started = true;
  void runOnce();
  const { pollIntervalMs } = getTelemetryOutboxWorkerConfig();
  timer = setInterval(() => {
    void runOnce();
  }, pollIntervalMs);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    started = false;
  };
}
