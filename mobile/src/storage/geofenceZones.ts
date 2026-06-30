import type { LocationRegion } from "expo-location";

export type GeofenceZone = LocationRegion & {
  id: string;
  label: string;
};

export const GEO_FENCE_TASK_REGIONS: GeofenceZone[] = [
  {
    id: "depot-north",
    label: "Deposito Norte",
    latitude: 4.711,
    longitude: -74.0721,
    radius: 250,
    notifyOnEnter: true,
    notifyOnExit: true,
  },
  {
    id: "depot-south",
    label: "Deposito Sur",
    latitude: 4.6995,
    longitude: -74.0832,
    radius: 250,
    notifyOnEnter: true,
    notifyOnExit: true,
  },
  {
    id: "hub-center",
    label: "Hub Centro",
    latitude: 4.7062,
    longitude: -74.0608,
    radius: 200,
    notifyOnEnter: true,
    notifyOnExit: true,
  },
];

export function toExpoGeofenceRegions(): LocationRegion[] {
  return GEO_FENCE_TASK_REGIONS.map(({ id, label, ...region }) => ({
    identifier: id,
    ...region,
  }));
}

export function describeGeofenceRegion(identifier?: string | null) {
  const zone = GEO_FENCE_TASK_REGIONS.find((item) => item.id === identifier || item.identifier === identifier);
  return zone?.label ?? identifier ?? "Zona desconocida";
}
