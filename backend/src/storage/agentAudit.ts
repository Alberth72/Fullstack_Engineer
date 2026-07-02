import * as db from "./db_json";
import * as pg from "./pg";
import type { AgentTraceRecord } from "./agentAuditTypes";
import { logger } from "../observability/logger";
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
    logger.warn("postgres_fallback_to_json", {
      component: "agent_audit",
      operation: "append_trace",
      error: logger.serializeError(err),
    });
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
    logger.warn("postgres_fallback_to_json", {
      component: "agent_audit",
      operation: "get_conversation",
      error: logger.serializeError(err),
    });
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
    logger.warn("postgres_fallback_to_json", {
      component: "agent_audit",
      operation: "list_traces",
      error: logger.serializeError(err),
    });
    return db.listAgentTraces(conversationId, limit);
  }
}
