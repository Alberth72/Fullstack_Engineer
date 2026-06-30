import { incrementCounter } from "../observability/metrics";
import { logger } from "../observability/logger";
import type { TelemetryEvent } from "../types/telemetry";
import { publishTelemetry, publishTelemetryBatch } from "./broadcaster";

function logPublicationFailure(scope: string, err: unknown) {
  logger.warn("telemetry_publish_failed", {
    scope,
    error: logger.serializeError(err),
  });
}

export function dispatchTelemetryPublication(event: TelemetryEvent) {
  void Promise.resolve(publishTelemetry(event))
    .then(() => {
      incrementCounter("telemetryPublished");
    })
    .catch((err) => {
      incrementCounter("telemetryPublishErrors");
      logPublicationFailure("telemetry event", err);
    });
}

export function dispatchTelemetryBatchPublication(events: TelemetryEvent[]) {
  if (!events.length) return;

  void Promise.resolve(publishTelemetryBatch(events))
    .then(() => {
      incrementCounter("telemetryPublished", events.length);
    })
    .catch((err) => {
      incrementCounter("telemetryPublishErrors");
      logPublicationFailure("telemetry batch", err);
    });
}
