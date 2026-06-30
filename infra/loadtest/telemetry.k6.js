import http from "k6/http";
import { check, sleep } from "k6";

const VEHICLE_COUNT = Math.max(1, parseInt(__ENV.VEHICLE_COUNT || "10000", 10) || 10000);
const BATCH_SIZE = Math.max(1, parseInt(__ENV.BATCH_SIZE || "100", 10) || 100);
const RATE = Math.max(1, parseInt(__ENV.RATE || "10", 10) || 10);
const DURATION = __ENV.DURATION || "5m";
const MODE = __ENV.MODE || "batch";
const USE_BATCH = MODE !== "single";
const INVALID_RATE = parseFloat(__ENV.INVALID_RATE || "0.05");
const DUPLICATE_RATE = parseFloat(__ENV.DUPLICATE_RATE || "0.10");

export const options = {
  scenarios: {
    telemetry_stream: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
};

const fleet = Array.from({ length: VEHICLE_COUNT }, (_, index) => `veh-${index + 1}`);

function randomVehicleId() {
  return fleet[Math.floor(Math.random() * fleet.length)];
}

function randomLatitude() {
  return 19.43 + (Math.random() * 2 - 1) * 0.2;
}

function randomLongitude() {
  return -99.13 + (Math.random() * 2 - 1) * 0.2;
}

function buildTelemetryEvent(duplicateId) {
  const invalid = Math.random() < INVALID_RATE;

  if (invalid) {
    return {
      vehicle_id: "",
      latitude: null,
      longitude: null,
      speed: null,
      status: "invalid",
      timestamp: Date.now(),
    };
  }

  const vehicle_id = randomVehicleId();

  return {
    id:
      duplicateId ??
      `evt-${vehicle_id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    vehicle_id,
    latitude: randomLatitude(),
    longitude: randomLongitude(),
    speed: Math.floor(Math.random() * 100),
    status: Math.random() < 0.2 ? "stopped" : "moving",
    timestamp: Date.now(),
  };
}

function buildBatchPayload() {
  const events = [];

  for (let index = 0; index < BATCH_SIZE; index += 1) {
    const duplicate =
      events.length > 0 && Math.random() < DUPLICATE_RATE
        ? events[events.length - 1].id
        : null;
    events.push(buildTelemetryEvent(duplicate));
  }

  return { events };
}

export default function () {
  const base = __ENV.API_BASE || "http://localhost:4001/api";

  if (USE_BATCH) {
    const payload = JSON.stringify(buildBatchPayload());
    const res = http.post(`${base}/telemetry/events/batch`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    check(res, {
      "batch status is accepted or error": (r) => [202, 400, 500].includes(r.status),
    });
  } else {
    const payload = JSON.stringify(buildTelemetryEvent());
    const res = http.post(`${base}/telemetry/event`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    check(res, {
      "status is accepted or error": (r) => [202, 400, 500].includes(r.status),
    });
  }

  sleep(0.1);
}
