import { afterEach, describe, expect, it } from "vitest";

import {
  getJsonStorageMaxEventsPerVehicle,
  getPostgresTelemetryRetentionDays,
  getTelemetryRetentionPolicy,
} from "../../src/storage/telemetryRetentionPolicy";
import { getJsonTelemetrySchemaReadiness } from "../../src/storage/telemetrySchemaReadiness";

const originalRetentionDays = process.env.TELEMETRY_RETENTION_DAYS;
const originalJsonMaxEvents = process.env.JSON_STORAGE_MAX_EVENTS_PER_VEHICLE;

afterEach(() => {
  if (originalRetentionDays === undefined) {
    delete process.env.TELEMETRY_RETENTION_DAYS;
  } else {
    process.env.TELEMETRY_RETENTION_DAYS = originalRetentionDays;
  }

  if (originalJsonMaxEvents === undefined) {
    delete process.env.JSON_STORAGE_MAX_EVENTS_PER_VEHICLE;
  } else {
    process.env.JSON_STORAGE_MAX_EVENTS_PER_VEHICLE = originalJsonMaxEvents;
  }
});

describe("telemetry retention policy", () => {
  it("uses safe defaults when env vars are absent or invalid", () => {
    delete process.env.TELEMETRY_RETENTION_DAYS;
    process.env.JSON_STORAGE_MAX_EVENTS_PER_VEHICLE = "0";

    expect(getPostgresTelemetryRetentionDays()).toBe(30);
    expect(getJsonStorageMaxEventsPerVehicle()).toBe(250);
  });

  it("exposes the effective configured telemetry retention policy", () => {
    process.env.TELEMETRY_RETENTION_DAYS = "45";
    process.env.JSON_STORAGE_MAX_EVENTS_PER_VEHICLE = "500";

    expect(getTelemetryRetentionPolicy()).toMatchObject({
      activeStorage: expect.any(String),
      postgres: {
        table: "telemetry_events",
        retention: {
          days: 45,
          interval: "45 days",
          envVar: "TELEMETRY_RETENTION_DAYS",
        },
      },
      json: {
        compaction: {
          maxEventsPerVehicle: 500,
          envVar: "JSON_STORAGE_MAX_EVENTS_PER_VEHICLE",
        },
      },
    });
  });

  it("exposes JSON fallback storage readiness when Postgres is not configured", () => {
    const readiness = getJsonTelemetrySchemaReadiness("json");

    expect(readiness).toMatchObject({
      activeStorage: "json",
      postgres: {
        configured: false,
        connected: false,
        tableExists: false,
        timescaleExtensionInstalled: false,
        hypertable: {
          expected: false,
          active: false,
          table: "telemetry_events",
          timeColumn: "timestamp",
        },
        idempotencyTableExists: false,
        migrationBlockers: [],
      },
      fallback: {
        jsonAvailable: true,
        reason: null,
      },
    });
  });
});
