"use client";

import { useEffect, useRef } from "react";
import { useFleetDashboard } from "@/hooks/useFleetDashboard";
import { AgentChatPanel } from "./dashboard/AgentChatPanel";
import { AlertsPanel } from "./dashboard/AlertsPanel";
import { HeroBanner } from "./dashboard/HeroBanner";
import { LiveFleetPanel } from "./dashboard/LiveFleetPanel";
import { MetricSummaryGrid } from "./dashboard/MetricSummaryGrid";
import { SystemHealthPanel } from "./dashboard/SystemHealthPanel";

export default function FleetDashboard() {
  const {
    vehicles,
    messages,
    question,
    setQuestion,
    loading,
    refreshInterval,
    setRefreshInterval,
    health,
    metrics,
    summary,
    vehicleDetail,
    selectedVehicleId,
    setSelectedVehicleId,
    criticalAlerts,
    operationalAlerts,
    selectedVehicle,
    connectionStatus,
    lastSyncAt,
    isPending,
    handleQueryAgent,
  } = useFleetDashboard();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const realtimeLabel =
    connectionStatus === "connected"
      ? "Conectado"
      : connectionStatus === "connecting"
      ? "Conectando"
      : connectionStatus === "disconnected"
      ? "Desconectado"
      : "Error";

  const statusTone = connectionStatus === "connected" ? "green" : connectionStatus === "error" ? "red" : "amber";

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 12% 0%, rgba(218, 124, 51, 0.22), transparent 28%), radial-gradient(circle at 88% 10%, rgba(20, 94, 86, 0.16), transparent 24%), linear-gradient(180deg, #f8f3eb 0%, #ede1d0 100%)",
        color: "#1d2430",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ maxWidth: "1440px", margin: "0 auto", padding: "26px 18px 44px", position: "relative" }}>
        <HeroBanner
          realtimeLabel={realtimeLabel}
          statusTone={statusTone}
          connectionStatus={connectionStatus}
          lastSyncAt={lastSyncAt}
          isPending={isPending}
          summary={summary}
          operationalAlerts={operationalAlerts}
          health={health}
          messagesCount={messages.length}
        />

        <MetricSummaryGrid summary={summary} />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "18px",
            marginBottom: "18px",
          }}
        >
          <SystemHealthPanel health={health} metrics={metrics} />
          <AlertsPanel
            operationalAlerts={operationalAlerts}
            criticalAlerts={criticalAlerts}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={setRefreshInterval}
          />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "18px",
          }}
        >
          <LiveFleetPanel
            vehicles={vehicles}
            selectedVehicle={selectedVehicle}
            selectedVehicleId={selectedVehicleId}
            vehicleDetail={vehicleDetail}
            onSelectVehicle={setSelectedVehicleId}
          />
          <AgentChatPanel
            messages={messages}
            question={question}
            loading={loading}
            messagesEndRef={messagesEndRef}
            onQuestionChange={setQuestion}
            onSubmit={handleQueryAgent}
          />
        </section>
      </div>
    </div>
  );
}
