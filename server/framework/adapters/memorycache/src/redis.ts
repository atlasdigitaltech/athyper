import { Redis, type Redis as RedisType, type RedisOptions } from "ioredis";

// ─── AdapterLogger ────────────────────────────────────────────────────────────
//
// Defined inline to keep this package free of @athyper/core.
// Structurally identical to InfraLogger — any InfraLogger instance satisfies it.

interface AdapterLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

// ─── Per-event throttle ───────────────────────────────────────────────────────
//
// Redis transport errors fire on every reconnect attempt. Throttling per event
// name prevents log floods while still capturing the first occurrence and each
// recurrence after the cooldown window.

const DEFAULT_ERROR_LOG_COOLDOWN_MS = 10_000; // 10 s between emissions per event

function makeThrottle(cooldownMs: number) {
  const lastEmittedAt = new Map<string, number>();
  return function shouldEmit(event: string): boolean {
    const now = Date.now();
    const last = lastEmittedAt.get(event) ?? 0;
    if (now - last >= cooldownMs) {
      lastEmittedAt.set(event, now);
      return true;
    }
    return false;
  };
}

// ─── RedisClient ──────────────────────────────────────────────────────────────

export type RedisClient = RedisType;

export interface RedisClientOptions extends RedisOptions {
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

export function createRedisClient(options: RedisClientOptions): RedisClient {
  // ── Config guard ──────────────────────────────────────────────────────────
  if (!options.host) throw new Error("RedisClientOptions.host is required");
  if (options.port !== undefined) {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`RedisClientOptions.port must be an integer between 1 and 65535, got: ${options.port}`);
    }
  }

  const { logger, errorLogCooldownMs, ...redisOptions } = options;

  const client = new Redis({
    lazyConnect:      true,
    enableReadyCheck: true,
    ...redisOptions,
  });

  if (logger) {
    const throttle = makeThrottle(errorLogCooldownMs ?? DEFAULT_ERROR_LOG_COOLDOWN_MS);

    client.on("error", (err: unknown) => {
      if (throttle("redis_error")) {
        logger.error("redis_error", { err: String(err) });
      }
    });

    client.on("reconnecting", () => {
      if (throttle("redis_reconnecting")) {
        logger.warn("redis_reconnecting", {});
      }
    });
  } else {
    // ioredis requires at least one "error" listener to avoid unhandled-event
    // exceptions when there is no logger. The circuit-breaker wrapper above
    // this adapter already tracks failures — no logging needed here.
    client.on("error", () => {});
  }

  return client;
}
