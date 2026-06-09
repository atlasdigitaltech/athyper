/**
 * CircuitBreaker — Phase 1.5
 *
 * Three-state circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED.
 *
 * CLOSED:    all calls pass through; failure window tracked.
 * OPEN:      all calls rejected with CircuitBreakerOpenError; reset after resetTimeout.
 * HALF_OPEN: one probe call allowed; success → CLOSED, failure → OPEN.
 *
 * Wired to all five server adapters (db, redis, auth, objectStorage, jobs) in
 * bootstrap.ts. When a circuit opens, the adapter reports "degraded" on /healthz.
 *
 * Ported from @athyper-F1/framework/core/src/resilience/circuit-breaker.ts
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Number of failures within the window that trips the breaker. Default 5. */
  failureThreshold: number;
  /** Sliding window in ms for counting failures. Default 60_000. */
  failureWindowMs: number;
  /** Time in ms before attempting to reset from OPEN. Default 30_000. */
  resetTimeoutMs: number;
  /** Successes needed in HALF_OPEN to close. Default 1. */
  successThreshold: number;
  /** Optional predicate — return true to count an error as a failure. Default: all errors. */
  shouldTrigger?: (err: Error) => boolean;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  nextAttemptAt?: number;
}

export class CircuitBreakerOpenError extends Error {
  constructor(
    public override readonly name: string,
    public readonly nextAttemptAt: number,
  ) {
    super(
      `Circuit '${name}' is OPEN — requests rejected until ${new Date(nextAttemptAt).toISOString()}`
    );
    this.name = "CircuitBreakerOpenError";
  }
}

// ── CircuitBreaker ────────────────────────────────────────────────────────────

const DEFAULTS: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs:  60_000,
  resetTimeoutMs:   30_000,
  successThreshold: 1,
};

export class CircuitBreaker {
  private readonly cfg: CircuitBreakerConfig;
  private state: CircuitState = "CLOSED";

  // Sliding window of failure timestamps (ms)
  private failures: number[] = [];
  private halfOpenSuccesses = 0;

  private openedAt?: number;
  private _totalCalls = 0;
  private _totalSuccesses = 0;
  private _lastFailureAt?: number;
  private _lastSuccessAt?: number;

  constructor(
    public readonly name: string,
    config?: Partial<CircuitBreakerConfig>,
  ) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this._totalCalls++;

    if (this.state === "OPEN") {
      const now = Date.now();
      const nextAttempt = (this.openedAt ?? 0) + this.cfg.resetTimeoutMs;
      if (now < nextAttempt) {
        throw new CircuitBreakerOpenError(this.name, nextAttempt);
      }
      // Transition to HALF_OPEN — allow one probe
      this.state = "HALF_OPEN";
      this.halfOpenSuccesses = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  getState(): CircuitState { return this.state; }

  getMetrics(): CircuitBreakerMetrics {
    const now = Date.now();
    this.pruneWindow(now);
    return {
      state:         this.state,
      failures:      this.failures.length,
      successes:     this._totalSuccesses,
      totalCalls:    this._totalCalls,
      lastFailureAt: this._lastFailureAt,
      lastSuccessAt: this._lastSuccessAt,
      nextAttemptAt: this.state === "OPEN"
        ? (this.openedAt ?? 0) + this.cfg.resetTimeoutMs
        : undefined,
    };
  }

  reset(): void {
    this.state = "CLOSED";
    this.failures = [];
    this.halfOpenSuccesses = 0;
    this.openedAt = undefined;
  }

  forceOpen(): void {
    this.state = "OPEN";
    this.openedAt = Date.now();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    this._totalSuccesses++;
    this._lastSuccessAt = Date.now();

    if (this.state === "HALF_OPEN") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.cfg.successThreshold) {
        this.state = "CLOSED";
        this.failures = [];
        this.openedAt = undefined;
        this.halfOpenSuccesses = 0;
      }
    } else {
      // In CLOSED: clear the failure window on success (healthy signal)
      // Only partial reset — don't delete older failures beyond window
    }
  }

  private onFailure(err: Error): void {
    if (this.cfg.shouldTrigger && !this.cfg.shouldTrigger(err)) return;

    const now = Date.now();
    this._lastFailureAt = now;

    if (this.state === "HALF_OPEN") {
      // Single failure in HALF_OPEN re-opens immediately
      this.state = "OPEN";
      this.openedAt = now;
      return;
    }

    this.failures.push(now);
    this.pruneWindow(now);

    if (this.failures.length >= this.cfg.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = now;
      this.failures = [];
    }
  }

  private pruneWindow(now: number): void {
    const cutoff = now - this.cfg.failureWindowMs;
    this.failures = this.failures.filter((ts) => ts > cutoff);
  }
}
