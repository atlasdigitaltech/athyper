export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  failureWindowMs: number;
  resetTimeoutMs: number;
  successThreshold: number;
  shouldTrigger?: (error: Error) => boolean;
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
    readonly circuitName: string,
    readonly nextAttemptAt: number,
  ) {
    super(`Circuit '${circuitName}' is open until ${new Date(nextAttemptAt).toISOString()}`);
    this.name = "CircuitBreakerOpenError";
  }
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs: 60_000,
  resetTimeoutMs: 30_000,
  successThreshold: 1,
};

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState = "CLOSED";
  private failures: number[] = [];
  private halfOpenSuccesses = 0;
  private openedAt?: number;
  private totalCalls = 0;
  private totalSuccesses = 0;
  private lastFailureAt?: number;
  private lastSuccessAt?: number;

  constructor(readonly name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(work: () => Promise<T>): Promise<T> {
    this.totalCalls += 1;
    if (this.state === "OPEN") {
      const nextAttemptAt = (this.openedAt ?? 0) + this.config.resetTimeoutMs;
      if (Date.now() < nextAttemptAt) {
        throw new CircuitBreakerOpenError(this.name, nextAttemptAt);
      }
      this.state = "HALF_OPEN";
      this.halfOpenSuccesses = 0;
    }

    try {
      const value = await work();
      this.recordSuccess();
      return value;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    this.pruneFailureWindow(Date.now());
    return {
      state: this.state,
      failures: this.failures.length,
      successes: this.totalSuccesses,
      totalCalls: this.totalCalls,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      nextAttemptAt: this.state === "OPEN"
        ? (this.openedAt ?? 0) + this.config.resetTimeoutMs
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

  private recordSuccess(): void {
    this.totalSuccesses += 1;
    this.lastSuccessAt = Date.now();
    if (this.state === "HALF_OPEN") {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.config.successThreshold) this.reset();
    }
  }

  private recordFailure(error: Error): void {
    if (this.config.shouldTrigger && !this.config.shouldTrigger(error)) return;
    const now = Date.now();
    this.lastFailureAt = now;
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.openedAt = now;
      return;
    }
    this.failures.push(now);
    this.pruneFailureWindow(now);
    if (this.failures.length >= this.config.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = now;
      this.failures = [];
    }
  }

  private pruneFailureWindow(now: number): void {
    const cutoff = now - this.config.failureWindowMs;
    this.failures = this.failures.filter((timestamp) => timestamp > cutoff);
  }
}
