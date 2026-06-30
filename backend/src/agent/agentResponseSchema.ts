import { z } from "zod";
import type { AgentResponse } from "./agentTypes";
import type { AgentSpecialist } from "./agentProfiles";

export const AgentSpecialistSchema = z.enum([
  "fleet_ops",
  "event_backend",
  "data_timescale",
  "security_ops",
  "ui_brand",
  "frontend_ops",
  "infra_sre",
  "mobile_edge",
]);

export const AgentResponseSchema = z
  .object({
    specialist: AgentSpecialistSchema.optional(),
    intent: z.string().min(1).optional(),
    query: z.string().min(1).optional(),
    result: z.unknown().optional(),
    tool: z.string().min(1).optional(),
    message: z.string().optional(),
    raw: z.string().optional(),
    error: z.string().optional(),
  })
  .strip();

export function validateAgentResponse(
  response: unknown,
  defaults: {
    question: string;
    specialist: AgentSpecialist;
  }
): AgentResponse {
  const parsed = AgentResponseSchema.safeParse(response);

  if (!parsed.success) {
    return {
      specialist: defaults.specialist,
      intent: "agent_response_schema_invalid",
      query: defaults.question,
      result: [],
      message: "Pude consultar la flota, pero la respuesta interna no cumplio el contrato esperado.",
      error: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }

  return {
    specialist: parsed.data.specialist ?? defaults.specialist,
    intent: parsed.data.intent ?? "general_query",
    query: parsed.data.query ?? defaults.question,
    result: parsed.data.result ?? [],
    tool: parsed.data.tool,
    message: parsed.data.message,
    raw: parsed.data.raw,
    error: parsed.data.error,
  };
}
