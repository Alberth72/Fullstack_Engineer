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
import { createRequestId, logger } from "../observability/logger";
import {
  createChildTraceContext,
  createTraceContext,
  traceLogContext,
} from "../observability/tracing";
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

function getOutboxPublishTrace(record: TelemetryOutboxRecord) {
  if (record.trace) {
    return createChildTraceContext(record.trace, record.trace.requestId);
  }

  return createTraceContext(createRequestId("outbox"));
}

function groupRecordsByTrace(records: TelemetryOutboxRecord[]) {
  const groups = new Map<string, TelemetryOutboxRecord[]>();

  for (const record of records) {
    const trace = record.trace;
    const key = trace ? `${trace.traceId}:${trace.spanId}` : "untraced";
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

async function publishRecord(record: TelemetryOutboxRecord, trace = getOutboxPublishTrace(record)) {
  const { publishRetry } = getTelemetryOutboxWorkerConfig();
  await withRetry(
    async () => {
      await publishTelemetryBatchStrict([record.payload], trace);
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
  const trace = records[0] ? getOutboxPublishTrace(records[0]) : undefined;
  await withRetry(
    async () => {
      await publishTelemetryBatchStrict(records.map((record) => record.payload), trace);
    },
    {
      attempts: publishRetry.attempts,
      baseDelayMs: publishRetry.baseDelayMs,
      maxDelayMs: publishRetry.maxDelayMs,
    }
  );
}

async function processRecord(record: TelemetryOutboxRecord) {
  const trace = getOutboxPublishTrace(record);
  try {
    await publishRecord(record, trace);
    await markOutboxPublished([record.id]);
    incrementCounter("telemetryOutboxPublished");
    logger.info("outbox_published", {
      ...traceLogContext(trace),
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
        ...traceLogContext(trace),
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
      ...traceLogContext(trace),
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
    const groups = groupRecordsByTrace(records);
    for (const group of groups) {
      await publishRecords(group);
    }
    await markOutboxPublished(records.map((record) => record.id));
    incrementCounter("telemetryOutboxPublished", records.length);
    logger.info("outbox_batch_published", {
      count: records.length,
      firstOutboxId: records[0]?.id ?? null,
      traceGroups: groups.length,
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
