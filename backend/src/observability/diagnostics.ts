import { logger } from "./logger";
import { snapshotMetrics } from "./metrics";
import type { RuntimeHealth } from "./runtimeHealth";

type AlertSeverity = "critical" | "warning" | "info";

type OperationalAlert = {
  severity: AlertSeverity;
  code: string;
  source: "runtime" | "telemetry" | "outbox" | "agent" | "logs";
  message: string;
  count?: number;
  metadata?: Record<string, unknown>;
};

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

function buildRuntimeAlerts(runtimeHealth: RuntimeHealth): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (runtimeHealth.checks.broker.configured && !runtimeHealth.checks.broker.connected) {
    alerts.push({
      severity: "critical",
      code: "broker_unavailable",
      source: "runtime",
      message: "RabbitMQ is configured but the service is not connected.",
      metadata: {
        mode: runtimeHealth.checks.broker.mode,
      },
    });
  }

  if (runtimeHealth.checks.database.configured && !runtimeHealth.checks.database.connected) {
    alerts.push({
      severity: "critical",
      code: "database_unavailable",
      source: "runtime",
      message: "Postgres/TimescaleDB is configured but the service is not connected.",
      metadata: {
        mode: runtimeHealth.checks.database.mode,
      },
    });
  }

  return alerts;
}

function buildCounterAlerts(counters: Record<string, number>): OperationalAlert[] {
  const alertRules: Array<{
    counter: string;
    severity: AlertSeverity;
    code: string;
    source: OperationalAlert["source"];
    message: string;
  }> = [
    {
      counter: "telemetryErrors",
      severity: "critical",
      code: "telemetry_ingest_errors",
      source: "telemetry",
      message: "Telemetry ingestion has recorded errors.",
    },
    {
      counter: "telemetryPublishErrors",
      severity: "critical",
      code: "telemetry_publish_errors",
      source: "telemetry",
      message: "Telemetry events failed while publishing to the broker.",
    },
    {
      counter: "telemetryOutboxDead",
      severity: "critical",
      code: "outbox_dead_letters",
      source: "outbox",
      message: "Telemetry outbox contains events moved to dead letter state.",
    },
    {
      counter: "outboxNotificationsCircuitOpen",
      severity: "critical",
      code: "outbox_notification_circuit_open",
      source: "outbox",
      message: "Outbox notification circuit breaker opened.",
    },
    {
      counter: "outboxNotificationsFailed",
      severity: "warning",
      code: "outbox_notification_failures",
      source: "outbox",
      message: "Outbox worker notifications have failed.",
    },
    {
      counter: "telemetryOutboxRetryScheduled",
      severity: "warning",
      code: "outbox_retries_scheduled",
      source: "outbox",
      message: "Telemetry outbox has scheduled retry attempts.",
    },
    {
      counter: "agentErrors",
      severity: "warning",
      code: "agent_errors",
      source: "agent",
      message: "AI operational agent has recorded errors.",
    },
  ];

  return alertRules
    .map((rule) => ({
      rule,
      count: counters[rule.counter] ?? 0,
    }))
    .filter(({ count }) => count > 0)
    .map(({ rule, count }) => ({
      severity: rule.severity,
      code: rule.code,
      source: rule.source,
      message: rule.message,
      count,
      metadata: {
        counter: rule.counter,
      },
    }));
}

function buildLogAlerts(recentProblems: ReturnType<typeof logger.recentProblems>): OperationalAlert[] {
  const errors = recentProblems.filter((problem) => problem.level === "error").length;
  const warnings = recentProblems.filter((problem) => problem.level === "warn").length;
  const alerts: OperationalAlert[] = [];

  if (errors > 0) {
    alerts.push({
      severity: "critical",
      code: "recent_error_logs",
      source: "logs",
      message: "Recent error logs require operator review.",
      count: errors,
    });
  }

  if (warnings > 0) {
    alerts.push({
      severity: "warning",
      code: "recent_warning_logs",
      source: "logs",
      message: "Recent warning logs require operator review.",
      count: warnings,
    });
  }

  return alerts;
}

function summarizeAlerts(alerts: OperationalAlert[]) {
  return alerts.reduce(
    (summary, alert) => {
      summary.total += 1;
      summary.bySeverity[alert.severity] += 1;
      return summary;
    },
    {
      total: 0,
      bySeverity: {
        critical: 0,
        warning: 0,
        info: 0,
      },
    }
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
  const alerts = [
    ...buildRuntimeAlerts(runtimeHealth),
    ...buildCounterAlerts(metrics.counters),
    ...buildLogAlerts(recentProblems),
  ];
  const alertSummary = summarizeAlerts(alerts);
  const attentionRequired = alerts.length > 0;

  return {
    status: runtimeHealth.status,
    attentionRequired,
    alertSummary,
    alerts,
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
