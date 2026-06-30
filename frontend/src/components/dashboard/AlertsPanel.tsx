import type { CriticalZoneAlert, OperationalAlert } from "@/domain/fleet";
import { AlertBadge, Panel } from "./DashboardPrimitives";

export function AlertsPanel({
  operationalAlerts,
  criticalAlerts,
  refreshInterval,
  onRefreshIntervalChange,
}: {
  operationalAlerts: OperationalAlert[];
  criticalAlerts: CriticalZoneAlert[];
  refreshInterval: number;
  onRefreshIntervalChange: (value: number) => void;
}) {
  return (
    <Panel title="Alertas operativas" subtitle="Senales inmediatas para seguimiento">
      <div style={{ display: "grid", gap: "10px" }}>
        {operationalAlerts.map((alert, idx) => (
          <AlertBadge key={`${alert.text}-${idx}`} level={alert.level} text={alert.text} />
        ))}
      </div>

      {criticalAlerts.length > 0 ? (
        <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
          {criticalAlerts.slice(0, 4).map((alert) => (
            <div
              key={`${alert.vehicle.vehicle_id}-${alert.zone.id}`}
              style={{
                border: "1px solid rgba(185, 28, 28, 0.18)",
                borderRadius: "16px",
                padding: "12px 14px",
                background: "linear-gradient(180deg, rgba(255, 247, 247, 0.98) 0%, rgba(255, 236, 236, 0.96) 100%)",
                boxShadow: "0 12px 26px rgba(138, 58, 58, 0.08)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                <strong>{alert.vehicle.vehicle_id}</strong>
                <span style={{ color: "#991b1b", fontSize: "12px", fontWeight: 800 }}>
                  {alert.zone.severity.toUpperCase()}
                </span>
              </div>
              <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "6px", lineHeight: 1.5 }}>
                {alert.zone.name} - {alert.stoppedMinutes} min detenido - {alert.distanceMeters} m del centro
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: "16px" }}>
        <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Refrescar cada (ms)
        </label>
        <input
          type="number"
          value={refreshInterval}
          onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: "12px",
            border: "1px solid #d6c7b7",
            background: "#fffaf3",
            color: "#1f2937",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        />
      </div>
    </Panel>
  );
}
