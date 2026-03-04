import { describe, it, expect, vi } from "vitest";

import { withRetry, calculateDelay, isTransientError, DB_RETRY_POLICY, API_RETRY_POLICY } from "./retry.js";

describe("Retry Logic", () => {
  describe("calculateDelay", () => {
    it("should calculate exponential backoff", () => {
      const policy = {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        strategy: "exponential" as const,
        multiplier: 2,
        jitter: false,
      };

      expect(calculateDelay(0, policy)).toBe(1000); // 1000 * 2^0
      expect(calculateDelay(1, policy)).toBe(2000); // 1000 * 2^1
      expect(calculateDelay(2, policy)).toBe(4000); // 1000 * 2^2
    });

    it("should respect max delay", () => {
      const policy = {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 3000,
        strategy: "exponential" as const,
        multiplier: 2,
        jitter: false,
      };

      expect(calculateDelay(3, policy)).toBe(3000); // capped at maxDelay
    });

    it("should calculate linear backoff", () => {
      const policy = {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        strategy: "linear" as const,
        multiplier: 2,
        jitter: false,
      };

      expect(calculateDelay(0, policy)).toBe(1000); // 1000 + 1000 * 0
      expect(calculateDelay(1, policy)).toBe(2000); // 1000 + 1000 * 1
      expect(calculateDelay(2, policy)).toBe(3000); // 1000 + 1000 * 2
    });

    it("should calculate fixed backoff", () => {
      const policy = {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        strategy: "fixed" as const,
        multiplier: 2,
        jitter: false,
      };

      expect(calculateDelay(0, policy)).toBe(1000);
      expect(calculateDelay(1, policy)).toBe(1000);
      expect(calculateDelay(2, policy)).toBe(1000);
    });
  });

  describe("withRetry", () => {
    it("should succeed on first attempt", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      const result = await withRetry(fn, { maxAttempts: 3 });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and eventually succeed", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockResolvedValue("success");

      const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 10 });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should throw after max attempts", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("always fails"));

      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelay: 10 })
      ).rejects.toThrow("always fails");

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should not retry non-retryable errors", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("validation error"));

      const policy = {
        maxAttempts: 3,
        initialDelay: 10,
        retryableError: (error: Error) => error.message.includes("network"),
      };

      await expect(withRetry(fn, policy)).rejects.toThrow("validation error");
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("isTransientError", () => {
    it("should detect network errors", () => {
      expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
      expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
      expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
    });

    it("should detect timeout errors", () => {
      expect(isTransientError(new Error("Request timed out"))).toBe(true);
      expect(isTransientError(new Error("Connection timeout"))).toBe(true);
    });

    it("should detect 5xx errors", () => {
      expect(isTransientError(new Error("HTTP 500"))).toBe(true);
      expect(isTransientError(new Error("HTTP 503"))).toBe(true);
    });

    it("should not detect non-transient errors", () => {
      expect(isTransientError(new Error("Invalid input"))).toBe(false);
      expect(isTransientError(new Error("HTTP 400"))).toBe(false);
    });
  });

  describe("Predefined Policies", () => {
    it("should have DB retry policy", () => {
      expect(DB_RETRY_POLICY.maxAttempts).toBe(3);
      expect(DB_RETRY_POLICY.strategy).toBe("exponential");
      expect(DB_RETRY_POLICY.retryableError).toBeDefined();
    });

    it("should have API retry policy", () => {
      expect(API_RETRY_POLICY.maxAttempts).toBe(3);
      expect(API_RETRY_POLICY.strategy).toBe("exponential");
      expect(API_RETRY_POLICY.retryableError).toBe(isTransientError);
    });
  });
});
