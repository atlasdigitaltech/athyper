import { Redis, RedisOptions } from 'ioredis';

interface AdapterLogger {
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
}
type RedisClient = Redis;
interface RedisClientOptions extends RedisOptions {
    /**
     * Optional structured logger for Redis transport events (errors,
     * reconnects). When omitted, events are swallowed silently — the
     * caller's circuit-breaker protection layer handles them.
     */
    logger?: AdapterLogger;
    /**
     * Minimum ms between error log emissions per event type (throttle, not TTL).
     * Prevents log floods on repeated reconnect attempts.
     * Default: 10000 (10 s).
     */
    errorLogCooldownMs?: number;
}
declare function createRedisClient(options: RedisClientOptions): RedisClient;

export { type RedisClient, type RedisClientOptions, createRedisClient };
