import { HttpTelemetryTransport } from "../adapters/httpTelemetryTransport";
import { createDemoTelemetryEvent } from "../domain/demoTelemetry";
import { createDemoTelemetryRoute } from "../domain/demoRoute";
import { TelemetrySyncService } from "../services/telemetrySyncService";
import { InMemoryOfflineQueueStore } from "../storage/inMemoryOfflineQueue";
import {
  createDefaultDriverContext,
  loadDriverContext as loadSqliteDriverContext,
  saveDriverContext as saveSqliteDriverContext,
  type DriverContext,
} from "../storage/sqliteDriverContext";
import { createSqliteOfflineQueueStore } from "../storage/sqliteOfflineQueue";
import type { OfflineQueueStore } from "../storage/offlineQueue";

export type MobileEnvironment = {
  queueStore: OfflineQueueStore;
  syncService: TelemetrySyncService;
  transport: HttpTelemetryTransport;
  loadDriverContext(): Promise<DriverContext>;
  saveDriverContext(context: DriverContext): Promise<DriverContext>;
  addDemoEvent(): Promise<void>;
  addDemoRoute(vehicleId: string): Promise<void>;
};

type CreateMobileEnvironmentOptions = {
  baseUrl?: string;
  useMemoryFallback?: boolean;
};

function resolveBaseUrl(baseUrl?: string) {
  return (
    baseUrl ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:4001"
  );
}

export async function createMobileEnvironment(
  options: CreateMobileEnvironmentOptions = {},
): Promise<MobileEnvironment> {
  const transport = new HttpTelemetryTransport({
    baseUrl: resolveBaseUrl(options.baseUrl),
  });
  let memoryDriverContext = createDefaultDriverContext();

  let queueStore: OfflineQueueStore;
  try {
    queueStore = await createSqliteOfflineQueueStore();
  } catch (error) {
    if (!options.useMemoryFallback) {
      throw error;
    }

    queueStore = new InMemoryOfflineQueueStore();
  }

  const syncService = new TelemetrySyncService(queueStore, transport);

  return {
    queueStore,
    syncService,
    transport,
    async loadDriverContext() {
      try {
        memoryDriverContext = await loadSqliteDriverContext();
      } catch {
        // keep memory fallback in environments where SQLite is unavailable
      }

      return memoryDriverContext;
    },
    async saveDriverContext(context) {
      try {
        memoryDriverContext = await saveSqliteDriverContext(context);
      } catch {
        memoryDriverContext = {
          driverName: context.driverName.trim() || memoryDriverContext.driverName,
          vehicleId: context.vehicleId.trim() || memoryDriverContext.vehicleId,
          routeId: context.routeId.trim() || memoryDriverContext.routeId,
          updatedAt: Date.now(),
        };
      }

      return memoryDriverContext;
    },
    async addDemoEvent() {
      await syncService.enqueue(createDemoTelemetryEvent());
    },
    async addDemoRoute(vehicleId) {
      await syncService.enqueueMany(createDemoTelemetryRoute(vehicleId));
    },
  };
}
