import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAppendAgentTrace = vi.hoisted(() => vi.fn());
const mockGetAgentConversation = vi.hoisted(() => vi.fn());
const mockListAgentTraces = vi.hoisted(() => vi.fn());

vi.mock("../../src/storage/pg", () => ({
  appendAgentTrace: mockAppendAgentTrace,
  getAgentConversation: mockGetAgentConversation,
  listAgentTraces: mockListAgentTraces,
}));

describe("agent audit storage", () => {
  const originalAuditDir = process.env.AGENT_AUDIT_DIR;
  const originalRetentionDays = process.env.AGENT_TRACE_RETENTION_DAYS;
  let tempDir = "";

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-agent-audit-"));
    process.env.AGENT_AUDIT_DIR = tempDir;
    process.env.AGENT_TRACE_RETENTION_DAYS = "30";
    vi.resetModules();

    mockAppendAgentTrace.mockRejectedValue(new Error("db_down"));
    mockGetAgentConversation.mockRejectedValue(new Error("db_down"));
    mockListAgentTraces.mockRejectedValue(new Error("db_down"));
  });

  afterEach(() => {
    if (originalAuditDir === undefined) {
      delete process.env.AGENT_AUDIT_DIR;
    } else {
      process.env.AGENT_AUDIT_DIR = originalAuditDir;
    }

    if (originalRetentionDays === undefined) {
      delete process.env.AGENT_TRACE_RETENTION_DAYS;
    } else {
      process.env.AGENT_TRACE_RETENTION_DAYS = originalRetentionDays;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("persists and reloads agent traces from the JSON audit store", async () => {
    const { appendAgentTrace, getAgentConversation, listAgentTraces } = await import(
      "../../src/storage/agentAudit"
    );

    const trace = {
      id: "trace-1",
      conversationId: "conv-1",
      turnIndex: 1,
      specialist: "fleet_ops",
      mode: "mock",
      question: "Cuantos vehiculos hay?",
      answer: {
        specialist: "fleet_ops",
        intent: "count_fleet",
        query: "Cuantos vehiculos hay?",
        result: [{ metric: "total_vehicles", value: 2 }],
        tool: "getFleetSummary",
      },
      tool: "getFleetSummary",
      tools: ["getFleetSummary"],
      context: {
        fleetSize: 2,
      },
      history: [],
      createdAt: 1700000000000,
      error: null,
    };

    await appendAgentTrace(trace);

    const storedFile = path.join(tempDir, "agent_traces.json");
    expect(fs.existsSync(storedFile)).toBe(true);

    const fromFile = JSON.parse(fs.readFileSync(storedFile, "utf8")) as Array<{ id: string }>;
    expect(fromFile).toHaveLength(1);
    expect(fromFile[0]?.id).toBe("trace-1");

    const conversation = await getAgentConversation("conv-1", 10);
    expect(conversation).toEqual([
      expect.objectContaining({
        turnIndex: 1,
        question: "Cuantos vehiculos hay?",
      }),
    ]);

    const traces = await listAgentTraces("conv-1", 10);
    expect(traces).toEqual([
      expect.objectContaining({
        id: "trace-1",
        conversationId: "conv-1",
        tool: "getFleetSummary",
      }),
    ]);
  });

  it("prunes JSON traces older than the configured retention window", async () => {
    const { appendAgentTrace, listAgentTraces } = await import("../../src/storage/agentAudit");
    const now = 1_700_000_000_000;
    const baseTrace = {
      conversationId: "conv-retention",
      turnIndex: 1,
      specialist: "fleet_ops" as const,
      mode: "mock" as const,
      question: "Cuantos vehiculos hay?",
      answer: {
        specialist: "fleet_ops" as const,
        intent: "count_fleet",
        query: "Cuantos vehiculos hay?",
        result: [{ metric: "total_vehicles", value: 2 }],
        tool: "getFleetSummary",
      },
      tool: "getFleetSummary",
      tools: ["getFleetSummary"],
      context: {},
      history: [],
      error: null,
    };

    await appendAgentTrace({
      ...baseTrace,
      id: "trace-old",
      createdAt: now - 31 * 24 * 60 * 60 * 1000,
    });
    await appendAgentTrace({
      ...baseTrace,
      id: "trace-new",
      turnIndex: 2,
      createdAt: now,
    });

    const traces = await listAgentTraces("conv-retention", 10);
    expect(traces.map((trace) => trace.id)).toEqual(["trace-new"]);
  });
});
