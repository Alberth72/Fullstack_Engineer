import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { logger } from "./logger";

let sdk: NodeSDK | null = null;

function readOtlpTraceEndpoint() {
  const explicitTraceEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (explicitTraceEndpoint) return explicitTraceEndpoint;

  const baseEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!baseEndpoint) return null;

  return `${baseEndpoint.replace(/\/$/, "")}/v1/traces`;
}

function isOtelEnabled() {
  if (process.env.OTEL_SDK_DISABLED?.toLowerCase() === "true") return false;
  return Boolean(readOtlpTraceEndpoint());
}

function parseResourceAttributes() {
  const serviceName = process.env.OTEL_SERVICE_NAME || "fleet-telemetry-backend";
  const attributes: Record<string, string> = {
    "service.name": serviceName,
    "service.version": process.env.npm_package_version || "0.1.0",
    "deployment.environment": process.env.NODE_ENV || "development",
  };

  const rawAttributes = process.env.OTEL_RESOURCE_ATTRIBUTES?.split(",") ?? [];
  for (const pair of rawAttributes) {
    const [key, ...valueParts] = pair.split("=");
    const value = valueParts.join("=");
    if (key?.trim() && value.trim()) {
      attributes[key.trim()] = value.trim();
    }
  }

  return attributes;
}

export function startOpenTelemetry() {
  if (sdk || !isOtelEnabled()) return;

  const endpoint = readOtlpTraceEndpoint();
  if (!endpoint) return;

  sdk = new NodeSDK({
    resource: resourceFromAttributes(parseResourceAttributes()),
    traceExporter: new OTLPTraceExporter({
      url: endpoint,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();
  logger.info("otel_tracing_started", {
    endpoint,
    serviceName: process.env.OTEL_SERVICE_NAME || "fleet-telemetry-backend",
  });

  const shutdown = async () => {
    if (!sdk) return;
    const currentSdk = sdk;
    sdk = null;
    await currentSdk.shutdown().catch((err) => {
      logger.warn("otel_shutdown_failed", {
        error: logger.serializeError(err),
      });
    });
  };

  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });
}

startOpenTelemetry();
