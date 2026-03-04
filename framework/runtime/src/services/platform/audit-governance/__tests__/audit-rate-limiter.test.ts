/**
 * Audit Rate Limiter Tests
 */
import { describe, it, expect, vi } from "vitest";

import { AuditRateLimiter } from "../domain/audit-rate-limiter.js";

import type { RateLimiter, RateLimitResult } from "@athyper/core";

function createMockLimiter(allowed = true): RateLimiter {
  return {
    consume: vi.fn().mockResolvedValue({
      allowed,
      remaining: allowed ? 499 : 0,
      limit: 500,
      resetMs: 60_000,
    } satisfies RateLimitResult),
    check: vi.fn().mockResolvedValue({
      allowed,
      remaining: allowed ? 499 : 0,
      limit: 500,
      resetMs: 60_000,
    } satisfies RateLimitResult),
    reset: vi.fn().mockResolvedValue(undefined),
  } as unknown as RateLimiter;
}

describe("AuditRateLimiter", () => {
  describe("always-capture events", () => {
    it("should always capture critical severity", async () => {
      const limiter = createMockLimiter(false); // Even if rate limited
      const rateLimiter = new AuditRateLimiter(limiter);

      const result = await rateLimiter.shouldCapture(
        "t-1",
        "workflow.created",
        "critical",
      );
      expect(result.capture).toBe(true);
      expect(result.sampled).toBe(false);
      // Should not even call the limiter
      expect(limiter.consume).not.toHaveBeenCalled();
    });

    it("should always capture error severity", async () => {
      const limiter = createMockLimiter(false);
      const rateLimiter = new AuditRateLimiter(limiter);

      const result = await rateLimiter.shouldCapture(
        "t-1",
        "workflow.error",
        "error",
      );
      expect(result.capture).toBe(true);
      expect(result.sampled).toBe(false);
    });

    it("should always capture admin events", async () => {
      const limiter = createMockLimiter(false);
      const rateLimiter = new AuditRateLimiter(limiter);

      const result = await rateLimiter.shouldCapture(
        "t-1",
        "admin.force_approve",
        "info",
      );
      expect(result.capture).toBe(true);
      expect(result.sampled).toBe(false);
    });

    it("should always capture security events", async () => {
      const limiter = createMockLimiter(false);
      const rateLimiter = new AuditRateLimiter(limiter);

      const result = await rateLimiter.shouldCapture(
        "t-1",
        "security.breach",
        "info",
      );
      expect(result.capture).toBe(true);
      expect(result.sampled).toBe(false);
    });
  });

  describe("rate-limited events", () => {
    it("should capture info events when under limit", async () => {
      const limiter = createMockLimiter(true);
      const rateLimiter = new AuditRateLimiter(limiter);

      const result = await rateLimiter.shouldCapture(
        "t-1",
        "workflow.created",
        "info",
      );
      expect(result.capture).toBe(true);
      expect(result.sampled).toBe(false);
      expect(limiter.consume).toHaveBeenCalledWith(
        "audit:rate:t-1:workflow.created",
      );
    });

    it("should sample when rate limit hit", async () => {
      const limiter = createMockLimiter(false);
      const rateLimiter = new AuditRateLimiter(limiter, {
        defaultSamplingRate: 1.0, // 100% sampling = always capture even when limited
      });

      const result = await rateLimiter.shouldCapture(
        "t-1",
        "workflow.created",
        "info",
      );
      expect(result.capture).toBe(true);
      expect(result.sampled).toBe(true);
    });

    it("should drop when rate limit hit and sampling misses", async () => {
      const limiter = createMockLimiter(false);
      const rateLimiter = new AuditRateLimiter(limiter, {
        defaultSamplingRate: 0.0, // 0% sampling = always drop when limited
      });

      const result = await rateLimiter.shouldCapture(
        "t-1",
        "workflow.created",
        "info",
      );
      expect(result.capture).toBe(false);
      expect(result.sampled).toBe(true);
    });
  });

  describe("fail-open behavior", () => {
    it("should capture on Redis failure", async () => {
      const limiter = createMockLimiter(true);
      (limiter.consume as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Redis down"),
      );

      const rateLimiter = new AuditRateLimiter(limiter);
      const result = await rateLimiter.shouldCapture(
        "t-1",
        "workflow.created",
        "info",
      );
      expect(result.capture).toBe(true);
      expect(result.sampled).toBe(false);
    });
  });
});
