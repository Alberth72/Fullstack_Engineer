import { telemetryApplication } from "../application/telemetry";
import { getTelemetryOutboxWorkerConfig } from "../events/outboxWorkerConfig";
import { getOutboxSummary } from "../storage/telemetryOutbox";
import { getTelemetryRetentionPolicy } from "../storage/telemetryRetentionPolicy";

export const recordEvent = telemetryApplication.recordEvent;
export const recordEvents = telemetryApplication.recordEvents;
export const getFleetState = telemetryApplication.getFleetState;
export const getFleetSnapshot = telemetryApplication.getFleetSnapshot;
export const getVehicleEvents = telemetryApplication.getVehicleEvents;
export const getFastestVehicles = telemetryApplication.getFastestVehicles;
export const getFleetSummary = telemetryApplication.getFleetSummary;
export const getVehicleDetail = telemetryApplication.getVehicleDetail;
export const getCriticalZones = telemetryApplication.getCriticalZones;
export const getVehiclesInCriticalZones = telemetryApplication.getVehiclesInCriticalZones;
export const getStoppedVehiclesInCriticalZones =
  telemetryApplication.getStoppedVehiclesInCriticalZones;
export const getTelemetryOutboxSummary = getOutboxSummary;
export const getTelemetryOutboxWorkerEffectiveConfig = getTelemetryOutboxWorkerConfig;
export const getTelemetryRetentionEffectivePolicy = getTelemetryRetentionPolicy;
