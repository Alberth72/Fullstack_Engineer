import { incrementCounter } from "../observability/metrics";
import { logger } from "../observability/logger";
import { traceLogContext, type TraceContext } from "../observability/tracing";
import type { TelemetryEvent } from "../types/telemetry";
import { publishTelemetry, publishTelemetryBatch } from "./broadcaster";

function logPublicationFailure(scope: string, err: unknown, trace?: TraceContext | null) {
  logger.warn("telemetry_publish_failed", {
    ...traceLogContext(trace),
    scope,
    error: logger.serializeError(err),
  });
}

export function dispatchTelemetryPublication(event: TelemetryEvent, trace?: TraceContext | null) {
  void Promise.resolve(publishTelemetry(event, trace))
    .then(() => {
      incrementCounter("telemetryPublished");
    })
    .catch((err) => {
      incrementCounter("telemetryPublishErrors");
      logPublicationFailure("telemetry event", err, trace);
    });
}

export function dispatchTelemetryBatchPublication(
  events: TelemetryEvent[],
  trace?: TraceContext | null
) {
  if (!events.length) return;

  void Promise.resolve(publishTelemetryBatch(events, trace))
    .then(() => {
      incrementCounter("telemetryPublished", events.length);
    })
    .catch((err) => {
      incrementCounter("telemetryPublishErrors");
      logPublicationFailure("telemetry batch", err, trace);
    });
}
