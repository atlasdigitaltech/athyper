import "server-only";

import { createClient } from "redis";

// ─── Rate Limiter ─────────────────────────────────────────────
//
// Redis-backed sliding window rate limiter for admin mesh routes.
// Uses the same Redis connection pattern as auth routes.
//
// Limits per session (tenantId:sid pair):
//   - Reads:  120 per 60-second window
//   - Writes:  30 per 60-second window

const READ_LIMIT = 120;
const WRITE_LIMIT = 30;
const WINDOW_SECONDS = 60;

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedis() {
    if (redisClient && redisClient.isOpen) return redisClient;
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    redisClient = createClient({ url });
    redisClient.on("error", () => { /* swallow — rate limiter is best-effort */ });
    await redisClient.connect();
    return redisClient;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs?: number;
}

/**
 * Check rate limit for the given session.
 * Best-effort: if Redis is unavailable, allow the request.
 */
export async function checkRateLimit(
    tenantId: string,
    sid: string,
    isWrite: boolean,
): Promise<RateLimitResult> {
    try {
        const redis = await getRedis();
        const bucket = isWrite ? "w" : "r";
        const limit = isWrite ? WRITE_LIMIT : READ_LIMIT;
        const key = `ratelimit:mesh:${tenantId}:${sid}:${bucket}`;
        const now = Date.now();
        const windowStart = now - WINDOW_SECONDS * 1000;

        // Sliding window: ZREMRANGEBYSCORE + ZADD + ZCARD
        // Using a pipeline for atomicity
        const multi = redis.multi();
        multi.zRemRangeByScore(key, 0, windowStart);
        multi.zAdd(key, { score: now, value: `${now}:${Math.random().toString(36).slice(2, 8)}` });
        multi.zCard(key);
        multi.expire(key, WINDOW_SECONDS + 1);

        const results = await multi.exec();
        const count = (results?.[2] as number) ?? 0;

        if (count > limit) {
            // Estimate when the oldest entry in window will expire
            const retryAfterMs = WINDOW_SECONDS * 1000;
            return { allowed: false, remaining: 0, retryAfterMs };
        }

        return { allowed: true, remaining: limit - count };
    } catch {
        // Best-effort: allow on Redis failure
        return { allowed: true, remaining: -1 };
    }
}
