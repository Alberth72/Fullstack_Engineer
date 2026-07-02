import { Router } from "express";
import * as telemetryService from "../services/telemetryService";
import { incrementCounter, snapshotMetrics } from "../observability/metrics";
import { logger } from "../observability/logger";

const router = Router();
const DEFAULT_DEAD_LETTER_PRUNE_DAYS = 14;

function isValidationError(err: unknown) {
  return (
    err instanceof Error &&
    (err.message === "invalid_payload" || err.message === "missing_vehicle_id")
  );
}

router.post("/event", async (req, res) => {
  try {
    const payload = req.body;
    const event = await telemetryService.recordEvent(payload);
    logger.info("telemetry_event_persisted", {
      vehicleId: event.vehicle_id,
      requestId: req.header("x-request-id") || null,
    });
    res.status(202).json({ status: "accepted", event });
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("telemetry_event_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(isValidationError(err) ? 400 : 500).json({
      error: isValidationError(err) ? "invalid_payload" : "internal_error",
    });
  }
});

router.post("/events/batch", async (req, res) => {
  try {
    const payload = req.body;
    const events = await telemetryService.recordEvents(payload?.events ?? []);
    logger.info("telemetry_batch_persisted", {
      count: events.length,
      requestId: req.header("x-request-id") || null,
    });
    res.status(202).json({ status: "accepted", count: events.length });
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("telemetry_batch_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(isValidationError(err) ? 400 : 500).json({
      error: isValidationError(err) ? "invalid_payload" : "internal_error",
    });
  }
});

router.get("/state", async (req, res) => {
  try {
    const snapshot = await telemetryService.getFleetSnapshot();
    res.json(snapshot);
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("telemetry_state_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const summary = await telemetryService.getFleetSummary();
    res.json(summary);
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("telemetry_summary_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/critical-zones", async (req, res) => {
  try {
    const zones = await telemetryService.getCriticalZones();
    res.json({ zones });
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("critical_zones_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/critical-zones/vehicles", async (req, res) => {
  try {
    const vehicles = await telemetryService.getVehiclesInCriticalZones();
    res.json({ vehicles });
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("critical_zone_vehicles_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/critical-zones/stopped", async (req, res) => {
  try {
    const minMinutes = Number(req.query.minMinutes ?? 20);
    const result = await telemetryService.getStoppedVehiclesInCriticalZones(
      Number.isFinite(minMinutes) && minMinutes > 0 ? minMinutes : 20,
    );
    res.json(result);
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("critical_zone_stopped_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/admin/outbox", async (req, res) => {
  try {
    const summary = await telemetryService.getTelemetryOutboxSummary();
    res.json(summary);
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("telemetry_outbox_summary_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/admin/outbox/config", async (req, res) => {
  try {
    res.json({
      worker: telemetryService.getTelemetryOutboxWorkerEffectiveConfig(),
    });
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("telemetry_outbox_config_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

function parseDeadLetterPruneBody(body: unknown) {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const olderThanDays =
    payload.olderThanDays === undefined
      ? DEFAULT_DEAD_LETTER_PRUNE_DAYS
      : Number(payload.olderThanDays);
  const dryRun = payload.dryRun === false ? false : true;

  if (!Number.isFinite(olderThanDays) || olderThanDays <= 0) {
    throw new Error("invalid_older_than_days");
  }

  return {
    olderThanDays,
    dryRun,
  };
}

router.post("/admin/outbox/dead-letters/prune", async (req, res) => {
  try {
    const options = parseDeadLetterPruneBody(req.body);
    const result = await telemetryService.pruneTelemetryOutboxDeadLetters(options);
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_older_than_days") {
      return res.status(400).json({ error: "invalid_older_than_days" });
    }

    incrementCounter("telemetryErrors");
    logger.error("telemetry_outbox_dead_letter_prune_failed", err, {
      requestId: req.header("x-request-id") || null,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/admin/ingestion", (_req, res) => {
  const { counters } = snapshotMetrics();
  res.json({
    generatedAt: Date.now(),
    receivedEvents: counters.telemetryEventsReceived,
    acceptedUniqueEvents: counters.telemetryEvents,
    insertedEvents: counters.telemetryEventsInserted,
    updatedEvents: counters.telemetryEventsUpdated,
    duplicateInBatchEvents: counters.telemetryEventsDuplicateInBatch,
    outboxCreated: counters.telemetryOutboxCreated,
    outboxSkipped: counters.telemetryOutboxSkipped,
    idempotentWrites:
      counters.telemetryEventsUpdated +
      counters.telemetryEventsDuplicateInBatch +
      counters.telemetryOutboxSkipped,
  });
});

router.get("/admin/retention", (_req, res) => {
  try {
    res.json(telemetryService.getTelemetryRetentionEffectivePolicy());
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("telemetry_retention_policy_failed", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/vehicle/:id/events", async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const events = await telemetryService.getVehicleEvents(vehicleId, 200);
    res.json({ vehicle_id: vehicleId, events });
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("vehicle_events_failed", err, {
      requestId: req.header("x-request-id") || null,
      vehicleId: req.params.id,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/vehicle/:id/detail", async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const detail = await telemetryService.getVehicleDetail(vehicleId);
    if (!detail.derived) {
      return res.status(404).json({ error: "vehicle_not_found", vehicle_id: vehicleId });
    }
    res.json(detail);
  } catch (err) {
    incrementCounter("telemetryErrors");
    logger.error("vehicle_detail_failed", err, {
      requestId: req.header("x-request-id") || null,
      vehicleId: req.params.id,
    });
    res.status(500).json({ error: "internal_error" });
  }
});

export { router as telemetryRouter };
