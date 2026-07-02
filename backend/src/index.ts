import "./observability/otel";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createApp } from "./app";
import { startBroker } from "./events/broadcaster";
import { registerTelemetryConsumers } from "./events/telemetryConsumers";
import { snapshotMetrics } from "./observability/metrics";
import { logger } from "./observability/logger";

const app = createApp();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  logger.info("ws_client_connected");
  socket.send(JSON.stringify({ type: "welcome", message: "Conexion establecida" }));
  socket.send(
    JSON.stringify({
      type: "metrics",
      metrics: snapshotMetrics(),
    })
  );
});

registerTelemetryConsumers(wss);

const port = parseInt(process.env.PORT || "4001", 10);

async function start() {
  await startBroker();
  server.listen(port, () => {
    logger.info("backend_started", { port });
  });
}

void start();
