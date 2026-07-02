import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { logger } from "../../src/observability/logger";

const originalAdminToken = process.env.ADMIN_API_TOKEN;
const originalCorsOrigins = process.env.CORS_ALLOWED_ORIGINS;
const originalRateLimitMaxRequests = process.env.RATE_LIMIT_MAX_REQUESTS;
const originalRateLimitWindowMs = process.env.RATE_LIMIT_WINDOW_MS;

afterEach(() => {
  if (originalAdminToken === undefined) {
    delete process.env.ADMIN_API_TOKEN;
  } else {
    process.env.ADMIN_API_TOKEN = originalAdminToken;
  }

  if (originalCorsOrigins === undefined) {
    delete process.env.CORS_ALLOWED_ORIGINS;
  } else {
    process.env.CORS_ALLOWED_ORIGINS = originalCorsOrigins;
  }

  if (originalRateLimitMaxRequests === undefined) {
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
  } else {
    process.env.RATE_LIMIT_MAX_REQUESTS = originalRateLimitMaxRequests;
  }

  if (originalRateLimitWindowMs === undefined) {
    delete process.env.RATE_LIMIT_WINDOW_MS;
  } else {
    process.env.RATE_LIMIT_WINDOW_MS = originalRateLimitWindowMs;
  }

  vi.restoreAllMocks();
  logger.clearRecentProblems();
});

describe("system routes", () => {
  it("returns health information", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      metrics: expect.any(Object),
      broker: expect.any(String),
      database: expect.any(String),
      checks: expect.any(Object),
      timestamp: expect.any(Number),
    });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("sets baseline security headers", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("returns metrics snapshot", async () => {
    const res = await request(createApp()).get("/metrics");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      counters: expect.any(Object),
      timings: expect.any(Object),
    });
  });

  it("returns protected operational diagnostics", async () => {
    process.env.ADMIN_API_TOKEN = "secret-token";
    logger.warn("diagnostic_test_warning", { requestId: "req-test" });

    const rejected = await request(createApp()).get("/diagnostics");
    const accepted = await request(createApp())
      .get("/diagnostics")
      .set("X-Admin-Token", "secret-token");

    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: "admin_auth_required" });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      status: expect.any(String),
      attentionRequired: true,
      role: "api",
      runtime: expect.any(Object),
      metrics: expect.any(Object),
      signals: {
        errorCounters: expect.any(Object),
        recentProblems: expect.arrayContaining([
          expect.objectContaining({
            level: "warn",
            message: "diagnostic_test_warning",
          }),
        ]),
      },
    });
  });

  it("allows only configured CORS origins", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000";

    const allowed = await request(createApp())
      .get("/health")
      .set("Origin", "http://localhost:3000");
    const blocked = await request(createApp())
      .get("/health")
      .set("Origin", "https://example.com");

    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(allowed.headers.vary).toBe("Origin");
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ error: "origin_not_allowed" });
  });

  it("requires admin token for operational metrics when configured", async () => {
    process.env.ADMIN_API_TOKEN = "secret-token";

    const rejected = await request(createApp()).get("/metrics");
    const accepted = await request(createApp())
      .get("/metrics")
      .set("Authorization", "Bearer secret-token");

    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: "admin_auth_required" });
    expect(accepted.status).toBe(200);
  });

  it("rate limits excessive requests", async () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    const app = createApp();

    const first = await request(app).get("/health");
    const second = await request(app).get("/health");

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body).toEqual({ error: "rate_limited" });
  });
});
