import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/telemetryService", () => ({
  recordEvent: vi.fn(),
  recordEvents: vi.fn(),
  getFleetState: vi.fn(),
  getFleetSnapshot: vi.fn(),
  getFleetSummary: vi.fn(),
  getVehicleEvents: vi.fn(),
  getVehicleDetail: vi.fn(),
  getCriticalZones: vi.fn(),
  getVehiclesInCriticalZones: vi.fn(),
  getStoppedVehiclesInCriticalZones: vi.fn(),
  getTelemetryOutboxSummary: vi.fn(),
  getTelemetryOutboxWorkerEffectiveConfig: vi.fn(),
}));

import { createApp } from "../../src/app";
import * as telemetryService from "../../src/services/telemetryService";

const mockedTelemetryService = vi.mocked(telemetryService);
const originalAdminToken = process.env.ADMIN_API_TOKEN;

describe("telemetry routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_API_TOKEN;
    } else {
      process.env.ADMIN_API_TOKEN = originalAdminToken;
    }

    vi.restoreAllMocks();
  });

  it("accepts a telemetry event", async () => {
    const event = {
      id: "evt-1",
      vehicle_id: "veh-1",
      latitude: 19.43,
      longitude: -99.13,
      speed: 50,
      status: "moving",
      timestamp: 1700000000000,
    };

    mockedTelemetryService.recordEvent.mockResolvedValue(event);

    const res = await request(createApp())
      .post("/api/telemetry/event")
      .send({
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 50,
        status: "moving",
      });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: "accepted", event });
  });

  it("rejects an invalid telemetry event", async () => {
    mockedTelemetryService.recordEvent.mockRejectedValue(new Error("missing_vehicle_id"));

    const res = await request(createApp())
      .post("/api/telemetry/event")
      .send({
        vehicle_id: "",
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_payload" });
  });

  it("accepts a telemetry batch", async () => {
    const events = [
      {
        id: "evt-1",
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 50,
        status: "moving",
        timestamp: 1700000000000,
      },
      {
        id: "evt-2",
        vehicle_id: "veh-2",
        latitude: 19.44,
        longitude: -99.14,
        speed: 0,
        status: "stopped",
        timestamp: 1700000005000,
      },
    ];

    mockedTelemetryService.recordEvents.mockResolvedValue(events);

    const res = await request(createApp())
      .post("/api/telemetry/events/batch")
      .send({
        events: events.map(({ id, ...event }) => event),
      });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "accepted", count: 2 });
  });

  it("returns the fleet snapshot", async () => {
    const snapshot = {
      vehicles: [
        {
          vehicle_id: "veh-1",
          latitude: 19.43,
          longitude: -99.13,
          speed: 50,
          status: "moving",
          lastSeen: 1700000000000,
        },
      ],
      summary: {
        totalVehicles: 1,
        moving: 1,
        stopped: 0,
        offline: 0,
        online: 1,
      },
    };

    mockedTelemetryService.getFleetSnapshot.mockResolvedValue(snapshot);

    const res = await request(createApp()).get("/api/telemetry/state");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(snapshot);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("returns the fleet summary", async () => {
    const summary = {
      totalVehicles: 2,
      moving: 1,
      stopped: 1,
      offline: 0,
      online: 2,
    };

    mockedTelemetryService.getFleetSummary.mockResolvedValue(summary);

    const res = await request(createApp()).get("/api/telemetry/summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
  });

  it("returns critical zone data", async () => {
    const zones = [{ id: "zone-1", name: "Zone 1" }];
    const stoppedVehicles = { minMinutes: 20, vehicles: [] };

    mockedTelemetryService.getCriticalZones.mockResolvedValue(zones as never);
    mockedTelemetryService.getVehiclesInCriticalZones.mockResolvedValue([] as never);
    mockedTelemetryService.getStoppedVehiclesInCriticalZones.mockResolvedValue(stoppedVehicles as never);

    const zonesRes = await request(createApp()).get("/api/telemetry/critical-zones");
    const stoppedRes = await request(createApp()).get("/api/telemetry/critical-zones/stopped");

    expect(zonesRes.status).toBe(200);
    expect(zonesRes.body).toEqual({ zones });
    expect(stoppedRes.status).toBe(200);
    expect(stoppedRes.body).toEqual(stoppedVehicles);
  });

  it("returns vehicle events", async () => {
    const events = [
      {
        id: "evt-1",
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 50,
        status: "moving",
        timestamp: 1700000000000,
      },
    ];

    mockedTelemetryService.getVehicleEvents.mockResolvedValue(events);

    const res = await request(createApp()).get("/api/telemetry/vehicle/veh-1/events");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ vehicle_id: "veh-1", events });
  });

  it("returns the telemetry outbox admin summary", async () => {
    const summary = {
      generatedAt: 1700000000000,
      storage: "json",
      total: 4,
      byStatus: {
        pending: 1,
        processing: 1,
        retry: 1,
        published: 1,
        dead: 0,
      },
      readyToPublish: 2,
      blockedUntilLater: 1,
      oldestPendingAt: 1700000000000,
      nextAttemptAt: 1700000005000,
      latestPublishedAt: 1700000003000,
      deadLetterCount: 0,
      retryCount: 1,
      processingCount: 1,
      errorSamples: [
        {
          id: "evt-retry",
          vehicle_id: "veh-2",
          status: "retry",
          attempts: 2,
          maxAttempts: 8,
          nextAttemptAt: 1700000005000,
          lastError: "broker_down",
        },
      ],
    };

    mockedTelemetryService.getTelemetryOutboxSummary.mockResolvedValue(summary as never);

    const res = await request(createApp()).get("/api/telemetry/admin/outbox");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
  });

  it("requires admin token for telemetry admin routes when configured", async () => {
    process.env.ADMIN_API_TOKEN = "secret-token";
    mockedTelemetryService.getTelemetryOutboxSummary.mockResolvedValue({
      generatedAt: 1700000000000,
      storage: "json",
      total: 0,
      byStatus: {
        pending: 0,
        processing: 0,
        retry: 0,
        published: 0,
        dead: 0,
      },
      readyToPublish: 0,
      blockedUntilLater: 0,
      oldestPendingAt: null,
      nextAttemptAt: null,
      latestPublishedAt: null,
      deadLetterCount: 0,
      retryCount: 0,
      processingCount: 0,
      errorSamples: [],
    } as never);

    const rejected = await request(createApp()).get("/api/telemetry/admin/outbox");
    const accepted = await request(createApp())
      .get("/api/telemetry/admin/outbox")
      .set("X-Admin-Token", "secret-token");

    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: "admin_auth_required" });
    expect(accepted.status).toBe(200);
  });

  it("returns the telemetry outbox worker effective configuration", async () => {
    const config = {
      pollIntervalMs: 750,
      claimLimit: 40,
      lockTimeoutMs: 45000,
      publishRetry: {
        attempts: 4,
        baseDelayMs: 300,
        maxDelayMs: 2000,
      },
      retryBackoff: {
        strategy: "exponential",
        baseDelayMs: 600,
        maxDelayMs: 12000,
      },
      defaults: {
        pollIntervalMs: 1000,
        claimLimit: 25,
        lockTimeoutMs: 30000,
        publishRetry: {
          attempts: 3,
          baseDelayMs: 250,
          maxDelayMs: 1500,
        },
        retryBackoff: {
          strategy: "exponential",
          baseDelayMs: 500,
          maxDelayMs: 10000,
        },
      },
    };

    mockedTelemetryService.getTelemetryOutboxWorkerEffectiveConfig.mockReturnValue(
      config as never
    );

    const res = await request(createApp()).get("/api/telemetry/admin/outbox/config");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ worker: config });
  });

  it("returns the telemetry ingestion admin counters", async () => {
    const res = await request(createApp()).get("/api/telemetry/admin/ingestion");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      generatedAt: expect.any(Number),
      receivedEvents: expect.any(Number),
      acceptedUniqueEvents: expect.any(Number),
      insertedEvents: expect.any(Number),
      updatedEvents: expect.any(Number),
      duplicateInBatchEvents: expect.any(Number),
      outboxCreated: expect.any(Number),
      outboxSkipped: expect.any(Number),
      idempotentWrites: expect.any(Number),
    });
  });

  it("returns vehicle detail when the vehicle exists", async () => {
    const detail = {
      vehicle_id: "veh-1",
      derived: {
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 50,
        status: "moving",
        lastSeen: 1700000000000,
        derivedStatus: "moving",
        isOffline: false,
      },
      lastEvent: {
        id: "evt-1",
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 50,
        status: "moving",
        timestamp: 1700000000000,
      },
    };

    mockedTelemetryService.getVehicleDetail.mockResolvedValue(detail as never);

    const res = await request(createApp()).get("/api/telemetry/vehicle/veh-1/detail");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(detail);
  });

  it("returns 404 when vehicle detail is missing", async () => {
    mockedTelemetryService.getVehicleDetail.mockResolvedValue({
      vehicle_id: "veh-404",
      derived: null,
      lastEvent: null,
    });

    const res = await request(createApp()).get("/api/telemetry/vehicle/veh-404/detail");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "vehicle_not_found", vehicle_id: "veh-404" });
  });
});
