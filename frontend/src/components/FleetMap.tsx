"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Vehicle = {
  vehicle_id: string;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  status?: string | null;
};

const defaultIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function FleetMap({ vehicles }: { vehicles: Vehicle[] }) {
  const validVehicles = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          typeof vehicle.latitude === "number" &&
          typeof vehicle.longitude === "number" &&
          !Number.isNaN(vehicle.latitude) &&
          !Number.isNaN(vehicle.longitude)
      ),
    [vehicles]
  );

  const center: [number, number] = validVehicles.length
    ? [validVehicles[0].latitude as number, validVehicles[0].longitude as number]
    : [19.4326, -99.1332];
  const vehiclePoints = useMemo(
    () => validVehicles.map((vehicle) => [vehicle.latitude as number, vehicle.longitude as number] as [number, number]),
    [validVehicles]
  );

  return (
    <div
      style={{
        height: "100%",
        minHeight: "420px",
        borderRadius: "18px",
        overflow: "hidden",
        border: "1px solid #eadfce",
      }}
    >
      <MapContainer center={center} zoom={10} preferCanvas style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsController points={vehiclePoints} />
        {validVehicles.map((vehicle) => (
          <Marker
            key={vehicle.vehicle_id}
            position={[vehicle.latitude as number, vehicle.longitude as number]}
            icon={defaultIcon}
          >
            <Popup>
              <strong>{vehicle.vehicle_id}</strong>
              <br />
              Estado: {vehicle.status || "desconocido"}
              <br />
              Velocidad: {vehicle.speed ?? "N/A"} km/h
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function MapBoundsController({ points }: { points: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    if (points.length === 1) {
      map.setView(points[0], 12, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.2), { animate: true });
  }, [map, points]);

  return null;
}
