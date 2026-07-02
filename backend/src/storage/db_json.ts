import fs from "fs";
import path from "path";
import { FleetVehicleState, TelemetryEvent } from "../types/telemetry";
import type { AgentTraceRecord } from "./agentAuditTypes";
import type {
  TelemetryOutboxRecord,
  TelemetryOutboxDeadLetterPruneOptions,
  TelemetryOutboxDeadLetterPruneResult,
  TelemetryOutboxStatus,
  TelemetryOutboxStorageMode,
  TelemetryOutboxSummary,
} from "./outboxTypes";
import {
  dedupeTelemetryEventsById,
  emptyTelemetryWriteResult,
  type TelemetryWriteResult,
} from "./telemetryWriteStats";
import { getAgentAuditConfig } from "../agent/agentAuditConfig";
import { getJsonStorageMaxEventsPerVehicle } from "./telemetryRetentionPolicy";

const dataDir = path.resolve(__dirname, "../../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, "events.json");
const outboxFile = path.join(dataDir, "outbox.json");
const agentDataDir = path.resolve(process.env.AGENT_AUDIT_DIR || dataDir);
if (!fs.existsSync(agentDataDir)) fs.mkdirSync(agentDataDir, { recursive: true });
const agentTraceFile = path.join(agentDataDir, "agent_traces.json");

function readAll(): TelemetryEvent[] {
  try {
    if (!fs.existsSync(dbFile)) return [];
    const raw = fs.readFileSync(dbFile, "utf8");
    return JSON.parse(raw) as TelemetryEvent[];
  } catch (err) {
    console.error("Error leyendo DB JSON:", err);
    return [];
  }
}

function writeAll(events: TelemetryEvent[]) {
  fs.writeFileSync(dbFile, JSON.stringify(events, null, 2), "utf8");
}

function compactEvents(events: TelemetryEvent[]) {
  const grouped = new Map<string, TelemetryEvent[]>();

  for (const event of events) {
    const bucket = grouped.get(event.vehicle_id) ?? [];
    bucket.push(event);
    grouped.set(event.vehicle_id, bucket);
  }

  const compacted: TelemetryEvent[] = [];
  const maxEventsPerVehicle = getJsonStorageMaxEventsPerVehicle();
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
    compacted.push(...bucket.slice(0, maxEventsPerVehicle));
  }

  return compacted;
}

function readOutbox(): TelemetryOutboxRecord[] {
  try {
    if (!fs.existsSync(outboxFile)) return [];
    const raw = fs.readFileSync(outboxFile, "utf8");
    return JSON.parse(raw) as TelemetryOutboxRecord[];
  } catch (err) {
    console.error("Error leyendo outbox JSON:", err);
    return [];
  }
}

function writeOutbox(entries: TelemetryOutboxRecord[]) {
  fs.writeFileSync(outboxFile, JSON.stringify(entries, null, 2), "utf8");
}

function readAgentTraces(): AgentTraceRecord[] {
  try {
    if (!fs.existsSync(agentTraceFile)) return [];
    const raw = fs.readFileSync(agentTraceFile, "utf8");
    return JSON.parse(raw) as AgentTraceRecord[];
  } catch (err) {
    console.error("Error leyendo agent traces JSON:", err);
    return [];
  }
}

function writeAgentTraces(entries: AgentTraceRecord[]) {
  fs.writeFileSync(agentTraceFile, JSON.stringify(entries, null, 2), "utf8");
}

function applyAgentTraceRetention(entries: AgentTraceRecord[], now = Date.now()) {
  const { traceRetentionDays } = getAgentAuditConfig();
  if (!Number.isFinite(traceRetentionDays) || traceRetentionDays <= 0) {
    return entries;
  }

  const cutoff = now - traceRetentionDays * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => entry.createdAt >= cutoff);
}

export function insertEvent(event: TelemetryEvent) {
  insertEvents([event]);
}

export function insertEvents(events: TelemetryEvent[]) {
  if (!events.length) return;

  const current = readAll();
  const byId = new Map<string, TelemetryEvent>();

  for (const existing of current) {
    byId.set(existing.id, existing);
  }

  for (const event of events) {
    byId.set(event.id, event);
  }

  writeAll(compactEvents(Array.from(byId.values())));
}

export function saveEventsWithOutbox(events: TelemetryEvent[]): TelemetryWriteResult {
  if (!events.length) return emptyTelemetryWriteResult("json");

  const currentEvents = readAll();
  const eventsById = new Map<string, TelemetryEvent>();
  for (const existing of currentEvents) {
    eventsById.set(existing.id, existing);
  }
  const { uniqueEvents, duplicateInBatch } = dedupeTelemetryEventsById(events);
  let inserted = 0;
  let updated = 0;

  for (const event of uniqueEvents) {
    if (eventsById.has(event.id)) {
      updated += 1;
    } else {
      inserted += 1;
    }
    eventsById.set(event.id, event);
  }
  writeAll(compactEvents(Array.from(eventsById.values())));

  const currentOutbox = readOutbox();
  const outboxById = new Map<string, TelemetryOutboxRecord>();
  for (const existing of currentOutbox) {
    outboxById.set(existing.id, existing);
  }

  const now = Date.now();
  let outboxCreated = 0;
  let outboxSkipped = 0;
  for (const event of uniqueEvents) {
    if (outboxById.has(event.id)) {
      outboxSkipped += 1;
      continue;
    }
    outboxById.set(event.id, {
      id: event.id,
      payload: event,
      status: "pending",
      attempts: 0,
      maxAttempts: 8,
      nextAttemptAt: now,
      lockedAt: null,
      lastError: null,
      publishedAt: null,
    });
    outboxCreated += 1;
  }

  writeOutbox(Array.from(outboxById.values()));
  return {
    storage: "json",
    received: events.length,
    unique: uniqueEvents.length,
    inserted,
    updated,
    duplicateInBatch,
    outboxCreated,
    outboxSkipped,
  };
}

export function getFleetState() {
  const events = readAll();
  const map = new Map<string, TelemetryEvent>();
  for (const e of events) {
    const existing = map.get(e.vehicle_id);
    if (!existing || e.timestamp > existing.timestamp) map.set(e.vehicle_id, e);
  }
  return Array.from(map.values()).map((row): FleetVehicleState => ({
    vehicle_id: row.vehicle_id,
    latitude: row.latitude,
    longitude: row.longitude,
    speed: row.speed,
    status: row.status,
    lastSeen: row.timestamp,
  }));
}

export function getEventsForVehicle(vehicle_id: string, limit = 100) {
  const events = readAll().filter((e) => e.vehicle_id === vehicle_id);
  return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function getFastestVehicles(minSpeed = 0, limit = 5) {
  const leaderboard = new Map<
    string,
    {
      vehicle_id: string;
      maxSpeed: number;
      maxSpeedAt: number | null;
      lastSeen: number | null;
      eventCount: number;
    }
  >();

  for (const event of readAll()) {
    const current = leaderboard.get(event.vehicle_id) ?? {
      vehicle_id: event.vehicle_id,
      maxSpeed: Number.NEGATIVE_INFINITY,
      maxSpeedAt: null,
      lastSeen: null,
      eventCount: 0,
    };

    current.eventCount += 1;
    current.lastSeen = current.lastSeen === null ? event.timestamp : Math.max(current.lastSeen, event.timestamp);

    if (
      typeof event.speed === "number" &&
      Number.isFinite(event.speed) &&
      event.speed >= current.maxSpeed
    ) {
      if (event.speed > current.maxSpeed || (event.speed === current.maxSpeed && (current.maxSpeedAt ?? 0) <= event.timestamp)) {
        current.maxSpeed = event.speed;
        current.maxSpeedAt = event.timestamp;
      }
    }

    leaderboard.set(event.vehicle_id, current);
  }

  return {
    minSpeed,
    vehicles: Array.from(leaderboard.values())
      .filter((row) => row.maxSpeed !== Number.NEGATIVE_INFINITY && row.maxSpeed >= minSpeed)
      .sort((a, b) => b.maxSpeed - a.maxSpeed || (b.maxSpeedAt ?? 0) - (a.maxSpeedAt ?? 0) || a.vehicle_id.localeCompare(b.vehicle_id))
      .slice(0, limit),
  };
}

export function getTelemetryStats() {
  const events = readAll();
  const totalVehicles = new Set(events.map((event) => event.vehicle_id)).size;
  const lastEventAt =
    events.length > 0 ? Math.max(...events.map((event) => event.timestamp)) : null;

  return {
    totalEvents: events.length,
    totalVehicles,
    lastEventAt,
  };
}

export function claimPendingOutbox(limit: number, lockTimeoutMs: number) {
  const now = Date.now();
  const outbox = readOutbox();
  const due = outbox
    .filter((entry) => ["pending", "retry", "processing"].includes(entry.status))
    .filter((entry) => entry.nextAttemptAt <= now)
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a.id.localeCompare(b.id))
    .slice(0, limit);

  const claimedIds = new Set(due.map((entry) => entry.id));
  const nextAttemptAt = now + lockTimeoutMs;

  const updated = outbox.map((entry) => {
    if (!claimedIds.has(entry.id)) return entry;

    return {
      ...entry,
      status: "processing" as const,
      attempts: entry.attempts + 1,
      lockedAt: now,
      nextAttemptAt,
      lastError: null,
    };
  });

  if (claimedIds.size > 0) {
    writeOutbox(updated);
  }

  return due.map((entry) => ({
    ...entry,
    status: "processing" as const,
    attempts: entry.attempts + 1,
    lockedAt: now,
    nextAttemptAt,
    lastError: null,
  }));
}

export function markOutboxPublished(ids: string[]) {
  if (!ids.length) return;

  const now = Date.now();
  const idSet = new Set(ids);
  const outbox = readOutbox().map((entry) => {
    if (!idSet.has(entry.id)) return entry;
    return {
      ...entry,
      status: "published" as const,
      lockedAt: null,
      lastError: null,
      publishedAt: now,
      nextAttemptAt: now,
    };
  });

  writeOutbox(outbox);
}

export function markOutboxRetry(
  id: string,
  error: string,
  delayMs: number,
  attempts: number,
  maxAttempts: number
) {
  const now = Date.now();
  const shouldDead = attempts >= maxAttempts;
  const outbox = readOutbox().map((entry) => {
    if (entry.id !== id) return entry;
    return {
      ...entry,
      status: shouldDead ? ("dead" as const) : ("retry" as const),
      lockedAt: null,
      lastError: error,
      nextAttemptAt: shouldDead ? now : now + delayMs,
    };
  });

  writeOutbox(outbox);
}

export function markOutboxDead(id: string, error: string, attempts: number) {
  markOutboxRetry(id, error, 0, attempts, attempts);
}

function buildEmptyOutboxStatusCounts(): Record<TelemetryOutboxStatus, number> {
  return {
    pending: 0,
    processing: 0,
    retry: 0,
    published: 0,
    dead: 0,
  };
}

export function getOutboxSummary(
  storage: TelemetryOutboxStorageMode = "json",
  now = Date.now()
): TelemetryOutboxSummary {
  const outbox = readOutbox();
  const byStatus = buildEmptyOutboxStatusCounts();
  let readyToPublish = 0;
  let blockedUntilLater = 0;
  let oldestPendingAt: number | null = null;
  let nextAttemptAt: number | null = null;
  let latestPublishedAt: number | null = null;

  for (const entry of outbox) {
    byStatus[entry.status] += 1;

    if (["pending", "processing", "retry"].includes(entry.status)) {
      oldestPendingAt =
        oldestPendingAt === null ? entry.nextAttemptAt : Math.min(oldestPendingAt, entry.nextAttemptAt);
      if (entry.nextAttemptAt <= now) {
        readyToPublish += 1;
      } else {
        blockedUntilLater += 1;
        nextAttemptAt =
          nextAttemptAt === null ? entry.nextAttemptAt : Math.min(nextAttemptAt, entry.nextAttemptAt);
      }
    }

    if (entry.publishedAt !== null) {
      latestPublishedAt =
        latestPublishedAt === null ? entry.publishedAt : Math.max(latestPublishedAt, entry.publishedAt);
    }
  }

  const errorSamples = outbox
    .filter((entry) => entry.lastError && ["dead", "retry"].includes(entry.status))
    .sort((a, b) => b.nextAttemptAt - a.nextAttemptAt || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map((entry) => ({
      id: entry.id,
      vehicle_id: entry.payload.vehicle_id,
      status: entry.status,
      attempts: entry.attempts,
      maxAttempts: entry.maxAttempts,
      nextAttemptAt: entry.nextAttemptAt,
      lastError: entry.lastError,
    }));

  return {
    generatedAt: now,
    storage,
    total: outbox.length,
    byStatus,
    readyToPublish,
    blockedUntilLater,
    oldestPendingAt,
    nextAttemptAt,
    latestPublishedAt,
    deadLetterCount: byStatus.dead,
    retryCount: byStatus.retry,
    processingCount: byStatus.processing,
    errorSamples,
  };
}

export function pruneDeadOutboxLetters(
  options: TelemetryOutboxDeadLetterPruneOptions,
  storage: TelemetryOutboxStorageMode = "json"
): TelemetryOutboxDeadLetterPruneResult {
  const generatedAt = options.now ?? Date.now();
  const cutoffAt = generatedAt - options.olderThanDays * 24 * 60 * 60 * 1000;
  const outbox = readOutbox();
  const matches = outbox.filter(
    (entry) => entry.status === "dead" && entry.nextAttemptAt <= cutoffAt
  );

  if (!options.dryRun && matches.length > 0) {
    const matchedIds = new Set(matches.map((entry) => entry.id));
    writeOutbox(outbox.filter((entry) => !matchedIds.has(entry.id)));
  }

  return {
    generatedAt,
    storage,
    dryRun: options.dryRun,
    olderThanDays: options.olderThanDays,
    cutoffAt,
    matched: matches.length,
    deleted: options.dryRun ? 0 : matches.length,
    retained: outbox.length - (options.dryRun ? 0 : matches.length),
  };
}

export function appendAgentTrace(trace: AgentTraceRecord) {
  const traces = applyAgentTraceRetention(readAgentTraces(), trace.createdAt);
  const byId = new Map<string, AgentTraceRecord>();

  for (const existing of traces) {
    byId.set(existing.id, existing);
  }

  byId.set(trace.id, trace);
  writeAgentTraces(applyAgentTraceRetention(Array.from(byId.values()), trace.createdAt));
}

export function getAgentConversation(conversationId: string, limit = 6) {
  return readAgentTraces()
    .filter((entry) => entry.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit)
    .map((entry) => ({
      turnIndex: entry.turnIndex,
      question: entry.question,
      answer: entry.answer,
      createdAt: entry.createdAt,
    }));
}

export function listAgentTraces(conversationId: string, limit = 20) {
  return readAgentTraces()
    .filter((entry) => entry.conversationId === conversationId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
