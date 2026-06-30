import { v4 as uuidv4 } from "uuid";
import { TelemetryEvent, TelemetryEventInput } from "../types/telemetry";

function isTelemetryPayload(payload: unknown): payload is TelemetryEventInput {
  return !!payload && typeof payload === "object" && !Array.isArray(payload);
}

export function buildTelemetryEvent(payload: TelemetryEventInput): TelemetryEvent {
  if (!isTelemetryPayload(payload)) {
    throw new Error("invalid_payload");
  }

  if (!payload.vehicle_id || typeof payload.vehicle_id !== "string") {
    throw new Error("missing_vehicle_id");
  }

  return {
    id: payload.id ?? uuidv4(),
    vehicle_id: payload.vehicle_id,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    speed: payload.speed ?? null,
    status: payload.status ?? null,
    timestamp: payload.timestamp ?? Date.now(),
  };
}

export function buildTelemetryEvents(payloads: TelemetryEventInput[]): TelemetryEvent[] {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    throw new Error("invalid_payload");
  }

  const deduped = new Map<string, TelemetryEvent>();

  for (const payload of payloads) {
    const event = buildTelemetryEvent(payload);
    deduped.set(event.id, event);
  }

  return Array.from(deduped.values());
}
