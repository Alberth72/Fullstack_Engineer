import type { WebSocketServer } from "ws";
import { subscribeTelemetry } from "./broadcaster";
import type { TelemetryEvent } from "../types/telemetry";
import { logger } from "../observability/logger";

function broadcastTelemetryEvent(wss: WebSocketServer, event: TelemetryEvent) {
  const message = JSON.stringify({ type: "telemetry", event });

  wss.clients.forEach((client) => {
    try {
      if (client.readyState === 1) {
        client.send(message);
      }
    } catch (err) {
      logger.warn("ws_send_failed", {
        error: logger.serializeError(err),
      });
    }
  });
}

export function registerTelemetryConsumers(wss: WebSocketServer) {
  subscribeTelemetry((event) => {
    broadcastTelemetryEvent(wss, event);
  });
}
