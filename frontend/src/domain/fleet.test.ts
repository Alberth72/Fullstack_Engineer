import { describe, expect, it } from "vitest";
import {
  buildOperationalAlerts,
  mergeTelemetryEvent,
  summarizeFleet,
  type CriticalZoneAlert,
  type FleetVehicle,
  type MetricsSnapshot,
  type SystemHealth,
  type TelemetryEvent,
} from "./fleet";

describe("fleet domain helpers", () => {
  it("summarizes fleet status with offline, stopped and moving vehicles", () => {
    const vehicles: FleetVehicle[] = [
      { vehicle_id: "veh-1", status: "moving", lastSeen: Date.now() },
      { vehicle_id: "veh-2", status: "stopped", lastSeen: Date.now() },
      { vehicle_id: "veh-3", status: "moving", lastSeen: 0 },
    ];

    expect(summarizeFleet(vehicles)).toEqual({
      totalVehicles: 3,
      moving: 1,
      stopped: 1,
      offline: 1,
      online: 2,
    });
  });

  it("merges telemetry events and keeps the newest vehicle first", () => {
    const vehicles: FleetVehicle[] = [
      { vehicle_id: "veh-2", status: "stopped", lastSeen: 10 },
      { vehicle_id: "veh-1", status: "moving", lastSeen: 20 },
    ];
    const event: TelemetryEvent = {
      id: "evt-1",
      vehicle_id: "veh-3",
      latitude: 19.4,
      longitude: -99.1,
      speed: 48,
      status: "moving",
      timestamp: 30,
    };

    const next = mergeTelemetryEvent(vehicles, event);

    expect(next[0]).toMatchObject({ vehicle_id: "veh-3", lastSeen: 30, speed: 48 });
    expect(next.map((vehicle) => vehicle.vehicle_id)).toEqual(["veh-3", "veh-1", "veh-2"]);
  });

  it("builds operational alerts from health, critical zones and metrics", () => {
    const health: SystemHealth = {
      status: "degraded",
      timestamp: Date.now(),
      broker: "memory",
      database: "json",
    };
    const summary = {
      totalVehicles: 4,
      moving: 2,
      stopped: 1,
      offline: 1,
      online: 3,
    };
    const criticalAlerts: CriticalZoneAlert[] = [
      {
        vehicle: { vehicle_id: "veh-1", status: "stopped", lastSeen: Date.now() },
        zone: { id: "z-1", name: "Centro", severity: "high" },
        distanceMeters: 120,
        stoppedSince: Date.now() - 1000 * 60 * 25,
        stoppedMinutes: 25,
      },
    ];
    const metrics: MetricsSnapshot = {
      counters: {
        telemetryErrors: 2,
        agentErrors: 1,
      },
    };

    const alerts = buildOperationalAlerts({
      health,
      summary,
      criticalAlerts,
      metrics,
    });

    expect(alerts.map((alert) => alert.text)).toEqual(
      expect.arrayContaining([
        "Estado del sistema: degraded",
        "1 vehiculos detenidos en zonas criticas por mas de 20 min",
        "1 vehiculos detenidos detectados",
        "1 vehiculos offline o sin senal reciente",
        "2 errores de telemetria acumulados",
        "1 errores del agente acumulados",
      ])
    );
  });
});
