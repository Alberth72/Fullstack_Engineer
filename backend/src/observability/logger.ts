type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

export function createRequestId(prefix = "req") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  return {
    message: String(err),
  };
}

function write(level: LogLevel, message: string, context: LogContext = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

export const logger = {
  info(message: string, context: LogContext = {}) {
    write("info", message, context);
  },
  warn(message: string, context: LogContext = {}) {
    write("warn", message, context);
  },
  error(message: string, error?: unknown, context: LogContext = {}) {
    write("error", message, {
      ...context,
      error: error ? serializeError(error) : undefined,
    });
  },
  serializeError,
};
