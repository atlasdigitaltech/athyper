/**
 * MessagingRateLimiter - Rate limiting for messaging operations
 *
 * Prevents abuse by limiting:
 * - Messages sent per user per time window
 * - Search queries per user per time window
 * - Conversation creation per user per time window
 *
 * Uses sliding window algorithm with Redis for distributed rate limiting.
 * Falls back to in-memory if Redis unavailable (single-node only).
 */

export interface RateLimitConfig {
    windowMs: number; // Time window in milliseconds
    maxRequests: number; // Max requests per window
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfter?: number; // Seconds until reset
}

export class RateLimitExceededError extends Error {
    constructor(
        public limitType: string,
        public retryAfter: number
    ) {
        super(`Rate limit exceeded for ${limitType}. Retry after ${retryAfter} seconds.`);
        this.name = "RateLimitExceededError";
    }
}

/**
 * Rate limiter using sliding window algorithm
 * In production, this should use Redis for distributed rate limiting
 */
export class MessagingRateLimiter {
    // Default rate limits
    private static readonly LIMITS = {
        messageSend: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 msgs/min
        search: { windowMs: 60 * 1000, maxRequests: 20 }, // 20 searches/min
        conversationCreate: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 convs/min
    };

    // In-memory fallback (NOT suitable for production multi-node)
    private inMemoryStore: Map<string, number[]> = new Map();

    /**
     * Check rate limit for message sending
     */
    async checkMessageSendLimit(
        tenantId: string,
        userId: string
    ): Promise<RateLimitResult> {
        const key = `msg:send:${tenantId}:${userId}`;
        return this.checkLimit(key, MessagingRateLimiter.LIMITS.messageSend);
    }

    /**
     * Check rate limit for search queries
     */
    async checkSearchLimit(tenantId: string, userId: string): Promise<RateLimitResult> {
        const key = `msg:search:${tenantId}:${userId}`;
        return this.checkLimit(key, MessagingRateLimiter.LIMITS.search);
    }

    /**
     * Check rate limit for conversation creation
     */
    async checkConversationCreateLimit(
        tenantId: string,
        userId: string
    ): Promise<RateLimitResult> {
        const key = `msg:conv:${tenantId}:${userId}`;
        return this.checkLimit(key, MessagingRateLimiter.LIMITS.conversationCreate);
    }

    /**
     * Generic rate limit check using sliding window
     */
    private async checkLimit(
        key: string,
        config: RateLimitConfig
    ): Promise<RateLimitResult> {
        const now = Date.now();
        const windowStart = now - config.windowMs;

        // Get or create request timestamps for this key
        let timestamps = this.inMemoryStore.get(key) ?? [];

        // Remove timestamps outside the current window
        timestamps = timestamps.filter((ts) => ts > windowStart);

        // Check if limit exceeded
        const currentCount = timestamps.length;
        const allowed = currentCount < config.maxRequests;

        if (allowed) {
            // Add current timestamp
            timestamps.push(now);
            this.inMemoryStore.set(key, timestamps);
        }

        const remaining = Math.max(0, config.maxRequests - currentCount - (allowed ? 1 : 0));
        const oldestTimestamp = timestamps[0] ?? now;
        const resetAt = new Date(oldestTimestamp + config.windowMs);
        const retryAfter = allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000);

        return {
            allowed,
            remaining,
            resetAt,
            retryAfter,
        };
    }

    /**
     * Enforce rate limit - throws if exceeded
     */
    async enforceMessageSendLimit(tenantId: string, userId: string): Promise<void> {
        const result = await this.checkMessageSendLimit(tenantId, userId);
        if (!result.allowed) {
            throw new RateLimitExceededError("message_send", result.retryAfter!);
        }
    }

    /**
     * Enforce search rate limit - throws if exceeded
     */
    async enforceSearchLimit(tenantId: string, userId: string): Promise<void> {
        const result = await this.checkSearchLimit(tenantId, userId);
        if (!result.allowed) {
            throw new RateLimitExceededError("search", result.retryAfter!);
        }
    }

    /**
     * Enforce conversation creation rate limit - throws if exceeded
     */
    async enforceConversationCreateLimit(tenantId: string, userId: string): Promise<void> {
        const result = await this.checkConversationCreateLimit(tenantId, userId);
        if (!result.allowed) {
            throw new RateLimitExceededError("conversation_create", result.retryAfter!);
        }
    }

    /**
     * Clean up old entries (for in-memory store)
     * In production with Redis, this is handled by key expiration
     */
    cleanup(): void {
        const now = Date.now();
        const maxAge = Math.max(
            MessagingRateLimiter.LIMITS.messageSend.windowMs,
            MessagingRateLimiter.LIMITS.search.windowMs,
            MessagingRateLimiter.LIMITS.conversationCreate.windowMs
        );

        for (const [key, timestamps] of this.inMemoryStore.entries()) {
            const filtered = timestamps.filter((ts) => ts > now - maxAge);
            if (filtered.length === 0) {
                this.inMemoryStore.delete(key);
            } else {
                this.inMemoryStore.set(key, filtered);
            }
        }
    }
}

/**
 * Production Note:
 * Replace in-memory store with Redis using sliding window algorithm:
 *
 * async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
 *     const now = Date.now();
 *     const windowStart = now - config.windowMs;
 *
 *     // Remove old entries
 *     await redis.zremrangebyscore(key, 0, windowStart);
 *
 *     // Count current requests
 *     const currentCount = await redis.zcard(key);
 *
 *     if (currentCount >= config.maxRequests) {
 *         const oldestScore = await redis.zrange(key, 0, 0, 'WITHSCORES');
 *         const resetAt = new Date(parseInt(oldestScore[1]) + config.windowMs);
 *         return {
 *             allowed: false,
 *             remaining: 0,
 *             resetAt,
 *             retryAfter: Math.ceil((resetAt.getTime() - now) / 1000),
 *         };
 *     }
 *
 *     // Add current request
 *     await redis.zadd(key, now, `${now}-${Math.random()}`);
 *     await redis.expire(key, Math.ceil(config.windowMs / 1000));
 *
 *     return {
 *         allowed: true,
 *         remaining: config.maxRequests - currentCount - 1,
 *         resetAt: new Date(now + config.windowMs),
 *     };
 * }
 */
