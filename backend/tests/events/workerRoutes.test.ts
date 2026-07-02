import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockRunTelemetryOutboxCycle = vi.hoisted(() => vi.fn());

vi.mock("../../src/events/outboxWorker", () => ({
  runTelemetryOutboxCycle: mockRunTelemetryOutboxCycle,
  startTelemetryOutboxWorker: vi.fn(() => vi.fn()),
}));

import { createWorkerApp } from "../../src/worker";

describe("worker routes", () => {
  const originalAdminToken = process.env.ADMIN_API_TOKEN;

  afterEach(() => {
    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_API_TOKEN;
    } else {
      process.env.ADMIN_API_TOKEN = originalAdminToken;
    }

    vi.clearAllMocks();
  });

  it("requires admin token for internal outbox notification when configured", async () => {
    process.env.ADMIN_API_TOKEN = "secret-token";
    mockRunTelemetryOutboxCycle.mockResolvedValue(undefined);

    const rejected = await request(createWorkerApp())
      .post("/internal/outbox/notify")
      .send({ count: 1 });
    const accepted = await request(createWorkerApp())
      .post("/internal/outbox/notify")
      .set("X-Admin-Token", "secret-token")
      .send({ count: 1 });

    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: "admin_auth_required" });
    expect(accepted.status).toBe(202);
    expect(mockRunTelemetryOutboxCycle).toHaveBeenCalledTimes(1);
  });

  it("returns protected worker diagnostics", async () => {
    process.env.ADMIN_API_TOKEN = "secret-token";

    const rejected = await request(createWorkerApp()).get("/diagnostics");
    const accepted = await request(createWorkerApp())
      .get("/diagnostics")
      .set("Authorization", "Bearer secret-token");

    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: "admin_auth_required" });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      status: expect.any(String),
      attentionRequired: expect.any(Boolean),
      role: "outbox-worker",
      runtime: expect.any(Object),
      metrics: expect.any(Object),
      signals: {
        errorCounters: expect.any(Object),
        recentProblems: expect.any(Array),
      },
      outboxWorker: expect.any(Object),
    });
  });
});
