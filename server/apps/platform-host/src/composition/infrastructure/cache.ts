import {
  createRedisCacheAdapter,
  createRedisNotificationEventBus,
} from "@athyper/server-adapter-cache-redis";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type CacheRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  "createRedisCache" | "createNotificationEvents"
>;

const DEFAULT_DEPENDENCIES: CacheRegistrationDependencies = {
  createRedisCache: createRedisCacheAdapter,
  createNotificationEvents: createRedisNotificationEventBus,
};

export function registerCache(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<CacheRegistrationDependencies> = {},
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  if (config.redis.url) {
    const redisOperations = container.adapters.openTelemetry?.metrics.counter(
      "athyper_redis_operations_total",
      "Redis operations by operation and outcome",
    );
    const redisCache = dependencies.createRedisCache({
      url: config.redis.url,
      connectTimeoutMs: config.redis.connectTimeoutMs,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      ...(config.redis.keyPrefix ? { keyPrefix: config.redis.keyPrefix } : {}),
      ...(redisOperations
        ? {
            observer: {
              operation(name, outcome) {
                redisOperations.increment({
                  operation: name,
                  outcome,
                  capability: "redis",
                });
              },
            },
          }
        : {}),
    });
    container.adapters.redisCache = redisCache;
    const notificationEvents = dependencies.createNotificationEvents(
      redisCache.client,
    );
    container.adapters.notificationEvents = notificationEvents;
    lifecycle.onReady(() => redisCache.connect());
    lifecycle.onShutdown(() => redisCache.close());
    lifecycle.onShutdown(() => notificationEvents.close());
  }
}
