const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_CLAIM_LIMIT = 25;
const DEFAULT_LOCK_TIMEOUT_MS = 30000;
const DEFAULT_PUBLISH_RETRY_ATTEMPTS = 3;
const DEFAULT_PUBLISH_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_PUBLISH_RETRY_MAX_DELAY_MS = 1500;
const DEFAULT_BACKOFF_BASE_DELAY_MS = 500;
const DEFAULT_BACKOFF_MAX_DELAY_MS = 10000;

function readIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export function getTelemetryOutboxWorkerConfig() {
  const pollIntervalMs = Math.max(
    100,
    readIntegerEnv("OUTBOX_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS)
  );
  const claimLimit = Math.max(1, readIntegerEnv("OUTBOX_CLAIM_LIMIT", DEFAULT_CLAIM_LIMIT));
  const lockTimeoutMs = Math.max(
    1000,
    readIntegerEnv("OUTBOX_LOCK_TIMEOUT_MS", DEFAULT_LOCK_TIMEOUT_MS)
  );
  const publishRetryAttempts = Math.max(
    1,
    readIntegerEnv("OUTBOX_PUBLISH_RETRY_ATTEMPTS", DEFAULT_PUBLISH_RETRY_ATTEMPTS)
  );
  const publishRetryBaseDelayMs = Math.max(
    50,
    readIntegerEnv(
      "OUTBOX_PUBLISH_RETRY_BASE_DELAY_MS",
      DEFAULT_PUBLISH_RETRY_BASE_DELAY_MS
    )
  );
  const publishRetryMaxDelayMs = Math.max(
    100,
    readIntegerEnv("OUTBOX_PUBLISH_RETRY_MAX_DELAY_MS", DEFAULT_PUBLISH_RETRY_MAX_DELAY_MS)
  );
  const backoffBaseDelayMs = Math.max(
    100,
    readIntegerEnv("OUTBOX_BACKOFF_BASE_DELAY_MS", DEFAULT_BACKOFF_BASE_DELAY_MS)
  );
  const backoffMaxDelayMs = Math.max(
    backoffBaseDelayMs,
    readIntegerEnv("OUTBOX_BACKOFF_MAX_DELAY_MS", DEFAULT_BACKOFF_MAX_DELAY_MS)
  );

  return {
    pollIntervalMs,
    claimLimit,
    lockTimeoutMs,
    publishRetry: {
      attempts: publishRetryAttempts,
      baseDelayMs: publishRetryBaseDelayMs,
      maxDelayMs: publishRetryMaxDelayMs,
    },
    retryBackoff: {
      strategy: "exponential" as const,
      baseDelayMs: backoffBaseDelayMs,
      maxDelayMs: backoffMaxDelayMs,
    },
    defaults: {
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      claimLimit: DEFAULT_CLAIM_LIMIT,
      lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
      publishRetry: {
        attempts: DEFAULT_PUBLISH_RETRY_ATTEMPTS,
        baseDelayMs: DEFAULT_PUBLISH_RETRY_BASE_DELAY_MS,
        maxDelayMs: DEFAULT_PUBLISH_RETRY_MAX_DELAY_MS,
      },
      retryBackoff: {
        strategy: "exponential" as const,
        baseDelayMs: DEFAULT_BACKOFF_BASE_DELAY_MS,
        maxDelayMs: DEFAULT_BACKOFF_MAX_DELAY_MS,
      },
    },
  };
}

export function getTelemetryOutboxRetryDelayMs(attempts: number) {
  const { retryBackoff } = getTelemetryOutboxWorkerConfig();
  return Math.min(
    retryBackoff.maxDelayMs,
    retryBackoff.baseDelayMs * Math.pow(2, Math.max(0, attempts - 1))
  );
}
