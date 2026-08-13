export type AdapterCircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface AdapterCircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly failureWindowMs: number;
  readonly resetTimeoutMs: number;
  readonly successThreshold: number;
  readonly shouldTrigger?: (error: Error) => boolean;
}

export class AdapterCircuitOpenError extends Error {
  constructor(readonly circuitName: string, readonly nextAttemptAt: number) {
    super(`Circuit '${circuitName}' is open until ${new Date(nextAttemptAt).toISOString()}`);
    this.name = "CircuitBreakerOpenError";
  }
}

const defaults: AdapterCircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs: 60_000,
  resetTimeoutMs: 30_000,
  successThreshold: 1,
};

/** Small dependency-boundary breaker with no global state or provider payload retention. */
export class AdapterCircuitBreaker {
  readonly #config: AdapterCircuitBreakerConfig;
  #state: AdapterCircuitState = "CLOSED";
  #failures: number[] = [];
  #openedAt?: number;
  #halfOpenSuccesses = 0;

  constructor(readonly name: string, config: Partial<AdapterCircuitBreakerConfig> = {}) {
    this.#config = { ...defaults, ...config };
    if (!Number.isInteger(this.#config.failureThreshold) || this.#config.failureThreshold < 1) {
      throw new RangeError("Circuit failure threshold must be a positive integer");
    }
  }

  getState(): AdapterCircuitState {
    return this.#state;
  }

  async execute<Result>(work: () => Promise<Result>): Promise<Result> {
    const now = Date.now();
    if (this.#state === "OPEN") {
      const nextAttemptAt = (this.#openedAt ?? now) + this.#config.resetTimeoutMs;
      if (now < nextAttemptAt) throw new AdapterCircuitOpenError(this.name, nextAttemptAt);
      this.#state = "HALF_OPEN";
      this.#halfOpenSuccesses = 0;
    }
    try {
      const result = await work();
      if (this.#state === "HALF_OPEN") {
        this.#halfOpenSuccesses += 1;
        if (this.#halfOpenSuccesses >= this.#config.successThreshold) this.#close();
      }
      return result;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (!this.#config.shouldTrigger || this.#config.shouldTrigger(normalized)) this.#recordFailure();
      throw error;
    }
  }

  #recordFailure(): void {
    const now = Date.now();
    if (this.#state === "HALF_OPEN") {
      this.#open(now);
      return;
    }
    const cutoff = now - this.#config.failureWindowMs;
    this.#failures = this.#failures.filter((timestamp) => timestamp > cutoff);
    this.#failures.push(now);
    if (this.#failures.length >= this.#config.failureThreshold) this.#open(now);
  }

  #open(now: number): void {
    this.#state = "OPEN";
    this.#openedAt = now;
    this.#failures = [];
  }

  #close(): void {
    this.#state = "CLOSED";
    this.#openedAt = undefined;
    this.#failures = [];
    this.#halfOpenSuccesses = 0;
  }
}
