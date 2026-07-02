import * as pg from "./pg";
import { usePostgresStorage } from "./storageMode";
import type { TelemetrySchemaReadiness } from "./schemaReadinessTypes";

export function getJsonTelemetrySchemaReadiness(
  storage: "json" | "json_fallback",
  reason: string | null = null
): TelemetrySchemaReadiness {
  return {
    generatedAt: Date.now(),
    activeStorage: storage,
    postgres: {
      configured: usePostgresStorage,
      connected: false,
      tableExists: false,
      timescaleExtensionInstalled: false,
      hypertable: {
        expected: usePostgresStorage,
        active: false,
        table: "telemetry_events",
        timeColumn: "timestamp",
        mode: "best_effort_on_schema_init",
      },
      idempotencyTableExists: false,
      primaryKeyColumns: [],
      migrationBlockers: usePostgresStorage ? ["postgres_unavailable"] : [],
    },
    fallback: {
      jsonAvailable: true,
      reason,
    },
    recommendation: usePostgresStorage
      ? "Postgres is configured but unavailable; verify DATABASE_URL, network, and TimescaleDB before running migration checks."
      : "JSON fallback is active; configure DATABASE_URL to validate TimescaleDB hypertable readiness.",
  };
}

export async function getTelemetrySchemaReadiness(): Promise<TelemetrySchemaReadiness> {
  if (!usePostgresStorage) {
    return getJsonTelemetrySchemaReadiness("json");
  }

  try {
    return await pg.getTelemetrySchemaReadiness();
  } catch (err) {
    const reason = err instanceof Error ? err.message : "postgres_unavailable";
    return getJsonTelemetrySchemaReadiness("json_fallback", reason);
  }
}
