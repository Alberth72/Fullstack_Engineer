import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTelemetryEvent, buildTelemetryEvents } from "../../src/domain/telemetry";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("domain/telemetry", () => {
  it("builds a normalized telemetry event with defaults", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    const event = buildTelemetryEvent({
      vehicle_id: "veh-1",
      latitude: 19.43,
      longitude: -99.13,
      speed: 42,
      status: "moving",
    });

    expect(event).toMatchObject({
      vehicle_id: "veh-1",
      latitude: 19.43,
      longitude: -99.13,
      speed: 42,
      status: "moving",
      timestamp: 1700000000000,
    });
    expect(event.id).toEqual(expect.any(String));
  });

  it("throws when vehicle_id is missing", () => {
    expect(() =>
      buildTelemetryEvent({
        vehicle_id: "",
      })
    ).toThrow("missing_vehicle_id");
  });

  it("deduplicates batch events by id", () => {
    const events = buildTelemetryEvents([
      {
        id: "evt-1",
        vehicle_id: "veh-1",
        timestamp: 1700000000000,
      },
      {
        id: "evt-1",
        vehicle_id: "veh-2",
        timestamp: 1700000005000,
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "evt-1",
      vehicle_id: "veh-2",
      timestamp: 1700000005000,
    });
  });
});
