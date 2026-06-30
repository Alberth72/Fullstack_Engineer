import { randomUUID } from "crypto";
import { runTool } from "./agentFunctionCaller";
import { classifyAgentIntent } from "./agentIntentRouter";
import { resolveAgentSpecialist, type AgentSpecialist } from "./agentProfiles";
import type {
  AgentConversationMessage,
  AgentConversationTurn,
  AgentExecution,
  AgentExecutionMode,
  AgentQueryOptions,
  AgentResponse,
} from "./agentTypes";
import {
  buildConversationContext,
  buildConversationMessages,
  buildExecutionConversationId,
  buildNextTurnIndex,
  enrichQuestionWithHistory,
  renderAgentReply,
} from "./agentConversation";
import { validateAgentResponse } from "./agentResponseSchema";
import { queryAgentWithLangChain } from "./langchainAgent";

function useMockAgent() {
  return !process.env.OPENAI_API_KEY || process.env.AGENT_MOCK === "true";
}

function getNumericMetric(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function getFleetStateSample(context: Record<string, any>) {
  if (Array.isArray(context.fleetState)) return context.fleetState;
  if (Array.isArray(context.sample)) return context.sample;
  return [];
}

function formatSpeedRecords(records: Array<{ vehicle_id: string; maxSpeed: number }>, minSpeed: number) {
  if (!records.length) {
    return minSpeed > 0
      ? `No encontre vehiculos que superen ${minSpeed} km/h.`
      : "No encontre vehiculos con velocidad historica disponible.";
  }

  const [fastest] = records;
  if (records.length === 1) {
    return minSpeed > 0
      ? `El vehiculo ${fastest.vehicle_id} supero los ${minSpeed} km/h con un maximo historico de ${fastest.maxSpeed} km/h.`
      : `El vehiculo ${fastest.vehicle_id} alcanzo un maximo historico de ${fastest.maxSpeed} km/h.`;
  }

  const topThree = records.slice(0, 3).map((item) => `${item.vehicle_id} (${item.maxSpeed} km/h)`);
  return minSpeed > 0
    ? `Los vehiculos que superaron ${minSpeed} km/h fueron ${topThree.join(", ")}.`
    : `Los vehiculos mas rapidos fueron ${topThree.join(", ")}.`;
}

async function getMockResponse(
  question: string,
  context: Record<string, any>,
  specialist: AgentSpecialist,
  intentRoute: ReturnType<typeof classifyAgentIntent>
): Promise<AgentResponse> {
  const summary = context.fleetSummary || {};
  const fleetState = getFleetStateSample(context);
  const recentConversation = context.recentConversation || [];
  const previousTurn = recentConversation[recentConversation.length - 1];
  const q = question.toLowerCase();

  if (previousTurn?.intent === "tool_getStoppedVehiclesInCriticalZones") {
    return {
      specialist,
      intent: "follow_up_stopped_critical_zones",
      query: question,
      result: previousTurn.message ? [{ message: previousTurn.message }] : [],
      tool: "getStoppedVehiclesInCriticalZones",
      message: "Retomo el hilo anterior con los mismos vehiculos detenidos en zonas criticas.",
    };
  }

  if (previousTurn?.intent === "tool_getVehiclesInCriticalZones") {
    return {
      specialist,
      intent: "follow_up_critical_zones",
      query: question,
      result: previousTurn.message ? [{ message: previousTurn.message }] : [],
      tool: "getVehiclesInCriticalZones",
      message: "Retomo el hilo anterior con los vehiculos que siguen dentro de zonas criticas.",
    };
  }

  if (q.includes("ubicacion") || q.includes("localizacion") || q.includes("location")) {
    return {
      specialist,
      intent: "get_locations",
      query: question,
      result: fleetState.map((v: any) => ({
        vehicle_id: v.vehicle_id,
        latitude: v.latitude,
        longitude: v.longitude,
      })),
      tool: "getFleetState",
      message:
        fleetState.length > 0
          ? `Te comparto la ubicacion actual de ${fleetState.length} vehiculos de la flota.`
          : "No tengo vehiculos con ubicacion disponible en este momento.",
    };
  }

  if (intentRoute.kind === "fastest_vehicle") {
    const minSpeed = intentRoute.threshold ?? 0;
    const toolResult = await runTool("getFastestVehicles", { minSpeed, limit: 5 });
    const output = toolResult.output as {
      minSpeed?: number;
      vehicles?: Array<{ vehicle_id: string; maxSpeed: number }>;
    };

    return {
      specialist,
      intent: "fastest_vehicle",
      query: question,
      result: output,
      tool: "getFastestVehicles",
      message: formatSpeedRecords(output.vehicles ?? [], output.minSpeed ?? minSpeed),
    };
  }

  if (q.includes("velocidad") || q.includes("speed") || q.includes("rapido")) {
    return {
      specialist,
      intent: "get_speeds",
      query: question,
      result: fleetState
        .filter((v: any) => v.speed !== null && v.speed !== undefined)
        .map((v: any) => ({ vehicle_id: v.vehicle_id, speed: v.speed })),
      tool: "getFleetState",
      message:
        fleetState.length > 0
          ? `Estas son las velocidades disponibles para ${fleetState.length} vehiculos.`
          : "No tengo velocidades disponibles para mostrar.",
    };
  }

  if (q.includes("detenido") || q.includes("stopped") || q.includes("parado")) {
    const stopped = fleetState.filter((v: any) => v.status === "stopped");
    return {
      specialist,
      intent: "filter_by_status",
      query: question,
      result: stopped.map((v: any) => ({ vehicle_id: v.vehicle_id, status: v.status })),
      tool: "getStoppedVehicles",
      message:
        stopped.length > 0
          ? `Encontre ${stopped.length} vehiculos detenidos: ${stopped.map((v: any) => v.vehicle_id).join(", ")}.`
          : "No veo vehiculos detenidos en este momento.",
    };
  }

  return {
    specialist,
    intent: "general_query",
    query: question,
    result: [
      {
        info: `Flota con ${getNumericMetric(summary.totalVehicles, context.fleetSize ?? fleetState.length)} vehiculos. Pregunta registrada: "${question}"`,
        summary,
      },
    ],
    tool: "getFleetSummary",
    message: `Veo ${getNumericMetric(summary.totalVehicles, context.fleetSize ?? fleetState.length)} vehiculos en la flota. Si quieres, puedo detallarte un vehiculo, las zonas criticas o los detenidos.`,
  };
}

function buildDirectResponse(
  question: string,
  context: Record<string, any>,
  specialist: AgentSpecialist,
  route: ReturnType<typeof classifyAgentIntent>
): AgentResponse | null {
  const summary = context.fleetSummary || {};
  const fleetState = getFleetStateSample(context);

  if (route.kind === "count_fleet") {
    const total = getNumericMetric(summary.totalVehicles, context.fleetSize ?? fleetState.length);
    const moving = getNumericMetric(summary.moving, fleetState.filter((v: any) => v.status === "moving").length);
    const stopped = getNumericMetric(summary.stopped, fleetState.filter((v: any) => v.status === "stopped").length);
    const offline = getNumericMetric(summary.offline, fleetState.filter((v: any) => v.status === "offline").length);

    return {
      specialist,
      intent: "count_fleet",
      query: question,
      result: [
        { metric: "total_vehicles", value: total },
        { metric: "moving", value: moving },
        { metric: "stopped", value: stopped },
        { metric: "offline", value: offline },
      ],
      tool: "getFleetSummary",
      message: `En este momento hay ${total} vehiculos en la flota: ${moving} en movimiento, ${stopped} detenidos y ${offline} offline.`,
    };
  }

  if (route.kind === "count_stopped") {
    const stopped = getNumericMetric(summary.stopped, fleetState.filter((v: any) => v.status === "stopped").length);

    return {
      specialist,
      intent: "count_stopped",
      query: question,
      result: [{ metric: "stopped", value: stopped }],
      tool: "getFleetSummary",
      message: `Hay ${stopped} vehiculos detenidos.`,
    };
  }

  if (route.kind === "count_offline") {
    const offline = getNumericMetric(summary.offline, fleetState.filter((v: any) => v.status === "offline").length);

    return {
      specialist,
      intent: "count_offline",
      query: question,
      result: [{ metric: "offline", value: offline }],
      tool: "getFleetSummary",
      message: `Hay ${offline} vehiculos offline.`,
    };
  }

  if (route.kind === "list_stopped") {
    const stopped = fleetState.filter((v: any) => v.status === "stopped");
    if (!stopped.length) return null;

    const ids = stopped
      .map((v: any) => (typeof v.vehicle_id === "string" ? v.vehicle_id : null))
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId));

    if (!ids.length) return null;

    return {
      specialist,
      intent: "list_stopped",
      query: question,
      result: ids.map((vehicle_id) => ({ vehicle_id, status: "stopped" })),
      tool: "getStoppedVehicles",
      message: `Hay ${ids.length} vehiculos detenidos: ${ids.join(", ")}.`,
    };
  }

  return null;
}

function normalizeFunctionOutput(name: string, output: any, question: string): AgentResponse {
  return {
    specialist: "fleet_ops",
    intent: `tool_${name}`,
    query: question,
    result: output,
    tool: name,
    message:
      output && typeof output === "object" && !Array.isArray(output) && typeof output.message === "string"
        ? output.message
        : undefined,
  };
}

function extractMinMinutes(question: string, fallback = 20) {
  const match = question.match(/(\d+)\s*(min|minuto|minutos)/i);
  if (!match) return fallback;

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function buildTrace(
  conversationId: string,
  turnIndex: number,
  question: string,
  specialist: AgentSpecialist,
  answer: AgentResponse,
  mode: AgentExecutionMode,
  toolsUsed: string[],
  context: Record<string, unknown>,
  history: AgentConversationMessage[],
  error: string | null
): AgentExecution {
  const validatedAnswer = validateAgentResponse(answer, {
    question,
    specialist,
  });
  const answerWithReply = {
    ...validatedAnswer,
    message: validatedAnswer.message ?? renderAgentReply(validatedAnswer),
  };

  return {
    answer: answerWithReply,
    trace: {
      id: randomUUID(),
      conversationId,
      turnIndex,
      specialist,
      mode,
      question,
      answer: answerWithReply,
      tool: answerWithReply.tool ?? null,
      tools: toolsUsed.length ? toolsUsed : answerWithReply.tool ? [answerWithReply.tool] : [],
      context,
      history,
      createdAt: Date.now(),
      error,
    },
  };
}

export async function executeAgentQuery(
  question: string,
  context = {},
  options: AgentQueryOptions = {}
): Promise<AgentExecution> {
  const specialist = resolveAgentSpecialist(question, options.specialist);
  const conversationId = buildExecutionConversationId(options.conversationId);
  const historyTurns: AgentConversationTurn[] = options.conversationHistory ?? [];
  const turnIndex = buildNextTurnIndex(historyTurns);
  const historyMessages = buildConversationMessages(historyTurns);
  const enrichedQuestion = enrichQuestionWithHistory(question, historyTurns);
  const intentRoute = classifyAgentIntent(question, historyTurns);
  const conversationContext = {
    ...context,
    ...buildConversationContext(historyTurns),
    conversationId,
    historyDepth: historyTurns.length,
  };

  const directAnswer = buildDirectResponse(question, conversationContext, specialist, intentRoute);
  if (directAnswer) {
    return buildTrace(
      conversationId,
      turnIndex,
      question,
      specialist,
      directAnswer,
      "rules",
      [directAnswer.tool ?? "rule"],
      conversationContext,
      historyMessages,
      null
    );
  }

  if (useMockAgent()) {
    if (intentRoute.kind === "critical_zones_stopped") {
      const minMinutes = extractMinMinutes(question);
      const toolResult = await runTool("getStoppedVehiclesInCriticalZones", { minMinutes });
      return buildTrace(
        conversationId,
        turnIndex,
        question,
        specialist,
        {
          ...normalizeFunctionOutput("getStoppedVehiclesInCriticalZones", toolResult.output, question),
          specialist,
        },
        "mock",
        ["getStoppedVehiclesInCriticalZones"],
        conversationContext,
        historyMessages,
        null
      );
    }

    if (intentRoute.kind === "critical_zones") {
      const toolResult = await runTool("getVehiclesInCriticalZones", {});
      return buildTrace(
        conversationId,
        turnIndex,
        question,
        specialist,
        {
          ...normalizeFunctionOutput("getVehiclesInCriticalZones", toolResult.output, question),
          specialist,
        },
        "mock",
        ["getVehiclesInCriticalZones"],
        conversationContext,
        historyMessages,
        null
      );
    }

    const answer = await getMockResponse(question, conversationContext, specialist, intentRoute);
    return buildTrace(
      conversationId,
      turnIndex,
      question,
      specialist,
      answer,
      "mock",
      answer.tool ? [answer.tool] : [],
      conversationContext,
      historyMessages,
      null
    );
  }

  try {
    const { answer, toolsUsed } = await queryAgentWithLangChain(
      question,
      conversationContext,
      specialist,
      historyMessages
    );

    return buildTrace(
      conversationId,
      turnIndex,
      question,
      specialist,
      answer,
      "langchain",
      toolsUsed,
      conversationContext,
      historyMessages,
      answer.error ?? null
    );
  } catch (err) {
    const toolResult = await runTool("getFleetSummary", {});
    const fallbackAnswer = {
      ...normalizeFunctionOutput("getFleetSummary", toolResult.output, question),
      specialist,
      error: err instanceof Error ? err.message : "langchain_error",
    };
    return buildTrace(
      conversationId,
      turnIndex,
      question,
      specialist,
      fallbackAnswer,
      "langchain",
      ["getFleetSummary"],
      conversationContext,
      historyMessages,
      fallbackAnswer.error ?? "langchain_error"
    );
  }
}

export async function queryAgent(
  question: string,
  context = {},
  options: AgentQueryOptions = {}
): Promise<AgentResponse> {
  const execution = await executeAgentQuery(question, context, options);
  return execution.answer;
}

export function queryAgentWithOptions(
  question: string,
  context = {},
  options: AgentQueryOptions = {}
): Promise<AgentResponse> {
  return queryAgent(question, context, options);
}

export default { queryAgent, queryAgentWithOptions, executeAgentQuery };
