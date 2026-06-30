import * as SQLite from "expo-sqlite";

export type DriverContext = {
  driverName: string;
  vehicleId: string;
  routeId: string;
  updatedAt: number;
};

const DEFAULT_CONTEXT: DriverContext = {
  driverName: "Conductor demo",
  vehicleId: "veh-mobile-1",
  routeId: "route-demo",
  updatedAt: Date.now(),
};

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS driver_context (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    driver_name TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

type SqliteDatabase = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;

async function ensureSchema(db: SqliteDatabase) {
  await db.execAsync(CREATE_TABLE_SQL);
}

function toContext(row: {
  driver_name: string;
  vehicle_id: string;
  route_id: string;
  updated_at: number;
}): DriverContext {
  return {
    driverName: row.driver_name,
    vehicleId: row.vehicle_id,
    routeId: row.route_id,
    updatedAt: row.updated_at,
  };
}

export async function loadDriverContext(databaseName = "fleet-driver.db"): Promise<DriverContext> {
  const db = await SQLite.openDatabaseAsync(databaseName);
  await ensureSchema(db);

  const rows = await db.getAllAsync<{
    driver_name: string;
    vehicle_id: string;
    route_id: string;
    updated_at: number;
  }>(`SELECT driver_name, vehicle_id, route_id, updated_at FROM driver_context WHERE id = 1 LIMIT 1`);

  if (rows.length === 0) {
    await saveDriverContext(DEFAULT_CONTEXT, databaseName);
    return DEFAULT_CONTEXT;
  }

  return toContext(rows[0]);
}

export async function saveDriverContext(
  context: DriverContext,
  databaseName = "fleet-driver.db",
): Promise<DriverContext> {
  const db = await SQLite.openDatabaseAsync(databaseName);
  await ensureSchema(db);

  const nextContext: DriverContext = {
    driverName: context.driverName.trim() || DEFAULT_CONTEXT.driverName,
    vehicleId: context.vehicleId.trim() || DEFAULT_CONTEXT.vehicleId,
    routeId: context.routeId.trim() || DEFAULT_CONTEXT.routeId,
    updatedAt: Date.now(),
  };

  await db.runAsync(
    `INSERT INTO driver_context (id, driver_name, vehicle_id, route_id, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       driver_name = excluded.driver_name,
       vehicle_id = excluded.vehicle_id,
       route_id = excluded.route_id,
       updated_at = excluded.updated_at`,
    [
      nextContext.driverName,
      nextContext.vehicleId,
      nextContext.routeId,
      nextContext.updatedAt,
    ],
  );

  return nextContext;
}

export function createDefaultDriverContext(): DriverContext {
  return { ...DEFAULT_CONTEXT, updatedAt: Date.now() };
}
