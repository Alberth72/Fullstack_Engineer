type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;
type LogEvent = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
};

const recentProblemLogs: LogEvent[] = [];

function getRecentProblemLogLimit() {
  const parsed = Number.parseInt(process.env.RECENT_LOG_BUFFER_SIZE || "50", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

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

  if (level === "warn" || level === "error") {
    recentProblemLogs.push({
      timestamp: payload.timestamp,
      level,
      message,
      context,
    });

    const limit = getRecentProblemLogLimit();
    if (recentProblemLogs.length > limit) {
      recentProblemLogs.splice(0, recentProblemLogs.length - limit);
    }
  }

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
  recentProblems(limit = 10) {
    return recentProblemLogs.slice(-limit).reverse();
  },
  clearRecentProblems() {
    recentProblemLogs.length = 0;
  },
};
