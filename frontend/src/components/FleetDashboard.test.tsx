import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FleetDashboard from "./FleetDashboard";

const mockUseFleetDashboard = vi.fn();
function MockFleetMap() {
  return React.createElement("div", { "data-testid": "fleet-map" }, "mapa");
}

vi.mock("next/dynamic", () => ({
  default: () => MockFleetMap,
}));

vi.mock("@/hooks/useFleetDashboard", () => ({
  useFleetDashboard: () => mockUseFleetDashboard(),
}));

describe("FleetDashboard", () => {
  beforeEach(() => {
    mockUseFleetDashboard.mockReturnValue({
      vehicles: [
        {
          vehicle_id: "veh-1",
          status: "moving",
          speed: 61,
          latitude: 19.4326,
          longitude: -99.1332,
          lastSeen: Date.now(),
        },
        {
          vehicle_id: "veh-2",
          status: "stopped",
          speed: 0,
          latitude: 19.43,
          longitude: -99.12,
          lastSeen: Date.now() - 1000 * 60 * 5,
        },
      ],
      messages: [],
      question: "",
      setQuestion: vi.fn(),
      loading: false,
      refreshInterval: 10000,
      setRefreshInterval: vi.fn(),
      health: {
        status: "ok",
        timestamp: Date.now(),
        broker: "rabbitmq",
        database: "postgres",
        checks: {
          broker: { configured: true, connected: true, mode: "rabbitmq" },
          database: { configured: true, connected: true, mode: "postgres" },
        },
        metrics: {
          counters: { requests: 12 },
          timings: { "GET /health": { count: 1, avgMs: 2 } },
        },
      },
      metrics: {
        counters: { requests: 12, telemetryEvents: 24, telemetryErrors: 0, agentQueries: 1, agentErrors: 0 },
        timings: { "GET /health": { count: 1, avgMs: 2 } },
      },
      summary: {
        totalVehicles: 2,
        moving: 1,
        stopped: 1,
        offline: 0,
        online: 2,
      },
      vehicleDetail: {
        vehicle_id: "veh-1",
        derived: {
          vehicle_id: "veh-1",
          latitude: 19.4326,
          longitude: -99.1332,
          speed: 61,
          status: "moving",
          lastSeen: Date.now(),
          derivedStatus: "moving",
          isOffline: false,
        },
        lastEvent: null,
      },
      selectedVehicleId: "veh-1",
      setSelectedVehicleId: vi.fn(),
      criticalAlerts: [],
      operationalAlerts: [{ level: "low", text: "Sin alertas activas" }],
      selectedVehicle: {
        vehicle_id: "veh-1",
        status: "moving",
        speed: 61,
        latitude: 19.4326,
        longitude: -99.1332,
        lastSeen: Date.now(),
      },
      connectionStatus: "connected",
      lastSyncAt: Date.now(),
      isPending: false,
      handleQueryAgent: vi.fn(),
    });
  });

  it("renders the operational dashboard and the real health checks", () => {
    render(React.createElement(FleetDashboard));

    expect(screen.getByRole("heading", { name: "Panel operativo de telemetria" })).toBeInTheDocument();
    expect(screen.getByText("Salud del sistema")).toBeInTheDocument();
    expect(screen.getByText("Rabbit real")).toBeInTheDocument();
    expect(screen.getByText("Postgres real")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "veh-1", level: 3 })).toBeInTheDocument();
    expect(screen.getByTestId("fleet-map")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Haz una pregunta sobre la flota...")).toBeInTheDocument();
  });
});
