import { createHash } from "node:crypto";
import type { Redis } from "ioredis";

export interface RedisRateLimitStore {
  consume(input: { readonly key: string; readonly windowMs: number; readonly now: number }): Promise<{ count: number; resetAt: number }>;
}

const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

export function createRedisRateLimitStore(client: Redis, prefix = "athyper:rate-limit"): RedisRateLimitStore {
  return {
    async consume(input) {
      if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1) throw new TypeError("Rate-limit window must be a positive integer");
      const digest = createHash("sha256").update(input.key).digest("hex");
      const result = await client.eval(CONSUME, 1, `${prefix}:${digest}`, String(input.windowMs));
      if (!Array.isArray(result) || result.length !== 2) throw new Error("Redis rate-limit response is invalid");
      const count = Number(result[0]); const ttl = Number(result[1]);
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(ttl)) throw new Error("Redis rate-limit counters are invalid");
      return { count, resetAt: input.now + Math.max(1, ttl) };
    },
  };
}
