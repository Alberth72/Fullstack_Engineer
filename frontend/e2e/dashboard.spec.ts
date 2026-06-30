import { expect, test } from "@playwright/test";

const telemetryState = {
  vehicles: [
    {
      vehicle_id: "veh-1",
      latitude: 19.4326,
      longitude: -99.1332,
      speed: 61,
      status: "moving",
      lastSeen: Date.now(),
    },
    {
      vehicle_id: "veh-2",
      latitude: 19.43,
      longitude: -99.12,
      speed: 0,
      status: "stopped",
      lastSeen: Date.now() - 1000 * 60 * 4,
    },
  ],
};

const telemetrySummary = {
  totalVehicles: 2,
  moving: 1,
  stopped: 1,
  offline: 0,
  online: 2,
};

const health = {
  status: "ok",
  timestamp: Date.now(),
  broker: "rabbitmq",
  database: "postgres",
  checks: {
    broker: { configured: true, connected: true, mode: "rabbitmq" },
    database: { configured: true, connected: true, mode: "postgres" },
  },
  metrics: {
    counters: { requests: 18, telemetryEvents: 24, telemetryErrors: 0, agentQueries: 1, agentErrors: 0 },
    timings: { "GET /health": { count: 1, avgMs: 3 } },
  },
};

const metrics = {
  counters: { requests: 18, telemetryEvents: 24, telemetryErrors: 0, agentQueries: 1, agentErrors: 0 },
  timings: { "GET /health": { count: 1, avgMs: 3 } },
};

const criticalZones = { vehicles: [] };

const vehicleDetail = {
  vehicle_id: "veh-1",
  derived: {
    vehicle_id: "veh-1",
    latitude: 19.4326,
    longitude: -99.1332,
    speed: 61,
    status: "moving",
    lastSeen: Date.now(),
    derivedStatus: "moving",
    isOffline: false,
  },
  lastEvent: null,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class MockWebSocket {
      static OPEN = 1;
      static CONNECTING = 0;
      static CLOSING = 2;
      static CLOSED = 3;

      onopen = null as ((event: Event) => void) | null;
      onmessage = null as ((event: MessageEvent) => void) | null;
      onerror = null as ((event: Event) => void) | null;
      onclose = null as ((event: CloseEvent) => void) | null;
      readyState = MockWebSocket.CONNECTING;

      constructor(_url: string) {
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "metrics",
                metrics: {
                  counters: { requests: 18, telemetryEvents: 24, telemetryErrors: 0, agentQueries: 1, agentErrors: 0 },
                  timings: { "GET /health": { count: 1, avgMs: 3 } },
                },
              }),
            })
          );
        }, 10);
      }

      send() {}
      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(new CloseEvent("close"));
      }
    }

    // @ts-expect-error test double
    window.WebSocket = MockWebSocket;
  });

  await page.route("**/api/telemetry/state", async (route) => {
    await route.fulfill({ json: telemetryState });
  });
  await page.route("**/api/telemetry/summary", async (route) => {
    await route.fulfill({ json: telemetrySummary });
  });
  await page.route("**/health", async (route) => {
    await route.fulfill({ json: health });
  });
  await page.route("**/metrics", async (route) => {
    await route.fulfill({ json: metrics });
  });
  await page.route("**/api/telemetry/critical-zones/stopped**", async (route) => {
    await route.fulfill({ json: criticalZones });
  });
  await page.route("**/api/telemetry/vehicle/veh-1/detail", async (route) => {
    await route.fulfill({ json: vehicleDetail });
  });
  await page.route("**/api/telemetry/vehicle/veh-2/detail", async (route) => {
    await route.fulfill({
      json: {
        vehicle_id: "veh-2",
        derived: {
          vehicle_id: "veh-2",
          latitude: 19.43,
          longitude: -99.12,
          speed: 0,
          status: "stopped",
          lastSeen: Date.now() - 1000 * 60 * 4,
          derivedStatus: "stopped",
          isOffline: false,
        },
        lastEvent: null,
      },
    });
  });
  await page.route("**/api/agent/query", async (route) => {
    const body = route.request().postDataJSON() as { question?: string };
    await route.fulfill({
      json: {
        question: body.question,
        reply: "Veo 2 vehiculos en la flota. Uno esta moviendose y otro esta detenido.",
        conversationId: "conv-test",
        turnIndex: 1,
      },
    });
  });
});

test("renders the operational dashboard with health and summary", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Panel operativo de telemetria" })).toBeVisible();
  await expect(page.getByText("Rabbit real")).toBeVisible();
  await expect(page.getByText("Postgres real")).toBeVisible();
  await expect(page.getByRole("heading", { name: "veh-1", level: 3 })).toBeVisible();
  await expect(page.getByText("1 vehiculos detenidos detectados")).toBeVisible();
});

test("sends a question to the AI agent and shows the reply", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("Haz una pregunta sobre la flota...").fill("cual es el estado de la flota?");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByText("Tu:")).toBeVisible();
  await expect(page.getByText("Agente:")).toBeVisible();
  await expect(page.getByText(/Veo 2 vehiculos en la flota/i)).toBeVisible();
});

test("switches the selected vehicle and renders its detail", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("vehicle-card-veh-2").click();

  const detailPanel = page.getByTestId("vehicle-detail-panel");
  await expect(detailPanel.getByRole("heading", { name: "veh-2", level: 3 })).toBeVisible();
  await expect(detailPanel.getByText("stopped", { exact: true })).toBeVisible();
});
