import type { DriverTelemetryEvent, DriverTelemetryPayload } from "../contracts/telemetry";

type CreateTelemetryEventInput = {
  eventId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed: number;
  status: DriverTelemetryEvent["status"];
  timestamp?: number;
};

export function createTelemetryEvent(input: CreateTelemetryEventInput): DriverTelemetryEvent {
  const timestamp = input.timestamp ?? Date.now();
  return {
    eventId: input.eventId,
    vehicle_id: input.vehicleId,
    latitude: input.latitude,
    longitude: input.longitude,
    speed: input.speed,
    status: input.status,
    timestamp,
    syncStatus: "pending",
    retryCount: 0,
    lastError: null,
  };
}

export function toPayload(event: DriverTelemetryEvent): DriverTelemetryPayload {
  return {
    eventId: event.eventId,
    vehicle_id: event.vehicle_id,
    latitude: event.latitude,
    longitude: event.longitude,
    speed: event.speed,
    status: event.status,
    timestamp: event.timestamp,
  };
}
