import { afterEach, describe, expect, it, vi } from "vitest";
import { createTelemetryApplication } from "../../../src/application/telemetry/useCases";
import type { TelemetryRepositoryPort } from "../../../src/application/telemetry/ports";
import { snapshotMetrics } from "../../../src/observability/metrics";
import type { TraceContext } from "../../../src/observability/tracing";
import { getCriticalZones } from "../../../src/services/criticalZones";
import type { FleetVehicleState, TelemetryEvent } from "../../../src/types/telemetry";

function createRepositoryMock(
  overrides: Partial<TelemetryRepositoryPort> = {}
): TelemetryRepositoryPort {
  return {
    saveEvent: vi.fn().mockResolvedValue(undefined),
    saveEvents: vi.fn().mockResolvedValue(undefined),
    getFleetState: vi.fn().mockResolvedValue([]),
    getVehicleEvents: vi.fn().mockResolvedValue([]),
    getFastestVehicles: vi.fn().mockResolvedValue({ minSpeed: 0, vehicles: [] }),
    getTelemetryStats: vi.fn().mockResolvedValue({
      totalEvents: 0,
      totalVehicles: 0,
      lastEventAt: null,
    }),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("application/telemetry", () => {
  it("persists a normalized event through the repository", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    const saveEvents = vi.fn().mockResolvedValue(undefined);
    const repository = createRepositoryMock({ saveEvents });
    const app = createTelemetryApplication({ repository, clock: () => 1700000000000 });

    const event = await app.recordEvent({
      vehicle_id: "veh-1",
      latitude: 19.43,
      longitude: -99.13,
      speed: 55,
      status: "moving",
    });

    expect(event).toMatchObject({
      vehicle_id: "veh-1",
      latitude: 19.43,
      longitude: -99.13,
      speed: 55,
      status: "moving",
      timestamp: 1700000000000,
    });
    expect(event.id).toEqual(expect.any(String));
    expect(saveEvents).toHaveBeenCalledTimes(1);
    expect(saveEvents).toHaveBeenCalledWith([event], undefined);
  });

  it("returns a normalized snapshot and summary", async () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const vehicles: FleetVehicleState[] = [
      {
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 50,
        status: "moving",
        lastSeen: now - 1000,
      },
      {
        vehicle_id: "veh-2",
        latitude: 19.44,
        longitude: -99.14,
        speed: 0,
        status: "stopped",
        lastSeen: now - 600000,
      },
    ];

    const repository = createRepositoryMock({
      getFleetState: vi.fn().mockResolvedValue(vehicles),
    });
    const app = createTelemetryApplication({ repository, clock: () => now });

    const snapshot = await app.getFleetSnapshot();

    expect(snapshot.vehicles).toHaveLength(2);
    expect(snapshot.vehicles[0]?.status).toBe("moving");
    expect(snapshot.vehicles[1]?.status).toBe("offline");
    expect(snapshot.summary).toEqual({
      totalVehicles: 2,
      moving: 1,
      stopped: 0,
      offline: 1,
      online: 1,
    });
  });

  it("finds stopped vehicles in critical zones", async () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const [zone] = getCriticalZones();

    const vehicles: FleetVehicleState[] = [
      {
        vehicle_id: "veh-9",
        latitude: zone.latitude,
        longitude: zone.longitude,
        speed: 0,
        status: "stopped",
        lastSeen: now - 60000,
      },
    ];

    const events: TelemetryEvent[] = [
      {
        id: "evt-1",
        vehicle_id: "veh-9",
        latitude: zone.latitude,
        longitude: zone.longitude,
        speed: 0,
        status: "stopped",
        timestamp: now - 30 * 60 * 1000,
      },
      {
        id: "evt-2",
        vehicle_id: "veh-9",
        latitude: zone.latitude,
        longitude: zone.longitude,
        speed: 0,
        status: "stopped",
        timestamp: now - 25 * 60 * 1000,
      },
    ];

    const repository = createRepositoryMock({
      getFleetState: vi.fn().mockResolvedValue(vehicles),
      getVehicleEvents: vi.fn().mockResolvedValue(events),
    });
    const app = createTelemetryApplication({ repository, clock: () => now });

    const result = await app.getStoppedVehiclesInCriticalZones(20);

    expect(result.minMinutes).toBe(20);
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]?.vehicle.vehicle_id).toBe("veh-9");
    expect(result.vehicles[0]?.stoppedMinutes).toBeGreaterThanOrEqual(25);
  });

  it("delegates fastest vehicle queries to the repository", async () => {
    const repository = createRepositoryMock({
      getFastestVehicles: vi.fn().mockResolvedValue({
        minSpeed: 59,
        vehicles: [
          {
            vehicle_id: "veh-1",
            maxSpeed: 61,
            maxSpeedAt: 1700000000000,
            lastSeen: 1700000000000,
            eventCount: 4,
          },
        ],
      }),
    });
    const app = createTelemetryApplication({ repository, clock: () => 1700000000000 });

    const result = await app.getFastestVehicles(59, 3);

    expect(repository.getFastestVehicles).toHaveBeenCalledWith(59, 3);
    expect(result.minSpeed).toBe(59);
    expect(result.vehicles[0]?.vehicle_id).toBe("veh-1");
    expect(result.vehicles[0]?.maxSpeed).toBe(61);
  });

  it("records write metrics for inserted, updated and duplicate batch events", async () => {
    const before = snapshotMetrics().counters;
    const saveEvents = vi.fn().mockResolvedValue({
      storage: "json",
      received: 1,
      unique: 1,
      inserted: 0,
      updated: 1,
      duplicateInBatch: 0,
      outboxCreated: 0,
      outboxSkipped: 1,
    });
    const repository = createRepositoryMock({ saveEvents });
    const app = createTelemetryApplication({ repository, clock: () => 1700000000000 });

    await app.recordEvents([
      {
        id: "evt-duplicate",
        vehicle_id: "veh-1",
        timestamp: 1700000000000,
      },
      {
        id: "evt-duplicate",
        vehicle_id: "veh-1",
        timestamp: 1700000001000,
      },
    ]);

    const after = snapshotMetrics().counters;
    expect(after.telemetryEventsReceived - before.telemetryEventsReceived).toBe(2);
    expect(after.telemetryEvents - before.telemetryEvents).toBe(1);
    expect(after.telemetryEventsInserted - before.telemetryEventsInserted).toBe(0);
    expect(after.telemetryEventsUpdated - before.telemetryEventsUpdated).toBe(1);
    expect(after.telemetryEventsDuplicateInBatch - before.telemetryEventsDuplicateInBatch).toBe(1);
    expect(after.telemetryOutboxCreated - before.telemetryOutboxCreated).toBe(0);
    expect(after.telemetryOutboxSkipped - before.telemetryOutboxSkipped).toBe(1);
  });

  it("propagates trace context to repository and outbox notifier", async () => {
    const trace: TraceContext = {
      traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      spanId: "bbbbbbbbbbbbbbbb",
      parentSpanId: null,
      requestId: "req-test",
      sampled: true,
    };
    const saveEvents = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn().mockResolvedValue(undefined);
    const repository = createRepositoryMock({ saveEvents });
    const app = createTelemetryApplication({
      repository,
      clock: () => 1700000000000,
      outboxNotifier: { notify },
    });

    const events = await app.recordEvents(
      [
        {
          id: "evt-traced",
          vehicle_id: "veh-1",
          timestamp: 1700000000000,
        },
      ],
      trace
    );

    expect(saveEvents).toHaveBeenCalledWith(events, trace);
    expect(notify).toHaveBeenCalledWith(events, trace);
  });
});
