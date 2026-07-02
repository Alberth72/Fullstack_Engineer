import { logger } from "./logger";
import { snapshotMetrics } from "./metrics";
import type { RuntimeHealth } from "./runtimeHealth";

type DiagnosticsOptions = {
  role: "api" | "outbox-worker";
  runtimeHealth: RuntimeHealth;
  extras?: Record<string, unknown>;
};

function pickNonZeroCounters(counters: Record<string, number>, keys: string[]) {
  return Object.fromEntries(
    keys
      .map((key) => [key, counters[key] ?? 0] as const)
      .filter(([, value]) => value > 0)
  );
}

export function buildOperationalDiagnostics({
  role,
  runtimeHealth,
  extras = {},
}: DiagnosticsOptions) {
  const metrics = snapshotMetrics();
  const recentProblems = logger.recentProblems(10);
  const errorCounters = pickNonZeroCounters(metrics.counters, [
    "telemetryErrors",
    "telemetryPublishErrors",
    "telemetryOutboxRetryScheduled",
    "telemetryOutboxDead",
    "outboxNotificationsCircuitOpen",
    "outboxNotificationsFailed",
    "agentErrors",
  ]);
  const attentionRequired =
    runtimeHealth.status === "degraded" ||
    Object.keys(errorCounters).length > 0 ||
    recentProblems.length > 0;

  return {
    status: runtimeHealth.status,
    attentionRequired,
    role,
    timestamp: Date.now(),
    runtime: runtimeHealth,
    metrics,
    signals: {
      errorCounters,
      recentProblems,
    },
    ...extras,
  };
}
