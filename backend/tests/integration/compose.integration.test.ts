import amqp, { type Channel, type Connection } from "amqplib";
import { randomUUID } from "crypto";
import request from "supertest";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createApp } from "../../src/app";
import { startWorkerService } from "../../src/worker";
import type { TelemetryEvent } from "../../src/types/telemetry";

const integrationDescribe =
  process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://fleet:fleet@localhost:5432/fleet";
const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const TELEMETRY_EXCHANGE = "telemetry.events";
const INTEGRATION_TIMEOUT_MS = Number(process.env.INTEGRATION_TIMEOUT_MS ?? 45000);
const WORKER_PORT = Number(process.env.WORKER_PORT ?? 4002);

const dbPool = new Pool({
  connectionString: DATABASE_URL,
  max: 2,
});

const publishedEvents: TelemetryEvent[] = [];
let probeConnection: Connection | null = null;
let probeChannel: Channel | null = null;
let stopWorkerService: null | (() => Promise<void>) = null;

async function waitFor<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs = INTEGRATION_TIMEOUT_MS,
  intervalMs = 250
) {
  const started = Date.now();
  let lastError: unknown = null;

  while (Date.now() - started < timeoutMs) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `${label} not ready after ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function extractTelemetryEvents(payload: string): TelemetryEvent[] {
  try {
    const parsed = JSON.parse(payload) as any;

    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      parsed.type === "telemetry_batch" &&
      Array.isArray(parsed.events)
    ) {
      return parsed.events;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      parsed.type === "telemetry" &&
      parsed.event
    ) {
      return [parsed.event];
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "vehicle_id" in parsed &&
      "timestamp" in parsed
    ) {
      return [parsed as TelemetryEvent];
    }
  } catch {
    return [];
  }

  return [];
}

function makeEvent(
  label: string,
  index: number,
  overrides: Partial<TelemetryEvent> = {}
): TelemetryEvent {
  const suffix = `${label}-${index}-${randomUUID().slice(0, 8)}`;

  return {
    id: `int-${suffix}`,
    vehicle_id: `veh-${suffix}`,
    latitude: 19.4326 + index * 0.01,
    longitude: -99.1332 - index * 0.01,
    speed: 40 + index * 5,
    status: "moving",
    timestamp: Date.now(),
    ...overrides,
  };
}

async function waitForDatabase() {
  await waitFor("postgres", async () => {
    await dbPool.query("SELECT 1");
    return true;
  });
}

async function waitForRabbitmq() {
  await waitFor("rabbitmq", async () => {
    const connection = await amqp.connect(RABBITMQ_URL);
    await connection.close();
    return true;
  });
}

async function startTelemetryProbe() {
  probeConnection = await amqp.connect(RABBITMQ_URL);
  probeChannel = await probeConnection.createChannel();
  await probeChannel.assertExchange(TELEMETRY_EXCHANGE, "fanout", {
    durable: true,
  });

  const probeQueue = await probeChannel.assertQueue("", {
    exclusive: true,
    autoDelete: true,
    durable: false,
  });

  await probeChannel.bindQueue(probeQueue.queue, TELEMETRY_EXCHANGE, "");
  await probeChannel.consume(
    probeQueue.queue,
    (message) => {
      if (!message) return;

      try {
        const events = extractTelemetryEvents(message.content.toString());
        publishedEvents.push(...events);
      } catch (err) {
        console.warn("[integration] Failed to parse published telemetry:", err);
      }
    },
    { noAck: true }
  );
}

async function waitForPublishedEvent(id: string) {
  return waitFor(`published event ${id}`, async () => {
    const event = publishedEvents.find((item) => item.id === id);
    if (!event) {
      throw new Error("event_not_received");
    }
    return event;
  });
}

async function getSummary() {
  const response = await request(createApp()).get("/api/telemetry/summary");
  expect(response.status).toBe(200);
  return response.body as {
    totalVehicles: number;
    moving: number;
    stopped: number;
    offline: number;
    online: number;
  };
}

async function getState() {
  const response = await request(createApp()).get("/api/telemetry/state");
  expect(response.status).toBe(200);
  return response.body as {
    summary: {
      totalVehicles: number;
      moving: number;
      stopped: number;
      offline: number;
      online: number;
    };
    vehicles: Array<{
      vehicle_id: string;
      latitude: number | null;
      longitude: number | null;
      speed: number | null;
      status: string | null;
      lastSeen: number;
    }>;
  };
}

integrationDescribe("compose integration", () => {
  beforeAll(async () => {
    await waitForDatabase();
    await waitForRabbitmq();
    publishedEvents.length = 0;
    await startTelemetryProbe();
    process.env.OUTBOX_WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
    stopWorkerService = await startWorkerService();
  });

  beforeEach(() => {
    publishedEvents.length = 0;
  });

  afterAll(async () => {
    if (stopWorkerService) {
      await stopWorkerService().catch(() => undefined);
    }
    await probeChannel?.close().catch(() => undefined);
    await probeConnection?.close().catch(() => undefined);
    await dbPool.end();
  });

  it("persists an event, publishes it through RabbitMQ and exposes it in state", async () => {
    const baseline = await getSummary();
    const event = makeEvent("single", 1, {
      status: "moving",
      speed: 48,
    });

    const response = await request(createApp())
      .post("/api/telemetry/event")
      .send(event);

    expect(response.status).toBe(202);
    expect(response.body.event).toMatchObject(event);

    const brokerEvent = await waitForPublishedEvent(event.id);
    expect(brokerEvent).toMatchObject(event);

    const state = await getState();
    expect(state.summary.totalVehicles).toBeGreaterThanOrEqual(
      baseline.totalVehicles + 1
    );
    expect(state.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vehicle_id: event.vehicle_id,
          status: "moving",
        }),
      ])
    );

    const detailResponse = await request(createApp()).get(
      `/api/telemetry/vehicle/${event.vehicle_id}/detail`
    );
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.vehicle_id).toBe(event.vehicle_id);
    expect(detailResponse.body.derived).toMatchObject({
      vehicle_id: event.vehicle_id,
      status: "moving",
      isOffline: false,
    });
    expect(detailResponse.body.lastEvent).toMatchObject(event);
  });

  it("persists a telemetry batch and updates the summary", async () => {
    const baseline = await getSummary();
    const events = [
      makeEvent("batch", 1, {
        status: "stopped",
        speed: 0,
      }),
      makeEvent("batch", 2, {
        status: "moving",
        speed: 52,
      }),
      makeEvent("batch", 3, {
        status: "moving",
        speed: 34,
      }),
    ];

    const response = await request(createApp())
      .post("/api/telemetry/events/batch")
      .send({
        events,
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: "accepted", count: 3 });

    await Promise.all(events.map((event) => waitForPublishedEvent(event.id)));

    const state = await getState();
    for (const event of events) {
      expect(state.vehicles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            vehicle_id: event.vehicle_id,
            status: event.status,
          }),
        ])
      );
    }

    expect(state.summary.totalVehicles).toBeGreaterThanOrEqual(
      baseline.totalVehicles + events.length
    );
  });

  it("routes a real fleet context into the agent flow", async () => {
    const baseline = await getSummary();
    const event = makeEvent("agent", 1, {
      status: "moving",
      speed: 61,
    });

    const insertResponse = await request(createApp())
      .post("/api/telemetry/event")
      .send(event);

    expect(insertResponse.status).toBe(202);
    await waitForPublishedEvent(event.id);

    const response = await request(createApp())
      .post("/api/agent/query")
      .send({ question: "Cuantos vehiculos hay?" });

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("mock");
    expect(response.body.answer).toMatchObject({
      intent: "count_fleet",
      tool: "getFleetSummary",
    });
    expect(response.body.answer.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "total_vehicles",
          value: expect.any(Number),
        }),
      ])
    );

    const totalVehiclesMetric = response.body.answer.result.find(
      (item: { metric: string }) => item.metric === "total_vehicles"
    );
    expect(totalVehiclesMetric.value).toBeGreaterThanOrEqual(
      baseline.totalVehicles + 1
    );
  });
});
