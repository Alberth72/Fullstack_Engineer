import type { MetricsSnapshot, SystemHealth } from "@/domain/fleet";
import { InlineRow, Panel, SmallStat } from "./DashboardPrimitives";

export function SystemHealthPanel({
  health,
  metrics,
}: {
  health: SystemHealth | null;
  metrics: MetricsSnapshot | null;
}) {
  return (
    <Panel title="Salud del sistema" subtitle="Estado del backend, broker y base de datos">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
        <SmallStat
          label="Broker"
          value={health?.broker || "unknown"}
          tone={health?.broker === "rabbitmq" ? "green" : health?.broker === "memory" ? "amber" : "neutral"}
        />
        <SmallStat
          label="DB"
          value={health?.database || "unknown"}
          tone={health?.database === "postgres" ? "green" : health?.database === "json" ? "amber" : "neutral"}
        />
        <SmallStat
          label="Rabbit real"
          value={health?.checks?.broker ? (health.checks.broker.connected ? "conectado" : "degradado") : "n/a"}
          tone={health?.checks?.broker ? (health.checks.broker.connected ? "green" : "amber") : "neutral"}
        />
        <SmallStat
          label="Postgres real"
          value={health?.checks?.database ? (health.checks.database.connected ? "conectado" : "degradado") : "n/a"}
          tone={health?.checks?.database ? (health.checks.database.connected ? "green" : "amber") : "neutral"}
        />
        <SmallStat label="Requests" value={metrics?.counters?.requests ?? 0} tone="neutral" />
        <SmallStat label="Rutas" value={`${metrics?.timings ? Object.keys(metrics.timings).length : 0} rutas`} tone="neutral" />
      </div>

      <div style={{ marginTop: "16px", display: "grid", gap: "10px" }}>
        <InlineRow label="Ultima senal" value={health ? new Date(health.timestamp).toLocaleTimeString() : "n/a"} />
        <InlineRow label="Telemetria acumulada" value={metrics?.counters?.telemetryEvents ?? 0} />
        <InlineRow label="Errores telemetria" value={metrics?.counters?.telemetryErrors ?? 0} />
        <InlineRow label="Consultas agente" value={metrics?.counters?.agentQueries ?? 0} />
        <InlineRow label="Errores agente" value={metrics?.counters?.agentErrors ?? 0} />
      </div>
    </Panel>
  );
}
