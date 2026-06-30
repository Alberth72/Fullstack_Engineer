import type { TelemetryEvent } from "../types/telemetry";

export type TelemetryOutboxStatus =
  | "pending"
  | "processing"
  | "retry"
  | "published"
  | "dead";

export type TelemetryOutboxRecord = {
  id: string;
  payload: TelemetryEvent;
  status: TelemetryOutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  lockedAt: number | null;
  lastError: string | null;
  publishedAt: number | null;
};

export type TelemetryOutboxStorageMode = "postgres" | "json" | "json_fallback";

export type TelemetryOutboxErrorSample = {
  id: string;
  vehicle_id: string;
  status: TelemetryOutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  lastError: string | null;
};

export type TelemetryOutboxSummary = {
  generatedAt: number;
  storage: TelemetryOutboxStorageMode;
  total: number;
  byStatus: Record<TelemetryOutboxStatus, number>;
  readyToPublish: number;
  blockedUntilLater: number;
  oldestPendingAt: number | null;
  nextAttemptAt: number | null;
  latestPublishedAt: number | null;
  deadLetterCount: number;
  retryCount: number;
  processingCount: number;
  errorSamples: TelemetryOutboxErrorSample[];
};
