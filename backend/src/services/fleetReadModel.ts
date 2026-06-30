import { FleetVehicleState } from "../types/telemetry";

export type FleetSummary = {
  totalVehicles: number;
  moving: number;
  stopped: number;
  offline: number;
  online: number;
};

export type FleetVehicleDetail = FleetVehicleState & {
  derivedStatus: "moving" | "stopped" | "offline";
  isOffline: boolean;
};

export type FleetSnapshot = {
  vehicles: FleetVehicleState[];
  summary: FleetSummary;
};

const OFFLINE_THRESHOLD_MS =
  parseInt(process.env.FLEET_OFFLINE_THRESHOLD_MS || "300000", 10);

export function normalizeFleetState(vehicles: FleetVehicleState[]): FleetVehicleState[] {
  const now = Date.now();

  return vehicles.map((vehicle) => {
    const isOffline = now - (vehicle.lastSeen ?? 0) > OFFLINE_THRESHOLD_MS;
    const status =
      isOffline
        ? "offline"
        : vehicle.status === "moving" || (vehicle.speed ?? 0) > 0
        ? "moving"
        : "stopped";

    return {
      ...vehicle,
      status,
    };
  });
}

export function buildFleetSummary(vehicles: FleetVehicleState[]): FleetSummary {
  return buildFleetSummaryFromNormalized(normalizeFleetState(vehicles));
}

export function buildFleetSummaryFromNormalized(
  normalized: FleetVehicleState[]
): FleetSummary {
  const moving = normalized.filter((vehicle) => vehicle.status === "moving").length;
  const stopped = normalized.filter((vehicle) => vehicle.status === "stopped").length;
  const offline = normalized.filter((vehicle) => vehicle.status === "offline").length;

  return {
    totalVehicles: normalized.length,
    moving,
    stopped,
    offline,
    online: normalized.length - offline,
  };
}

export function buildFleetSnapshot(vehicles: FleetVehicleState[]): FleetSnapshot {
  const normalized = normalizeFleetState(vehicles);

  return {
    vehicles: normalized,
    summary: buildFleetSummaryFromNormalized(normalized),
  };
}

export function buildVehicleDetail(vehicle: FleetVehicleState | undefined): FleetVehicleDetail | null {
  if (!vehicle) return null;

  const normalized = normalizeFleetState([vehicle])[0];
  const derivedStatus = (normalized.status || "stopped") as "moving" | "stopped" | "offline";
  const isOffline = derivedStatus === "offline";

  return {
    ...normalized,
    derivedStatus,
    isOffline,
  };
}
