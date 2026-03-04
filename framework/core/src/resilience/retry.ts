/**
 * Retry logic with exponential backoff
 * Resilience pattern for transient failures
 */

export type RetryStrategy = "exponential" | "fixed" | "linear";

export interface RetryPolicy {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Initial delay before first retry (milliseconds)
   */
  initialDelay: number;

  /**
   * Maximum delay between retries (milliseconds)
   */
  maxDelay: number;

  /**
   * Backoff strategy
   */
  strategy: RetryStrategy;

  /**
   * Backoff multiplier (for exponential strategy)
   */
  multiplier: number;

  /**
   * Add random jitter to prevent thundering herd
   */
  jitter: boolean;

  /**
   * Predicate to determine if error is retryable
   */
  retryableError?: (error: Error) => boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  strategy: "exponential",
  multiplier: 2,
  jitter: true,
};

/**
 * Calculate delay for next retry attempt
 */
export function calculateDelay(
  attempt: number,
  policy: RetryPolicy
): number {
  let delay: number;

  switch (policy.strategy) {
    case "exponential":
      delay = Math.min(
        policy.initialDelay * Math.pow(policy.multiplier, attempt),
        policy.maxDelay
      );
      break;
    case "linear":
      delay = Math.min(
        policy.initialDelay + policy.initialDelay * attempt,
        policy.maxDelay
      );
      break;
    case "fixed":
    default:
      delay = policy.initialDelay;
      break;
  }

  // Add jitter (random 0-50% of delay)
  if (policy.jitter) {
    const jitterAmount = delay * 0.5 * Math.random();
    delay = delay + jitterAmount;
  }

  return Math.floor(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: Partial<RetryPolicy> = {}
): Promise<T> {
  const fullPolicy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...policy };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < fullPolicy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (fullPolicy.retryableError && !fullPolicy.retryableError(lastError)) {
        throw lastError;
      }

      // If this was the last attempt, throw
      if (attempt === fullPolicy.maxAttempts - 1) {
        throw lastError;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, fullPolicy);
      await sleep(delay);
    }
  }

  throw lastError || new Error("Retry failed with unknown error");
}

/**
 * Retry decorator for class methods
 */
export function Retry(policy: Partial<RetryPolicy> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), policy);
    };

    return descriptor;
  };
}

/**
 * Check if error is a transient network error
 */
export function isTransientError(error: Error): boolean {
  const transientCodes = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ENETUNREACH",
  ];

  const errorMessage = error.message.toLowerCase();
  const isNetworkError = transientCodes.some((code) =>
    errorMessage.includes(code.toLowerCase())
  );

  const isTimeoutError =
    errorMessage.includes("timeout") || errorMessage.includes("timed out");

  const is5xxError = /5\d{2}/.test(errorMessage);

  return isNetworkError || isTimeoutError || is5xxError;
}

/**
 * Retry policy for database operations
 */
export const DB_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 500,
  maxDelay: 5000,
  strategy: "exponential",
  multiplier: 2,
  jitter: true,
  retryableError: (error) => {
    const message = error.message.toLowerCase();
    return (
      message.includes("connection") ||
      message.includes("timeout") ||
      message.includes("deadlock") ||
      message.includes("lock timeout")
    );
  },
};

/**
 * Retry policy for external API calls
 */
export const API_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  strategy: "exponential",
  multiplier: 2,
  jitter: true,
  retryableError: isTransientError,
};
