import { isTransientDbError } from "@athyper/server-foundation/kernel/resilience";
import type { RetryPolicy } from "@athyper/server-foundation/kernel/resilience";

export const DB_RETRY_POLICY: Partial<RetryPolicy> = {
  maxAttempts:    3,
  initialDelayMs: 100,
  maxDelayMs:     2_000,
  strategy:       "exponential",
  retryableError: isTransientDbError,
};
