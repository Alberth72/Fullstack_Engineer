import type { WebSocketServer } from "ws";
import { subscribeTelemetry } from "./broadcaster";
import type { TelemetryEvent } from "../types/telemetry";
import { logger } from "../observability/logger";
import { traceLogContext, type TraceContext } from "../observability/tracing";

function broadcastTelemetryEvent(
  wss: WebSocketServer,
  event: TelemetryEvent,
  trace?: TraceContext | null
) {
  const message = JSON.stringify({ type: "telemetry", event, trace: trace ?? null });

  wss.clients.forEach((client) => {
    try {
      if (client.readyState === 1) {
        client.send(message);
      }
    } catch (err) {
      logger.warn("ws_send_failed", {
        ...traceLogContext(trace),
        error: logger.serializeError(err),
      });
    }
  });
}

export function registerTelemetryConsumers(wss: WebSocketServer) {
  subscribeTelemetry((event, trace) => {
    broadcastTelemetryEvent(wss, event, trace);
  });
}
