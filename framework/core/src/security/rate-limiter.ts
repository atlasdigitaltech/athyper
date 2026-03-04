/**
 * Rate limiting abstractions and algorithms
 * Supports per-tenant, per-user, and per-IP rate limiting
 */

export type RateLimitStrategy = "token_bucket" | "sliding_window" | "fixed_window";

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   */
  maxRequests: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Rate limiting strategy
   */
  strategy?: RateLimitStrategy;

  /**
   * Key prefix for storage
   */
  keyPrefix?: string;

  /**
   * Skip rate limiting based on request
   */
  skip?: (key: string, metadata?: Record<string, unknown>) => boolean | Promise<boolean>;

  /**
   * Custom key generator
   */
  keyGenerator?: (context: RateLimitContext) => string;
}

export interface RateLimitContext {
  /**
   * Tenant key (for multi-tenant rate limiting)
   */
  tenantKey?: string;

  /**
   * User ID
   */
  userId?: string;

  /**
   * IP address
   */
  ip?: string;

  /**
   * API endpoint/route
   */
  endpoint?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

export interface RateLimitResult {
  /**
   * Whether the request is allowed
   */
  allowed: boolean;

  /**
   * Remaining requests in the current window
   */
  remaining: number;

  /**
   * Total limit
   */
  limit: number;

  /**
   * Time until the rate limit resets (milliseconds)
   */
  resetMs: number;

  /**
   * Retry after (seconds) - only present when blocked
   */
  retryAfter?: number;
}

export interface RateLimiter {
  /**
   * Check if a request is allowed and consume a token
   */
  consume(key: string, cost?: number): Promise<RateLimitResult>;

  /**
   * Check if a request would be allowed without consuming
   */
  check(key: string): Promise<RateLimitResult>;

  /**
   * Reset rate limit for a key
   */
  reset(key: string): Promise<void>;

  /**
   * Get current rate limit status
   */
  getStatus(key: string): Promise<RateLimitResult>;
}

/**
 * In-memory rate limiter using token bucket algorithm
 * Good for single-instance deployments or testing
 */
export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<
    string,
    { tokens: number; lastRefill: number; resetTime: number }
  >();

  constructor(private config: RateLimitConfig) {}

  async consume(key: string, cost: number = 1): Promise<RateLimitResult> {
    const fullKey = this.getFullKey(key);
    const bucket = this.getBucket(fullKey);

    // Refill tokens based on elapsed time
    this.refillBucket(bucket);

    const allowed = bucket.tokens >= cost;

    if (allowed) {
      bucket.tokens -= cost;
    }

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      limit: this.config.maxRequests,
      resetMs: bucket.resetTime - Date.now(),
      retryAfter: allowed ? undefined : Math.ceil((bucket.resetTime - Date.now()) / 1000),
    };
  }

  async check(key: string): Promise<RateLimitResult> {
    const fullKey = this.getFullKey(key);
    const bucket = this.getBucket(fullKey);

    this.refillBucket(bucket);

    return {
      allowed: bucket.tokens >= 1,
      remaining: Math.floor(bucket.tokens),
      limit: this.config.maxRequests,
      resetMs: bucket.resetTime - Date.now(),
    };
  }

  async reset(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    this.buckets.delete(fullKey);
  }

  async getStatus(key: string): Promise<RateLimitResult> {
    return this.check(key);
  }

  private getFullKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
  }

  private getBucket(key: string): { tokens: number; lastRefill: number; resetTime: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxRequests,
        lastRefill: now,
        resetTime: now + this.config.windowMs,
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  private refillBucket(bucket: { tokens: number; lastRefill: number; resetTime: number }): void {
    const now = Date.now();

    // If window has passed, reset
    if (now >= bucket.resetTime) {
      bucket.tokens = this.config.maxRequests;
      bucket.lastRefill = now;
      bucket.resetTime = now + this.config.windowMs;
      return;
    }

    // Token bucket: refill at a constant rate
    const elapsed = now - bucket.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const tokensToAdd = elapsed * refillRate;

    bucket.tokens = Math.min(this.config.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Clean up old buckets (garbage collection)
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, bucket] of this.buckets.entries()) {
      // Remove buckets that haven't been accessed in 2x the window time
      if (now - bucket.lastRefill > this.config.windowMs * 2) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.buckets.delete(key);
    }
  }
}

/**
 * Create default rate limit key from context
 */
export function createRateLimitKey(context: RateLimitContext): string {
  const parts: string[] = [];

  if (context.tenantKey) parts.push(`tenant:${context.tenantKey}`);
  if (context.userId) parts.push(`user:${context.userId}`);
  if (context.endpoint) parts.push(`endpoint:${context.endpoint}`);
  if (context.ip) parts.push(`ip:${context.ip}`);

  return parts.join(":");
}

/**
 * Pre-configured rate limit profiles
 */
export const RATE_LIMIT_PROFILES = {
  /**
   * Strict rate limit for public/unauthenticated endpoints
   */
  public: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    strategy: "sliding_window" as RateLimitStrategy,
  },

  /**
   * Standard rate limit for authenticated users
   */
  authenticated: {
    maxRequests: 1000,
    windowMs: 60000, // 1 minute
    strategy: "token_bucket" as RateLimitStrategy,
  },

  /**
   * Generous rate limit for premium/enterprise tenants
   */
  premium: {
    maxRequests: 10000,
    windowMs: 60000, // 1 minute
    strategy: "token_bucket" as RateLimitStrategy,
  },

  /**
   * Strict rate limit for write operations
   */
  write: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    strategy: "token_bucket" as RateLimitStrategy,
  },

  /**
   * Very strict rate limit for sensitive operations (login, password reset)
   */
  sensitive: {
    maxRequests: 5,
    windowMs: 60000, // 1 minute
    strategy: "fixed_window" as RateLimitStrategy,
  },
} as const;
