import { FleetVehicleState, TelemetryEvent } from "../types/telemetry";
import { normalizeFleetState } from "./fleetReadModel";

export type CriticalZone = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  severity: "medium" | "high";
};

export type VehicleInCriticalZone = {
  vehicle: FleetVehicleState;
  zone: CriticalZone;
  distanceMeters: number;
};

export type StoppedVehicleInCriticalZone = VehicleInCriticalZone & {
  stoppedSince: number;
  stoppedMinutes: number;
};

const EARTH_RADIUS_METERS = 6371000;

const CRITICAL_ZONES: CriticalZone[] = [
  {
    id: "centro-historico",
    name: "Centro Historico",
    latitude: 19.4326,
    longitude: -99.1332,
    radiusMeters: 3000,
    severity: "high",
  },
  {
    id: "zona-industrial-norte",
    name: "Zona Industrial Norte",
    latitude: 19.5042,
    longitude: -99.1469,
    radiusMeters: 2500,
    severity: "medium",
  },
  {
    id: "aeropuerto-logistico",
    name: "Corredor Logistico Aeropuerto",
    latitude: 19.4361,
    longitude: -99.0719,
    radiusMeters: 2200,
    severity: "high",
  },
];

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getCriticalZones() {
  return CRITICAL_ZONES;
}

export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return Math.round(EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function findCriticalZoneForVehicle(vehicle: FleetVehicleState) {
  if (vehicle.latitude === null || vehicle.latitude === undefined) return null;
  if (vehicle.longitude === null || vehicle.longitude === undefined) return null;

  const vehiclePoint = {
    latitude: vehicle.latitude,
    longitude: vehicle.longitude,
  };

  return CRITICAL_ZONES
    .map((zone) => ({
      zone,
      distanceMeters: distanceMeters(vehiclePoint, zone),
    }))
    .filter((match) => match.distanceMeters <= match.zone.radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0] ?? null;
}

export function getVehiclesInCriticalZones(vehicles: FleetVehicleState[]): VehicleInCriticalZone[] {
  return normalizeFleetState(vehicles).flatMap((vehicle) => {
    const match = findCriticalZoneForVehicle(vehicle);
    if (!match) return [];

    return [
      {
        vehicle,
        zone: match.zone,
        distanceMeters: match.distanceMeters,
      },
    ];
  });
}

export function isStoppedTelemetry(event: TelemetryEvent | FleetVehicleState) {
  if (event.status === "moving") return false;
  return event.status === "stopped" || event.speed === 0;
}

export function calculateStoppedSince(events: TelemetryEvent[]) {
  const sortedEvents = [...events].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sortedEvents[0];
  if (!latest || !isStoppedTelemetry(latest)) return null;

  let stoppedSince = latest.timestamp;

  for (const event of sortedEvents) {
    if (!isStoppedTelemetry(event)) break;
    stoppedSince = event.timestamp;
  }

  return stoppedSince;
}
