import { usePostgresStorage } from "./storageMode";

const DEFAULT_POSTGRES_RETENTION_DAYS = 30;
const DEFAULT_JSON_MAX_EVENTS_PER_VEHICLE = 250;

function readPositiveInteger(name: string, defaultValue: number) {
  const raw = process.env[name];
  if (!raw?.trim()) return defaultValue;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

export function getPostgresTelemetryRetentionDays() {
  return readPositiveInteger(
    "TELEMETRY_RETENTION_DAYS",
    DEFAULT_POSTGRES_RETENTION_DAYS
  );
}

export function getJsonStorageMaxEventsPerVehicle() {
  return readPositiveInteger(
    "JSON_STORAGE_MAX_EVENTS_PER_VEHICLE",
    DEFAULT_JSON_MAX_EVENTS_PER_VEHICLE
  );
}

export function getTelemetryRetentionPolicy() {
  const postgresRetentionDays = getPostgresTelemetryRetentionDays();
  const jsonMaxEventsPerVehicle = getJsonStorageMaxEventsPerVehicle();

  return {
    generatedAt: Date.now(),
    activeStorage: usePostgresStorage ? "postgres" : "json",
    postgres: {
      table: "telemetry_events",
      timeColumn: "timestamp",
      hypertable: {
        extension: "timescaledb",
        mode: "best_effort_on_schema_init",
      },
      retention: {
        enabled: true,
        days: postgresRetentionDays,
        interval: `${postgresRetentionDays} days`,
        envVar: "TELEMETRY_RETENTION_DAYS",
        defaultDays: DEFAULT_POSTGRES_RETENTION_DAYS,
      },
    },
    json: {
      storage: "events.json",
      compaction: {
        strategy: "latest_events_per_vehicle",
        maxEventsPerVehicle: jsonMaxEventsPerVehicle,
        envVar: "JSON_STORAGE_MAX_EVENTS_PER_VEHICLE",
        defaultMaxEventsPerVehicle: DEFAULT_JSON_MAX_EVENTS_PER_VEHICLE,
      },
    },
    fallback: {
      whenPostgresUnavailable: "json_compaction_policy_applies",
    },
  };
}
