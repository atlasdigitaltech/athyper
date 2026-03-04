/**
 * Redis-backed distributed rate limiter
 * Uses Lua scripts for atomic operations
 */

import type {
  RateLimiter,
  RateLimitConfig,
  RateLimitResult,
} from "@athyper/core";
import type { Redis } from "ioredis";

/**
 * Token bucket rate limiter using Redis
 * Suitable for distributed deployments
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private redis: Redis,
    private config: RateLimitConfig
  ) {}

  async consume(key: string, cost: number = 1): Promise<RateLimitResult> {
    const fullKey = this.getFullKey(key);
    const now = Date.now();
    const windowMs = this.config.windowMs;
    const maxRequests = this.config.maxRequests;

    try {
      // Use Lua script for atomic token bucket operation
      const result = await this.redis.eval(
        this.getTokenBucketScript(),
        1,
        fullKey,
        now.toString(),
        windowMs.toString(),
        maxRequests.toString(),
        cost.toString()
      );

      const [allowed, tokens, resetTime] = result as [number, number, number];

      return {
        allowed: allowed === 1,
        remaining: Math.floor(tokens),
        limit: maxRequests,
        resetMs: resetTime - now,
        retryAfter: allowed === 1 ? undefined : Math.ceil((resetTime - now) / 1000),
      };
    } catch (error) {
      // On Redis error, fail open (allow request) but log
      console.error(
        JSON.stringify({
          msg: "rate_limiter_error",
          key: fullKey,
          err: String(error),
        })
      );

      return {
        allowed: true,
        remaining: maxRequests,
        limit: maxRequests,
        resetMs: windowMs,
      };
    }
  }

  async check(key: string): Promise<RateLimitResult> {
    const fullKey = this.getFullKey(key);
    const now = Date.now();

    try {
      const [tokens, resetTime] = await this.redis.eval(
        this.getCheckScript(),
        1,
        fullKey,
        now.toString(),
        this.config.windowMs.toString(),
        this.config.maxRequests.toString()
      ) as [number, number];

      return {
        allowed: tokens >= 1,
        remaining: Math.floor(tokens),
        limit: this.config.maxRequests,
        resetMs: resetTime - now,
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "rate_limiter_check_error",
          key: fullKey,
          err: String(error),
        })
      );

      return {
        allowed: true,
        remaining: this.config.maxRequests,
        limit: this.config.maxRequests,
        resetMs: this.config.windowMs,
      };
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    await this.redis.del(fullKey);
  }

  async getStatus(key: string): Promise<RateLimitResult> {
    return this.check(key);
  }

  private getFullKey(key: string): string {
    const prefix = this.config.keyPrefix ?? "ratelimit";
    return `${prefix}:${key}`;
  }

  /**
   * Lua script for atomic token bucket consume operation
   * Returns: [allowed (1 or 0), remaining tokens, reset time]
   */
  private getTokenBucketScript(): string {
    return `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local maxRequests = tonumber(ARGV[3])
      local cost = tonumber(ARGV[4])

      -- Get current bucket state
      local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill', 'resetTime')
      local tokens = tonumber(bucket[1])
      local lastRefill = tonumber(bucket[2])
      local resetTime = tonumber(bucket[3])

      -- Initialize new bucket if doesn't exist
      if not tokens then
        tokens = maxRequests
        lastRefill = now
        resetTime = now + windowMs
      end

      -- Reset if window has passed
      if now >= resetTime then
        tokens = maxRequests
        lastRefill = now
        resetTime = now + windowMs
      else
        -- Refill tokens based on elapsed time
        local elapsed = now - lastRefill
        local refillRate = maxRequests / windowMs
        local tokensToAdd = elapsed * refillRate
        tokens = math.min(maxRequests, tokens + tokensToAdd)
        lastRefill = now
      end

      -- Check if request is allowed
      local allowed = 0
      if tokens >= cost then
        tokens = tokens - cost
        allowed = 1
      end

      -- Save bucket state
      redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill, 'resetTime', resetTime)
      redis.call('PEXPIRE', key, windowMs * 2) -- Expire after 2x window

      return {allowed, tokens, resetTime}
    `;
  }

  /**
   * Lua script for checking rate limit without consuming
   */
  private getCheckScript(): string {
    return `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local maxRequests = tonumber(ARGV[3])

      local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill', 'resetTime')
      local tokens = tonumber(bucket[1])
      local lastRefill = tonumber(bucket[2])
      local resetTime = tonumber(bucket[3])

      if not tokens then
        return {maxRequests, now + windowMs}
      end

      if now >= resetTime then
        return {maxRequests, now + windowMs}
      end

      -- Calculate refilled tokens
      local elapsed = now - lastRefill
      local refillRate = maxRequests / windowMs
      local tokensToAdd = elapsed * refillRate
      tokens = math.min(maxRequests, tokens + tokensToAdd)

      return {tokens, resetTime}
    `;
  }
}

/**
 * Sliding window rate limiter using Redis sorted sets
 * More accurate than fixed window, prevents burst at window boundaries
 */
export class RedisSlidingWindowRateLimiter implements RateLimiter {
  constructor(
    private redis: Redis,
    private config: RateLimitConfig
  ) {}

  async consume(key: string, cost: number = 1): Promise<RateLimitResult> {
    const fullKey = this.getFullKey(key);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Use Lua script for atomic sliding window operation
      const result = await this.redis.eval(
        this.getSlidingWindowScript(),
        1,
        fullKey,
        now.toString(),
        windowStart.toString(),
        this.config.maxRequests.toString(),
        cost.toString(),
        this.config.windowMs.toString()
      );

      const [allowed, count] = result as [number, number];
      const remaining = Math.max(0, this.config.maxRequests - count);

      return {
        allowed: allowed === 1,
        remaining,
        limit: this.config.maxRequests,
        resetMs: this.config.windowMs,
        retryAfter: allowed === 1 ? undefined : Math.ceil(this.config.windowMs / 1000),
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "sliding_window_rate_limiter_error",
          key: fullKey,
          err: String(error),
        })
      );

      return {
        allowed: true,
        remaining: this.config.maxRequests,
        limit: this.config.maxRequests,
        resetMs: this.config.windowMs,
      };
    }
  }

  async check(key: string): Promise<RateLimitResult> {
    const fullKey = this.getFullKey(key);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Count requests in current window
      const count = await this.redis.zcount(fullKey, windowStart, now);
      const remaining = Math.max(0, this.config.maxRequests - count);

      return {
        allowed: count < this.config.maxRequests,
        remaining,
        limit: this.config.maxRequests,
        resetMs: this.config.windowMs,
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "sliding_window_check_error",
          key: fullKey,
          err: String(error),
        })
      );

      return {
        allowed: true,
        remaining: this.config.maxRequests,
        limit: this.config.maxRequests,
        resetMs: this.config.windowMs,
      };
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    await this.redis.del(fullKey);
  }

  async getStatus(key: string): Promise<RateLimitResult> {
    return this.check(key);
  }

  private getFullKey(key: string): string {
    const prefix = this.config.keyPrefix ?? "ratelimit:sw";
    return `${prefix}:${key}`;
  }

  /**
   * Lua script for atomic sliding window operation
   */
  private getSlidingWindowScript(): string {
    return `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local maxRequests = tonumber(ARGV[3])
      local cost = tonumber(ARGV[4])
      local windowMs = tonumber(ARGV[5])

      -- Remove old entries outside window
      redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

      -- Count current requests in window
      local count = redis.call('ZCARD', key)

      local allowed = 0
      if count < maxRequests then
        -- Add current request(s)
        for i = 1, cost do
          redis.call('ZADD', key, now, now .. ':' .. i)
        end
        count = count + cost
        allowed = 1
      end

      -- Set expiry
      redis.call('PEXPIRE', key, windowMs)

      return {allowed, count}
    `;
  }
}
