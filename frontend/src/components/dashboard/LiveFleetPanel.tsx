import dynamic from "next/dynamic";
import type { FleetVehicle, VehicleDetail } from "@/domain/fleet";
import { InlineRow, Panel, VehicleStatusPill } from "./DashboardPrimitives";

const FleetMap = dynamic(() => import("../FleetMap"), { ssr: false });

export function LiveFleetPanel({
  vehicles,
  selectedVehicle,
  selectedVehicleId,
  vehicleDetail,
  onSelectVehicle,
}: {
  vehicles: FleetVehicle[];
  selectedVehicle: FleetVehicle | null;
  selectedVehicleId: string | null;
  vehicleDetail: VehicleDetail | null;
  onSelectVehicle: (vehicleId: string) => void;
}) {
  return (
    <Panel title="Flota en vivo" subtitle="Estado y ubicacion de los vehiculos">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "14px",
        }}
      >
        <VehicleList
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={onSelectVehicle}
        />

        <div style={{ display: "grid", gap: "14px" }}>
          <FleetMapPanel vehicles={vehicles} />
          <VehicleDetailPanel selectedVehicle={selectedVehicle} vehicleDetail={vehicleDetail} />
        </div>
      </div>
    </Panel>
  );
}

function VehicleList({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
}: {
  vehicles: FleetVehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string) => void;
}) {
  return (
    <div style={{ borderRight: "1px solid #eadfce", paddingRight: "12px", maxHeight: "620px", overflowY: "auto" }}>
      {vehicles.length === 0 ? (
        <p style={{ color: "#8b8b8b" }}>No hay vehiculos registrados</p>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {vehicles.map((vehicle) => (
            <button
              key={vehicle.vehicle_id}
              onClick={() => onSelectVehicle(vehicle.vehicle_id)}
              data-testid={`vehicle-card-${vehicle.vehicle_id}`}
              style={{
                textAlign: "left",
                border: selectedVehicleId === vehicle.vehicle_id ? "1px solid #8b5e34" : "1px solid #eadfce",
                background:
                  selectedVehicleId === vehicle.vehicle_id
                    ? "linear-gradient(180deg, #fff7ef 0%, #fff2e5 100%)"
                    : "rgba(255,255,255,0.96)",
                borderRadius: "14px",
                padding: "12px",
                cursor: "pointer",
                color: "#1f2937",
                boxShadow:
                  selectedVehicleId === vehicle.vehicle_id ? "0 12px 22px rgba(139, 94, 52, 0.12)" : "none",
                transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <strong>{vehicle.vehicle_id}</strong>
                <VehicleStatusPill status={vehicle.status || "desconocido"} />
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px", display: "grid", gap: "4px" }}>
                <span>Velocidad: {vehicle.speed ?? "N/A"} km/h</span>
                <span>Ultima senal: {vehicle.lastSeen ? new Date(vehicle.lastSeen).toLocaleTimeString() : "n/a"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FleetMapPanel({ vehicles }: { vehicles: FleetVehicle[] }) {
  return (
    <div
      style={{
        padding: "12px",
        borderRadius: "22px",
        background: "linear-gradient(180deg, rgba(30, 38, 49, 0.04) 0%, rgba(139, 94, 52, 0.04) 100%)",
        border: "1px solid #eadfce",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8b5e34" }}>
            Live map
          </div>
          <div style={{ fontSize: "14px", color: "#6b7280" }}>Posicion actual y concentracion de la flota</div>
        </div>
        <div style={{ fontSize: "12px", color: "#5b5248", whiteSpace: "nowrap" }}>{vehicles.length} vehiculos</div>
      </div>
      <div style={{ height: "420px" }}>
        <FleetMap vehicles={vehicles} />
      </div>
    </div>
  );
}

function VehicleDetailPanel({
  selectedVehicle,
  vehicleDetail,
}: {
  selectedVehicle: FleetVehicle | null;
  vehicleDetail: VehicleDetail | null;
}) {
  if (!selectedVehicle) {
    return <p style={{ color: "#8b8b8b" }}>Selecciona un vehiculo para ver su detalle.</p>;
  }

  return (
    <div
      data-testid="vehicle-detail-panel"
      style={{
        border: "1px solid #eadfce",
        borderRadius: "20px",
        padding: "18px",
        background: "linear-gradient(180deg, #fff 0%, #fbf4ea 100%)",
        boxShadow: "0 18px 40px rgba(74, 53, 31, 0.08)",
      }}
    >
      <p style={{ margin: 0, color: "#8b5e34", textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.14em" }}>
        Detalle del vehiculo
      </p>
      <h3 style={{ margin: "8px 0 12px", fontSize: "24px" }}>{selectedVehicle.vehicle_id}</h3>
      <div style={{ display: "grid", gap: "10px" }}>
        <InlineRow label="Estado" value={vehicleDetail?.derived?.derivedStatus || selectedVehicle.status || "desconocido"} />
        <InlineRow label="Velocidad" value={`${selectedVehicle.speed ?? "N/A"} km/h`} />
        <InlineRow label="Latitud" value={selectedVehicle.latitude?.toFixed(5) ?? "n/a"} />
        <InlineRow label="Longitud" value={selectedVehicle.longitude?.toFixed(5) ?? "n/a"} />
        <InlineRow
          label="Ultima senal"
          value={selectedVehicle.lastSeen ? new Date(selectedVehicle.lastSeen).toLocaleString() : "n/a"}
        />
        <InlineRow label="Offline" value={vehicleDetail?.derived?.isOffline ? "si" : "no"} />
        <InlineRow
          label="Ultimo evento"
          value={vehicleDetail?.lastEvent ? new Date(vehicleDetail.lastEvent.timestamp).toLocaleString() : "n/a"}
        />
      </div>
    </div>
  );
}
