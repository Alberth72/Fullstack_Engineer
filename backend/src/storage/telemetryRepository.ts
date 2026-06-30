import * as db from "./db_json";
import * as pg from "./pg";
import type { TelemetryRepositoryPort } from "../application/telemetry/ports";
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
      console.warn("Postgres unavailable, falling back to JSON storage with outbox:", err);
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
      console.warn("Postgres unavailable, falling back to JSON storage:", err);
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
      console.warn("Postgres unavailable, falling back to JSON storage:", err);
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
      console.warn("Postgres unavailable, falling back to JSON speed leaderboard:", err);
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
      console.warn("Postgres unavailable, falling back to JSON-derived stats:", err);
      return db.getTelemetryStats();
    }
  },
};
