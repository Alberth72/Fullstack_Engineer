export type AgentSpecialist =
  | "fleet_ops"
  | "event_backend"
  | "data_timescale"
  | "security_ops"
  | "ui_brand"
  | "frontend_ops"
  | "infra_sre"
  | "mobile_edge";

export type AgentSpecialistHint = {
  specialist: AgentSpecialist;
  label: string;
  focus: string;
  stack: string[];
};

const KEYWORDS: Array<{ specialist: AgentSpecialist; patterns: RegExp[] }> = [
  {
    specialist: "event_backend",
    patterns: [/rabbitmq/i, /broker/i, /evento/i, /eventos/i, /retry/i, /circuit/i],
  },
  {
    specialist: "data_timescale",
    patterns: [/timescale/i, /postgres/i, /sql/i, /hypertable/i, /retencion/i, /indice/i],
  },
  {
    specialist: "security_ops",
    patterns: [
      /segur/i,
      /\bsecurity\b/i,
      /\bauth\b/i,
      /autentic/i,
      /\bcsp\b/i,
      /\bcsrf\b/i,
      /\bxss\b/i,
      /\bowasp\b/i,
      /\bjwt\b/i,
      /\boauth\b/i,
      /\bheaders?\b/i,
      /\bsecrets?\b/i,
      /hardening/i,
      /rate[- ]limit/i,
    ],
  },
  {
    specialist: "ui_brand",
    patterns: [
      /\bui\b/i,
      /\bux\b/i,
      /diseno/i,
      /disenar/i,
      /color(es)?/i,
      /tipograf/i,
      /layout/i,
      /responsive/i,
      /accesibil/i,
      /\bbrand\b/i,
      /visual/i,
      /estet/i,
      /theme/i,
    ],
  },
  {
    specialist: "mobile_edge",
    patterns: [/react native/i, /mobile/i, /offline/i, /gps/i, /sync/i, /conductor/i],
  },
  {
    specialist: "frontend_ops",
    patterns: [/next\.?js/i, /react/i, /frontend/i, /websocket/i, /mapa/i, /alerta/i],
  },
  {
    specialist: "infra_sre",
    patterns: [/docker/i, /compose/i, /k6/i, /observabilidad/i, /health/i, /ci\/?cd/i, /sre/i],
  },
];

const PROFILES: Record<AgentSpecialist, AgentSpecialistHint> = {
  fleet_ops: {
    specialist: "fleet_ops",
    label: "Fleet Operations Specialist",
    focus: "operacion de flota, alertas, estado vehicular y lectura de telemetria real",
    stack: ["Node.js", "TypeScript", "Express", "WebSocket", "RabbitMQ", "TimescaleDB"],
  },
  event_backend: {
    specialist: "event_backend",
    label: "Backend / Events Specialist",
    focus: "ingesta asincrona, colas, contratos de evento, retries y circuit breakers",
    stack: ["Node.js", "TypeScript", "RabbitMQ", "amqplib", "resilience patterns"],
  },
  data_timescale: {
    specialist: "data_timescale",
    label: "TimescaleDB Specialist",
    focus: "modelado temporal, hypertables, indices, retencion y consultas por vehiculo",
    stack: ["PostgreSQL", "TimescaleDB", "SQL", "indexes", "hypertables"],
  },
  security_ops: {
    specialist: "security_ops",
    label: "Security Specialist",
    focus: "hardening basico, headers defensivos, auth, secreto minimo y reduccion de superficie de ataque",
    stack: ["OWASP", "HTTP security headers", "auth", "rate limiting", "secrets hygiene"],
  },
  ui_brand: {
    specialist: "ui_brand",
    label: "UI / Brand Specialist",
    focus: "jerarquia visual, color, tipografia, accesibilidad y consistencia estetica del dashboard",
    stack: ["Next.js", "React", "design systems", "accessibility", "visual hierarchy"],
  },
  frontend_ops: {
    specialist: "frontend_ops",
    label: "Frontend Operations Specialist",
    focus: "dashboard operacional, mapa, estados incrementales y consumo de WebSocket",
    stack: ["Next.js", "React", "TypeScript", "Leaflet", "WebSocket"],
  },
  infra_sre: {
    specialist: "infra_sre",
    label: "Infra / SRE Specialist",
    focus: "Docker Compose, healthchecks, carga, resiliencia operativa y CI/CD",
    stack: ["Docker Compose", "k6", "RabbitMQ", "TimescaleDB", "observability"],
  },
  mobile_edge: {
    specialist: "mobile_edge",
    label: "Mobile / Edge Specialist",
    focus: "captura offline-first, sync por lotes y resolucion de duplicados en campo",
    stack: ["React Native", "offline storage", "sync", "GPS", "batch upload"],
  },
};

export function getAgentSpecialistProfile(specialist: AgentSpecialist): AgentSpecialistHint {
  return PROFILES[specialist];
}

export function normalizeAgentSpecialist(input?: string | null): AgentSpecialist | null {
  if (!input) return null;

  const normalized = input.trim().toLowerCase();
  const directMatch = (Object.keys(PROFILES) as AgentSpecialist[]).find(
    (specialist) => specialist === normalized
  );

  return directMatch ?? null;
}

export function inferAgentSpecialist(question: string): AgentSpecialist {
  for (const entry of KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(question))) {
      return entry.specialist;
    }
  }

  return "fleet_ops";
}

export function resolveAgentSpecialist(question: string, requested?: string | null): AgentSpecialist {
  return normalizeAgentSpecialist(requested) ?? inferAgentSpecialist(question);
}

export function buildAgentSystemPrompt(specialist: AgentSpecialist, context: unknown) {
  const profile = getAgentSpecialistProfile(specialist);
  const contextJson = JSON.stringify(context);
  const specialistGuidance: Partial<Record<AgentSpecialist, string>> = {
    security_ops:
      "- Prioriza threat modeling liviano, hardening incremental y headers defensivos antes que features pesadas.",
    ui_brand:
      "- Prioriza jerarquia visual, contraste, consistencia y accesibilidad antes que efectos decorativos.",
    frontend_ops:
      "- Mantener el dashboard operacional claro, rapido y coherente con la fuente de verdad del backend.",
    infra_sre:
      "- Si la pregunta es sobre operacion, reduce consumo y complejidad antes de escalar infraestructura.",
  };

  return `Eres ${profile.label}.
Especialidad:
- ${profile.focus}

Stack relevante:
- ${profile.stack.join(", ")}

Contexto operativo:
${contextJson}

Reglas:
- No inventes datos.
- Si falta una fact operativa, dilo con claridad.
- Usa tools internas para hechos de flota o telemetria.
- Si la pregunta es de arquitectura o stack, responde como especialista del dominio seleccionado.
- Si la pregunta pide maxima velocidad historica, vehículo mas rapido o un umbral como "mayor a 59 km/h", usa la tool historica adecuada y responde con el maximo observado.
- ${specialistGuidance[specialist] ?? "Mantener la respuesta concreta, util y operativa."}
- Redacta "message" como respuesta natural y breve para un operador humano.
- Usa el contexto compacto y prioriza la ultima senal operativa.
- Si la pregunta solo pide un conteo simple, responde breve y directo.
- No expliques el JSON al usuario, solo usa "message" para la respuesta.
- Devuelve siempre JSON valido con este esquema:
{
  "specialist": string,
  "intent": string,
  "query": string,
  "message": string,
  "result": [ ... ]
}

Ejemplos:
- Pregunta: "cuantos vehiculos hay en la flota?" -> intent: "count_fleet", message: "En este momento hay 5 vehiculos en la flota: 3 en movimiento, 1 detenido y 1 offline."
- Pregunta: "cuantos vehiculos detenidos hay?" -> intent: "count_stopped", message: "Hay 2 vehiculos detenidos."
- Pregunta: "cuantos vehiculos estan fuera de servicio?" -> intent: "count_offline", message: "Hay 1 vehiculo offline."
- Pregunta: "cuales vehiculos estan detenidos?" -> intent: "list_stopped", message: "Hay 2 vehiculos detenidos: veh-1, veh-4."
- Pregunta: "cual fue el vehiculo mas rapido?" -> intent: "fastest_vehicle", message: "El vehiculo veh-1 alcanzo 61 km/h."
- Pregunta: "cual fue el vehiculo que alcanzo mas de 59 km/h?" -> intent: "fastest_vehicle", message: "El vehiculo veh-1 supero los 59 km/h con 61 km/h."
- Pregunta: "que vehiculos estan en zonas criticas?" -> intent: "critical_zones", message: "Te comparto los vehiculos que siguen dentro de zonas criticas."
- Pregunta: "y esos?" -> intent: "follow_up", message: "Retomo el contexto anterior y te doy el detalle operativo."
- Pregunta: "dame el detalle del vehiculo veh-12" -> intent: "vehicle_detail", message: "El vehiculo veh-12 tiene estado disponible y su ultima senal fue reciente."
- Pregunta: "a que velocidad va veh-12?" -> intent: "speed", message: "Te comparto la velocidad actual del vehiculo consultado."
}`;
}
