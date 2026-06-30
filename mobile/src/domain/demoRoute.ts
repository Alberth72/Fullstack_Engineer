import { createTelemetryEvent } from "./eventFactory";
import type { DriverTelemetryEvent } from "../contracts/telemetry";

type DemoRoutePoint = {
  latitude: number;
  longitude: number;
  speed: number;
  status: DriverTelemetryEvent["status"];
  offsetMs: number;
};

const DEMO_ROUTE_POINTS: DemoRoutePoint[] = [
  {
    latitude: 4.711,
    longitude: -74.0721,
    speed: 0,
    status: "vehicle_started",
    offsetMs: 0,
  },
  {
    latitude: 4.712,
    longitude: -74.0698,
    speed: 18,
    status: "moving",
    offsetMs: 45_000,
  },
  {
    latitude: 4.7098,
    longitude: -74.0669,
    speed: 29,
    status: "moving",
    offsetMs: 90_000,
  },
  {
    latitude: 4.7063,
    longitude: -74.0609,
    speed: 16,
    status: "geofence_enter",
    offsetMs: 135_000,
  },
  {
    latitude: 4.7061,
    longitude: -74.0606,
    speed: 0,
    status: "stopped",
    offsetMs: 180_000,
  },
  {
    latitude: 4.7049,
    longitude: -74.0589,
    speed: 26,
    status: "geofence_exit",
    offsetMs: 225_000,
  },
  {
    latitude: 4.7026,
    longitude: -74.0564,
    speed: 34,
    status: "moving",
    offsetMs: 270_000,
  },
  {
    latitude: 4.6995,
    longitude: -74.0832,
    speed: 0,
    status: "vehicle_stopped",
    offsetMs: 315_000,
  },
];

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export function createDemoTelemetryRoute(
  vehicleId = "veh-mobile-1",
  startAt = Date.now(),
): DriverTelemetryEvent[] {
  return DEMO_ROUTE_POINTS.map((point, index) =>
    createTelemetryEvent({
      eventId: `demo-route-${startAt}-${index}-${randomSuffix()}`,
      vehicleId,
      latitude: point.latitude,
      longitude: point.longitude,
      speed: point.speed,
      status: point.status,
      timestamp: startAt + point.offsetMs,
    }),
  );
}
