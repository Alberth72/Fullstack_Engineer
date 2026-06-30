import * as db from "./db_json";
import * as pg from "./pg";
import type { AgentTraceRecord } from "./agentAuditTypes";
import { usePostgresStorage } from "./storageMode";

function isStorageFailure(err: unknown) {
  return err instanceof Error && !String(err.message || "").includes("invalid");
}

export async function appendAgentTrace(trace: AgentTraceRecord) {
  if (!usePostgresStorage) {
    return db.appendAgentTrace(trace);
  }

  try {
    await pg.appendAgentTrace(trace);
  } catch (err) {
    if (!isStorageFailure(err)) {
      throw err;
    }
    console.warn("Postgres unavailable, falling back to JSON storage for agent traces:", err);
    db.appendAgentTrace(trace);
  }
}

export async function getAgentConversation(conversationId: string, limit = 6) {
  if (!usePostgresStorage) {
    return db.getAgentConversation(conversationId, limit);
  }

  try {
    return await pg.getAgentConversation(conversationId, limit);
  } catch (err) {
    console.warn("Postgres unavailable, reading agent conversation from JSON storage:", err);
    return db.getAgentConversation(conversationId, limit);
  }
}

export async function listAgentTraces(conversationId: string, limit = 20) {
  if (!usePostgresStorage) {
    return db.listAgentTraces(conversationId, limit);
  }

  try {
    return await pg.listAgentTraces(conversationId, limit);
  } catch (err) {
    console.warn("Postgres unavailable, reading agent traces from JSON storage:", err);
    return db.listAgentTraces(conversationId, limit);
  }
}
