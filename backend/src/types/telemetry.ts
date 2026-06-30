export type TelemetryEventInput = {
  id?: string;
  vehicle_id: string;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  status?: string | null;
  timestamp?: number;
};

export type TelemetryEventBatchInput = {
  events: TelemetryEventInput[];
};

export type TelemetryEvent = {
  id: string;
  vehicle_id: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  status: string | null;
  timestamp: number;
};

export type FleetVehicleState = {
  vehicle_id: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  status: string | null;
  lastSeen: number;
};
