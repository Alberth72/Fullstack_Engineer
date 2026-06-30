const DEFAULT_TRACE_RETENTION_DAYS = 30;
const DEFAULT_CONVERSATION_SUMMARY_THRESHOLD = 6;
const DEFAULT_CONVERSATION_RECENT_TURNS = 4;
const DEFAULT_TRACE_QUERY_LIMIT = 20;
const MAX_TRACE_QUERY_LIMIT = 50;

function readIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export function getAgentAuditConfig() {
  const traceRetentionDays = readIntegerEnv(
    "AGENT_TRACE_RETENTION_DAYS",
    DEFAULT_TRACE_RETENTION_DAYS
  );
  const conversationSummaryThreshold = Math.max(
    2,
    readIntegerEnv(
      "AGENT_CONVERSATION_SUMMARY_THRESHOLD",
      DEFAULT_CONVERSATION_SUMMARY_THRESHOLD
    )
  );
  const conversationRecentTurns = Math.max(
    1,
    readIntegerEnv("AGENT_CONVERSATION_RECENT_TURNS", DEFAULT_CONVERSATION_RECENT_TURNS)
  );

  return {
    schemaVersion: "agent-response.v1",
    traceRetentionDays,
    traceRetentionEnabled: traceRetentionDays > 0,
    conversationSummaryThreshold,
    conversationRecentTurns,
    traceQueryDefaultLimit: DEFAULT_TRACE_QUERY_LIMIT,
    traceQueryMaxLimit: MAX_TRACE_QUERY_LIMIT,
    defaults: {
      traceRetentionDays: DEFAULT_TRACE_RETENTION_DAYS,
      conversationSummaryThreshold: DEFAULT_CONVERSATION_SUMMARY_THRESHOLD,
      conversationRecentTurns: DEFAULT_CONVERSATION_RECENT_TURNS,
      traceQueryLimit: DEFAULT_TRACE_QUERY_LIMIT,
    },
  };
}
