// src/redis.ts
import { Redis } from "ioredis";
var DEFAULT_ERROR_LOG_COOLDOWN_MS = 1e4;
function makeThrottle(cooldownMs) {
  const lastEmittedAt = /* @__PURE__ */ new Map();
  return function shouldEmit(event) {
    const now = Date.now();
    const last = lastEmittedAt.get(event) ?? 0;
    if (now - last >= cooldownMs) {
      lastEmittedAt.set(event, now);
      return true;
    }
    return false;
  };
}
function createRedisClient(options) {
  if (!options.host) throw new Error("RedisClientOptions.host is required");
  if (options.port !== void 0) {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`RedisClientOptions.port must be an integer between 1 and 65535, got: ${options.port}`);
    }
  }
  const { logger, errorLogCooldownMs, ...redisOptions } = options;
  const client = new Redis({
    lazyConnect: true,
    enableReadyCheck: true,
    ...redisOptions
  });
  if (logger) {
    const throttle = makeThrottle(errorLogCooldownMs ?? DEFAULT_ERROR_LOG_COOLDOWN_MS);
    client.on("error", (err) => {
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
    client.on("error", () => {
    });
  }
  return client;
}
export {
  createRedisClient
};
//# sourceMappingURL=index.js.map