import type { TelemetryEvent } from "../types/telemetry";

export type TelemetryWriteStorage = "postgres" | "json" | "json_fallback";

export type TelemetryWriteResult = {
  storage: TelemetryWriteStorage;
  received: number;
  unique: number;
  inserted: number;
  updated: number;
  duplicateInBatch: number;
  outboxCreated: number;
  outboxSkipped: number;
};

export function emptyTelemetryWriteResult(
  storage: TelemetryWriteStorage,
  received = 0
): TelemetryWriteResult {
  return {
    storage,
    received,
    unique: 0,
    inserted: 0,
    updated: 0,
    duplicateInBatch: 0,
    outboxCreated: 0,
    outboxSkipped: 0,
  };
}

export function dedupeTelemetryEventsById(events: TelemetryEvent[]) {
  const byId = new Map<string, TelemetryEvent>();

  for (const event of events) {
    byId.set(event.id, event);
  }

  const uniqueEvents = Array.from(byId.values());
  return {
    uniqueEvents,
    duplicateInBatch: events.length - uniqueEvents.length,
  };
}
