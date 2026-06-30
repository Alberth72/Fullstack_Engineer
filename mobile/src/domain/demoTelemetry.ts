import { createTelemetryEvent } from "./eventFactory";
import type { DriverTelemetryEvent } from "../contracts/telemetry";

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export function createDemoTelemetryEvent(
  vehicleId = "veh-mobile-1",
  speed = 32,
): DriverTelemetryEvent {
  return createTelemetryEvent({
    eventId: `demo-${Date.now()}-${randomSuffix()}`,
    vehicleId,
    latitude: 4.711,
    longitude: -74.0721,
    speed,
    status: speed > 0 ? "moving" : "stopped",
    timestamp: Date.now(),
  });
}
