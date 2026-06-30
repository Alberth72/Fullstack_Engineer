import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockCreateAgent = vi.hoisted(() => vi.fn());

vi.mock("langchain", async () => {
  const actual = await vi.importActual<any>("langchain");
  return {
    ...actual,
    createAgent: mockCreateAgent,
  };
});

import { queryAgent } from "../../src/agent/agentClient";

describe("langchain agent integration", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalMock = process.env.AGENT_MOCK;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AGENT_MOCK = "false";
    mockCreateAgent.mockReturnValue({
      invoke: mockInvoke,
    });
    mockInvoke.mockResolvedValue({
      structuredResponse: {
        specialist: "fleet_ops",
        intent: "general_query",
        query: "Como va la operacion hoy?",
        result: [],
      },
      messages: [],
    });
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalMock === undefined) {
      delete process.env.AGENT_MOCK;
    } else {
      process.env.AGENT_MOCK = originalMock;
    }

    vi.clearAllMocks();
  });

  it("builds a LangChain agent and returns its structured response", async () => {
    const answer = await queryAgent("Como va la operacion hoy?", {
      fleetSize: 2,
      fleetSummary: {
        totalVehicles: 2,
        moving: 1,
        stopped: 1,
        offline: 0,
        online: 2,
      },
      sample: [],
    });

    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai:gpt-4o-mini",
        tools: expect.any(Array),
        systemPrompt: expect.stringContaining("Fleet Operations Specialist"),
        responseFormat: expect.any(Object),
      })
    );
    expect(mockInvoke).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "Como va la operacion hoy?" }],
    });
    expect(answer).toMatchObject({
      specialist: "fleet_ops",
      intent: "general_query",
      query: "Como va la operacion hoy?",
      result: [],
    });
  });

  it("normalizes invalid structured responses into a schema error answer", async () => {
    mockInvoke.mockResolvedValue({
      structuredResponse: {
        specialist: "fleet_ops",
        intent: "general_query",
        query: "Como va la operacion hoy?",
        message: 42,
        result: [],
      },
      messages: [],
    });

    const answer = await queryAgent("Como va la operacion hoy?", {
      fleetSize: 2,
      fleetSummary: {
        totalVehicles: 2,
        moving: 1,
        stopped: 1,
        offline: 0,
        online: 2,
      },
      sample: [],
    });

    expect(answer).toMatchObject({
      specialist: "fleet_ops",
      intent: "agent_response_schema_invalid",
      query: "Como va la operacion hoy?",
      result: [],
      message: "Pude consultar la flota, pero la respuesta interna no cumplio el contrato esperado.",
    });
    expect(answer.error).toContain("Expected string");
  });
});
