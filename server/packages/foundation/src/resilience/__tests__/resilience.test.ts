import { describe, expect, it, vi } from "vitest";
import {
  calculateRetryDelay,
  CircuitBreaker,
  CircuitBreakerOpenError,
  isTransientError,
  type RetryPolicy,
  withRetry,
} from "../index.js";

const noWaitPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 2,
  jitter: false,
  strategy: "exponential",
};

describe("retry", () => {
  it("retries until the operation succeeds", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("ok");
    await expect(withRetry(operation, noWaitPolicy)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("calculates bounded deterministic delays without jitter", () => {
    expect(calculateRetryDelay(3, { ...noWaitPolicy, initialDelayMs: 10, maxDelayMs: 25 }))
      .toBe(25);
    expect(isTransientError(Object.assign(new Error("socket failed"), { code: "ECONNRESET" })))
      .toBe(true);
  });
});

describe("CircuitBreaker", () => {
  it("opens at the threshold and recovers through a half-open probe", async () => {
    const breaker = new CircuitBreaker("test", {
      failureThreshold: 1,
      resetTimeoutMs: 0,
    });
    await expect(breaker.execute(async () => { throw new Error("failed"); }))
      .rejects.toThrow("failed");
    expect(breaker.getState()).toBe("OPEN");

    await expect(breaker.execute(async () => "recovered")).resolves.toBe("recovered");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("rejects calls while open", async () => {
    const breaker = new CircuitBreaker("test", { resetTimeoutMs: 60_000 });
    breaker.forceOpen();
    await expect(breaker.execute(async () => "unreachable"))
      .rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });
});
