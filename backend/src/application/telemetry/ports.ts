import type {
  FleetVehicleState,
  TelemetryEvent,
  TelemetryEventInput,
} from "../../types/telemetry";
import type {
  CriticalZone,
  StoppedVehicleInCriticalZone,
  VehicleInCriticalZone,
} from "../../services/criticalZones";
import type {
  FleetSnapshot,
  FleetSummary,
  FleetVehicleDetail,
} from "../../services/fleetReadModel";
import type { TelemetryWriteResult } from "../../storage/telemetryWriteStats";
import type { TraceContext } from "../../observability/tracing";

export type TelemetryRepositoryPort = {
  saveEvent(event: TelemetryEvent, trace?: TraceContext): Promise<TelemetryWriteResult | void>;
  saveEvents(events: TelemetryEvent[], trace?: TraceContext): Promise<TelemetryWriteResult | void>;
  getFleetState(): Promise<FleetVehicleState[]>;
  getVehicleEvents(vehicleId: string, limit?: number): Promise<TelemetryEvent[]>;
  getFastestVehicles(minSpeed?: number, limit?: number): Promise<FastestVehiclesResult>;
  getTelemetryStats(): Promise<TelemetryStats>;
};

export type FastestVehiclesResult = {
  minSpeed: number;
  vehicles: Array<{
    vehicle_id: string;
    maxSpeed: number;
    maxSpeedAt: number | null;
    lastSeen: number | null;
    eventCount: number;
  }>;
};

export type TelemetryStats = {
  totalEvents: number;
  totalVehicles: number;
  lastEventAt: number | null;
};

export type TelemetryClock = () => number;

export type TelemetryApplication = {
  recordEvent(payload: TelemetryEventInput, trace?: TraceContext): Promise<TelemetryEvent>;
  recordEvents(payloads: TelemetryEventInput[], trace?: TraceContext): Promise<TelemetryEvent[]>;
  getFleetState(): Promise<FleetVehicleState[]>;
  getFleetSnapshot(): Promise<FleetSnapshot>;
  getFleetSummary(): Promise<FleetSummary>;
  getVehicleEvents(vehicleId: string, limit?: number): Promise<TelemetryEvent[]>;
  getFastestVehicles(minSpeed?: number, limit?: number): Promise<FastestVehiclesResult>;
  getVehicleDetail(vehicleId: string): Promise<{
    vehicle_id: string;
    derived: FleetVehicleDetail | null;
    lastEvent: TelemetryEvent | null;
  }>;
  getCriticalZones(): Promise<CriticalZone[]>;
  getVehiclesInCriticalZones(): Promise<VehicleInCriticalZone[]>;
  getStoppedVehiclesInCriticalZones(minMinutes?: number): Promise<{
    minMinutes: number;
    vehicles: StoppedVehicleInCriticalZone[];
  }>;
};

export type TelemetryOutboxNotifier = {
  notify(events: TelemetryEvent[], trace?: TraceContext): Promise<void>;
};
