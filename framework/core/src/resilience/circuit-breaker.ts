/**
 * Circuit Breaker pattern implementation
 * Prevents cascading failures and allows systems to recover
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /**
   * Number of failures before opening circuit
   */
  failureThreshold: number;

  /**
   * Time window for counting failures (milliseconds)
   */
  failureWindow: number;

  /**
   * Time to wait before attempting to close circuit (milliseconds)
   */
  resetTimeout: number;

  /**
   * Number of successful calls required to close circuit from half-open
   */
  successThreshold: number;

  /**
   * Optional: predicate to determine if error should trigger circuit
   */
  shouldTrigger?: (error: Error) => boolean;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindow: 60000, // 1 minute
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
};

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
}

export class CircuitBreakerOpenError extends Error {
  constructor(public readonly nextAttemptTime: Date) {
    super(
      `Circuit breaker is OPEN. Next attempt at ${nextAttemptTime.toISOString()}`
    );
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: number = 0;
  private successes: number = 0;
  private totalCalls: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private failureTimestamps: number[] = [];

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG
  ) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new CircuitBreakerOpenError(this.nextAttemptTime!);
      }
    }

    this.totalCalls++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Record successful call
   */
  private onSuccess(): void {
    this.lastSuccessTime = new Date();

    if (this.state === "HALF_OPEN") {
      this.successes++;

      if (this.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Record failed call
   */
  private onFailure(error: Error): void {
    // Check if error should trigger circuit
    if (this.config.shouldTrigger && !this.config.shouldTrigger(error)) {
      return;
    }

    this.lastFailureTime = new Date();
    this.failures++;

    const now = Date.now();
    this.failureTimestamps.push(now);

    // Remove old failure timestamps outside the window
    const windowStart = now - this.config.failureWindow;
    this.failureTimestamps = this.failureTimestamps.filter(
      (timestamp) => timestamp > windowStart
    );

    if (this.state === "HALF_OPEN") {
      this.transitionToOpen();
    } else if (
      this.state === "CLOSED" &&
      this.failureTimestamps.length >= this.config.failureThreshold
    ) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
    this.totalCalls = 0;
    this.failureTimestamps = [];
    this.nextAttemptTime = undefined;
    console.log(
      JSON.stringify({
        msg: "circuit_breaker_closed",
        name: this.name,
      })
    );
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.state = "OPEN";
    this.successes = 0;
    this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    console.error(
      JSON.stringify({
        msg: "circuit_breaker_opened",
        name: this.name,
        failures: this.failureTimestamps.length,
        nextAttemptTime: this.nextAttemptTime.toISOString(),
      })
    );
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    this.state = "HALF_OPEN";
    this.successes = 0;
    console.log(
      JSON.stringify({
        msg: "circuit_breaker_half_open",
        name: this.name,
      })
    );
  }

  /**
   * Check if circuit should attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) return false;
    return Date.now() >= this.nextAttemptTime.getTime();
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.transitionToClosed();
  }

  /**
   * Force circuit to OPEN state (useful for testing)
   */
  forceOpen(): void {
    this.transitionToOpen();
  }
}

/**
 * Circuit breaker decorator for class methods
 */
export function WithCircuitBreaker(
  name: string,
  config: Partial<CircuitBreakerConfig> = {}
) {
  const circuitBreaker = new CircuitBreaker(name, {
    ...DEFAULT_CIRCUIT_CONFIG,
    ...config,
  });

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return circuitBreaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
