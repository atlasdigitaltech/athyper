import { describe, expect, it, vi } from "vitest";
import {
  calculateRetryDelay,
  CircuitBreaker,
  CircuitBreakerOpenError,
  isTransientError,
  type RetryPolicy,
  withRetry,
} from "../index.js";
import type { Clock } from "../../dependencies/index.js";

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

  it("injects deterministic time and randomness and exposes attempt context", async () => {
    const sleeps: number[] = [];
    const clock: Clock = {
      now: () => 100,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    };
    const attempts: number[] = [];

    await expect(withRetry(async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt === 1) throw new Error("retry");
      return "ok";
    }, { ...noWaitPolicy, initialDelayMs: 100, maxDelayMs: 100, jitter: true }, {
      clock,
      random: { next: () => 0.5 },
    })).resolves.toBe("ok");

    expect(attempts).toEqual([1, 2]);
    expect(sleeps).toEqual([125]);
  });

  it("propagates cancellation into work and aborts before another attempt", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const operation = vi.fn(async ({ signal }: { signal?: AbortSignal }) => {
      expect(signal).toBe(controller.signal);
      controller.abort(reason);
      throw new Error("retryable");
    });

    await expect(withRetry(operation, noWaitPolicy, { signal: controller.signal }))
      .rejects.toBe(reason);
    expect(operation).toHaveBeenCalledTimes(1);
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

  it("uses an injected clock for recovery and metrics", async () => {
    let now = 1_000;
    const clock: Clock = { now: () => now, sleep: async () => undefined };
    const breaker = new CircuitBreaker("test", {
      failureThreshold: 1,
      resetTimeoutMs: 50,
    }, { clock });

    await expect(breaker.execute(async () => { throw new Error("failed"); }))
      .rejects.toThrow("failed");
    expect(breaker.getMetrics()).toMatchObject({ lastFailureAt: 1_000, nextAttemptAt: 1_050 });
    now = 1_050;
    await expect(breaker.execute(async () => "recovered")).resolves.toBe("recovered");
    expect(breaker.getMetrics().lastSuccessAt).toBe(1_050);
  });

  it("does not count cancellation as a circuit failure", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const breaker = new CircuitBreaker("test", { failureThreshold: 1 });

    await expect(breaker.execute(async (signal) => {
      expect(signal).toBe(controller.signal);
      controller.abort(reason);
      return "ignored";
    }, controller.signal)).rejects.toBe(reason);
    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.getMetrics().failures).toBe(0);
  });
});
