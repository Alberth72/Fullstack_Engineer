import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { HttpTelemetryTransport } from "../adapters/httpTelemetryTransport";
import { createTelemetryEvent } from "../domain/eventFactory";
import { TelemetrySyncService } from "../services/telemetrySyncService";
import { loadDriverContext } from "../storage/sqliteDriverContext";
import { createSqliteOfflineQueueStore } from "../storage/sqliteOfflineQueue";

export const BACKGROUND_LOCATION_TASK_NAME = "fleet-driver-background-location";

function resolveBaseUrl() {
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4001";
}

function createEventId(timestamp: number) {
  return `bg-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
}

TaskManager.defineTask<Location.LocationObject[]>(BACKGROUND_LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    return;
  }

  try {
    const locations = data ?? [];
    if (locations.length === 0) {
      return;
    }

    const queueStore = await createSqliteOfflineQueueStore();
    const transport = new HttpTelemetryTransport({ baseUrl: resolveBaseUrl() });
    const syncService = new TelemetrySyncService(queueStore, transport);
    const driverContext = await loadDriverContext();

    for (const location of locations) {
      const speed = Number.isFinite(location.coords.speed ?? 0) ? Math.max(0, location.coords.speed ?? 0) : 0;
      const event = createTelemetryEvent({
        eventId: createEventId(location.timestamp),
        vehicleId: driverContext.vehicleId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed,
        status: speed > 0 ? "moving" : "stopped",
        timestamp: location.timestamp,
      });

      await syncService.enqueue(event);
    }

    const backendHealth = await transport.checkHealth();
    if (backendHealth.online) {
      await syncService.flush();
    }
  } catch {
    // background sync is best-effort for demo and must not crash the task
  }
});
