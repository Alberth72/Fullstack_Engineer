import { randomUUID } from "crypto";
import type {
  AgentConversationMessage,
  AgentConversationTurn,
  AgentAuditTraceSummary,
  AgentExecution,
  AgentResponse,
  AgentTraceRecord,
} from "./agentTypes";
import type { AgentSpecialist } from "./agentProfiles";
import { appendAgentTrace, getAgentConversation, listAgentTraces } from "../storage/agentAudit";
import { getAgentAuditConfig } from "./agentAuditConfig";

const THREAD_TOOL_TITLES: Record<string, string> = {
  getFleetSummary: "Resumen de flota",
  getFleetState: "Estado de la flota",
  getFastestVehicles: "Velocidad historica",
  getStoppedVehicles: "Vehiculos detenidos",
  getCriticalZones: "Zonas criticas",
  getVehiclesInCriticalZones: "Vehiculos en zonas criticas",
  getStoppedVehiclesInCriticalZones: "Vehiculos detenidos en zonas criticas",
  getVehicleDetail: "Detalle de vehiculo",
  getVehicleEvents: "Historial de vehiculo",
};

const THREAD_STOPWORDS = new Set([
  "que",
  "cuantos",
  "cuantas",
  "cual",
  "cuales",
  "de",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "y",
  "o",
  "en",
  "por",
  "para",
  "con",
  "del",
  "al",
  "sobre",
  "mas",
  "tambien",
  "ahora",
  "hay",
  "son",
  "esta",
  "estan",
  "tiene",
  "tienen",
  "detenidos",
  "detenido",
]);

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cleanQuestionForTitle(question: string) {
  return stripAccents(question.toLowerCase())
    .replace(/[¿?¡!.,;:"'()\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeQuestion(question: string) {
  const words = cleanQuestionForTitle(question)
    .split(" ")
    .filter(Boolean)
    .filter((word) => !THREAD_STOPWORDS.has(word));

  if (!words.length) {
    return "Consulta operativa";
  }

  return toTitleCase(words.slice(0, 6).join(" "));
}

function getConversationSourceQuestion(question: string, history: AgentConversationTurn[]) {
  return history[0]?.question || question;
}

function formatList(items: string[], fallback = "sin detalles adicionales") {
  if (!items.length) return fallback;
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function formatDatetime(timestamp?: number | null) {
  if (!timestamp) return null;

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatMetricReply(answer: AgentResponse) {
  const result = Array.isArray(answer.result) ? answer.result : [];
  const metrics = new Map<string, unknown>();

  for (const entry of result) {
    if (entry && typeof entry === "object" && "metric" in entry && "value" in entry) {
      const row = entry as { metric: string; value: unknown };
      metrics.set(row.metric, row.value);
    }
  }

  if (!metrics.size) return null;

  const total = metrics.get("total_vehicles");
  const moving = metrics.get("moving");
  const stopped = metrics.get("stopped");
  const offline = metrics.get("offline");

  if (answer.intent === "count_fleet" || answer.tool === "getFleetSummary") {
    const parts = [
      typeof moving === "number" ? `${moving} en movimiento` : null,
      typeof stopped === "number" ? `${stopped} detenidos` : null,
      typeof offline === "number" ? `${offline} offline` : null,
    ].filter(Boolean) as string[];

    if (typeof total === "number" && parts.length > 0) {
      return `En este momento hay ${total} vehiculos en la flota: ${formatList(parts)}.`;
    }

    if (typeof total === "number") {
      return `En este momento hay ${total} vehiculos en la flota.`;
    }
  }

  if (typeof offline === "number" && answer.intent === "count_offline") {
    return `Hay ${offline} vehiculos offline.`;
  }

  if (typeof metrics.get("total") === "number") {
    return `Encontre ${metrics.get("total")} resultados operativos.`;
  }

  return null;
}

function formatVehicleListReply(answer: AgentResponse) {
  const rawResult = answer.result;
  const result = Array.isArray(rawResult)
    ? rawResult
    : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).vehicles)
    ? ((rawResult as Record<string, unknown>).vehicles as unknown[])
    : [];

  const vehicles = result
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return typeof row.vehicle_id === "string" ? row.vehicle_id : null;
    })
    .filter((item): item is string => Boolean(item));

  if (!vehicles.length) return null;

  if (answer.tool === "getStoppedVehiclesInCriticalZones" || answer.tool === "getVehiclesInCriticalZones") {
    return `Encontre ${vehicles.length} vehiculos: ${formatList(vehicles)}.`;
  }

  if (answer.tool === "getStoppedVehicles") {
    return `Hay ${vehicles.length} vehiculos detenidos: ${formatList(vehicles)}.`;
  }

  return `Vehiculos detectados: ${formatList(vehicles)}.`;
}

function formatSpeedReply(answer: AgentResponse) {
  const rawResult = answer.result;
  if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) return null;

  const data = rawResult as Record<string, unknown>;
  const minSpeed = typeof data.minSpeed === "number" ? data.minSpeed : null;
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];

  const parsed = vehicles
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        vehicle_id: typeof row.vehicle_id === "string" ? row.vehicle_id : null,
        maxSpeed: typeof row.maxSpeed === "number" ? row.maxSpeed : null,
      };
    })
    .filter(
      (item): item is { vehicle_id: string; maxSpeed: number } =>
        Boolean(item && item.vehicle_id && typeof item.maxSpeed === "number")
    )
    .sort((a, b) => b.maxSpeed - a.maxSpeed);

  if (!parsed.length) {
    return minSpeed && minSpeed > 0
      ? `No encontre vehiculos que superen ${minSpeed} km/h.`
      : "No encontre vehiculos con velocidad historica disponible.";
  }

  if (parsed.length === 1) {
    const [fastest] = parsed;
    return minSpeed && minSpeed > 0
      ? `El vehiculo ${fastest.vehicle_id} supero los ${minSpeed} km/h con un maximo historico de ${fastest.maxSpeed} km/h.`
      : `El vehiculo ${fastest.vehicle_id} alcanzo un maximo historico de ${fastest.maxSpeed} km/h.`;
  }

  const topThree = parsed.slice(0, 3).map((item) => `${item.vehicle_id} (${item.maxSpeed} km/h)`);
  return minSpeed && minSpeed > 0
    ? `Los vehiculos que superaron ${minSpeed} km/h fueron ${formatList(topThree)}.`
    : `Los vehiculos mas rapidos fueron ${formatList(topThree)}.`;
}

function formatDetailReply(answer: AgentResponse) {
  const result = answer.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;

  const data = result as Record<string, unknown>;
  const derived = data.derived as Record<string, unknown> | undefined;
  const lastEvent = data.lastEvent as Record<string, unknown> | undefined;

  if (!derived && !lastEvent) return null;

  const vehicleId = typeof data.vehicle_id === "string" ? data.vehicle_id : null;
  const status =
    (derived && typeof derived.derivedStatus === "string" && derived.derivedStatus) ||
    (derived && typeof derived.status === "string" && derived.status) ||
    (lastEvent && typeof lastEvent.status === "string" && lastEvent.status) ||
    null;
  const lastSeen = derived && typeof derived.lastSeen === "number" ? derived.lastSeen : null;
  const lastEventAt = lastEvent && typeof lastEvent.timestamp === "number" ? lastEvent.timestamp : null;
  const stamp = formatDatetime(lastSeen ?? lastEventAt);

  const parts = [
    vehicleId ? `El vehiculo ${vehicleId}` : "El vehiculo consultado",
    status ? `esta ${status}` : "tiene estado disponible",
    stamp ? `y su ultima senal fue ${stamp}` : null,
  ].filter(Boolean) as string[];

  return `${parts.join(" ")}.`;
}

export function renderAgentReply(answer: AgentResponse) {
  if (typeof answer.message === "string" && answer.message.trim()) {
    return answer.message.trim();
  }

  if (typeof answer.raw === "string" && answer.raw.trim()) {
    return answer.raw.trim();
  }

  return (
    formatMetricReply(answer) ||
    formatSpeedReply(answer) ||
    formatDetailReply(answer) ||
    formatVehicleListReply(answer) ||
    "Pude consultar la flota, pero no encontre una respuesta mas detallada para esa pregunta."
  );
}

export function buildConversationTitle(
  question: string,
  answer: AgentResponse,
  history: AgentConversationTurn[] = []
) {
  const toolTitle = answer.tool ? THREAD_TOOL_TITLES[answer.tool] : undefined;
  if (toolTitle) {
    return toolTitle;
  }

  return summarizeQuestion(getConversationSourceQuestion(question, history));
}

export function buildConversationSummary(
  question: string,
  answer: AgentResponse,
  history: AgentConversationTurn[] = []
) {
  const sourceQuestion = getConversationSourceQuestion(question, history);
  const preview = summarizeQuestion(sourceQuestion);
  const turnCount = history.length + 1;
  const toolTitle = answer.tool ? THREAD_TOOL_TITLES[answer.tool] : undefined;

  if (toolTitle) {
    return `${turnCount} turnos | ${toolTitle} | ${preview}`;
  }

  return `${turnCount} turnos | ${preview}`;
}

export async function loadAgentConversation(conversationId: string, limit = 6) {
  const config = getAgentAuditConfig();
  const expandedLimit = Math.max(
    limit,
    config.conversationSummaryThreshold + config.conversationRecentTurns + 1
  );
  const turns = await getAgentConversation(conversationId, expandedLimit);
  return compactConversationHistory(turns, limit);
}

function buildAutomaticConversationSummary(turns: AgentConversationTurn[]): AgentConversationTurn {
  const first = turns[0]!;
  const last = turns[turns.length - 1]!;
  const tools = Array.from(
    new Set(
      turns
        .map((turn) => turn.answer.tool)
        .filter((tool): tool is string => Boolean(tool))
    )
  );
  const intents = Array.from(
    new Set(
      turns
        .map((turn) => turn.answer.intent)
        .filter((intent): intent is string => Boolean(intent))
    )
  );
  const highlights = turns
    .slice(-3)
    .map((turn) => renderAgentReply(turn.answer))
    .filter(Boolean);

  return {
    turnIndex: Math.max(0, last.turnIndex - turns.length),
    question: "Resumen automatico de la conversacion previa",
    answer: {
      specialist: last.answer.specialist,
      intent: "conversation_summary",
      query: "Resumen automatico de la conversacion previa",
      result: {
        summarizedTurns: turns.length,
        firstTurnIndex: first.turnIndex,
        lastTurnIndex: last.turnIndex,
        tools,
        intents,
        highlights,
      },
      tool: "conversationSummary",
      message: [
        `Resumen automatico de ${turns.length} turnos previos.`,
        tools.length ? `Tools usadas: ${tools.join(", ")}.` : "Sin tools registradas.",
        highlights.length ? `Ultimos hallazgos: ${highlights.join(" | ")}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
    createdAt: last.createdAt,
  };
}

export function compactConversationHistory(
  turns: AgentConversationTurn[],
  limit = 6
): AgentConversationTurn[] {
  const config = getAgentAuditConfig();
  if (turns.length <= config.conversationSummaryThreshold) {
    return turns.slice(-limit);
  }

  const recentCount = Math.min(config.conversationRecentTurns, Math.max(1, limit - 1));
  const olderTurns = turns.slice(0, -recentCount);
  const recentTurns = turns.slice(-recentCount);
  return [buildAutomaticConversationSummary(olderTurns), ...recentTurns];
}

export function summarizeAgentTrace(trace: AgentTraceRecord): AgentAuditTraceSummary {
  return {
    id: trace.id,
    conversationId: trace.conversationId,
    turnIndex: trace.turnIndex,
    specialist: trace.specialist,
    mode: trace.mode,
    question: trace.question,
    intent: trace.answer.intent ?? null,
    message: trace.answer.message ?? renderAgentReply(trace.answer),
    tool: trace.tool,
    tools: trace.tools,
    createdAt: trace.createdAt,
    error: trace.error ?? trace.answer.error ?? null,
    contextKeys: Object.keys(trace.context ?? {}).sort(),
    historyDepth: trace.history.length,
  };
}

export async function loadAgentTraceSummaries(conversationId: string, limit = 20) {
  const traces = await listAgentTraces(conversationId, limit);
  return traces.map(summarizeAgentTrace);
}

export function createConversationId() {
  return `conv-${randomUUID()}`;
}

export function buildConversationMessages(
  history: AgentConversationTurn[],
  limit = 2
): AgentConversationMessage[] {
  return history
    .slice(-limit)
    .flatMap((turn) => [
      {
        role: "user" as const,
        content: turn.question,
      },
      {
        role: "assistant" as const,
        content: renderAgentReply(turn.answer),
      },
    ]);
}

export function buildConversationContext(history: AgentConversationTurn[]) {
  return {
    recentConversation: history.slice(-2).map((turn) => ({
      turnIndex: turn.turnIndex,
      question: turn.question,
      intent: turn.answer.intent,
      tool: turn.answer.tool ?? null,
      message: turn.answer.message ?? null,
    })),
  };
}

export function isFollowUpQuestion(question: string) {
  const normalized = question.trim().toLowerCase();
  return (
    normalized.startsWith("y ") ||
    normalized.startsWith("y los") ||
    normalized.startsWith("y las") ||
    normalized.startsWith("de esos") ||
    normalized.startsWith("de ellas") ||
    normalized.startsWith("ahora") ||
    normalized.startsWith("tambien") ||
    normalized.startsWith("también") ||
    normalized.startsWith("esos") ||
    normalized.startsWith("ellas") ||
    normalized.startsWith("ellos") ||
    normalized.startsWith("que mas") ||
    normalized.startsWith("qué mas") ||
    normalized.startsWith("que más") ||
    normalized.startsWith("qué más")
  );
}

export function enrichQuestionWithHistory(
  question: string,
  history: AgentConversationTurn[]
): string {
  if (!history.length || !isFollowUpQuestion(question)) {
    return question;
  }

  const previous = history[history.length - 1];
  return [
    question,
    "",
    "Contexto de la ultima respuesta:",
    JSON.stringify({
      question: previous.question,
      answer: {
        intent: previous.answer.intent,
        tool: previous.answer.tool,
        message: previous.answer.message ?? renderAgentReply(previous.answer),
      },
    }),
  ].join("\n");
}

export async function persistAgentExecution(execution: AgentExecution) {
  await appendAgentTrace(execution.trace);
}

export function buildNextTurnIndex(history: AgentConversationTurn[]) {
  return history.length > 0 ? history[history.length - 1]!.turnIndex + 1 : 1;
}

export function buildExecutionConversationId(
  requestedConversationId?: string | null
) {
  return requestedConversationId?.trim() || createConversationId();
}
