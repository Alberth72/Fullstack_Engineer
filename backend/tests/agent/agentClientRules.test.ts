import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAgent = vi.hoisted(() => vi.fn());
const mockRunTool = vi.hoisted(() => vi.fn());

vi.mock("langchain", async () => {
  const actual = await vi.importActual<any>("langchain");
  return {
    ...actual,
    createAgent: mockCreateAgent,
  };
});

vi.mock("../../src/agent/agentFunctionCaller", () => ({
  runTool: mockRunTool,
}));

import { executeAgentQuery } from "../../src/agent/agentClient";

describe("agent client rules mode", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalMock = process.env.AGENT_MOCK;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AGENT_MOCK = "false";
    mockCreateAgent.mockReset();
    mockRunTool.mockReset();
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

  it("bypasses LangChain for direct stopped counts", async () => {
    const execution = await executeAgentQuery("cuantos vehiculos detenidos hay?", {
      fleetSize: 10,
      fleetSummary: {
        totalVehicles: 10,
        moving: 6,
        stopped: 3,
        offline: 1,
        online: 9,
      },
      fleetState: [
        { vehicle_id: "veh-1", status: "moving" },
        { vehicle_id: "veh-2", status: "stopped" },
      ],
      recentConversation: [],
    });

    expect(mockCreateAgent).not.toHaveBeenCalled();
    expect(execution.trace.mode).toBe("rules");
    expect(execution.answer).toMatchObject({
      intent: "count_stopped",
      tool: "getFleetSummary",
      message: "Hay 3 vehiculos detenidos.",
      result: [{ metric: "stopped", value: 3 }],
    });
  });

  it("uses the historical speed tool in mock mode", async () => {
    process.env.AGENT_MOCK = "true";
    mockRunTool.mockResolvedValue({
      name: "getFastestVehicles",
      output: {
        minSpeed: 59,
        vehicles: [
          { vehicle_id: "veh-1", maxSpeed: 61 },
          { vehicle_id: "veh-2", maxSpeed: 60 },
        ],
      },
    });

    const execution = await executeAgentQuery("cual fue el vehiculo que alcanzo mas de 59 km/h?", {
      fleetSize: 5,
      fleetSummary: {
        totalVehicles: 5,
        moving: 4,
        stopped: 1,
        offline: 0,
        online: 5,
      },
      fleetState: [],
      recentConversation: [],
    });

    expect(mockCreateAgent).not.toHaveBeenCalled();
    expect(mockRunTool).toHaveBeenCalledWith("getFastestVehicles", { minSpeed: 59, limit: 5 });
    expect(execution.trace.mode).toBe("mock");
    expect(execution.answer).toMatchObject({
      intent: "fastest_vehicle",
      tool: "getFastestVehicles",
      message: "Los vehiculos que superaron 59 km/h fueron veh-1 (61 km/h), veh-2 (60 km/h).",
      result: {
        minSpeed: 59,
        vehicles: [
          { vehicle_id: "veh-1", maxSpeed: 61 },
          { vehicle_id: "veh-2", maxSpeed: 60 },
        ],
      },
    });
  });
});
