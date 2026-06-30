import type { AgentSpecialist } from "./agentProfiles";

export type AgentResponse = {
  specialist?: AgentSpecialist;
  intent?: string;
  query?: string;
  result?: any[] | any;
  tool?: string;
  message?: string;
  raw?: string;
  error?: string;
};

export type AgentQueryOptions = {
  specialist?: string | null;
  conversationId?: string | null;
  conversationHistory?: AgentConversationTurn[];
};

export type AgentConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentConversationTurn = {
  turnIndex: number;
  question: string;
  answer: AgentResponse;
  createdAt: number;
};

export type AgentExecutionMode = "mock" | "langchain" | "rules";

export type AgentTraceRecord = {
  id: string;
  conversationId: string;
  turnIndex: number;
  specialist: AgentSpecialist;
  mode: AgentExecutionMode;
  question: string;
  answer: AgentResponse;
  tool: string | null;
  tools: string[];
  context: Record<string, unknown>;
  history: AgentConversationMessage[];
  createdAt: number;
  error: string | null;
};

export type AgentExecution = {
  answer: AgentResponse;
  trace: AgentTraceRecord;
};

export type AgentAuditTraceSummary = {
  id: string;
  conversationId: string;
  turnIndex: number;
  specialist: AgentSpecialist;
  mode: AgentExecutionMode;
  question: string;
  intent: string | null;
  message: string | null;
  tool: string | null;
  tools: string[];
  createdAt: number;
  error: string | null;
  contextKeys: string[];
  historyDepth: number;
};
