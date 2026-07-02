import { Router } from "express";
import { executeAgentQuery } from "../agent/agentClient";
import { getAgentAuditConfig } from "../agent/agentAuditConfig";
import { classifyAgentIntent } from "../agent/agentIntentRouter";
import { buildAgentPromptContext } from "../agent/agentContext";
import {
  buildExecutionConversationId,
  persistAgentExecution,
  loadAgentConversation,
  loadAgentTraceSummaries,
} from "../agent/agentConversation";
import * as telemetryService from "../services/telemetryService";
import { incrementCounter } from "../observability/metrics";
import { logger } from "../observability/logger";
import { traceLogContext, type TraceContext } from "../observability/tracing";

const router = Router();

function readLimit(value: unknown) {
  const { traceQueryDefaultLimit, traceQueryMaxLimit } = getAgentAuditConfig();
  const fallback = traceQueryDefaultLimit;
  const max = traceQueryMaxLimit;
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function getTrace(res: { locals: Record<string, unknown> }) {
  return res.locals.trace as TraceContext | undefined;
}

router.post("/query", async (req, res) => {
  const trace = getTrace(res);
  try {
    const { question, specialist, conversationId } = req.body;
    if (!question) return res.status(400).json({ error: "missing_question" });

    const resolvedConversationId = buildExecutionConversationId(
      conversationId || req.header("x-agent-conversation-id")
    );

    // Provide a minimal context from current fleet state to the agent
    const conversationHistory = await loadAgentConversation(resolvedConversationId, 6);
    const intentRoute = classifyAgentIntent(question, conversationHistory);
    const needsFleetState = [
      "list_stopped",
      "location",
      "speed",
      "vehicle_detail",
      "vehicle_events",
    ].includes(intentRoute.kind);

    const fleetSummaryPromise = telemetryService.getFleetSummary();
    const fleetStatePromise = needsFleetState ? telemetryService.getFleetState() : Promise.resolve([]);
    const [fleetSummary, fleetState] = await Promise.all([fleetSummaryPromise, fleetStatePromise]);

    const context = buildAgentPromptContext({
      conversationId: resolvedConversationId,
      history: conversationHistory,
      specialist: specialist || null,
      intent: intentRoute,
      fleetSize:
        needsFleetState || typeof fleetSummary.totalVehicles !== "number"
          ? fleetState.length
          : fleetSummary.totalVehicles,
      fleetSummary,
      fleetState,
    });

    const execution = await executeAgentQuery(question, context, {
      specialist,
      conversationId: resolvedConversationId,
      conversationHistory,
    });
    await persistAgentExecution(execution);
    incrementCounter("agentQueries");
    logger.info("agent_query_processed", {
      ...traceLogContext(trace),
      conversationId: execution.trace.conversationId,
      mode: execution.trace.mode,
      specialist: execution.answer.specialist,
      intent: intentRoute.kind,
    });
    res.json({
      question,
      answer: execution.answer,
      reply: execution.answer.message,
      mode: execution.trace.mode,
      specialist: execution.answer.specialist,
      conversationId: execution.trace.conversationId,
      turnIndex: execution.trace.turnIndex,
    });
  } catch (err) {
    incrementCounter("agentErrors");
    logger.error("agent_query_failed", err, {
      ...traceLogContext(trace),
    });
    res.status(500).json({ error: "agent_error" });
  }
});

router.get("/conversations/:conversationId/traces", async (req, res) => {
  const trace = getTrace(res);
  try {
    const conversationId = req.params.conversationId?.trim();
    if (!conversationId) return res.status(400).json({ error: "missing_conversation_id" });

    const limit = readLimit(req.query.limit);
    const traces = await loadAgentTraceSummaries(conversationId, limit);
    res.json({
      conversationId,
      count: traces.length,
      traces,
    });
  } catch (err) {
    incrementCounter("agentErrors");
    logger.error("agent_audit_traces_failed", err, {
      ...traceLogContext(trace),
      conversationId: req.params.conversationId || null,
    });
    res.status(500).json({ error: "agent_audit_error" });
  }
});

router.get("/admin/config", (_req, res) => {
  res.json({
    agentAudit: getAgentAuditConfig(),
  });
});

export { router as agentRouter };
