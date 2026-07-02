import * as db from "./db_json";
import * as pg from "./pg";
import type { TelemetryRepositoryPort } from "../application/telemetry/ports";
import { logger } from "../observability/logger";
import { usePostgresStorage } from "./storageMode";

export const telemetryRepository: TelemetryRepositoryPort = {
  async saveEvent(event) {
    return telemetryRepository.saveEvents([event]);
  },
  async saveEvents(events) {
    if (!events.length) return;

    if (!usePostgresStorage) {
      return db.saveEventsWithOutbox(events);
    }

    try {
      return await pg.saveEventsWithOutbox(events);
    } catch (err) {
      logger.warn("postgres_fallback_to_json", {
        component: "telemetry_repository",
        operation: "save_events_with_outbox",
        eventCount: events.length,
        error: logger.serializeError(err),
      });
      const result = db.saveEventsWithOutbox(events);
      return {
        ...result,
        storage: "json_fallback" as const,
      };
    }
  },
  async getFleetState() {
    if (!usePostgresStorage) {
      return db.getFleetState();
    }

    try {
      return await pg.getFleetState();
    } catch (err) {
      logger.warn("postgres_fallback_to_json", {
        component: "telemetry_repository",
        operation: "get_fleet_state",
        error: logger.serializeError(err),
      });
      return db.getFleetState();
    }
  },
  async getVehicleEvents(vehicleId, limit = 100) {
    if (!usePostgresStorage) {
      return db.getEventsForVehicle(vehicleId, limit);
    }

    try {
      return await pg.getEventsForVehicle(vehicleId, limit);
    } catch (err) {
      logger.warn("postgres_fallback_to_json", {
        component: "telemetry_repository",
        operation: "get_vehicle_events",
        vehicleId,
        error: logger.serializeError(err),
      });
      return db.getEventsForVehicle(vehicleId, limit);
    }
  },
  async getFastestVehicles(minSpeed = 0, limit = 5) {
    if (!usePostgresStorage) {
      return db.getFastestVehicles(minSpeed, limit);
    }

    try {
      return await pg.getFastestVehicles(minSpeed, limit);
    } catch (err) {
      logger.warn("postgres_fallback_to_json", {
        component: "telemetry_repository",
        operation: "get_fastest_vehicles",
        minSpeed,
        limit,
        error: logger.serializeError(err),
      });
      return db.getFastestVehicles(minSpeed, limit);
    }
  },
  async getTelemetryStats() {
    if (!usePostgresStorage) {
      return db.getTelemetryStats();
    }

    try {
      return await pg.getTelemetryStats();
    } catch (err) {
      logger.warn("postgres_fallback_to_json", {
        component: "telemetry_repository",
        operation: "get_telemetry_stats",
        error: logger.serializeError(err),
      });
      return db.getTelemetryStats();
    }
  },
};
