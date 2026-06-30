import { buildTelemetryEvents } from "../../domain/telemetry";
import { incrementCounter } from "../../observability/metrics";
import {
  buildFleetSnapshot,
  buildVehicleDetail,
  type FleetSnapshot,
} from "../../services/fleetReadModel";
import type { StoppedVehicleInCriticalZone } from "../../services/criticalZones";
import {
  calculateStoppedSince,
  getCriticalZones as getConfiguredCriticalZones,
  getVehiclesInCriticalZones as buildVehiclesInCriticalZones,
} from "../../services/criticalZones";
import { TelemetryApplication, TelemetryClock, TelemetryRepositoryPort } from "./ports";
import type { TelemetryOutboxNotifier } from "./ports";
import { TelemetryEvent, TelemetryEventInput } from "../../types/telemetry";
import type { TelemetryWriteResult } from "../../storage/telemetryWriteStats";

function recordTelemetryWriteMetrics(result: TelemetryWriteResult | void, inputDuplicates = 0) {
  if (!result) return;

  incrementCounter("telemetryEventsInserted", result.inserted);
  incrementCounter("telemetryEventsUpdated", result.updated);
  incrementCounter(
    "telemetryEventsDuplicateInBatch",
    result.duplicateInBatch + inputDuplicates
  );
  incrementCounter("telemetryOutboxCreated", result.outboxCreated);
  incrementCounter("telemetryOutboxSkipped", result.outboxSkipped);
}

export function createTelemetryApplication(deps: {
  repository: TelemetryRepositoryPort;
  clock?: TelemetryClock;
  outboxNotifier?: TelemetryOutboxNotifier;
}): TelemetryApplication {
  const now = deps.clock ?? Date.now;

  const recordEvents = async (payloads: TelemetryEventInput[]): Promise<TelemetryEvent[]> => {
    const events = buildTelemetryEvents(payloads);
    const inputDuplicates = Math.max(0, payloads.length - events.length);
    const writeResult = await deps.repository.saveEvents(events);
    recordTelemetryWriteMetrics(writeResult, inputDuplicates);
    if (deps.outboxNotifier) {
      await deps.outboxNotifier.notify(events);
    }
    incrementCounter("telemetryEventsReceived", payloads.length);
    incrementCounter("telemetryEvents", events.length);
    return events;
  };

  const recordEvent = async (payload: TelemetryEventInput): Promise<TelemetryEvent> => {
    const events = await recordEvents([payload]);
    return events[0]!;
  };

  const getFleetSnapshot = async () => {
    const vehicles = await deps.repository.getFleetState();
    return buildFleetSnapshot(vehicles);
  };

  const getFleetState = async () => {
    const snapshot = await getFleetSnapshot();
    return snapshot.vehicles;
  };

  const getFleetSummary = async () => {
    const snapshot = await getFleetSnapshot();
    return snapshot.summary;
  };

  const getVehicleEvents = async (vehicleId: string, limit = 100) => {
    return deps.repository.getVehicleEvents(vehicleId, limit);
  };

  const getFastestVehicles = async (minSpeed = 0, limit = 5) => {
    return deps.repository.getFastestVehicles(minSpeed, limit);
  };

  const getVehicleDetail = async (vehicleId: string) => {
    const [vehicles, events] = await Promise.all([
      deps.repository.getFleetState(),
      deps.repository.getVehicleEvents(vehicleId, 1),
    ]);

    const current = vehicles.find((vehicle) => vehicle.vehicle_id === vehicleId);
    const derived = buildVehicleDetail(current);

    return {
      vehicle_id: vehicleId,
      derived,
      lastEvent: events[0] ?? null,
    };
  };

  const getCriticalZones = async () => {
    return getConfiguredCriticalZones();
  };

  const getVehiclesInCriticalZones = async () => {
    const vehicles = await deps.repository.getFleetState();
    return buildVehiclesInCriticalZones(vehicles);
  };

  const getStoppedVehiclesInCriticalZones = async (minMinutes = 20) => {
    const candidates = await getVehiclesInCriticalZones();
    const nowMs = now();
    const alerts: StoppedVehicleInCriticalZone[] = [];

    const stoppedCandidates = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        events: await deps.repository.getVehicleEvents(candidate.vehicle.vehicle_id, 200),
      }))
    );

    for (const { candidate, events } of stoppedCandidates) {
      if (candidate.vehicle.status !== "stopped") continue;

      const stoppedSince = calculateStoppedSince(events);
      if (!stoppedSince) continue;

      const stoppedMinutes = Math.floor((nowMs - stoppedSince) / 60000);
      if (stoppedMinutes < minMinutes) continue;

      alerts.push({
        ...candidate,
        stoppedSince,
        stoppedMinutes,
      });
    }

    return {
      minMinutes,
      vehicles: alerts,
    };
  };

  return {
    recordEvent,
    recordEvents,
    getFleetState,
    getFleetSnapshot,
    getFleetSummary,
    getVehicleEvents,
    getFastestVehicles,
    getVehicleDetail,
    getCriticalZones,
    getVehiclesInCriticalZones,
    getStoppedVehiclesInCriticalZones,
  };
}
