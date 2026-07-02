import { isBrokerConnected } from "../events/broadcaster";
import { isConnected as isDatabaseConnected } from "../storage/pg";

type BrokerCheck = {
  configured: boolean;
  connected: boolean;
  mode: "rabbitmq" | "memory";
};

type DatabaseCheck = {
  configured: boolean;
  connected: boolean;
  mode: "postgres" | "json";
};

export type RuntimeHealth = {
  status: "ok" | "degraded";
  timestamp: number;
  broker: "rabbitmq" | "memory";
  database: "postgres" | "json";
  checks: {
    broker: BrokerCheck;
    database: DatabaseCheck;
  };
};

async function probeBrokerHealth(): Promise<BrokerCheck> {
  const configured = Boolean(process.env.RABBITMQ_URL?.trim());

  if (!configured) {
    return {
      configured: false,
      connected: true,
      mode: "memory",
    };
  }

  const connected = await isBrokerConnected();
  return {
    configured: true,
    connected,
    mode: "rabbitmq",
  };
}

async function probeDatabaseHealth(): Promise<DatabaseCheck> {
  const configured = Boolean(process.env.DATABASE_URL?.trim());

  if (!configured) {
    return {
      configured: false,
      connected: true,
      mode: "json",
    };
  }

  const connected = await isDatabaseConnected();
  return {
    configured: true,
    connected,
    mode: "postgres",
  };
}

export async function probeRuntimeHealth(): Promise<RuntimeHealth> {
  const [broker, database] = await Promise.all([probeBrokerHealth(), probeDatabaseHealth()]);
  const healthy = broker.connected && database.connected;

  return {
    status: healthy ? "ok" : "degraded",
    timestamp: Date.now(),
    broker: broker.mode,
    database: database.mode,
    checks: {
      broker,
      database,
    },
  };
}
