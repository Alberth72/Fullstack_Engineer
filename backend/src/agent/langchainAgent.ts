import { createAgent, tool } from "langchain";
import * as z from "zod";
import { buildAgentSystemPrompt, type AgentSpecialist } from "./agentProfiles";
import type { AgentConversationMessage, AgentResponse } from "./agentTypes";
import { AgentResponseSchema, validateAgentResponse } from "./agentResponseSchema";
import {
  getCriticalZones,
  getFastestVehicles,
  getFleetState,
  getFleetSummary,
  getStoppedVehicles,
  getStoppedVehiclesInCriticalZones,
  getVehicleDetail,
  getVehicleEvents,
  getVehiclesInCriticalZones,
} from "./agentTools";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function makeTrackedTool<TInput>(
  toolsUsed: string[],
  name: string,
  description: string,
  schema: any,
  handler: (input: TInput) => Promise<unknown>
) {
  return tool(
    async (input: TInput) => {
      toolsUsed.push(name);
      return handler(input);
    },
    {
      name,
      description,
      schema,
    }
  );
}

function createTelemetryTools(toolsUsed: string[]): any[] {
  return [
    makeTrackedTool(toolsUsed, "getFleetState", "Devuelve el estado actual de todos los vehiculos de la flota.", z.object({}), async () => getFleetState()),
    makeTrackedTool(toolsUsed, "getFleetSummary", "Devuelve un resumen agregado de la flota con conteos de moving, stopped y offline.", z.object({}), async () => getFleetSummary()),
    makeTrackedTool(
      toolsUsed,
      "getFastestVehicles",
      "Devuelve los vehiculos con la mayor velocidad historica registrada, con filtro opcional por velocidad minima.",
      z.object({
        minSpeed: z.number().optional(),
        limit: z.number().optional(),
      }),
      async (input: { minSpeed?: number; limit?: number }) => getFastestVehicles(input)
    ),
    makeTrackedTool(
      toolsUsed,
      "getVehicleEvents",
      "Devuelve el historial de eventos de telemetria para un vehiculo especifico.",
      z.object({
        vehicle_id: z.string(),
        limit: z.number().optional(),
      }),
      async (input: { vehicle_id: string; limit?: number }) => getVehicleEvents(input)
    ),
    makeTrackedTool(
      toolsUsed,
      "getVehicleDetail",
      "Devuelve el detalle derivado de un vehiculo con su estado actual y ultimo evento.",
      z.object({
        vehicle_id: z.string(),
      }),
      async (input: { vehicle_id: string }) => getVehicleDetail(input)
    ),
    makeTrackedTool(
      toolsUsed,
      "getStoppedVehicles",
      "Devuelve los vehiculos detenidos al menos un numero minimo de minutos.",
      z.object({
        minMinutes: z.number(),
      }),
      async (input: { minMinutes: number }) => getStoppedVehicles(input)
    ),
    makeTrackedTool(toolsUsed, "getCriticalZones", "Devuelve el catalogo de zonas criticas monitoreadas por la operacion.", z.object({}), async () => getCriticalZones()),
    makeTrackedTool(toolsUsed, "getVehiclesInCriticalZones", "Devuelve vehiculos que actualmente se encuentran dentro de una zona critica.", z.object({}), async () => getVehiclesInCriticalZones()),
    makeTrackedTool(
      toolsUsed,
      "getStoppedVehiclesInCriticalZones",
      "Devuelve vehiculos detenidos por un minimo de minutos dentro de zonas criticas.",
      z.object({
        minMinutes: z.number().optional(),
      }),
      async (input: { minMinutes?: number }) => getStoppedVehiclesInCriticalZones(input)
    ),
  ];
}

function normalizeResponse(
  response: Partial<AgentResponse>,
  question: string,
  specialist: AgentSpecialist
): AgentResponse {
  return validateAgentResponse(response, { question, specialist });
}

export async function queryAgentWithLangChain(
  question: string,
  context: unknown,
  specialist: AgentSpecialist,
  history: AgentConversationMessage[] = []
): Promise<{ answer: AgentResponse; toolsUsed: string[] }> {
  const toolsUsed: string[] = [];
  const agent = createAgent({
    model: `openai:${MODEL}`,
    tools: createTelemetryTools(toolsUsed),
    systemPrompt: buildAgentSystemPrompt(specialist, context),
    responseFormat: AgentResponseSchema,
    name: `fleet_${specialist}`,
  } as any) as any;

  const result = await agent.invoke({
    messages: [...history, { role: "user", content: question }],
  } as any);

  const structuredResponse = result.structuredResponse as Partial<AgentResponse> | undefined;
  if (structuredResponse) {
    return {
      answer: normalizeResponse(structuredResponse, question, specialist),
      toolsUsed,
    };
  }

  const lastMessage = result.messages?.at?.(-1);
  return {
    answer: {
      specialist,
      query: question,
      intent: "general_query",
      raw: lastMessage && "content" in lastMessage ? String(lastMessage.content ?? "") : undefined,
      result: [],
      error: "no_structured_response",
    },
    toolsUsed,
  };
}
