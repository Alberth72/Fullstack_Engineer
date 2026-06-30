import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { HttpTelemetryTransport } from "../adapters/httpTelemetryTransport";
import { createTelemetryEvent } from "../domain/eventFactory";
import { TelemetrySyncService } from "../services/telemetrySyncService";
import { loadDriverContext } from "../storage/sqliteDriverContext";
import { createSqliteOfflineQueueStore } from "../storage/sqliteOfflineQueue";

export const GEOFENCING_TASK_NAME = "fleet-driver-geofence-task";

function resolveBaseUrl() {
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4001";
}

function createEventId(regionId: string, timestamp: number, eventType: string) {
  return `gf-${eventType}-${regionId}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
}

TaskManager.defineTask<{
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}>(GEOFENCING_TASK_NAME, async ({ data, error }) => {
  if (error) {
    return;
  }

  try {
    const eventType = data?.eventType;
    const region = data?.region;
    if (!eventType || !region) {
      return;
    }

    const queueStore = await createSqliteOfflineQueueStore();
    const transport = new HttpTelemetryTransport({ baseUrl: resolveBaseUrl() });
    const syncService = new TelemetrySyncService(queueStore, transport);
    const driverContext = await loadDriverContext();

    const status =
      eventType === Location.GeofencingEventType.Enter
        ? "geofence_enter"
        : "geofence_exit";

    const event = createTelemetryEvent({
      eventId: createEventId(region.identifier ?? "region", Date.now(), status),
      vehicleId: driverContext.vehicleId,
      latitude: region.latitude,
      longitude: region.longitude,
      speed: 0,
      status,
      timestamp: Date.now(),
    });

    await syncService.enqueue(event);

    const backendHealth = await transport.checkHealth();
    if (backendHealth.online) {
      await syncService.flush(5);
    }
  } catch {
    // geofence events are best-effort and should not crash the task
  }
});
