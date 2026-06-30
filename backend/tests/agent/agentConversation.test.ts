import { describe, expect, it } from "vitest";
import { compactConversationHistory } from "../../src/agent/agentConversation";
import type { AgentConversationTurn } from "../../src/agent/agentTypes";

function buildTurn(turnIndex: number, tool = "getFleetSummary"): AgentConversationTurn {
  return {
    turnIndex,
    question: `Pregunta ${turnIndex}`,
    answer: {
      specialist: "fleet_ops",
      intent: turnIndex % 2 === 0 ? "count_fleet" : "vehicle_detail",
      query: `Pregunta ${turnIndex}`,
      result: [{ metric: "turn", value: turnIndex }],
      tool,
      message: `Respuesta ${turnIndex}`,
    },
    createdAt: 1_700_000_000_000 + turnIndex,
  };
}

describe("agent conversation compaction", () => {
  it("keeps short conversations unchanged", () => {
    const turns = [buildTurn(1), buildTurn(2), buildTurn(3)];

    expect(compactConversationHistory(turns, 6)).toEqual(turns);
  });

  it("summarizes older turns and keeps recent turns for long conversations", () => {
    const turns = Array.from({ length: 8 }, (_, index) => buildTurn(index + 1));

    const compacted = compactConversationHistory(turns, 6);

    expect(compacted).toHaveLength(5);
    expect(compacted[0]).toMatchObject({
      question: "Resumen automatico de la conversacion previa",
      answer: {
        intent: "conversation_summary",
        tool: "conversationSummary",
      },
    });
    expect(compacted[0]?.answer.result).toMatchObject({
      summarizedTurns: 4,
      firstTurnIndex: 1,
      lastTurnIndex: 4,
      tools: ["getFleetSummary"],
    });
    expect(compacted.slice(1).map((turn) => turn.turnIndex)).toEqual([5, 6, 7, 8]);
  });
});
