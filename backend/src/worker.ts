import { createServer } from "http";
import { json } from "body-parser";
import express from "express";
import { startBroker } from "./events/broadcaster";
import { runTelemetryOutboxCycle, startTelemetryOutboxWorker } from "./events/outboxWorker";
import { getTelemetryOutboxWorkerConfig } from "./events/outboxWorkerConfig";
import { incrementCounter, recordTiming, snapshotMetrics } from "./observability/metrics";
import { probeRuntimeHealth } from "./observability/runtimeHealth";
import { createRequestId, logger } from "./observability/logger";
import { buildOperationalDiagnostics } from "./observability/diagnostics";
import { getAdminApiToken } from "./security/securityConfig";

function readAdminToken(req: express.Request) {
  const authHeader = req.header("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim();
  }

  return req.header("x-admin-token")?.trim() || null;
}

export function createWorkerApp() {
  const app = express();

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || createRequestId("worker");
    const start = Date.now();

    res.setHeader("x-request-id", requestId);
    res.on("finish", () => {
      const duration = Date.now() - start;
      incrementCounter("workerRequests");
      recordTiming(`worker ${req.method} ${req.path}`, duration);
      logger.info("worker_request", {
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
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  app.use(json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));

  app.get("/health", async (_req, res) => {
    const runtimeHealth = await probeRuntimeHealth();
    res.status(200).json({
      status: runtimeHealth.status,
      role: "outbox-worker",
      broker: runtimeHealth.broker,
      database: runtimeHealth.database,
      checks: runtimeHealth.checks,
      outboxWorker: getTelemetryOutboxWorkerConfig(),
      metrics: snapshotMetrics(),
      timestamp: runtimeHealth.timestamp,
    });
  });

  app.get("/diagnostics", async (req, res) => {
    const requiredToken = getAdminApiToken();
    if (requiredToken && readAdminToken(req) !== requiredToken) {
      return res.status(401).json({ error: "admin_auth_required" });
    }

    const runtimeHealth = await probeRuntimeHealth();
    res.json(
      buildOperationalDiagnostics({
        role: "outbox-worker",
        runtimeHealth,
        extras: {
          outboxWorker: getTelemetryOutboxWorkerConfig(),
        },
      })
    );
  });

  app.post("/internal/outbox/notify", async (req, res) => {
    try {
      const requiredToken = getAdminApiToken();
      if (requiredToken && readAdminToken(req) !== requiredToken) {
        return res.status(401).json({ error: "admin_auth_required" });
      }

      await runTelemetryOutboxCycle();
      res.status(202).json({
        status: "accepted",
        count: Number(req.body?.count ?? 0),
      });
    } catch (err) {
      logger.error("worker_notify_failed", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return app;
}

export async function startWorkerService() {
  await startBroker();

  const app = createWorkerApp();
  const server = createServer(app);
  const port = parseInt(process.env.WORKER_PORT || process.env.PORT || "4002", 10);
  const stopOutboxWorker = startTelemetryOutboxWorker();

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  logger.info("worker_started", { port });

  return async () => {
    stopOutboxWorker();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  };
}

if (require.main === module) {
  void startWorkerService();
}
