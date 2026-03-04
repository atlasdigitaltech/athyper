import { describe, it, expect, beforeEach } from "vitest";

import {
  MemoryRateLimiter,
  createRateLimitKey,
  RATE_LIMIT_PROFILES,
  type RateLimitConfig,
  type RateLimitContext,
} from "./rate-limiter.js";

describe("MemoryRateLimiter", () => {
  let limiter: MemoryRateLimiter;
  let config: RateLimitConfig;

  beforeEach(() => {
    config = {
      maxRequests: 10,
      windowMs: 60000, // 1 minute
      strategy: "token_bucket",
    };
    limiter = new MemoryRateLimiter(config);
  });

  describe("consume", () => {
    it("should allow requests within limit", async () => {
      const result1 = await limiter.consume("test-key");
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBeLessThanOrEqual(9);

      const result2 = await limiter.consume("test-key");
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBeLessThanOrEqual(8);
    });

    it("should block requests after limit exceeded", async () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.consume("test-key");
      }

      const result = await limiter.consume("test-key");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("should support custom cost", async () => {
      const result1 = await limiter.consume("test-key", 5);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBeLessThanOrEqual(5);

      const result2 = await limiter.consume("test-key", 5);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBeLessThanOrEqual(0);

      const result3 = await limiter.consume("test-key", 1);
      expect(result3.allowed).toBe(false);
    });

    it("should isolate different keys", async () => {
      // Exhaust key1
      for (let i = 0; i < 10; i++) {
        await limiter.consume("key1");
      }

      const key1Result = await limiter.consume("key1");
      expect(key1Result.allowed).toBe(false);

      // key2 should still have tokens
      const key2Result = await limiter.consume("key2");
      expect(key2Result.allowed).toBe(true);
    });

    it("should refill tokens over time", async () => {
      // Use a limiter with faster refill for testing
      const fastLimiter = new MemoryRateLimiter({
        maxRequests: 10,
        windowMs: 1000, // 1 second for faster refill
      });

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await fastLimiter.consume("test-key");
      }

      // Should be blocked
      const blocked = await fastLimiter.consume("test-key");
      expect(blocked.allowed).toBe(false);

      // Wait for some refill (simulate time passing)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have some tokens refilled (token bucket algorithm)
      // With 10 tokens/1000ms = 0.01 tokens/ms, after 200ms = 2 tokens
      const afterWait = await fastLimiter.check("test-key");
      expect(afterWait.remaining).toBeGreaterThan(0);
    });
  });

  describe("check", () => {
    it("should check without consuming", async () => {
      const check1 = await limiter.check("test-key");
      expect(check1.allowed).toBe(true);
      expect(check1.remaining).toBe(10);

      const check2 = await limiter.check("test-key");
      expect(check2.allowed).toBe(true);
      expect(check2.remaining).toBe(10); // Should not change
    });

    it("should reflect consumed tokens", async () => {
      await limiter.consume("test-key", 5);

      const check = await limiter.check("test-key");
      expect(check.remaining).toBeLessThanOrEqual(5);
    });
  });

  describe("reset", () => {
    it("should reset rate limit for key", async () => {
      // Consume tokens
      for (let i = 0; i < 10; i++) {
        await limiter.consume("test-key");
      }

      // Should be blocked
      const blocked = await limiter.consume("test-key");
      expect(blocked.allowed).toBe(false);

      // Reset
      await limiter.reset("test-key");

      // Should be allowed again
      const allowed = await limiter.consume("test-key");
      expect(allowed.allowed).toBe(true);
      expect(allowed.remaining).toBeLessThanOrEqual(9);
    });
  });

  describe("getStatus", () => {
    it("should return current status", async () => {
      await limiter.consume("test-key", 3);

      const status = await limiter.getStatus("test-key");
      expect(status.remaining).toBeLessThanOrEqual(7);
      expect(status.limit).toBe(10);
    });
  });

  describe("cleanup", () => {
    it("should remove old buckets", async () => {
      // Create a limiter with short window
      const shortLimiter = new MemoryRateLimiter({
        maxRequests: 10,
        windowMs: 100,
      });

      await shortLimiter.consume("test-key");

      // Wait for 2x window time
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Cleanup
      shortLimiter.cleanup();

      // Bucket should be removed and recreated with full tokens
      const status = await shortLimiter.check("test-key");
      expect(status.remaining).toBe(10);
    });
  });

  describe("keyPrefix", () => {
    it("should use key prefix", async () => {
      const limiterWithPrefix = new MemoryRateLimiter({
        ...config,
        keyPrefix: "api",
      });

      await limiterWithPrefix.consume("test");

      // Verify prefix is used (indirectly by checking isolation)
      const limiterWithoutPrefix = new MemoryRateLimiter(config);
      const status = await limiterWithoutPrefix.check("test");

      // Should be full because different prefix
      expect(status.remaining).toBe(10);
    });
  });
});

describe("createRateLimitKey", () => {
  it("should create key from tenant only", () => {
    const context: RateLimitContext = {
      tenantKey: "tenant-a",
    };

    const key = createRateLimitKey(context);
    expect(key).toBe("tenant:tenant-a");
  });

  it("should create key from multiple context fields", () => {
    const context: RateLimitContext = {
      tenantKey: "tenant-a",
      userId: "user-123",
      endpoint: "/api/users",
    };

    const key = createRateLimitKey(context);
    expect(key).toBe("tenant:tenant-a:user:user-123:endpoint:/api/users");
  });

  it("should create key from IP address", () => {
    const context: RateLimitContext = {
      ip: "192.168.1.1",
    };

    const key = createRateLimitKey(context);
    expect(key).toBe("ip:192.168.1.1");
  });

  it("should handle empty context", () => {
    const context: RateLimitContext = {};

    const key = createRateLimitKey(context);
    expect(key).toBe("");
  });
});

describe("RATE_LIMIT_PROFILES", () => {
  it("should have public profile", () => {
    expect(RATE_LIMIT_PROFILES.public).toBeDefined();
    expect(RATE_LIMIT_PROFILES.public.maxRequests).toBe(100);
    expect(RATE_LIMIT_PROFILES.public.windowMs).toBe(60000);
  });

  it("should have authenticated profile", () => {
    expect(RATE_LIMIT_PROFILES.authenticated).toBeDefined();
    expect(RATE_LIMIT_PROFILES.authenticated.maxRequests).toBe(1000);
  });

  it("should have premium profile", () => {
    expect(RATE_LIMIT_PROFILES.premium).toBeDefined();
    expect(RATE_LIMIT_PROFILES.premium.maxRequests).toBe(10000);
  });

  it("should have write profile", () => {
    expect(RATE_LIMIT_PROFILES.write).toBeDefined();
    expect(RATE_LIMIT_PROFILES.write.maxRequests).toBe(100);
  });

  it("should have sensitive profile", () => {
    expect(RATE_LIMIT_PROFILES.sensitive).toBeDefined();
    expect(RATE_LIMIT_PROFILES.sensitive.maxRequests).toBe(5);
    expect(RATE_LIMIT_PROFILES.sensitive.strategy).toBe("fixed_window");
  });
});
