export type SyncStatus = "pending" | "queued" | "sending" | "synced" | "failed";

export type DriverTelemetryEvent = {
  eventId: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  status:
    | "moving"
    | "stopped"
    | "idle"
    | "offline"
    | "vehicle_started"
    | "vehicle_stopped"
    | "geofence_enter"
    | "geofence_exit";
  timestamp: number;
  syncStatus: SyncStatus;
  retryCount: number;
  lastError?: string | null;
};

export type DriverTelemetryPayload = Omit<
  DriverTelemetryEvent,
  "syncStatus" | "retryCount" | "lastError"
>;

export type SyncBatchRequest = {
  events: DriverTelemetryPayload[];
};

export type SyncBatchResponse = {
  accepted: number;
  rejected: number;
  serverTimestamp: number;
  duplicateEventIds?: string[];
};

export type SyncBatchDetail = {
  index: number;
  size: number;
  accepted: number;
  rejected: number;
};

export type SyncBatchSummary = {
  batchSize: number;
  batchCount: number;
  accepted: number;
  rejected: number;
  details: SyncBatchDetail[];
};

export type SyncHealth = {
  online: boolean;
  lastSyncAt: number | null;
  pendingEvents: number;
  failedEvents: number;
};
