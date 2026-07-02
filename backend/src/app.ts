import express from "express";
import { json } from "body-parser";
import { telemetryRouter } from "./routes/telemetry";
import { agentRouter } from "./routes/agent";
import {
  getHealthSummary,
  incrementCounter,
  recordTiming,
  snapshotMetrics,
} from "./observability/metrics";
import { probeRuntimeHealth } from "./observability/runtimeHealth";
import { createRequestId, logger } from "./observability/logger";
import { buildOperationalDiagnostics } from "./observability/diagnostics";
import {
  getAdminApiToken,
  getCorsConfig,
  getRateLimitConfig,
  isOriginAllowed,
} from "./security/securityConfig";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

function isProtectedOperationalPath(path: string) {
  return (
    path === "/metrics" ||
    path === "/diagnostics" ||
    path.startsWith("/api/telemetry/admin/") ||
    path.startsWith("/api/agent/admin/") ||
    /^\/api\/agent\/conversations\/[^/]+\/traces$/.test(path)
  );
}

function readAdminToken(req: express.Request) {
  const authHeader = req.header("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim();
  }

  return req.header("x-admin-token")?.trim() || null;
}

function getClientKey(req: express.Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function createApp() {
  const app = express();
  const rateLimitStore = new Map<string, RateLimitEntry>();

  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || createRequestId();
    const start = Date.now();

    res.setHeader("x-request-id", requestId);
    res.on("finish", () => {
      const duration = Date.now() - start;
      incrementCounter("requests");
      recordTiming(`${req.method} ${req.path}`, duration);
      logger.info("http_request", {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  });

  app.use((req, res, next) => {
    const cors = getCorsConfig();
    const origin = req.header("origin");

    if (!isOriginAllowed(origin, cors)) {
      return res.status(403).json({ error: "origin_not_allowed" });
    }

    res.header("Access-Control-Allow-Origin", cors.allowAll ? "*" : origin || cors.allowedOrigins[0]);
    if (!cors.allowAll) {
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("X-Content-Type-Options", "nosniff");
    res.header("X-Frame-Options", "DENY");
    res.header("Referrer-Policy", "strict-origin-when-cross-origin");
    res.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.header("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  app.use((req, res, next) => {
    const config = getRateLimitConfig();
    if (!config.enabled) return next();

    const now = Date.now();
    const key = getClientKey(req);
    const current = rateLimitStore.get(key);
    const entry =
      current && current.resetAt > now
        ? current
        : {
            count: 0,
            resetAt: now + config.windowMs,
          };

    entry.count += 1;
    rateLimitStore.set(key, entry);
    res.header("X-RateLimit-Limit", String(config.maxRequests));
    res.header("X-RateLimit-Remaining", String(Math.max(0, config.maxRequests - entry.count)));
    res.header("X-RateLimit-Reset", String(entry.resetAt));

    if (entry.count > config.maxRequests) {
      return res.status(429).json({ error: "rate_limited" });
    }

    next();
  });

  app.use((req, res, next) => {
    const requiredToken = getAdminApiToken();
    if (!requiredToken || !isProtectedOperationalPath(req.path)) return next();

    if (readAdminToken(req) !== requiredToken) {
      return res.status(401).json({ error: "admin_auth_required" });
    }

    next();
  });

  app.use(json({ limit: process.env.JSON_BODY_LIMIT || "5mb" }));
  app.use("/api/telemetry", telemetryRouter);
  app.use("/api/agent", agentRouter);

  app.get("/health", async (_req, res) => {
    const runtimeHealth = await probeRuntimeHealth();
    res.status(200).json(
      getHealthSummary({
        ...runtimeHealth,
        outboxWorker: process.env.OUTBOX_WORKER_URL ? "http" : "memory",
        metrics: snapshotMetrics(),
      })
    );
  });

  app.get("/metrics", async (_req, res) => {
    res.json(snapshotMetrics());
  });

  app.get("/diagnostics", async (_req, res) => {
    const runtimeHealth = await probeRuntimeHealth();
    res.json(
      buildOperationalDiagnostics({
        role: "api",
        runtimeHealth,
        extras: {
          outboxWorker: process.env.OUTBOX_WORKER_URL ? "http" : "memory",
        },
      })
    );
  });

  return app;
}
