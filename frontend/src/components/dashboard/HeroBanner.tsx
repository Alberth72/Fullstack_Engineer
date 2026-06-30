import type { FleetSummary, OperationalAlert, SystemHealth } from "@/domain/fleet";
import { MiniCommandStat, Pill, StatusPill } from "./DashboardPrimitives";

export function HeroBanner({
  realtimeLabel,
  statusTone,
  connectionStatus,
  lastSyncAt,
  isPending,
  summary,
  operationalAlerts,
  health,
  messagesCount,
}: {
  realtimeLabel: string;
  statusTone: "green" | "amber" | "red";
  connectionStatus: string;
  lastSyncAt: number | null;
  isPending: boolean;
  summary: FleetSummary;
  operationalAlerts: OperationalAlert[];
  health: SystemHealth | null;
  messagesCount: number;
}) {
  return (
    <header
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: "18px",
        marginBottom: "18px",
        padding: "18px",
        borderRadius: "28px",
        border: "1px solid rgba(107, 76, 43, 0.14)",
        background: "linear-gradient(135deg, rgba(34, 44, 56, 0.96) 0%, rgba(55, 64, 76, 0.92) 56%, rgba(33, 83, 72, 0.92) 100%)",
        color: "#f8f4ee",
        boxShadow: "0 22px 60px rgba(35, 27, 18, 0.22)",
      }}
    >
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#f4d3b3",
              fontSize: "12px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 800,
            }}
          >
            Fleet Operations Center
          </span>
          <span style={{ fontSize: "12px", color: "rgba(248,244,238,0.74)" }}>Command view</span>
        </div>

        <h1 style={{ fontSize: "clamp(32px, 4vw, 50px)", lineHeight: 1.02, margin: "14px 0 10px", fontWeight: 800 }}>
          Panel operativo de telemetria
        </h1>
        <p style={{ maxWidth: "760px", fontSize: "16px", lineHeight: 1.6, color: "rgba(248,244,238,0.82)", margin: 0 }}>
          Vista unica para salud del sistema, actividad de la flota, alertas en tiempo real y consultas al agente IA.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "16px" }}>
          <StatusPill label="Tiempo real" value={realtimeLabel} tone={statusTone} />
          <StatusPill
            label="Ultimo sync"
            value={lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "n/a"}
            tone="neutral"
          />
          <StatusPill label="Sincronia" value={isPending ? "En curso" : "Estable"} tone={isPending ? "amber" : "green"} />
        </div>
      </div>

      <div
        style={{
          padding: "16px",
          borderRadius: "22px",
          background: "rgba(12, 20, 31, 0.3)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "grid",
          gap: "10px",
          alignContent: "start",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(248,244,238,0.68)" }}>
            Situacion actual
          </span>
          <span
            style={{
              padding: "6px 10px",
              borderRadius: "999px",
              background: connectionStatus === "connected" ? "rgba(24, 132, 93, 0.18)" : "rgba(217, 119, 6, 0.18)",
              color: connectionStatus === "connected" ? "#8ef0bf" : "#ffd08a",
              fontSize: "12px",
              fontWeight: 800,
            }}
          >
            {connectionStatus.toUpperCase()}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
          <MiniCommandStat label="Vehiculos" value={summary.totalVehicles} />
          <MiniCommandStat label="En linea" value={summary.online} />
          <MiniCommandStat label="Alertas" value={operationalAlerts.length} />
          <MiniCommandStat label="Mensajes" value={messagesCount} />
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "10px" }}>
          <div style={{ fontSize: "12px", color: "rgba(248,244,238,0.66)", marginBottom: "6px" }}>Capas activas</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <Pill label={`Broker: ${health?.broker || "memory"}`} />
            <Pill label={`DB: ${health?.database || "json"}`} />
            <Pill label={`WS: ${connectionStatus}`} />
          </div>
        </div>
      </div>
    </header>
  );
}
