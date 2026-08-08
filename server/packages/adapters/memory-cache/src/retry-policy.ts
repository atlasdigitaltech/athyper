import { isTransientError } from "@athyper/server-foundation/kernel/resilience";
import type { RetryPolicy } from "@athyper/server-foundation/kernel/resilience";

export const REDIS_RETRY_POLICY: Partial<RetryPolicy> = {
  maxAttempts:    3,
  initialDelayMs: 50,
  maxDelayMs:     1_000,
  strategy:       "exponential",
  retryableError: isTransientError,
};
