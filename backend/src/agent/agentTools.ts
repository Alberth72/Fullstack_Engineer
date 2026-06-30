import * as telemetryService from "../services/telemetryService";

type FleetState = Array<{
  vehicle_id: string;
  latitude?: number;
  longitude?: number;
  speed?: number;
  status?: string;
  lastSeen?: number;
}>;

export async function getFleetState() {
  const vehicles = await telemetryService.getFleetState();
  return { vehicles };
}

export async function getFleetSummary() {
  const summary = await telemetryService.getFleetSummary();
  return summary;
}

export async function getVehicleDetail(input: { vehicle_id: string }) {
  const detail = await telemetryService.getVehicleDetail(input.vehicle_id);
  return detail;
}

export async function getVehicleEvents(input: { vehicle_id: string; limit?: number }) {
  const events = await telemetryService.getVehicleEvents(input.vehicle_id, input.limit ?? 100);
  return { vehicle_id: input.vehicle_id, events };
}

export async function getFastestVehicles(input: { minSpeed?: number; limit?: number }) {
  return telemetryService.getFastestVehicles(input.minSpeed ?? 0, input.limit ?? 5);
}

export async function getStoppedVehicles(input: { minMinutes: number }) {
  const allVehicles = await telemetryService.getFleetState();
  const threshold = Date.now() - input.minMinutes * 60 * 1000;
  const stopped = allVehicles.filter((vehicle) => {
    return vehicle.status === "stopped" && (vehicle.lastSeen ?? 0) <= threshold;
  });
  return { minMinutes: input.minMinutes, vehicles: stopped };
}

export async function getCriticalZones() {
  const zones = await telemetryService.getCriticalZones();
  return { zones };
}

export async function getVehiclesInCriticalZones() {
  const vehicles = await telemetryService.getVehiclesInCriticalZones();
  return { vehicles };
}

export async function getStoppedVehiclesInCriticalZones(input: { minMinutes?: number }) {
  return telemetryService.getStoppedVehiclesInCriticalZones(input.minMinutes ?? 20);
}
