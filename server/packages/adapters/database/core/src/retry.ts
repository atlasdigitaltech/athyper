import type { RetryPolicy } from "@athyper/server-foundation/resilience";

const TRANSIENT_SQL_STATES = new Set([
  "40001",
  "40P01",
  "55P03",
  "57P01",
  "57P02",
  "57P03",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
]);

const TRANSIENT_NODE_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

export function isTransientDatabaseError(error: Error): boolean {
  const code = Reflect.get(error, "code");
  return (
    typeof code === "string" &&
    (TRANSIENT_SQL_STATES.has(code) || TRANSIENT_NODE_CODES.has(code.toUpperCase()))
  );
}

export const DB_RETRY_POLICY = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 2_000,
  multiplier: 2,
  jitter: true,
  strategy: "exponential",
  retryableError: isTransientDatabaseError,
} satisfies RetryPolicy;
