import type { FleetSummary } from "@/domain/fleet";
import { MetricCard } from "./DashboardPrimitives";

export function MetricSummaryGrid({ summary }: { summary: FleetSummary }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "14px",
        marginBottom: "18px",
      }}
    >
      <MetricCard label="Vehiculos" value={summary.totalVehicles} tone="dark" hint="unidad total en la flota" />
      <MetricCard label="Moviendo" value={summary.moving} tone="green" hint="vehiculos activos en ruta" />
      <MetricCard label="Detenidos" value={summary.stopped} tone="amber" hint="requieren seguimiento" />
      <MetricCard label="Offline" value={summary.offline} tone="red" hint="sin senal reciente" />
    </section>
  );
}
