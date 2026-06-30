import type { AgentConversationTurn } from "./agentTypes";

export type AgentIntentKind =
  | "count_fleet"
  | "count_stopped"
  | "count_offline"
  | "list_stopped"
  | "critical_zones"
  | "critical_zones_stopped"
  | "fastest_vehicle"
  | "vehicle_detail"
  | "vehicle_events"
  | "location"
  | "speed"
  | "follow_up"
  | "general";

export type AgentIntentRoute = {
  kind: AgentIntentKind;
  isDirect: boolean;
  followUp: boolean;
  minMinutes: number;
  threshold: number;
};

const FOLLOW_UP_PREFIXES = [
  "y ",
  "y los",
  "y las",
  "de esos",
  "de ellas",
  "ahora",
  "tambien",
  "esos",
  "ellas",
  "ellos",
  "que mas",
];

function normalizeQuestion(question: string) {
  return question.trim().toLowerCase();
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function startsWithFollowUpMarker(question: string) {
  const normalized = stripAccents(normalizeQuestion(question));
  return FOLLOW_UP_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function mentionsStopped(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /detenid|parad|stopped/.test(normalized);
}

function mentionsOffline(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /offline|fuera de servicio|sin senal|sin cobertura/.test(normalized);
}

function mentionsCount(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /cuantos|cuantas|cantidad|total|cuanto hay|cuanta hay/.test(normalized);
}

function mentionsList(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /que vehiculos|cuales|lista|mostrame|dame los|muestreme|listame/.test(normalized);
}

function mentionsCriticalZones(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /zona critica|zonas criticas|critical zone|critical zones/.test(normalized);
}

function mentionsLocation(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /ubicacion|localizacion|location|donde esta|donde estan/.test(normalized);
}

function mentionsSpeed(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /velocidad|speed|rapido|rapida|km\/h|kmh|kph/.test(normalized);
}

function mentionsPeakSpeed(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /alcanz|supero|supera|mayor a|mas rapido|mas veloz|maxima velocidad|velocidad maxima|velocidad mas alta|velocidad mas rapida|record de velocidad/.test(
    normalized
  );
}

function mentionsVehicleDetail(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /detalle|detalles|estado del vehiculo|info del vehiculo|vehiculo .*estado/.test(normalized);
}

function mentionsVehicleEvents(question: string) {
  const normalized = stripAccents(question).toLowerCase();
  return /historial|eventos|recorrido|timeline/.test(normalized);
}

function extractMinMinutes(question: string, fallback = 20) {
  const match = question.match(/(\d+)\s*(min|minuto|minutos)/i);
  if (!match) return fallback;

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function extractSpeedThreshold(question: string, fallback = 0) {
  const normalized = stripAccents(question).toLowerCase();
  const match = normalized.match(/(\d+)\s*(?:km\/h|kmh|kph|kilometros por hora)?/i);
  if (!match) return fallback;

  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getLastTurn(history: AgentConversationTurn[]) {
  return history.length > 0 ? history[history.length - 1] : null;
}

export function classifyAgentIntent(
  question: string,
  history: AgentConversationTurn[] = []
): AgentIntentRoute {
  const followUp = startsWithFollowUpMarker(question) && history.length > 0;

  if (mentionsOffline(question)) {
    return {
      kind: "count_offline",
      isDirect: true,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsCriticalZones(question) && mentionsStopped(question)) {
    return {
      kind: "critical_zones_stopped",
      isDirect: false,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsCriticalZones(question)) {
    return {
      kind: "critical_zones",
      isDirect: false,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsSpeed(question) && mentionsPeakSpeed(question)) {
    const threshold = extractSpeedThreshold(question);
    return {
      kind: "fastest_vehicle",
      isDirect: false,
      followUp,
      minMinutes: 0,
      threshold,
    };
  }

  if (mentionsStopped(question) && mentionsCount(question)) {
    return {
      kind: "count_stopped",
      isDirect: true,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsStopped(question) && mentionsList(question)) {
    return {
      kind: "list_stopped",
      isDirect: true,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsLocation(question)) {
    return {
      kind: "location",
      isDirect: false,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsSpeed(question)) {
    return {
      kind: "speed",
      isDirect: false,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsVehicleDetail(question)) {
    return {
      kind: "vehicle_detail",
      isDirect: false,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsVehicleEvents(question)) {
    return {
      kind: "vehicle_events",
      isDirect: false,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (followUp) {
    const lastTurn = getLastTurn(history);
    const previousIntent = stripAccents(String(lastTurn?.answer.intent ?? "").toLowerCase());

    if (previousIntent.includes("stopped")) {
      return {
        kind: "count_stopped",
        isDirect: true,
        followUp: true,
        minMinutes: extractMinMinutes(question),
        threshold: 0,
      };
    }

    if (previousIntent.includes("offline")) {
      return {
        kind: "count_offline",
        isDirect: true,
        followUp: true,
        minMinutes: extractMinMinutes(question),
        threshold: 0,
      };
    }

    return {
      kind: "follow_up",
      isDirect: false,
      followUp: true,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  if (mentionsCount(question)) {
    return {
      kind: "count_fleet",
      isDirect: true,
      followUp,
      minMinutes: extractMinMinutes(question),
      threshold: 0,
    };
  }

  return {
    kind: "general",
    isDirect: false,
    followUp,
    minMinutes: extractMinMinutes(question),
    threshold: 0,
  };
}
