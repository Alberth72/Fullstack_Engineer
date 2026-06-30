type Counters = {
  telemetryEvents: number;
  telemetryEventsReceived: number;
  telemetryEventsInserted: number;
  telemetryEventsUpdated: number;
  telemetryEventsDuplicateInBatch: number;
  telemetryOutboxCreated: number;
  telemetryOutboxSkipped: number;
  telemetryPublished: number;
  telemetryPublishErrors: number;
  telemetryOutboxClaimed: number;
  telemetryOutboxPublished: number;
  telemetryOutboxRetryScheduled: number;
  telemetryOutboxDead: number;
  outboxNotificationsSkipped: number;
  outboxNotificationsCircuitOpen: number;
  outboxNotificationsSent: number;
  outboxNotificationsFailed: number;
  workerRequests: number;
  telemetryErrors: number;
  agentQueries: number;
  agentErrors: number;
  requests: number;
};

const counters: Counters = {
  telemetryEvents: 0,
  telemetryEventsReceived: 0,
  telemetryEventsInserted: 0,
  telemetryEventsUpdated: 0,
  telemetryEventsDuplicateInBatch: 0,
  telemetryOutboxCreated: 0,
  telemetryOutboxSkipped: 0,
  telemetryPublished: 0,
  telemetryPublishErrors: 0,
  telemetryOutboxClaimed: 0,
  telemetryOutboxPublished: 0,
  telemetryOutboxRetryScheduled: 0,
  telemetryOutboxDead: 0,
  outboxNotificationsSkipped: 0,
  outboxNotificationsCircuitOpen: 0,
  outboxNotificationsSent: 0,
  outboxNotificationsFailed: 0,
  workerRequests: 0,
  telemetryErrors: 0,
  agentQueries: 0,
  agentErrors: 0,
  requests: 0,
};

const timings: Record<string, { count: number; totalMs: number }> = {};

export function incrementCounter(key: keyof Counters, amount = 1) {
  counters[key] += amount;
}

export function recordTiming(route: string, ms: number) {
  if (!timings[route]) {
    timings[route] = { count: 0, totalMs: 0 };
  }
  timings[route].count += 1;
  timings[route].totalMs += ms;
}

export function snapshotMetrics() {
  const averages = Object.fromEntries(
    Object.entries(timings).map(([route, value]) => [
      route,
      {
        count: value.count,
        avgMs: value.count ? Number((value.totalMs / value.count).toFixed(2)) : 0,
      },
    ])
  );

  return {
    counters: { ...counters },
    timings: averages,
  };
}

export function getHealthSummary(extra: Record<string, unknown> = {}) {
  return {
    status: "ok",
    timestamp: Date.now(),
    ...extra,
  };
}
