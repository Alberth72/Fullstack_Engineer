import type {
  DriverTelemetryEvent,
  DriverTelemetryPayload,
  SyncBatchRequest,
  SyncBatchResponse,
  SyncBatchSummary,
  SyncHealth,
} from "../contracts/telemetry";
import type { OfflineQueueStore } from "../storage/offlineQueue";
import { countQueueStates, mergeEventQueue } from "../storage/offlineQueue";
import { toPayload } from "../domain/eventFactory";

export type TelemetryTransport = {
  syncBatch(request: SyncBatchRequest): Promise<SyncBatchResponse>;
};

export type SyncResult = {
  accepted: number;
  rejected: number;
  failedEventIds: string[];
  acceptedEventIds: string[];
  summary: SyncBatchSummary;
};

export class TelemetrySyncService {
  constructor(
    private readonly queueStore: OfflineQueueStore,
    private readonly transport: TelemetryTransport,
  ) {}

  async enqueue(event: DriverTelemetryEvent): Promise<void> {
    const current = await this.queueStore.list();
    const next = mergeEventQueue(current, [event], "dedupe-by-event-id");
    await this.queueStore.replace(next);
  }

  async enqueueMany(events: DriverTelemetryEvent[]): Promise<void> {
    const current = await this.queueStore.list();
    const next = mergeEventQueue(current, events, "dedupe-by-event-id");
    await this.queueStore.replace(next);
  }

  async getHealth(online: boolean): Promise<SyncHealth> {
    const events = await this.queueStore.list();
    const counts = countQueueStates(events);
    const lastSyncAt = this.findLastSyncedAt(events);
    return {
      online,
      lastSyncAt,
      pendingEvents: counts.pending,
      failedEvents: counts.failed,
    };
  }

  async flush(batchSize = 10): Promise<SyncResult> {
    const queue = await this.queueStore.list();
    const pending = queue.filter((event) => event.syncStatus !== "synced");

    if (pending.length === 0) {
      return {
        accepted: 0,
        rejected: 0,
        failedEventIds: [],
        acceptedEventIds: [],
        summary: {
          batchSize,
          batchCount: 0,
          accepted: 0,
          rejected: 0,
          details: [],
        },
      };
    }

    const prepared = pending.map((event) => ({
      ...event,
      syncStatus: "sending" as const,
      retryCount: event.retryCount + 1,
      lastError: null,
    }));

    let workingQueue = mergeEventQueue(queue, prepared, "keep-latest");
    await this.queueStore.replace(workingQueue);

    const acceptedEventIds: string[] = [];
    const failedEventIds: string[] = [];
    const batchDetails: SyncBatchSummary["details"] = [];

    try {
      for (let index = 0; index < prepared.length; index += batchSize) {
        const batch = prepared.slice(index, index + batchSize);
        const response = await this.transport.syncBatch({
          events: batch.map((event) => toPayload(event)),
        });

        const rejectedSet = new Set(response.duplicateEventIds ?? []);
        const batchAcceptedIds = batch.filter((event) => !rejectedSet.has(event.eventId)).map((event) => event.eventId);
        const batchFailedIds = batch.filter((event) => rejectedSet.has(event.eventId)).map((event) => event.eventId);

        acceptedEventIds.push(...batchAcceptedIds);
        failedEventIds.push(...batchFailedIds);

        workingQueue = workingQueue.map((event) => {
          if (batchAcceptedIds.includes(event.eventId)) {
            return { ...event, syncStatus: "synced" as const, lastError: null };
          }
          if (batchFailedIds.includes(event.eventId)) {
            return { ...event, syncStatus: "failed" as const, lastError: "duplicate_event" };
          }
          return event;
        });

        await this.queueStore.replace(workingQueue);

        batchDetails.push({
          index: batchDetails.length + 1,
          size: batch.length,
          accepted: batchAcceptedIds.length,
          rejected: batchFailedIds.length,
        });
      }

      return {
        accepted: acceptedEventIds.length,
        rejected: failedEventIds.length,
        failedEventIds,
        acceptedEventIds,
        summary: {
          batchSize,
          batchCount: batchDetails.length,
          accepted: acceptedEventIds.length,
          rejected: failedEventIds.length,
          details: batchDetails,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "sync_failed";
      workingQueue = workingQueue.map((event) => {
        if (pending.some((candidate) => candidate.eventId === event.eventId) && event.syncStatus !== "synced") {
          return {
            ...event,
            syncStatus: "failed" as const,
            lastError: reason,
          };
        }
        return event;
      });

      await this.queueStore.replace(workingQueue);

      throw error;
    }
  }

  private findLastSyncedAt(events: DriverTelemetryEvent[]): number | null {
    const syncedEvents = events.filter((event) => event.syncStatus === "synced");
    if (syncedEvents.length === 0) {
      return null;
    }

    return syncedEvents.reduce((latest, event) => Math.max(latest, event.timestamp), 0);
  }
}

export function mapPayloadToTelemetryEvent(
  payload: DriverTelemetryPayload,
  syncStatus: DriverTelemetryEvent["syncStatus"] = "pending",
): DriverTelemetryEvent {
  return {
    ...payload,
    syncStatus,
    retryCount: 0,
    lastError: null,
  };
}
