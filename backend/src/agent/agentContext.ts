import type { AgentConversationTurn } from "./agentTypes";
import type { AgentIntentRoute } from "./agentIntentRouter";

export type AgentContextVehicle = {
  vehicle_id: string;
  status?: string | null;
  speed?: number | null;
  lastSeen?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type AgentConversationContextTurn = {
  turnIndex: number;
  question: string;
  intent?: string;
  tool?: string | null;
  message?: string | null;
};

export type AgentPromptContext = {
  conversationId: string;
  historyDepth: number;
  specialist?: string | null;
  intent: AgentIntentRoute;
  fleetSize: number;
  fleetSummary: Record<string, unknown>;
  fleetSample: AgentContextVehicle[];
  recentConversation: AgentConversationContextTurn[];
};

function compactVehicle(vehicle: Record<string, unknown>): AgentContextVehicle | null {
  const vehicleId = typeof vehicle.vehicle_id === "string" ? vehicle.vehicle_id : null;
  if (!vehicleId) return null;

  return {
    vehicle_id: vehicleId,
    status: typeof vehicle.status === "string" ? vehicle.status : null,
    speed: typeof vehicle.speed === "number" ? vehicle.speed : null,
    lastSeen: typeof vehicle.lastSeen === "number" ? vehicle.lastSeen : null,
    latitude: typeof vehicle.latitude === "number" ? vehicle.latitude : null,
    longitude: typeof vehicle.longitude === "number" ? vehicle.longitude : null,
  };
}

export function buildFleetSample(fleetState: unknown, limit = 3): AgentContextVehicle[] {
  if (!Array.isArray(fleetState) || !fleetState.length) return [];

  return fleetState
    .slice(0, limit)
    .map((vehicle) => {
      if (!vehicle || typeof vehicle !== "object") return null;
      return compactVehicle(vehicle as Record<string, unknown>);
    })
    .filter((vehicle): vehicle is AgentContextVehicle => Boolean(vehicle));
}

export function buildRecentConversationContext(history: AgentConversationTurn[], limit = 2) {
  return history.slice(-limit).map((turn) => ({
    turnIndex: turn.turnIndex,
    question: turn.question,
    intent: turn.answer.intent,
    tool: turn.answer.tool ?? null,
    message: turn.answer.message ?? null,
  }));
}

export function buildAgentPromptContext(input: {
  conversationId: string;
  history: AgentConversationTurn[];
  specialist?: string | null;
  intent: AgentIntentRoute;
  fleetSize: number;
  fleetSummary: Record<string, unknown>;
  fleetState?: unknown;
}) {
  return {
    conversationId: input.conversationId,
    historyDepth: input.history.length,
    specialist: input.specialist ?? null,
    intent: input.intent,
    fleetSize: input.fleetSize,
    fleetSummary: input.fleetSummary,
    fleetSample: buildFleetSample(input.fleetState),
    recentConversation: buildRecentConversationContext(input.history),
  } satisfies AgentPromptContext;
}
