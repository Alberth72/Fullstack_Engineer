import amqp from "amqplib";
import { EventEmitter } from "events";
import { TelemetryEvent } from "../types/telemetry";
import { CircuitBreaker, withRetry } from "../utils/resilience";
import { logger } from "../observability/logger";
import type { TraceContext } from "../observability/tracing";

type TelemetryHandler = (event: TelemetryEvent, trace?: TraceContext | null) => void | Promise<void>;

type Broker = {
  publishTelemetry(event: TelemetryEvent, trace?: TraceContext | null): Promise<void>;
  publishTelemetryBatch(events: TelemetryEvent[], trace?: TraceContext | null): Promise<void>;
  publishTelemetryStrict(event: TelemetryEvent, trace?: TraceContext | null): Promise<void>;
  publishTelemetryBatchStrict(events: TelemetryEvent[], trace?: TraceContext | null): Promise<void>;
  subscribeTelemetry(handler: TelemetryHandler): void;
  start(): Promise<void>;
  isConnected(): Promise<boolean>;
};

const TELEMETRY_EXCHANGE = "telemetry.events";
const TELEMETRY_QUEUE = process.env.BROKER_QUEUE_NAME || "telemetry.ws";
const brokerUrl = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";

type TelemetryEnvelope =
  | {
      type: "telemetry";
      event: TelemetryEvent;
      trace?: TraceContext | null;
    }
  | {
      type: "telemetry_batch";
      events: TelemetryEvent[];
      trace?: TraceContext | null;
    };

function extractTelemetryMessage(payload: unknown): {
  events: TelemetryEvent[];
  trace: TraceContext | null;
} {
  if (!payload || typeof payload !== "object") {
    return { events: [], trace: null };
  }

  const message = payload as Partial<TelemetryEnvelope> & Partial<TelemetryEvent>;

  if (message.type === "telemetry_batch" && Array.isArray(message.events)) {
    return { events: message.events, trace: message.trace ?? null };
  }

  if (message.type === "telemetry" && message.event) {
    return { events: [message.event], trace: message.trace ?? null };
  }

  if ("vehicle_id" in message && "timestamp" in message) {
    return { events: [message as TelemetryEvent], trace: null };
  }

  return { events: [], trace: null };
}

class InMemoryBroker implements Broker {
  private emitter = new EventEmitter();

  async start() {
    return;
  }

  async publishTelemetry(event: TelemetryEvent, trace?: TraceContext | null) {
    this.emitter.emit("telemetry", event, trace ?? null);
  }

  async publishTelemetryBatch(events: TelemetryEvent[], trace?: TraceContext | null) {
    for (const event of events) {
      this.emitter.emit("telemetry", event, trace ?? null);
    }
  }

  async publishTelemetryStrict(event: TelemetryEvent, trace?: TraceContext | null) {
    return this.publishTelemetry(event, trace);
  }

  async publishTelemetryBatchStrict(events: TelemetryEvent[], trace?: TraceContext | null) {
    return this.publishTelemetryBatch(events, trace);
  }

  subscribeTelemetry(handler: TelemetryHandler) {
    this.emitter.on("telemetry", handler);
  }

  async isConnected() {
    return true;
  }
}

class RabbitBroker implements Broker {
  private connection: any = null;
  private channel: any = null;
  private fallback = new InMemoryBroker();
  private handlers: TelemetryHandler[] = [];
  private ready = false;
  private connecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private started = false;
  private breaker = new CircuitBreaker(
    parseInt(process.env.BROKER_BREAKER_THRESHOLD || "3", 10),
    parseInt(process.env.BROKER_BREAKER_COOLDOWN_MS || "10000", 10)
  );

  private getReconnectDelayMs() {
    const baseDelay = Math.max(
      250,
      parseInt(process.env.BROKER_RECONNECT_BASE_DELAY_MS || "750", 10) || 750
    );
    const maxDelay = Math.max(
      baseDelay,
      parseInt(process.env.BROKER_RECONNECT_MAX_DELAY_MS || "10000", 10) || 10000
    );

    return Math.min(maxDelay, baseDelay * Math.pow(2, Math.max(0, this.reconnectAttempts - 1)));
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private markDisconnected(reason?: unknown) {
    this.ready = false;
    this.channel = null;
    this.connection = null;

    if (reason) {
      logger.warn("broker_disconnected", { reason: String(reason) });
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (!this.started || this.reconnectTimer || this.connecting) {
      return;
    }

    const delayMs = this.getReconnectDelayMs();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delayMs);

    logger.warn("broker_reconnect_scheduled", { delayMs });
  }

  private async connect() {
    if (!this.started || this.connecting || this.ready) {
      return;
    }

    this.connecting = true;

    try {
      this.connection = await withRetry(
        () => amqp.connect(brokerUrl),
        {
          attempts: parseInt(process.env.BROKER_RETRY_ATTEMPTS || "3", 10),
          baseDelayMs: parseInt(process.env.BROKER_RETRY_BASE_DELAY_MS || "150", 10),
          maxDelayMs: parseInt(process.env.BROKER_RETRY_MAX_DELAY_MS || "1200", 10),
        }
      );
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(TELEMETRY_EXCHANGE, "fanout", {
        durable: true,
      });

      await this.channel.assertQueue(TELEMETRY_QUEUE, { durable: true });
      await this.channel.bindQueue(TELEMETRY_QUEUE, TELEMETRY_EXCHANGE, "");

      await this.channel.consume(TELEMETRY_QUEUE, async (msg: any) => {
        if (!msg) return;
        try {
          const parsed = JSON.parse(msg.content.toString()) as unknown;
          const { events, trace } = extractTelemetryMessage(parsed);

          if (!events.length) {
            throw new Error("invalid_telemetry_message");
          }

          for (const event of events) {
            for (const handler of this.handlers) {
              await handler(event, trace);
            }
          }
          this.channel.ack(msg);
        } catch (err) {
          logger.warn("broker_message_processing_failed", {
            error: logger.serializeError(err),
          });
          this.channel.nack(msg, false, false);
        }
      });

      this.connection.on("close", () => {
        this.markDisconnected("close");
      });
      this.connection.on("error", (err: unknown) => {
        this.markDisconnected(err);
      });

      this.ready = true;
      this.reconnectAttempts = 0;
      this.breaker.success();
      this.clearReconnectTimer();
      logger.info("broker_connected", { mode: "rabbitmq" });
    } catch (err) {
      this.ready = false;
      this.breaker.failure();
      this.reconnectAttempts += 1;
      logger.warn("broker_unavailable_fallback", {
        mode: "memory",
        attempts: this.reconnectAttempts,
        error: logger.serializeError(err),
      });
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  async start() {
    this.started = true;
    await this.fallback.start();
    void this.connect();
  }

  async publishTelemetry(event: TelemetryEvent, trace?: TraceContext | null) {
    try {
      await this.publishTelemetryStrict(event, trace);
    } catch (err) {
      logger.warn("broker_publish_fallback", {
        error: logger.serializeError(err),
      });
      return this.fallback.publishTelemetry(event, trace);
    }
  }

  async publishTelemetryBatch(events: TelemetryEvent[], trace?: TraceContext | null) {
    if (!events.length) return;

    if (!this.breaker.canExecute()) {
      return this.fallback.publishTelemetryBatch(events, trace);
    }

    if (!this.ready || !this.channel) {
      return this.fallback.publishTelemetryBatch(events, trace);
    }

    try {
      await this.publishTelemetryBatchStrict(events, trace);
    } catch (err) {
      logger.warn("broker_publish_batch_fallback", {
        error: logger.serializeError(err),
      });
      return this.fallback.publishTelemetryBatch(events, trace);
    }
  }

  async publishTelemetryStrict(event: TelemetryEvent, trace?: TraceContext | null) {
    return this.publishTelemetryBatchStrict([event], trace);
  }

  async publishTelemetryBatchStrict(events: TelemetryEvent[], trace?: TraceContext | null) {
    if (!events.length) return;

    if (!this.breaker.canExecute()) {
      throw new Error("broker_circuit_open");
    }

    if (!this.ready || !this.channel) {
      throw new Error("broker_unavailable");
    }

    try {
      await withRetry(
        async () => {
          const published = this.channel.publish(
            TELEMETRY_EXCHANGE,
            "",
            Buffer.from(
              JSON.stringify({
                type: "telemetry_batch",
                events,
                trace: trace ?? null,
              } satisfies TelemetryEnvelope)
            ),
            {
              contentType: "application/json",
              persistent: true,
            }
          );

          if (!published) {
            throw new Error("broker_publish_backpressure");
          }
        },
        {
          attempts: parseInt(process.env.BROKER_RETRY_ATTEMPTS || "3", 10),
          baseDelayMs: parseInt(process.env.BROKER_RETRY_BASE_DELAY_MS || "150", 10),
          maxDelayMs: parseInt(process.env.BROKER_RETRY_MAX_DELAY_MS || "1200", 10),
        }
      );
      this.breaker.success();
      this.ready = true;
    } catch (err) {
      this.breaker.failure();
      this.ready = false;
      throw err;
    }
  }

  subscribeTelemetry(handler: TelemetryHandler) {
    this.handlers.push(handler);
    this.fallback.subscribeTelemetry(handler);
  }

  async isConnected() {
    return this.ready;
  }
}

const broker: Broker = process.env.RABBITMQ_URL ? new RabbitBroker() : new InMemoryBroker();

export async function startBroker() {
  await broker.start();
}

export async function isBrokerConnected() {
  return broker.isConnected();
}

export async function publishTelemetry(event: TelemetryEvent, trace?: TraceContext | null) {
  await broker.publishTelemetry(event, trace);
}

export async function publishTelemetryBatch(events: TelemetryEvent[], trace?: TraceContext | null) {
  await broker.publishTelemetryBatch(events, trace);
}

export async function publishTelemetryStrict(event: TelemetryEvent, trace?: TraceContext | null) {
  await broker.publishTelemetryStrict(event, trace);
}

export async function publishTelemetryBatchStrict(
  events: TelemetryEvent[],
  trace?: TraceContext | null
) {
  await broker.publishTelemetryBatchStrict(events, trace);
}

export function subscribeTelemetry(handler: TelemetryHandler) {
  broker.subscribeTelemetry(handler);
}
