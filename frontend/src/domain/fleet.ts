export type FleetVehicle = {
  vehicle_id: string;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  status?: string | null;
  lastSeen?: number;
};

export type FleetSummary = {
  totalVehicles: number;
  moving: number;
  stopped: number;
  offline: number;
  online: number;
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

export type VehicleDetail = {
  vehicle_id: string;
  derived?: {
    vehicle_id: string;
    latitude?: number | null;
    longitude?: number | null;
    speed?: number | null;
    status?: string | null;
    lastSeen?: number;
    derivedStatus?: "moving" | "stopped" | "offline";
    isOffline?: boolean;
  } | null;
  lastEvent?: TelemetryEvent | null;
};

export type CriticalZoneAlert = {
  vehicle: FleetVehicle;
  zone: {
    id: string;
    name: string;
    severity: "medium" | "high";
  };
  distanceMeters: number;
  stoppedSince: number;
  stoppedMinutes: number;
};

export type Message = {
  role: "user" | "assistant";
  content: string;
  meta?: string;
};

export type SystemHealth = {
  status: string;
  timestamp: number;
  broker?: string;
  database?: string;
  checks?: {
    broker?: {
      configured: boolean;
      connected: boolean;
      mode: string;
    };
    database?: {
      configured: boolean;
      connected: boolean;
      mode: string;
    };
  };
  metrics?: MetricsSnapshot;
};

export type MetricsSnapshot = {
  counters?: Record<string, number>;
  timings?: Record<string, { count: number; avgMs: number }>;
};

export type OperationalAlert = {
  level: "high" | "medium" | "low";
  text: string;
};

const OFFLINE_THRESHOLD_MS = parseInt(
  process.env.NEXT_PUBLIC_FLEET_OFFLINE_THRESHOLD_MS || "300000",
  10
);

export function isVehicleOffline(vehicle: FleetVehicle, now = Date.now()) {
  return now - (vehicle.lastSeen ?? 0) > OFFLINE_THRESHOLD_MS;
}

export function normalizeVehicle(vehicle: FleetVehicle, now = Date.now()): FleetVehicle {
  const isOffline = isVehicleOffline(vehicle, now);
  const status =
    isOffline
      ? "offline"
      : vehicle.status === "moving" || (vehicle.speed ?? 0) > 0
      ? "moving"
      : "stopped";

  return {
    ...vehicle,
    status,
  };
}

export function normalizeFleetState(vehicles: FleetVehicle[]) {
  const now = Date.now();
  return vehicles.map((vehicle) => normalizeVehicle(vehicle, now));
}

export function summarizeFleet(vehicles: FleetVehicle[]): FleetSummary {
  const normalized = normalizeFleetState(vehicles);
  const moving = normalized.filter((vehicle) => vehicle.status === "moving").length;
  const stopped = normalized.filter((vehicle) => vehicle.status === "stopped").length;
  const offline = normalized.filter((vehicle) => vehicle.status === "offline").length;

  return {
    totalVehicles: normalized.length,
    moving,
    stopped,
    offline,
    online: normalized.length - offline,
  };
}

export function mergeTelemetryEvent(vehicles: FleetVehicle[], event: TelemetryEvent) {
  const nextVehicle: FleetVehicle = {
    vehicle_id: event.vehicle_id,
    latitude: event.latitude,
    longitude: event.longitude,
    speed: event.speed,
    status: event.status,
    lastSeen: event.timestamp,
  };

  const next = new Map<string, FleetVehicle>();
  for (const vehicle of vehicles) {
    next.set(vehicle.vehicle_id, vehicle);
  }
  next.set(nextVehicle.vehicle_id, nextVehicle);

  return Array.from(next.values()).sort((a, b) => {
    const delta = (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
    return delta !== 0 ? delta : a.vehicle_id.localeCompare(b.vehicle_id);
  });
}

export function buildOperationalAlerts({
  health,
  summary,
  criticalAlerts,
  metrics,
}: {
  health: SystemHealth | null;
  summary: FleetSummary;
  criticalAlerts: CriticalZoneAlert[];
  metrics: MetricsSnapshot | null;
}): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (health?.status && health.status !== "ok") {
    alerts.push({ level: "high", text: `Estado del sistema: ${health.status}` });
  }

  if (criticalAlerts.length > 0) {
    alerts.push({
      level: "high",
      text: `${criticalAlerts.length} vehiculos detenidos en zonas criticas por mas de 20 min`,
    });
  }

  if (summary.stopped > 0) {
    alerts.push({
      level: "medium",
      text: `${summary.stopped} vehiculos detenidos detectados`,
    });
  }

  if (summary.offline > 0) {
    alerts.push({
      level: "high",
      text: `${summary.offline} vehiculos offline o sin senal reciente`,
    });
  }

  if ((metrics?.counters?.telemetryErrors ?? 0) > 0) {
    alerts.push({
      level: "high",
      text: `${metrics?.counters?.telemetryErrors ?? 0} errores de telemetria acumulados`,
    });
  }

  if ((metrics?.counters?.agentErrors ?? 0) > 0) {
    alerts.push({
      level: "medium",
      text: `${metrics?.counters?.agentErrors ?? 0} errores del agente acumulados`,
    });
  }

  if (!alerts.length) {
    alerts.push({ level: "low", text: "Sin alertas activas" });
  }

  return alerts;
}
