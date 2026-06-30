import { afterEach, describe, expect, it } from "vitest";
import {
  getTelemetryOutboxRetryDelayMs,
  getTelemetryOutboxWorkerConfig,
} from "../../src/events/outboxWorkerConfig";

const ENV_KEYS = [
  "OUTBOX_POLL_INTERVAL_MS",
  "OUTBOX_CLAIM_LIMIT",
  "OUTBOX_LOCK_TIMEOUT_MS",
  "OUTBOX_PUBLISH_RETRY_ATTEMPTS",
  "OUTBOX_PUBLISH_RETRY_BASE_DELAY_MS",
  "OUTBOX_PUBLISH_RETRY_MAX_DELAY_MS",
  "OUTBOX_BACKOFF_BASE_DELAY_MS",
  "OUTBOX_BACKOFF_MAX_DELAY_MS",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

describe("outbox worker config", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("returns defaults when env vars are not set", () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    expect(getTelemetryOutboxWorkerConfig()).toEqual({
      pollIntervalMs: 1000,
      claimLimit: 25,
      lockTimeoutMs: 30000,
      publishRetry: {
        attempts: 3,
        baseDelayMs: 250,
        maxDelayMs: 1500,
      },
      retryBackoff: {
        strategy: "exponential",
        baseDelayMs: 500,
        maxDelayMs: 10000,
      },
      defaults: {
        pollIntervalMs: 1000,
        claimLimit: 25,
        lockTimeoutMs: 30000,
        publishRetry: {
          attempts: 3,
          baseDelayMs: 250,
          maxDelayMs: 1500,
        },
        retryBackoff: {
          strategy: "exponential",
          baseDelayMs: 500,
          maxDelayMs: 10000,
        },
      },
    });
  });

  it("returns clamped effective values from env vars", () => {
    process.env.OUTBOX_POLL_INTERVAL_MS = "20";
    process.env.OUTBOX_CLAIM_LIMIT = "0";
    process.env.OUTBOX_LOCK_TIMEOUT_MS = "500";
    process.env.OUTBOX_PUBLISH_RETRY_ATTEMPTS = "0";
    process.env.OUTBOX_PUBLISH_RETRY_BASE_DELAY_MS = "10";
    process.env.OUTBOX_PUBLISH_RETRY_MAX_DELAY_MS = "50";
    process.env.OUTBOX_BACKOFF_BASE_DELAY_MS = "700";
    process.env.OUTBOX_BACKOFF_MAX_DELAY_MS = "600";

    const config = getTelemetryOutboxWorkerConfig();

    expect(config.pollIntervalMs).toBe(100);
    expect(config.claimLimit).toBe(1);
    expect(config.lockTimeoutMs).toBe(1000);
    expect(config.publishRetry).toEqual({
      attempts: 1,
      baseDelayMs: 50,
      maxDelayMs: 100,
    });
    expect(config.retryBackoff).toEqual({
      strategy: "exponential",
      baseDelayMs: 700,
      maxDelayMs: 700,
    });
  });

  it("calculates exponential retry delay using effective config", () => {
    process.env.OUTBOX_BACKOFF_BASE_DELAY_MS = "250";
    process.env.OUTBOX_BACKOFF_MAX_DELAY_MS = "900";

    expect(getTelemetryOutboxRetryDelayMs(1)).toBe(250);
    expect(getTelemetryOutboxRetryDelayMs(2)).toBe(500);
    expect(getTelemetryOutboxRetryDelayMs(3)).toBe(900);
  });
});
