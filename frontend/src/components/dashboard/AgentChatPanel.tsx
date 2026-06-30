import type { FormEventHandler, RefObject } from "react";
import type { Message } from "@/domain/fleet";
import { Panel } from "./DashboardPrimitives";

export function AgentChatPanel({
  messages,
  question,
  loading,
  messagesEndRef,
  onQuestionChange,
  onSubmit,
}: {
  messages: Message[];
  question: string;
  loading: boolean;
  messagesEndRef: RefObject<HTMLDivElement>;
  onQuestionChange: (question: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <Panel title="Agente IA" subtitle="Consultas operativas y explicaciones contextuales">
      <div
        style={{
          maxHeight: "360px",
          overflowY: "auto",
          background: "linear-gradient(180deg, #fffaf3 0%, #fff6ea 100%)",
          padding: "12px",
          borderRadius: "16px",
          marginBottom: "12px",
          border: "1px solid #eadfce",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: "#8b8b8b" }}>Inicia una conversacion...</p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} style={{ marginBottom: "12px" }}>
              <strong style={{ color: msg.role === "user" ? "#8b5e34" : "#1f7a3a" }}>
                {msg.role === "user" ? "Tu:" : "Agente:"}
              </strong>
              <div
                style={{
                  background: msg.role === "user" ? "#fff" : "#f2fbf5",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  fontSize: "14px",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  border: "1px solid #eadfce",
                  marginTop: "6px",
                  boxShadow: "0 10px 18px rgba(74, 53, 31, 0.04)",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          type="text"
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder="Haz una pregunta sobre la flota..."
          disabled={loading}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: "12px",
            border: "1px solid #d6c7b7",
            background: "#fff",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 18px",
            background: loading
              ? "linear-gradient(180deg, #d9c6ae 0%, #c7b8a3 100%)"
              : "linear-gradient(180deg, #9b6537 0%, #7c4b21 100%)",
            color: "white",
            border: "none",
            borderRadius: "12px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 800,
            boxShadow: "0 10px 20px rgba(124, 75, 33, 0.24)",
          }}
        >
          {loading ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </Panel>
  );
}
