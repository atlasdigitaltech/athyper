export interface EvalCache {
  eval?(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export interface TrackedSetCache extends EvalCache {
  sadd?(key: string, member: string): Promise<unknown>;
  expire?(key: string, ttlSeconds: number): Promise<unknown>;
}

export interface RateLimitCache extends EvalCache {
  incr?(key: string): Promise<number>;
  expire?(key: string, ttlSeconds: number): Promise<unknown>;
  del?(key: string | string[]): Promise<unknown>;
}

const TRACKED_SET_SCRIPT = `
redis.call("SADD", KEYS[1], ARGV[1])
return redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
`;

const RATE_LIMIT_SCRIPT = `
local n = redis.call("INCR", KEYS[1])
local ttl = redis.call("TTL", KEYS[1])
if n == 1 or ttl < 0 then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
end
return n
`;

export async function addTrackedKey(
  cache: TrackedSetCache,
  setKey: string,
  member: string,
  ttlSeconds: number,
): Promise<void> {
  if (typeof cache.eval === "function") {
    await cache.eval(TRACKED_SET_SCRIPT, 1, setKey, member, ttlSeconds);
    return;
  }

  if (typeof cache.sadd === "function" && typeof cache.expire === "function") {
    await cache.sadd(setKey, member);
    await cache.expire(setKey, ttlSeconds);
  }
}

export async function incrementRateLimit(
  cache: RateLimitCache,
  key: string,
  windowSec: number,
): Promise<number> {
  if (typeof cache.eval === "function") {
    const raw = await cache.eval(RATE_LIMIT_SCRIPT, 1, key, windowSec);
    const count = Number(raw);
    return Number.isFinite(count) ? count : 0;
  }

  if (typeof cache.incr !== "function" || typeof cache.expire !== "function") {
    return 0;
  }

  const count = await cache.incr(key);
  if (count === 1) {
    try {
      await cache.expire(key, windowSec);
    } catch (err) {
      await cache.del?.(key).catch(() => undefined);
      throw err;
    }
  }
  return count;
}
