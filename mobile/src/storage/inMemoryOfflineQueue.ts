import type { DriverTelemetryEvent } from "../contracts/telemetry";
import type { OfflineQueueStore } from "./offlineQueue";
import { mergeEventQueue } from "./offlineQueue";

export class InMemoryOfflineQueueStore implements OfflineQueueStore {
  private events: DriverTelemetryEvent[] = [];

  async list(): Promise<DriverTelemetryEvent[]> {
    return [...this.events];
  }

  async upsert(event: DriverTelemetryEvent): Promise<void> {
    this.events = mergeEventQueue(this.events, [event], "keep-latest");
  }

  async upsertMany(events: DriverTelemetryEvent[]): Promise<void> {
    this.events = mergeEventQueue(this.events, events, "keep-latest");
  }

  async replace(events: DriverTelemetryEvent[]): Promise<void> {
    this.events = [...events];
  }

  async markSynced(eventIds: string[]): Promise<void> {
    const accepted = new Set(eventIds);
    this.events = this.events.map((event) =>
      accepted.has(event.eventId)
        ? { ...event, syncStatus: "synced", lastError: null }
        : event,
    );
  }

  async markFailed(eventId: string, reason: string): Promise<void> {
    this.events = this.events.map((event) =>
      event.eventId === eventId
        ? { ...event, syncStatus: "failed", lastError: reason, retryCount: event.retryCount + 1 }
        : event,
    );
  }

  async clear(): Promise<void> {
    this.events = [];
  }
}
