import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecuteAgentQuery = vi.hoisted(() => vi.fn());
const mockLoadAgentConversation = vi.hoisted(() => vi.fn());
const mockPersistAgentExecution = vi.hoisted(() => vi.fn());
const mockLoadAgentTraceSummaries = vi.hoisted(() => vi.fn());

vi.mock("../../src/agent/agentClient", () => ({
  executeAgentQuery: mockExecuteAgentQuery,
  queryAgent: vi.fn(),
}));

vi.mock("../../src/agent/agentConversation", () => ({
  loadAgentConversation: mockLoadAgentConversation,
  loadAgentTraceSummaries: mockLoadAgentTraceSummaries,
  persistAgentExecution: mockPersistAgentExecution,
  buildExecutionConversationId: (conversationId?: string | null) => conversationId ?? "conv-test",
  buildConversationTitle: (_question: string, answer: { tool?: string }) =>
    answer.tool === "getFleetSummary"
      ? "Resumen de flota"
      : answer.tool === "getStoppedVehiclesInCriticalZones"
      ? "Vehiculos detenidos en zonas criticas"
      : "Consulta operativa",
  buildConversationSummary: () => "1 turnos | Resumen de flota | Consulta operativa",
}));

vi.mock("../../src/services/telemetryService", () => ({
  getFleetState: vi.fn(),
  getFleetSummary: vi.fn(),
}));

import { createApp } from "../../src/app";
import * as telemetryService from "../../src/services/telemetryService";

const mockedTelemetryService = vi.mocked(telemetryService);

describe("agent routes", () => {
  const originalRetentionDays = process.env.AGENT_TRACE_RETENTION_DAYS;
  const originalSummaryThreshold = process.env.AGENT_CONVERSATION_SUMMARY_THRESHOLD;
  const originalRecentTurns = process.env.AGENT_CONVERSATION_RECENT_TURNS;
  const originalAdminToken = process.env.ADMIN_API_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAgentTraceSummaries.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalRetentionDays === undefined) {
      delete process.env.AGENT_TRACE_RETENTION_DAYS;
    } else {
      process.env.AGENT_TRACE_RETENTION_DAYS = originalRetentionDays;
    }

    if (originalSummaryThreshold === undefined) {
      delete process.env.AGENT_CONVERSATION_SUMMARY_THRESHOLD;
    } else {
      process.env.AGENT_CONVERSATION_SUMMARY_THRESHOLD = originalSummaryThreshold;
    }

    if (originalRecentTurns === undefined) {
      delete process.env.AGENT_CONVERSATION_RECENT_TURNS;
    } else {
      process.env.AGENT_CONVERSATION_RECENT_TURNS = originalRecentTurns;
    }

    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_API_TOKEN;
    } else {
      process.env.ADMIN_API_TOKEN = originalAdminToken;
    }

    vi.restoreAllMocks();
  });

  it("rejects missing questions", async () => {
    const res = await request(createApp()).post("/api/agent/query").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing_question" });
  });

  it("builds context from fleet state and returns the agent response", async () => {
    mockedTelemetryService.getFleetSummary.mockResolvedValue({
      totalVehicles: 2,
      moving: 1,
      stopped: 1,
      offline: 0,
      online: 2,
    });
    mockLoadAgentConversation.mockResolvedValue([]);
    mockExecuteAgentQuery.mockResolvedValue({
      answer: {
        intent: "count_fleet",
        query: "Cuantos vehiculos hay?",
        result: [{ metric: "total_vehicles", value: 2 }],
        tool: "getFleetSummary",
        message: "En este momento hay 2 vehiculos en la flota.",
      },
      trace: {
        id: "trace-1",
        conversationId: "conv-test",
      turnIndex: 1,
        specialist: "fleet_ops",
        mode: "mock",
        question: "Cuantos vehiculos hay?",
        answer: {
          intent: "count_fleet",
          query: "Cuantos vehiculos hay?",
          result: [{ metric: "total_vehicles", value: 2 }],
          tool: "getFleetSummary",
          message: "En este momento hay 2 vehiculos en la flota.",
        },
        tool: "getFleetSummary",
        tools: ["getFleetSummary"],
        context: {},
        history: [],
        createdAt: 1700000000000,
        error: null,
      },
    });

    const res = await request(createApp()).post("/api/agent/query").send({
      question: "Cuantos vehiculos hay?",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      question: "Cuantos vehiculos hay?",
      answer: {
        intent: "count_fleet",
        query: "Cuantos vehiculos hay?",
        result: [{ metric: "total_vehicles", value: 2 }],
        tool: "getFleetSummary",
        message: "En este momento hay 2 vehiculos en la flota.",
      },
      mode: "mock",
      conversationId: "conv-test",
      turnIndex: 1,
      reply: "En este momento hay 2 vehiculos en la flota.",
    });
    expect(mockExecuteAgentQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteAgentQuery).toHaveBeenCalledWith(
      "Cuantos vehiculos hay?",
      expect.objectContaining({
        conversationId: "conv-test",
        historyDepth: 0,
        fleetSize: 2,
        fleetSummary: {
          totalVehicles: 2,
          moving: 1,
          stopped: 1,
          offline: 0,
          online: 2,
        },
        fleetSample: [],
        recentConversation: [],
        specialist: null,
        intent: expect.objectContaining({
          kind: "count_fleet",
          isDirect: true,
        }),
      }),
      { specialist: undefined, conversationId: "conv-test", conversationHistory: [] }
    );
    expect(mockPersistAgentExecution).toHaveBeenCalledTimes(1);
  });

  it("forwards a specialist hint to the agent", async () => {
    mockedTelemetryService.getFleetState.mockResolvedValue([
      {
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 50,
        status: "moving",
        lastSeen: 1700000000000,
      },
    ]);
    mockedTelemetryService.getFleetSummary.mockResolvedValue({
      totalVehicles: 1,
      moving: 1,
      stopped: 0,
      offline: 0,
      online: 1,
    });
    mockLoadAgentConversation.mockResolvedValue([]);
    mockExecuteAgentQuery.mockResolvedValue({
      answer: {
        specialist: "infra_sre",
        intent: "general_query",
        query: "Como va el stack?",
        result: [],
        message: "Todo va estable.",
      },
      trace: {
        id: "trace-2",
        conversationId: "conv-test",
        turnIndex: 1,
        specialist: "infra_sre",
        mode: "mock",
        question: "Como va el stack?",
        answer: {
          specialist: "infra_sre",
          intent: "general_query",
          query: "Como va el stack?",
          result: [],
          message: "Todo va estable.",
        },
        tool: null,
        tools: [],
        context: {},
        history: [],
        createdAt: 1700000000000,
        error: null,
      },
    });

    const res = await request(createApp()).post("/api/agent/query").send({
      question: "Como va el stack?",
      specialist: "infra_sre",
    });

    expect(res.status).toBe(200);
    expect(mockExecuteAgentQuery).toHaveBeenCalledWith(
      "Como va el stack?",
      expect.objectContaining({
        conversationId: "conv-test",
        historyDepth: 0,
        fleetSize: 1,
        fleetSummary: {
          totalVehicles: 1,
          moving: 1,
          stopped: 0,
          offline: 0,
          online: 1,
        },
        fleetSample: [],
        recentConversation: [],
        specialist: "infra_sre",
        intent: expect.objectContaining({
          kind: "general",
          isDirect: false,
        }),
      }),
      { specialist: "infra_sre", conversationId: "conv-test", conversationHistory: [] }
    );
  });

  it("rehydrates previous turns for a follow-up conversation", async () => {
    mockedTelemetryService.getFleetState.mockResolvedValue([
      {
        vehicle_id: "veh-1",
        latitude: 19.43,
        longitude: -99.13,
        speed: 0,
        status: "stopped",
        lastSeen: 1700000000000,
      },
    ]);
    mockedTelemetryService.getFleetSummary.mockResolvedValue({
      totalVehicles: 1,
      moving: 0,
      stopped: 1,
      offline: 0,
      online: 1,
    });
    mockLoadAgentConversation.mockResolvedValue([
      {
        turnIndex: 1,
        question: "Que vehiculos estan detenidos en zonas criticas?",
        answer: {
          specialist: "fleet_ops",
          intent: "tool_getStoppedVehiclesInCriticalZones",
          query: "Que vehiculos estan detenidos en zonas criticas?",
          result: [{ vehicle_id: "veh-1" }],
          tool: "getStoppedVehiclesInCriticalZones",
        },
        createdAt: 1700000000000,
      },
    ]);
    mockExecuteAgentQuery.mockResolvedValue({
      answer: {
        specialist: "fleet_ops",
        intent: "follow_up_stopped_critical_zones",
        query: "y cuantos son?",
        result: [{ metric: "total", value: 1 }],
        tool: "getStoppedVehiclesInCriticalZones",
        message: "Hay 1 vehiculo detenido en zona critica.",
      },
      trace: {
        id: "trace-3",
        conversationId: "conv-follow",
        turnIndex: 2,
        specialist: "fleet_ops",
        mode: "mock",
        question: "y cuantos son?",
        answer: {
          specialist: "fleet_ops",
          intent: "follow_up_stopped_critical_zones",
          query: "y cuantos son?",
          result: [{ metric: "total", value: 1 }],
          tool: "getStoppedVehiclesInCriticalZones",
          message: "Hay 1 vehiculo detenido en zona critica.",
        },
        tool: "getStoppedVehiclesInCriticalZones",
        tools: ["getStoppedVehiclesInCriticalZones"],
        context: {},
        history: [],
        createdAt: 1700000000000,
        error: null,
      },
    });

    const res = await request(createApp()).post("/api/agent/query").send({
      question: "y cuantos son?",
      conversationId: "conv-follow",
    });

    expect(res.status).toBe(200);
    expect(mockLoadAgentConversation).toHaveBeenCalledWith("conv-follow", 6);
    expect(mockExecuteAgentQuery).toHaveBeenCalledWith(
      "y cuantos son?",
      expect.objectContaining({
        conversationId: "conv-follow",
        historyDepth: 1,
        fleetSize: 1,
        fleetSummary: {
          totalVehicles: 1,
          moving: 0,
          stopped: 1,
          offline: 0,
          online: 1,
        },
        fleetSample: [],
        recentConversation: expect.arrayContaining([
          expect.objectContaining({
            turnIndex: 1,
            question: "Que vehiculos estan detenidos en zonas criticas?",
            intent: "tool_getStoppedVehiclesInCriticalZones",
            tool: "getStoppedVehiclesInCriticalZones",
          }),
        ]),
        specialist: null,
        intent: expect.objectContaining({
          kind: "count_stopped",
          isDirect: true,
          followUp: true,
        }),
      }),
      {
        specialist: undefined,
        conversationId: "conv-follow",
        conversationHistory: expect.arrayContaining([
          expect.objectContaining({
            turnIndex: 1,
            question: "Que vehiculos estan detenidos en zonas criticas?",
          }),
        ]),
      }
    );
    expect(res.body.reply).toBe("Hay 1 vehiculo detenido en zona critica.");
  });

  it("returns auditable trace summaries for a conversation", async () => {
    mockLoadAgentTraceSummaries.mockResolvedValue([
      {
        id: "trace-1",
        conversationId: "conv-audit",
        turnIndex: 1,
        specialist: "fleet_ops",
        mode: "rules",
        question: "Cuantos vehiculos hay?",
        intent: "count_fleet",
        message: "En este momento hay 2 vehiculos en la flota.",
        tool: "getFleetSummary",
        tools: ["getFleetSummary"],
        createdAt: 1700000000000,
        error: null,
        contextKeys: ["fleetSummary", "conversationId"],
        historyDepth: 0,
      },
    ]);

    const res = await request(createApp()).get("/api/agent/conversations/conv-audit/traces?limit=10");

    expect(res.status).toBe(200);
    expect(mockLoadAgentTraceSummaries).toHaveBeenCalledWith("conv-audit", 10);
    expect(res.body).toEqual({
      conversationId: "conv-audit",
      count: 1,
      traces: [
        expect.objectContaining({
          id: "trace-1",
          intent: "count_fleet",
          tool: "getFleetSummary",
          historyDepth: 0,
        }),
      ],
    });
  });

  it("requires admin token for agent audit traces when configured", async () => {
    process.env.ADMIN_API_TOKEN = "secret-token";
    mockLoadAgentTraceSummaries.mockResolvedValue([]);

    const rejected = await request(createApp()).get("/api/agent/conversations/conv-audit/traces");
    const accepted = await request(createApp())
      .get("/api/agent/conversations/conv-audit/traces")
      .set("Authorization", "Bearer secret-token");

    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: "admin_auth_required" });
    expect(accepted.status).toBe(200);
  });

  it("returns the effective agent audit configuration", async () => {
    process.env.AGENT_TRACE_RETENTION_DAYS = "45";
    process.env.AGENT_CONVERSATION_SUMMARY_THRESHOLD = "8";
    process.env.AGENT_CONVERSATION_RECENT_TURNS = "3";

    const res = await request(createApp()).get("/api/agent/admin/config");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      agentAudit: {
        schemaVersion: "agent-response.v1",
        traceRetentionDays: 45,
        traceRetentionEnabled: true,
        conversationSummaryThreshold: 8,
        conversationRecentTurns: 3,
        traceQueryDefaultLimit: 20,
        traceQueryMaxLimit: 50,
        defaults: {
          traceRetentionDays: 30,
          conversationSummaryThreshold: 6,
          conversationRecentTurns: 4,
          traceQueryLimit: 20,
        },
      },
    });
  });
});
