import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAgentQuery } from "../../src/agent/agentClient";

type RegressionCase = {
  id: string;
  question: string;
  context: Record<string, unknown>;
  options: {
    specialist?: string | null;
    conversationHistory?: Array<{
      turnIndex: number;
      question: string;
      answer: {
        specialist?: string;
        intent?: string;
        query?: string;
        result?: unknown;
        tool?: string;
      };
      createdAt: number;
    }>;
  };
  expected: {
    mode: "rules" | "mock";
    intent: string;
    tool: string;
    message: string;
  };
};

describe("agent regression cases", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalMock = process.env.AGENT_MOCK;
  const corpusPath = path.resolve(__dirname, "agent-regression-cases.json");
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8")) as {
    version: number;
    cases: RegressionCase[];
  };

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AGENT_MOCK;
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
  });

  it.each(corpus.cases)("$id stays stable", async (testCase) => {
    const execution = await executeAgentQuery(testCase.question, testCase.context, {
      specialist: testCase.options.specialist ?? null,
      conversationHistory: testCase.options.conversationHistory ?? [],
    });

    expect(execution.trace.mode).toBe(testCase.expected.mode);
    expect(execution.answer).toMatchObject({
      intent: testCase.expected.intent,
      tool: testCase.expected.tool,
      message: testCase.expected.message,
    });
  });
});
