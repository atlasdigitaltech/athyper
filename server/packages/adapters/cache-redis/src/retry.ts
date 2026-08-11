import {
  isTransientError,
  type RetryPolicy,
} from "@athyper/server-foundation/resilience";

const TRANSIENT_REDIS_CODES = new Set([
  "CLUSTERDOWN",
  "LOADING",
  "MASTERDOWN",
  "READONLY",
  "TRYAGAIN",
]);

export function isTransientRedisError(error: Error): boolean {
  const code = Reflect.get(error, "code");
  if (typeof code === "string" && TRANSIENT_REDIS_CODES.has(code.toUpperCase())) {
    return true;
  }

  const firstWord = error.message.trim().split(/\s+/, 1)[0]?.toUpperCase();
  return Boolean(firstWord && TRANSIENT_REDIS_CODES.has(firstWord)) ||
    isTransientError(error);
}

export const REDIS_RETRY_POLICY = {
  maxAttempts: 3,
  initialDelayMs: 50,
  maxDelayMs: 1_000,
  multiplier: 2,
  jitter: true,
  strategy: "exponential",
  retryableError: isTransientRedisError,
} satisfies RetryPolicy;
