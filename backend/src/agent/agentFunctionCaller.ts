import {
  getCriticalZones,
  getFleetState,
  getFleetSummary,
  getFastestVehicles,
  getStoppedVehicles,
  getStoppedVehiclesInCriticalZones,
  getVehicleDetail,
  getVehicleEvents,
  getVehiclesInCriticalZones,
} from "./agentTools";

export type ToolResponse = {
  name: string;
  output: any;
};

export async function runTool(name: string, args: any): Promise<ToolResponse> {
  switch (name) {
    case "getFleetState":
      return { name, output: await getFleetState() };
    case "getFleetSummary":
      return { name, output: await getFleetSummary() };
    case "getFastestVehicles":
      return { name, output: await getFastestVehicles(args) };
    case "getVehicleEvents":
      return { name, output: await getVehicleEvents(args) };
    case "getVehicleDetail":
      return { name, output: await getVehicleDetail(args) };
    case "getStoppedVehicles":
      return { name, output: await getStoppedVehicles(args) };
    case "getCriticalZones":
      return { name, output: await getCriticalZones() };
    case "getVehiclesInCriticalZones":
      return { name, output: await getVehiclesInCriticalZones() };
    case "getStoppedVehiclesInCriticalZones":
      return { name, output: await getStoppedVehiclesInCriticalZones(args) };
    default:
      return { name, output: { error: `Tool not found: ${name}` } };
  }
}

export function getToolSpecs() {
  return [
    {
      name: "getFleetState",
      description: "Devuelve el estado actual de todos los vehiculos de la flota.",
      parameters: {
        type: "object",
        properties: {},
      },
      required: [],
    },
    {
      name: "getFleetSummary",
      description: "Devuelve un resumen agregado de la flota con conteos de moving, stopped y offline.",
      parameters: {
        type: "object",
        properties: {},
      },
      required: [],
    },
    {
      name: "getFastestVehicles",
      description: "Devuelve los vehiculos con la mayor velocidad historica registrada, con filtro opcional por velocidad minima.",
      parameters: {
        type: "object",
        properties: {
          minSpeed: { type: "number", description: "Velocidad minima historica a considerar" },
          limit: { type: "number", description: "Cantidad maxima de resultados a devolver" },
        },
        required: [],
      },
      required: [],
    },
    {
      name: "getVehicleEvents",
      description: "Devuelve el historial de eventos de telemetria para un vehiculo especifico.",
      parameters: {
        type: "object",
        properties: {
          vehicle_id: { type: "string", description: "ID del vehiculo" },
          limit: { type: "number", description: "Cantidad maxima de eventos a devolver" },
        },
        required: ["vehicle_id"],
      },
    },
    {
      name: "getVehicleDetail",
      description: "Devuelve el detalle derivado de un vehiculo con su estado actual, si esta offline y su ultimo evento.",
      parameters: {
        type: "object",
        properties: {
          vehicle_id: { type: "string", description: "ID del vehiculo" },
        },
        required: ["vehicle_id"],
      },
      required: ["vehicle_id"],
    },
    {
      name: "getStoppedVehicles",
      description: "Devuelve los vehiculos detenidos al menos un numero minimo de minutos.",
      parameters: {
        type: "object",
        properties: {
          minMinutes: { type: "number", description: "Minutos de detencion minima" },
        },
        required: ["minMinutes"],
      },
    },
    {
      name: "getCriticalZones",
      description: "Devuelve el catalogo de zonas criticas monitoreadas por la operacion.",
      parameters: {
        type: "object",
        properties: {},
      },
      required: [],
    },
    {
      name: "getVehiclesInCriticalZones",
      description: "Devuelve vehiculos que actualmente se encuentran dentro de una zona critica.",
      parameters: {
        type: "object",
        properties: {},
      },
      required: [],
    },
    {
      name: "getStoppedVehiclesInCriticalZones",
      description: "Devuelve vehiculos detenidos por un minimo de minutos dentro de zonas criticas.",
      parameters: {
        type: "object",
        properties: {
          minMinutes: { type: "number", description: "Minutos de detencion minima dentro de zona critica" },
        },
        required: [],
      },
    },
  ];
}
