import type { DriverTelemetryEvent } from "../contracts/telemetry";

export type QueueConflictPolicy = "dedupe-by-event-id" | "keep-latest";

export type OfflineQueueStore = {
  list(): Promise<DriverTelemetryEvent[]>;
  upsert(event: DriverTelemetryEvent): Promise<void>;
  upsertMany(events: DriverTelemetryEvent[]): Promise<void>;
  replace(events: DriverTelemetryEvent[]): Promise<void>;
  markSynced(eventIds: string[]): Promise<void>;
  markFailed(eventId: string, reason: string): Promise<void>;
  clear(): Promise<void>;
};

export function mergeEventQueue(
  currentEvents: DriverTelemetryEvent[],
  incomingEvents: DriverTelemetryEvent[],
  policy: QueueConflictPolicy = "dedupe-by-event-id",
): DriverTelemetryEvent[] {
  const merged = new Map<string, DriverTelemetryEvent>();

  for (const event of currentEvents) {
    merged.set(event.eventId, event);
  }

  for (const event of incomingEvents) {
    const existing = merged.get(event.eventId);
    if (!existing) {
      merged.set(event.eventId, event);
      continue;
    }

    if (policy === "keep-latest") {
      merged.set(event.eventId, event.timestamp >= existing.timestamp ? event : existing);
    }
  }

  return [...merged.values()].sort((left, right) => left.timestamp - right.timestamp);
}

export function countQueueStates(events: DriverTelemetryEvent[]) {
  return events.reduce(
    (acc, event) => {
      if (event.syncStatus === "synced") acc.synced += 1;
      if (event.syncStatus === "failed") acc.failed += 1;
      if (event.syncStatus === "pending" || event.syncStatus === "queued" || event.syncStatus === "sending") {
        acc.pending += 1;
      }
      return acc;
    },
    { pending: 0, failed: 0, synced: 0 },
  );
}
