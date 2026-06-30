import axios from "axios";
import { incrementCounter } from "../observability/metrics";
import { logger } from "../observability/logger";
import type { TelemetryEvent } from "../types/telemetry";
import { CircuitBreaker, withRetry } from "../utils/resilience";
import { getAdminApiToken } from "../security/securityConfig";

const notifierBreaker = new CircuitBreaker(
  parseInt(process.env.OUTBOX_NOTIFIER_BREAKER_THRESHOLD || "3", 10),
  parseInt(process.env.OUTBOX_NOTIFIER_COOLDOWN_MS || "10000", 10)
);

function getWorkerUrl() {
  const workerUrl = process.env.OUTBOX_WORKER_URL?.trim();
  if (!workerUrl) return null;

  return workerUrl.replace(/\/$/, "");
}

function getNotifyPath() {
  return process.env.OUTBOX_WORKER_NOTIFY_PATH || "/internal/outbox/notify";
}

function describeError(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export async function notifyTelemetryOutboxWorker(events: TelemetryEvent[]) {
  const workerUrl = getWorkerUrl();
  if (!workerUrl || !events.length) {
    incrementCounter("outboxNotificationsSkipped");
    return;
  }

  if (!notifierBreaker.canExecute()) {
    incrementCounter("outboxNotificationsCircuitOpen");
    return;
  }

  const endpoint = `${workerUrl}${getNotifyPath()}`;
  const adminToken = getAdminApiToken();

  try {
    await withRetry(
      async () => {
        const response = await axios.post(
          endpoint,
          {
            count: events.length,
            eventIds: events.map((event) => event.id),
          },
          {
            headers: adminToken ? { "X-Admin-Token": adminToken } : undefined,
            timeout: parseInt(process.env.OUTBOX_WORKER_TIMEOUT_MS || "3000", 10),
            validateStatus: (status) => status >= 200 && status < 300,
          }
        );

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`worker_notify_${response.status}`);
        }
      },
      {
        attempts: parseInt(process.env.OUTBOX_NOTIFY_RETRY_ATTEMPTS || "3", 10),
        baseDelayMs: parseInt(process.env.OUTBOX_NOTIFY_RETRY_BASE_DELAY_MS || "150", 10),
        maxDelayMs: parseInt(process.env.OUTBOX_NOTIFY_RETRY_MAX_DELAY_MS || "1200", 10),
      }
    );

    notifierBreaker.success();
    incrementCounter("outboxNotificationsSent");
  } catch (err) {
    notifierBreaker.failure();
    incrementCounter("outboxNotificationsFailed");
    logger.warn("outbox_notification_failed", {
      error: describeError(err),
      workerUrl: workerUrl || null,
      eventCount: events.length,
    });
  }
}
