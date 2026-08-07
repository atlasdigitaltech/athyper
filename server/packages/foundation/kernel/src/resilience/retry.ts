/**
 * withRetry — Phase 1.5
 *
 * Exponential / linear / fixed backoff with optional jitter.
 * Predefined policies for DB and API calls.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RetryStrategy = "exponential" | "fixed" | "linear";

export interface RetryPolicy {
  /** Max total attempts (including the first). Default 3. */
  maxAttempts: number;
  /** Delay before first retry in ms. Default 200. */
  initialDelayMs: number;
  /** Cap on computed delay in ms. Default 10_000. */
  maxDelayMs: number;
  /** Backoff multiplier for exponential strategy. Default 2. */
  multiplier: number;
  /** Add 0–50% random jitter to prevent thundering herd. Default true. */
  jitter: boolean;
  /** Backoff strategy. Default exponential. */
  strategy: RetryStrategy;
  /**
   * Return true to retry on this error. Default: retries all errors.
   * Use to skip retrying on 4xx client errors, auth failures, etc.
   */
  retryableError?: (err: Error) => boolean;
}

const DEFAULTS: RetryPolicy = {
  maxAttempts:    3,
  initialDelayMs: 200,
  maxDelayMs:     10_000,
  multiplier:     2,
  jitter:         true,
  strategy:       "exponential",
};

// ── Predefined policies ───────────────────────────────────────────────────────
// Tech-specific policies live in their respective adapters:
//   DB_RETRY_POLICY    → @athyper/adapter-db
//   REDIS_RETRY_POLICY → @athyper/adapter-memory-cache
// Kept here: API_RETRY_POLICY (no dedicated HTTP adapter package yet)

/** Suitable for outbound HTTP calls (network blips, 429, 503). */
export const API_RETRY_POLICY: Partial<RetryPolicy> = {
  maxAttempts:    4,
  initialDelayMs: 500,
  maxDelayMs:     8_000,
  strategy:       "exponential",
  retryableError: isTransientHttpError,
};

// ── Core function ─────────────────────────────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy?: Partial<RetryPolicy>,
): Promise<T> {
  const cfg: RetryPolicy = { ...DEFAULTS, ...policy };
  let lastErr: Error = new Error("withRetry: no attempts made");

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));

      if (cfg.retryableError && !cfg.retryableError(lastErr)) throw lastErr;

      if (attempt === cfg.maxAttempts) break;

      const delay = calculateDelay(attempt, cfg);
      await sleep(delay);
    }
  }

  throw lastErr;
}

// ── Delay calculation ─────────────────────────────────────────────────────────

export function calculateDelay(attempt: number, policy: RetryPolicy): number {
  let base: number;
  switch (policy.strategy) {
    case "exponential":
      base = policy.initialDelayMs * Math.pow(policy.multiplier, attempt - 1);
      break;
    case "linear":
      base = policy.initialDelayMs * attempt;
      break;
    case "fixed":
    default:
      base = policy.initialDelayMs;
  }

  const capped = Math.min(base, policy.maxDelayMs);

  if (!policy.jitter) return capped;

  const jitter = capped * 0.5 * Math.random();
  return Math.floor(capped + jitter);
}

// ── Error classifiers ─────────────────────────────────────────────────────────

const TRANSIENT_PATTERNS = [
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND",
  "EHOSTUNREACH", "EPIPE", "ECONNABORTED",
  "connection terminated", "connection refused", "timeout",
  "too many connections", "pool", "deadlock",
];

export function isTransientError(err: Error): boolean {
  const msg = (err.message ?? "").toLowerCase();
  const code = (err as NodeJS.ErrnoException).code ?? "";
  return TRANSIENT_PATTERNS.some(
    (p) => msg.includes(p.toLowerCase()) || code === p
  );
}

export function isTransientDbError(err: Error): boolean {
  if (isTransientError(err)) return true;
  const pg = err as { code?: string };
  if (pg.code && (pg.code.startsWith("08") || pg.code.startsWith("53"))) return true;
  return false;
}

export function isTransientHttpError(err: Error): boolean {
  if (isTransientError(err)) return true;
  const http = err as { status?: number; statusCode?: number };
  const status = http.status ?? http.statusCode;
  if (status === 429 || status === 503) return true;
  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
