import axios from "axios";

type VehicleSeed = {
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  status: "moving" | "stopped";
};

type SimulationState = VehicleSeed & {
  heading: number;
};

const DEFAULT_INTERVAL_MS = parseInt(process.env.TELEMETRY_SIM_INTERVAL_MS || "2000", 10);
const DEFAULT_VEHICLE_COUNT = parseInt(process.env.TELEMETRY_SIM_VEHICLES || "6", 10);
const DEFAULT_BATCH_SIZE = Math.max(
  1,
  parseInt(process.env.TELEMETRY_SIM_BATCH_SIZE || "25", 10) || 25
);
const DEFAULT_SPREAD_KM = parseFloat(process.env.TELEMETRY_SIM_SPREAD_KM || "12");
const DEFAULT_MIN_SPEED = parseInt(process.env.TELEMETRY_SIM_MIN_SPEED || "25", 10);
const DEFAULT_MAX_SPEED = parseInt(process.env.TELEMETRY_SIM_MAX_SPEED || "85", 10);
const DEFAULT_HEADING_JITTER = parseFloat(process.env.TELEMETRY_SIM_HEADING_JITTER || "18");
const START_ONLY = process.env.TELEMETRY_SIM_ONCE === "true";
const API_BASE = process.env.TELEMETRY_API_BASE || "http://localhost:4001/api";

function kmToLatitudeDegrees(km: number) {
  return km / 110.574;
}

function kmToLongitudeDegrees(km: number, latitude: number) {
  const latitudeFactor = Math.cos((latitude * Math.PI) / 180);
  const divisor = 111.32 * Math.max(latitudeFactor, 0.2);
  return km / divisor;
}

function createInitialFleet(count: number): SimulationState[] {
  const centerLat = parseFloat(process.env.TELEMETRY_SIM_CENTER_LAT || "19.4326");
  const centerLng = parseFloat(process.env.TELEMETRY_SIM_CENTER_LNG || "-99.1332");

  return Array.from({ length: count }, (_, index) => {
    const angle = (index / Math.max(count, 1)) * Math.PI * 2;
    const distanceKm = DEFAULT_SPREAD_KM * (0.35 + Math.random() * 0.6);
    const latOffset = Math.cos(angle) * kmToLatitudeDegrees(distanceKm);
    const lngOffset = Math.sin(angle) * kmToLongitudeDegrees(distanceKm, centerLat);
    return {
      vehicle_id: `veh-${index + 1}`,
      latitude: centerLat + latOffset,
      longitude: centerLng + lngOffset,
      speed: DEFAULT_MIN_SPEED + Math.floor(Math.random() * (DEFAULT_MAX_SPEED - DEFAULT_MIN_SPEED)),
      status: "moving",
      heading: (45 + index * 18 + Math.random() * 45) % 360,
    };
  });
}

function jitter(value: number, amount: number) {
  return value + (Math.random() * 2 - 1) * amount;
}

function nextStatus(current: "moving" | "stopped") {
  const flipChance = current === "moving" ? 0.12 : 0.18;
  return Math.random() < flipChance ? (current === "moving" ? "stopped" : "moving") : current;
}

function nextSpeed(status: "moving" | "stopped", current: number) {
  if (status === "stopped") return 0;
  const candidate = jitter(current || 45, 12);
  return Math.max(DEFAULT_MIN_SPEED, Math.min(DEFAULT_MAX_SPEED, Math.round(candidate)));
}

function advanceVehicle(vehicle: SimulationState): SimulationState {
  const status = nextStatus(vehicle.status);
  const speed = nextSpeed(status, vehicle.speed);
  const distanceKm = status === "stopped" ? 0 : (speed * DEFAULT_INTERVAL_MS) / 3600000;
  const headingRad = (vehicle.heading * Math.PI) / 180;
  const latitudeNoise = (Math.random() - 0.5) * kmToLatitudeDegrees(0.05);
  const longitudeNoise = (Math.random() - 0.5) * kmToLongitudeDegrees(0.05, vehicle.latitude);

  const latitude = vehicle.latitude + Math.cos(headingRad) * kmToLatitudeDegrees(distanceKm) + latitudeNoise;
  const longitude = vehicle.longitude + Math.sin(headingRad) * kmToLongitudeDegrees(distanceKm, vehicle.latitude) + longitudeNoise;
  const heading = (vehicle.heading + jitter(0, DEFAULT_HEADING_JITTER) + 360) % 360;

  return {
    ...vehicle,
    latitude,
    longitude,
    speed,
    status,
    heading,
  };
}

function buildPayload(vehicle: SimulationState) {
  return {
    vehicle_id: vehicle.vehicle_id,
    latitude: Number(vehicle.latitude.toFixed(6)),
    longitude: Number(vehicle.longitude.toFixed(6)),
    speed: vehicle.speed,
    status: vehicle.status,
    timestamp: Date.now(),
  };
}

async function emitTelemetryBatch(vehicles: SimulationState[]) {
  const events = vehicles.map(buildPayload);
  const response = await axios.post(
    `${API_BASE}/telemetry/events/batch`,
    { events },
    {
      timeout: 15000,
    }
  );

  return {
    count: response.data?.count ?? events.length,
    vehicles,
  };
}

function chunkVehicles<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function runOnce() {
  const fleet = createInitialFleet(DEFAULT_VEHICLE_COUNT);
  const batches = chunkVehicles(fleet, DEFAULT_BATCH_SIZE);
  await Promise.all(batches.map((batch) => emitTelemetryBatch(batch)));
}

async function runLoop() {
  let fleet = createInitialFleet(DEFAULT_VEHICLE_COUNT);
  console.log(
    `[sim] starting telemetry simulator with ${fleet.length} vehicles every ${DEFAULT_INTERVAL_MS}ms spread=${DEFAULT_SPREAD_KM}km batchSize=${DEFAULT_BATCH_SIZE}`
  );

  const tick = async () => {
    fleet = fleet.map((vehicle) => advanceVehicle(vehicle));
    const batches = chunkVehicles(fleet, DEFAULT_BATCH_SIZE);
    const sent = await Promise.all(batches.map((batch) => emitTelemetryBatch(batch)));

    const totalEvents = sent.reduce((sum, item) => sum + item.count, 0);
    console.log(`[sim] tick emitted ${totalEvents} events in ${batches.length} batches`);
  };

  await tick();

  const interval = setInterval(() => {
    tick().catch((err) => {
      console.error("[sim] telemetry tick failed:", err);
    });
  }, DEFAULT_INTERVAL_MS);

  const shutdown = () => {
    clearInterval(interval);
    console.log("[sim] telemetry simulator stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  try {
    if (START_ONLY) {
      await runOnce();
      return;
    }
    await runLoop();
  } catch (err) {
    console.error("[sim] simulator failed:", err);
    process.exit(1);
  }
}

void main();
