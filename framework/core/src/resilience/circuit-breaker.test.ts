import { describe, it, expect, vi, beforeEach } from "vitest";

import { CircuitBreaker, CircuitBreakerOpenError } from "./circuit-breaker.js";

describe("Circuit Breaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker("test", {
      failureThreshold: 3,
      failureWindow: 10000,
      resetTimeout: 5000,
      successThreshold: 2,
    });
  });

  describe("CLOSED state", () => {
    it("should start in CLOSED state", () => {
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should allow calls when CLOSED", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      const result = await breaker.execute(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should transition to OPEN after threshold failures", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("fail"));

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow("fail");
      }

      expect(breaker.getState()).toBe("OPEN");
    });
  });

  describe("OPEN state", () => {
    beforeEach(async () => {
      // Force circuit to OPEN
      const fn = vi.fn().mockRejectedValue(new Error("fail"));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow("fail");
      }
    });

    it("should reject calls immediately when OPEN", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
      expect(fn).not.toHaveBeenCalled();
    });

    it("should include next attempt time in error", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      try {
        await breaker.execute(fn);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as CircuitBreakerOpenError).nextAttemptTime).toBeInstanceOf(Date);
      }
    });
  });

  describe("HALF_OPEN state", () => {
    it("should transition to HALF_OPEN after reset timeout", async () => {
      // Create breaker with short timeout for testing
      const fastBreaker = new CircuitBreaker("test", {
        failureThreshold: 2,
        failureWindow: 10000,
        resetTimeout: 100, // Short timeout
        successThreshold: 2,
      });

      // Force to OPEN
      const failFn = vi.fn().mockRejectedValue(new Error("fail"));
      for (let i = 0; i < 2; i++) {
        await expect(fastBreaker.execute(failFn)).rejects.toThrow("fail");
      }
      expect(fastBreaker.getState()).toBe("OPEN");

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Next call should transition to HALF_OPEN
      const successFn = vi.fn().mockResolvedValue("success");
      await fastBreaker.execute(successFn);

      expect(fastBreaker.getState()).toBe("HALF_OPEN");
    });

    it("should transition to CLOSED after success threshold", async () => {
      const fastBreaker = new CircuitBreaker("test", {
        failureThreshold: 2,
        failureWindow: 10000,
        resetTimeout: 100,
        successThreshold: 2,
      });

      // Force to OPEN
      const failFn = vi.fn().mockRejectedValue(new Error("fail"));
      for (let i = 0; i < 2; i++) {
        await expect(fastBreaker.execute(failFn)).rejects.toThrow("fail");
      }

      // Wait and transition to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Succeed 2 times (threshold)
      const successFn = vi.fn().mockResolvedValue("success");
      await fastBreaker.execute(successFn);
      await fastBreaker.execute(successFn);

      expect(fastBreaker.getState()).toBe("CLOSED");
    });

    it("should transition back to OPEN on failure in HALF_OPEN", async () => {
      const fastBreaker = new CircuitBreaker("test", {
        failureThreshold: 2,
        failureWindow: 10000,
        resetTimeout: 100,
        successThreshold: 2,
      });

      // Force to OPEN
      const failFn = vi.fn().mockRejectedValue(new Error("fail"));
      for (let i = 0; i < 2; i++) {
        await expect(fastBreaker.execute(failFn)).rejects.toThrow("fail");
      }

      // Wait and transition to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 150));
      const successFn = vi.fn().mockResolvedValue("success");
      await fastBreaker.execute(successFn);

      // Fail in HALF_OPEN
      await expect(fastBreaker.execute(failFn)).rejects.toThrow("fail");

      expect(fastBreaker.getState()).toBe("OPEN");
    });
  });

  describe("Metrics", () => {
    it("should track metrics", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      await breaker.execute(fn);
      await breaker.execute(fn);

      const metrics = breaker.getMetrics();

      expect(metrics.state).toBe("CLOSED");
      expect(metrics.totalCalls).toBe(2);
      expect(metrics.successes).toBe(0); // Only tracked in HALF_OPEN
      expect(metrics.lastSuccessTime).toBeDefined();
    });

    it("should track failures", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("fail"));

      await expect(breaker.execute(fn)).rejects.toThrow("fail");

      const metrics = breaker.getMetrics();

      expect(metrics.failures).toBe(1);
      expect(metrics.lastFailureTime).toBeDefined();
    });
  });

  describe("Reset", () => {
    it("should reset to initial state", async () => {
      // Force some failures
      const fn = vi.fn().mockRejectedValue(new Error("fail"));
      await expect(breaker.execute(fn)).rejects.toThrow("fail");

      breaker.reset();

      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.getMetrics().failures).toBe(0);
      expect(breaker.getMetrics().totalCalls).toBe(0);
    });
  });

  describe("Force Open", () => {
    it("should force circuit to OPEN state", () => {
      breaker.forceOpen();

      expect(breaker.getState()).toBe("OPEN");
    });
  });
});
