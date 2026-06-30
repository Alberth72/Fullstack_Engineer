export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === options.attempts) break;
      const delay = Math.min(
        options.maxDelayMs ?? Number.MAX_SAFE_INTEGER,
        options.baseDelayMs * Math.pow(2, attempt - 1)
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("retry_exhausted");
}

export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number
  ) {}

  canExecute() {
    return Date.now() >= this.openUntil;
  }

  success() {
    this.failures = 0;
    this.openUntil = 0;
  }

  failure() {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.cooldownMs;
      this.failures = 0;
    }
  }
}
