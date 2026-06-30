type CorsConfig = {
  allowAll: boolean;
  allowedOrigins: string[];
};

type RateLimitConfig = {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
};

function readIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function readCsvEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getCorsConfig(): CorsConfig {
  const allowedOrigins = readCsvEnv("CORS_ALLOWED_ORIGINS");
  return {
    allowAll: allowedOrigins.length === 0 || allowedOrigins.includes("*"),
    allowedOrigins: allowedOrigins.filter((origin) => origin !== "*"),
  };
}

export function getAdminApiToken() {
  const token = process.env.ADMIN_API_TOKEN?.trim();
  return token || null;
}

export function getRateLimitConfig(): RateLimitConfig {
  const maxRequests = readIntegerEnv("RATE_LIMIT_MAX_REQUESTS", 600);
  return {
    enabled: maxRequests > 0,
    windowMs: Math.max(1000, readIntegerEnv("RATE_LIMIT_WINDOW_MS", 60000)),
    maxRequests,
  };
}

export function isOriginAllowed(origin: string | undefined, config = getCorsConfig()) {
  if (!origin) return true;
  if (config.allowAll) return true;
  return config.allowedOrigins.includes(origin);
}
