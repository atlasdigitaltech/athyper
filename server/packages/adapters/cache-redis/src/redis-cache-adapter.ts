import type { Logger } from "@athyper/server-foundation/observability";
import { Redis, type RedisOptions } from "ioredis";

export interface RedisCacheAdapterConfig {
  readonly url: string;
  readonly keyPrefix?: string;
  readonly connectTimeoutMs?: number;
  readonly maxRetriesPerRequest?: number;
  readonly errorLogCooldownMs?: number;
  readonly logger?: Pick<Logger, "info" | "warn" | "error">;
  readonly observer?: { operation(name: "connect" | "get" | "set" | "delete" | "health", outcome: "success" | "error"): void };
}

export interface RedisSetOptions {
  readonly ttlSeconds?: number;
  readonly onlyIfAbsent?: boolean;
}

export interface RedisCacheHealth {
  readonly healthy: boolean;
  readonly latencyMs?: number;
  readonly message?: string;
}

export interface RedisCacheAdapter {
  /** Raw client for infrastructure integrations such as BullMQ. */
  readonly client: Redis;
  connect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<boolean>;
  delete(key: string): Promise<number>;
  health(): Promise<RedisCacheHealth>;
  close(): Promise<void>;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_ERROR_LOG_COOLDOWN_MS = 10_000;

export function createRedisCacheAdapter(
  config: RedisCacheAdapterConfig,
): RedisCacheAdapter {
  validateConfig(config);

  const options: RedisOptions = {
    lazyConnect: true,
    enableReadyCheck: true,
    connectTimeout: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? 2,
    ...(config.keyPrefix ? { keyPrefix: config.keyPrefix } : {}),
  };
  const client = new Redis(config.url, options);
  attachTransportObservers(
    client,
    config.logger,
    config.errorLogCooldownMs ?? DEFAULT_ERROR_LOG_COOLDOWN_MS,
  );
  return createRedisCacheRuntime(client, config.observer);
}

export function createRedisCacheRuntime(client: Redis, observer?: RedisCacheAdapterConfig["observer"]): RedisCacheAdapter {
  let closePromise: Promise<void> | undefined;

  return {
    client,

    async connect() {
      try { if (client.status === "wait") await client.connect(); observer?.operation("connect", "success"); }
      catch (error) { observer?.operation("connect", "error"); throw error; }
    },

    async get(key) {
      try { const result = await client.get(requireKey(key)); observer?.operation("get", "success"); return result; }
      catch (error) { observer?.operation("get", "error"); throw error; }
    },

    async set(key, value, options = {}) {
      const normalizedKey = requireKey(key);
      const ttl = options.ttlSeconds;
      if (ttl !== undefined && (!Number.isInteger(ttl) || ttl <= 0)) {
        throw new TypeError("Redis cache TTL must be a positive integer");
      }

      try {
        let result: "OK" | null;
        if (ttl !== undefined && options.onlyIfAbsent) result = await client.set(normalizedKey, value, "EX", ttl, "NX");
        else if (ttl !== undefined) result = await client.set(normalizedKey, value, "EX", ttl);
        else if (options.onlyIfAbsent) result = await client.set(normalizedKey, value, "NX");
        else result = await client.set(normalizedKey, value);
        observer?.operation("set", "success"); return result === "OK";
      } catch (error) { observer?.operation("set", "error"); throw error; }
    },

    async delete(key) {
      try { const result = await client.del(requireKey(key)); observer?.operation("delete", "success"); return result; }
      catch (error) { observer?.operation("delete", "error"); throw error; }
    },

    async health() {
      const startedAt = performance.now();
      try {
        const result = await client.ping();
        if (result !== "PONG") {
          observer?.operation("health", "error");
          return { healthy: false, message: `Unexpected Redis PING result: ${result}` };
        }
        observer?.operation("health", "success"); return { healthy: true, latencyMs: performance.now() - startedAt };
      } catch (error) {
        observer?.operation("health", "error");
        return {
          healthy: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    close() {
      closePromise ??= closeClient(client);
      return closePromise;
    },
  };
}

function validateConfig(config: RedisCacheAdapterConfig): void {
  const rawUrl = config.url.trim();
  if (!rawUrl) throw new TypeError("Redis URL must not be empty");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError("Redis URL is invalid");
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new TypeError("Redis URL must use redis:// or rediss://");
  }
  if (
    config.connectTimeoutMs !== undefined &&
    (!Number.isInteger(config.connectTimeoutMs) || config.connectTimeoutMs <= 0)
  ) {
    throw new TypeError("Redis connect timeout must be a positive integer");
  }
  if (
    config.maxRetriesPerRequest !== undefined &&
    (!Number.isInteger(config.maxRetriesPerRequest) ||
      config.maxRetriesPerRequest < 0)
  ) {
    throw new TypeError("Redis max retries per request must be a non-negative integer");
  }
}

function requireKey(key: string): string {
  const normalized = key.trim();
  if (!normalized) throw new TypeError("Redis cache key must not be empty");
  return normalized;
}

function attachTransportObservers(
  client: Redis,
  logger: RedisCacheAdapterConfig["logger"],
  cooldownMs: number,
): void {
  const shouldLog = createEventThrottle(cooldownMs);
  client.on("error", (error: Error) => {
    if (logger && shouldLog("error")) {
      logger.error("redis_transport_error", { error: error.message });
    }
  });
  client.on("reconnecting", () => {
    if (logger && shouldLog("reconnecting")) {
      logger.warn("redis_reconnecting");
    }
  });
  client.on("ready", () => logger?.info("redis_ready"));
}

function createEventThrottle(cooldownMs: number): (event: string) => boolean {
  if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
    throw new TypeError("Redis error log cooldown must be non-negative");
  }
  const lastEmittedAt = new Map<string, number>();
  return (event) => {
    const now = Date.now();
    const previous = lastEmittedAt.get(event);
    if (previous !== undefined && now - previous < cooldownMs) return false;
    lastEmittedAt.set(event, now);
    return true;
  };
}

async function closeClient(client: Redis): Promise<void> {
  if (client.status === "end") return;
  if (client.status === "wait") {
    client.disconnect(false);
    return;
  }
  try {
    await client.quit();
  } catch (error) {
    client.disconnect(false);
    throw error;
  }
}
