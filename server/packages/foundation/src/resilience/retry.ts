import {
  systemClock,
  systemRandom,
  type Clock,
  type RandomSource,
  type RuntimeDependencies,
} from "../dependencies/index.js";

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

export interface RetryAttemptContext {
  readonly attempt: number;
  readonly signal?: AbortSignal;
}

export interface RetryDependencies extends RuntimeDependencies {
  readonly signal?: AbortSignal;
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
  work: (context: RetryAttemptContext) => Promise<T>,
  policy: Partial<RetryPolicy> = {},
  dependencies: RetryDependencies = {},
): Promise<T> {
  const resolved: RetryPolicy = { ...DEFAULT_POLICY, ...policy };
  const clock = dependencies.clock ?? systemClock;
  const random = dependencies.random ?? systemRandom;
  if (!Number.isInteger(resolved.maxAttempts) || resolved.maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= resolved.maxAttempts; attempt += 1) {
    dependencies.signal?.throwIfAborted();
    try {
      return await work({ attempt, signal: dependencies.signal });
    } catch (error) {
      dependencies.signal?.throwIfAborted();
      lastError = error instanceof Error ? error : new Error(String(error));
      if (resolved.retryableError && !resolved.retryableError(lastError)) throw lastError;
      if (attempt < resolved.maxAttempts) {
        await clock.sleep(calculateRetryDelay(attempt, resolved, random), dependencies.signal);
      }
    }
  }
  throw lastError ?? new Error("Retry operation made no attempts");
}

export function calculateRetryDelay(
  attempt: number,
  policy: RetryPolicy,
  random: RandomSource = systemRandom,
): number {
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
  return Math.floor(cappedDelay + cappedDelay * 0.5 * random.next());
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
