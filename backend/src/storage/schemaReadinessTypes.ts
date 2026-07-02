export type TelemetrySchemaReadinessStorage = "postgres" | "json" | "json_fallback";

export type TelemetrySchemaReadiness = {
  generatedAt: number;
  activeStorage: TelemetrySchemaReadinessStorage;
  postgres: {
    configured: boolean;
    connected: boolean;
    tableExists: boolean;
    timescaleExtensionInstalled: boolean;
    hypertable: {
      expected: boolean;
      active: boolean;
      table: string;
      timeColumn: string;
      mode: "best_effort_on_schema_init";
    };
    idempotencyTableExists: boolean;
    primaryKeyColumns: string[];
    migrationBlockers: string[];
  };
  fallback: {
    jsonAvailable: boolean;
    reason: string | null;
  };
  recommendation: string;
};
