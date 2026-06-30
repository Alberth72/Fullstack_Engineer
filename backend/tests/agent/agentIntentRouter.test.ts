import { describe, expect, it } from "vitest";
import { classifyAgentIntent } from "../../src/agent/agentIntentRouter";

describe("agent intent router", () => {
  it("routes stopped count queries before the generic fleet count", () => {
    const route = classifyAgentIntent("cuantos vehiculos detenidos hay en la flota?");

    expect(route).toMatchObject({
      kind: "count_stopped",
      isDirect: true,
      followUp: false,
    });
  });

  it("routes offline count queries directly", () => {
    const route = classifyAgentIntent("cuantos vehiculos estan fuera de servicio?");

    expect(route).toMatchObject({
      kind: "count_offline",
      isDirect: true,
      followUp: false,
    });
  });

  it("uses the previous turn when resolving a follow-up", () => {
    const route = classifyAgentIntent("y cuantos son?", [
      {
        turnIndex: 1,
        question: "Que vehiculos estan detenidos en zonas criticas?",
        answer: {
          intent: "tool_getStoppedVehiclesInCriticalZones",
          query: "Que vehiculos estan detenidos en zonas criticas?",
          result: [],
          tool: "getStoppedVehiclesInCriticalZones",
        },
        createdAt: 1700000000000,
      },
    ]);

    expect(route).toMatchObject({
      kind: "count_stopped",
      isDirect: true,
      followUp: true,
    });
  });

  it("routes historical maximum speed questions to the fastest vehicle intent", () => {
    const route = classifyAgentIntent("cual fue el vehiculo que alcanzo los 61 km/h?");

    expect(route).toMatchObject({
      kind: "fastest_vehicle",
      isDirect: false,
      followUp: false,
      threshold: 61,
    });
  });
});
