/**
 * Integration Rate Limiter — Redis sliding window per endpoint.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { RateLimitConfig } from "../models/IntegrationEndpoint.js";
import type Redis from "ioredis";

export class IntegrationRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Check rate limit and consume one slot if allowed.
   * Returns { allowed: true } or { allowed: false, retryAfterMs }.
   */
  async checkAndConsume(
    tenantId: string,
    endpointId: string,
    config: RateLimitConfig,
  ): Promise<{ allowed: boolean; retryAfterMs?: number }> {
    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    // Check per-second limit
    if (config.maxPerSecond) {
      const result = await this.checkWindow(
        `int:rl:${tenantId}:${endpointId}:s`,
        config.maxPerSecond,
        1000,
        now,
        member,
      );
      if (!result.allowed) return result;
    }

    // Check per-minute limit
    if (config.maxPerMinute) {
      const result = await this.checkWindow(
        `int:rl:${tenantId}:${endpointId}:m`,
        config.maxPerMinute,
        60_000,
        now,
        member,
      );
      if (!result.allowed) return result;
    }

    return { allowed: true };
  }

  async getRemainingQuota(
    tenantId: string,
    endpointId: string,
    config: RateLimitConfig,
  ): Promise<{ perSecond: number; perMinute: number }> {
    const now = Date.now();
    let perSecond = config.maxPerSecond ?? Infinity;
    let perMinute = config.maxPerMinute ?? Infinity;

    if (config.maxPerSecond) {
      const key = `int:rl:${tenantId}:${endpointId}:s`;
      const count = await this.redis.zcount(key, now - 1000, "+inf");
      perSecond = Math.max(0, config.maxPerSecond - count);
    }

    if (config.maxPerMinute) {
      const key = `int:rl:${tenantId}:${endpointId}:m`;
      const count = await this.redis.zcount(key, now - 60_000, "+inf");
      perMinute = Math.max(0, config.maxPerMinute - count);
    }

    return { perSecond, perMinute };
  }

  private async checkWindow(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number,
    member: string,
  ): Promise<{ allowed: boolean; retryAfterMs?: number }> {
    const windowStart = now - windowMs;

    // Pipeline: remove expired + count current + add new + set TTL
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now.toString(), member);
    pipeline.pexpire(key, windowMs + 1000);

    const results = await pipeline.exec();
    if (!results) return { allowed: true };

    const currentCount = (results[1]?.[1] as number) ?? 0;

    if (currentCount >= maxRequests) {
      // Remove the member we just added
      await this.redis.zrem(key, member);

      // Estimate retry time from oldest entry in window
      const oldest = await this.redis.zrange(key, 0, 0, "WITHSCORES");
      const oldestScore = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
      const retryAfterMs = Math.max(100, oldestScore + windowMs - now);

      this.logger.debug(
        { key, currentCount, maxRequests, retryAfterMs },
        "[int:rate-limit] Rate limit exceeded",
      );

      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }
}
