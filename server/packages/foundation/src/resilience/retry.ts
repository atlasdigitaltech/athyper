export type RetryStrategy = "exponential" | "fixed" | "linear";

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
  strategy: RetryStrategy;
  retryableError?: (error: Error) => boolean;
}

const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 200,
  maxDelayMs: 10_000,
  multiplier: 2,
  jitter: true,
  strategy: "exponential",
};

export async function withRetry<T>(
  work: () => Promise<T>,
  policy: Partial<RetryPolicy> = {},
): Promise<T> {
  const resolved: RetryPolicy = { ...DEFAULT_POLICY, ...policy };
  if (!Number.isInteger(resolved.maxAttempts) || resolved.maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= resolved.maxAttempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (resolved.retryableError && !resolved.retryableError(lastError)) throw lastError;
      if (attempt < resolved.maxAttempts) {
        await delay(calculateRetryDelay(attempt, resolved));
      }
    }
  }
  throw lastError ?? new Error("Retry operation made no attempts");
}

export function calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
  let baseDelay: number;
  switch (policy.strategy) {
    case "exponential":
      baseDelay = policy.initialDelayMs * policy.multiplier ** (attempt - 1);
      break;
    case "linear":
      baseDelay = policy.initialDelayMs * attempt;
      break;
    case "fixed":
      baseDelay = policy.initialDelayMs;
      break;
  }
  const cappedDelay = Math.min(baseDelay, policy.maxDelayMs);
  if (!policy.jitter) return cappedDelay;
  return Math.floor(cappedDelay + cappedDelay * 0.5 * Math.random());
}

const TRANSIENT_PATTERNS = [
  "econnreset", "econnrefused", "etimedout", "enotfound", "ehostunreach",
  "epipe", "econnaborted", "connection terminated", "connection refused", "timeout",
];

export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const code = (error as NodeJS.ErrnoException).code?.toLowerCase() ?? "";
  return TRANSIENT_PATTERNS.some((pattern) => message.includes(pattern) || code === pattern);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
