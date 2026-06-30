import * as SQLite from "expo-sqlite";
import type { DriverTelemetryEvent } from "../contracts/telemetry";
import type { OfflineQueueStore } from "./offlineQueue";
import { mergeEventQueue } from "./offlineQueue";

type SqliteDatabase = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;

type SqliteTelemetryRow = {
  event_id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  status: DriverTelemetryEvent["status"];
  timestamp: number;
  sync_status: DriverTelemetryEvent["syncStatus"];
  retry_count: number;
  last_error: string | null;
};

const CREATE_TABLE_SQL = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS telemetry_queue (
    event_id TEXT PRIMARY KEY NOT NULL,
    vehicle_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed REAL NOT NULL,
    status TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    sync_status TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NULL
  );
`;

function toRow(event: DriverTelemetryEvent): SqliteTelemetryRow {
  return {
    event_id: event.eventId,
    vehicle_id: event.vehicle_id,
    latitude: event.latitude,
    longitude: event.longitude,
    speed: event.speed,
    status: event.status,
    timestamp: event.timestamp,
    sync_status: event.syncStatus,
    retry_count: event.retryCount,
    last_error: event.lastError ?? null,
  };
}

function fromRow(row: SqliteTelemetryRow): DriverTelemetryEvent {
  return {
    eventId: row.event_id,
    vehicle_id: row.vehicle_id,
    latitude: row.latitude,
    longitude: row.longitude,
    speed: row.speed,
    status: row.status,
    timestamp: row.timestamp,
    syncStatus: row.sync_status,
    retryCount: row.retry_count,
    lastError: row.last_error,
  };
}

async function ensureSchema(db: SqliteDatabase) {
  await db.execAsync(CREATE_TABLE_SQL);
}

export async function createSqliteOfflineQueueStore(
  databaseName = "fleet-driver.db",
): Promise<OfflineQueueStore> {
  const db = await SQLite.openDatabaseAsync(databaseName);
  await ensureSchema(db);

  const store: OfflineQueueStore = {
    async list() {
      const rows = await db.getAllAsync<SqliteTelemetryRow>(
        `SELECT event_id, vehicle_id, latitude, longitude, speed, status, timestamp, sync_status, retry_count, last_error
         FROM telemetry_queue
         ORDER BY timestamp ASC`,
      );
      return rows.map(fromRow);
    },

    async upsert(event) {
      const row = toRow(event);
      await db.runAsync(
        `INSERT INTO telemetry_queue (
          event_id, vehicle_id, latitude, longitude, speed, status, timestamp, sync_status, retry_count, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          vehicle_id = excluded.vehicle_id,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          speed = excluded.speed,
          status = excluded.status,
          timestamp = excluded.timestamp,
          sync_status = excluded.sync_status,
          retry_count = excluded.retry_count,
          last_error = excluded.last_error`,
        [
          row.event_id,
          row.vehicle_id,
          row.latitude,
          row.longitude,
          row.speed,
          row.status,
          row.timestamp,
          row.sync_status,
          row.retry_count,
          row.last_error,
        ],
      );
    },

    async upsertMany(events) {
      for (const event of events) {
        await store.upsert(event);
      }
    },

    async replace(events) {
      await db.execAsync(`DELETE FROM telemetry_queue;`);
      await store.upsertMany(events);
    },

    async markSynced(eventIds) {
      if (eventIds.length === 0) {
        return;
      }

      await db.runAsync(
        `UPDATE telemetry_queue
         SET sync_status = 'synced',
             last_error = NULL
         WHERE event_id IN (${eventIds.map(() => "?").join(",")})`,
        eventIds,
      );
    },

    async markFailed(eventId, reason) {
      await db.runAsync(
        `UPDATE telemetry_queue
         SET sync_status = 'failed',
             retry_count = retry_count + 1,
             last_error = ?
         WHERE event_id = ?`,
        [reason, eventId],
      );
    },

    async clear() {
      await db.execAsync(`DELETE FROM telemetry_queue;`);
    },
  };

  return store;
}

export async function hydrateSqliteQueue(
  db: SqliteDatabase,
  events: DriverTelemetryEvent[],
): Promise<void> {
  await ensureSchema(db);
  await db.execAsync(`DELETE FROM telemetry_queue;`);
  const merged = mergeEventQueue([], events, "keep-latest");

  for (const event of merged) {
    const row = toRow(event);
    await db.runAsync(
      `INSERT INTO telemetry_queue (
        event_id, vehicle_id, latitude, longitude, speed, status, timestamp, sync_status, retry_count, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        vehicle_id = excluded.vehicle_id,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        speed = excluded.speed,
        status = excluded.status,
        timestamp = excluded.timestamp,
        sync_status = excluded.sync_status,
        retry_count = excluded.retry_count,
        last_error = excluded.last_error`,
      [
        row.event_id,
        row.vehicle_id,
        row.latitude,
        row.longitude,
        row.speed,
        row.status,
        row.timestamp,
        row.sync_status,
        row.retry_count,
        row.last_error,
      ],
    );
  }
}
