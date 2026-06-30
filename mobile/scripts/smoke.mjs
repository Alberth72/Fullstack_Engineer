import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const tscBin = require.resolve("typescript/bin/tsc");

function createTempTsconfig(tempRoot) {
  const tsconfig = {
    compilerOptions: {
      noEmit: false,
      outDir: path.join(tempRoot, "dist"),
      rootDir: projectRoot,
      module: "commonjs",
      target: "es2020",
      declaration: false,
      sourceMap: false,
      moduleResolution: "node",
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    files: [
      path.join(projectRoot, "src", "contracts", "telemetry.ts"),
      path.join(projectRoot, "src", "domain", "eventFactory.ts"),
      path.join(projectRoot, "src", "domain", "demoTelemetry.ts"),
      path.join(projectRoot, "src", "domain", "demoRoute.ts"),
      path.join(projectRoot, "src", "domain", "trackingReadiness.ts"),
      path.join(projectRoot, "src", "storage", "offlineQueue.ts"),
      path.join(projectRoot, "src", "storage", "inMemoryOfflineQueue.ts"),
      path.join(projectRoot, "src", "services", "telemetrySyncService.ts"),
    ],
  };

  const tsconfigPath = path.join(tempRoot, "tsconfig.smoke.json");
  writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");
  return tsconfigPath;
}

function compileSmokeBundle(tempRoot) {
  const tsconfigPath = createTempTsconfig(tempRoot);
  execFileSync(process.execPath, [tscBin, "-p", tsconfigPath], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  return path.join(tempRoot, "dist");
}

async function run() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "fleet-driver-mobile-smoke-"));

  try {
    const distRoot = compileSmokeBundle(tempRoot);
    const demoTelemetry = require(path.join(distRoot, "src", "domain", "demoTelemetry.js"));
    const demoRoute = require(path.join(distRoot, "src", "domain", "demoRoute.js"));
    const trackingReadiness = require(path.join(distRoot, "src", "domain", "trackingReadiness.js"));
    const { InMemoryOfflineQueueStore } = require(path.join(
      distRoot,
      "src",
      "storage",
      "inMemoryOfflineQueue.js",
    ));
    const { TelemetrySyncService } = require(path.join(distRoot, "src", "services", "telemetrySyncService.js"));

    const single = demoTelemetry.createDemoTelemetryEvent("veh-smoke-1", 0);
    assert.equal(single.vehicle_id, "veh-smoke-1");
    assert.equal(single.status, "stopped");

    const route = demoRoute.createDemoTelemetryRoute("veh-smoke-2", 1_700_000_000_000);
    assert.equal(route.length, 8);
    assert.ok(route.some((event) => event.status === "vehicle_started"));
    assert.ok(route.some((event) => event.status === "vehicle_stopped"));
    assert.ok(route.some((event) => event.status === "geofence_enter"));
    assert.ok(route.some((event) => event.status === "geofence_exit"));

    const blockedReadiness = trackingReadiness.evaluateTrackingReadiness({
      foregroundPermission: "denied",
      backgroundPermission: "undetermined",
      foregroundCanAskAgain: false,
      backgroundCanAskAgain: true,
      taskManagerAvailable: true,
      backgroundAvailable: true,
      taskRegistered: false,
      geofencingTaskRegistered: false,
      backendOnline: false,
    });
    assert.equal(blockedReadiness.status, "blocked");
    assert.ok(blockedReadiness.blockers.includes("enable_foreground_location_in_settings"));

    const readyReadiness = trackingReadiness.evaluateTrackingReadiness({
      foregroundPermission: "granted",
      backgroundPermission: "granted",
      foregroundCanAskAgain: true,
      backgroundCanAskAgain: true,
      taskManagerAvailable: true,
      backgroundAvailable: true,
      taskRegistered: true,
      geofencingTaskRegistered: true,
      backendOnline: true,
    });
    assert.equal(readyReadiness.status, "ready");
    assert.equal(readyReadiness.ready, true);

    const store = new InMemoryOfflineQueueStore();
    const transport = {
      async syncBatch(request) {
        return {
          accepted: request.events.length,
          rejected: 0,
          serverTimestamp: Date.now(),
        };
      },
    };

    const syncService = new TelemetrySyncService(store, transport);
    await syncService.enqueueMany(route);

    const before = await syncService.getHealth(true);
    assert.equal(before.pendingEvents, route.length);
    assert.equal(before.failedEvents, 0);

    const result = await syncService.flush(3);
    assert.equal(result.accepted, route.length);
    assert.equal(result.rejected, 0);
    assert.equal(result.summary.batchCount, 3);
    assert.equal(result.summary.accepted, route.length);
    assert.equal(result.summary.rejected, 0);

    const after = await syncService.getHealth(true);
    assert.equal(after.pendingEvents, 0);
    assert.equal(after.failedEvents, 0);

    const persisted = await store.list();
    assert.ok(persisted.every((event) => event.syncStatus === "synced"));

    const reconnectStore = new InMemoryOfflineQueueStore();
    let transportOnline = false;
    const reconnectTransport = {
      async syncBatch(request) {
        if (!transportOnline) {
          throw new Error("network_down");
        }

        return {
          accepted: request.events.length,
          rejected: 0,
          serverTimestamp: Date.now(),
        };
      },
    };
    const reconnectSyncService = new TelemetrySyncService(reconnectStore, reconnectTransport);
    await reconnectSyncService.enqueueMany(route);

    await assert.rejects(() => reconnectSyncService.flush(4), /network_down/);

    const failedHealth = await reconnectSyncService.getHealth(false);
    assert.equal(failedHealth.online, false);
    assert.equal(failedHealth.pendingEvents, 0);
    assert.equal(failedHealth.failedEvents, route.length);

    const failedQueue = await reconnectStore.list();
    assert.ok(failedQueue.every((event) => event.syncStatus === "failed"));
    assert.ok(failedQueue.every((event) => event.retryCount === 1));
    assert.ok(failedQueue.every((event) => event.lastError === "network_down"));

    transportOnline = true;
    const recovered = await reconnectSyncService.flush(4);
    assert.equal(recovered.accepted, route.length);
    assert.equal(recovered.rejected, 0);
    assert.equal(recovered.summary.batchCount, 2);

    const recoveredHealth = await reconnectSyncService.getHealth(true);
    assert.equal(recoveredHealth.online, true);
    assert.equal(recoveredHealth.pendingEvents, 0);
    assert.equal(recoveredHealth.failedEvents, 0);

    const recoveredQueue = await reconnectStore.list();
    assert.ok(recoveredQueue.every((event) => event.syncStatus === "synced"));
    assert.ok(recoveredQueue.every((event) => event.lastError === null));

    console.log("Smoke OK: ruta demo, readiness GPS, cola offline, fallo de red, reintento y sync por lotes verificados.");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error("Smoke failed:");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
