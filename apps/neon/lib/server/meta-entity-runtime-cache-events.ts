import "server-only";

import {
  createDocumentEditRedisClient,
  type DocumentEditRedisClient,
} from "@/lib/server/document-edit-runtime-redis";
import type { RuntimeCacheInvalidationScope } from "@/lib/server/scoped-runtime-cache";

export const META_ENTITY_RUNTIME_INVALIDATION_CHANNEL = "descriptor-runtime:invalidate:v1";
export const META_ENTITY_RUNTIME_GENERATION_KEY = "descriptor-runtime:generation:v1";

export interface MetaEntityRuntimeInvalidationEvent extends RuntimeCacheInvalidationScope {
  generation: number;
  emittedAt: number;
  origin: string;
}

let subscriberPromise: Promise<DocumentEditRedisClient | null> | null = null;

export function ensureMetaEntityRuntimeInvalidationSubscriber(
  invalidate: (event: MetaEntityRuntimeInvalidationEvent) => void,
): void {
  if (subscriberPromise) return;
  subscriberPromise = createSubscriber(invalidate).catch(() => {
    subscriberPromise = null;
    return null;
  });
}

export function parseMetaEntityRuntimeInvalidationEvent(raw: string): MetaEntityRuntimeInvalidationEvent | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object") return null;
    if (typeof value["generation"] !== "number" || !Number.isSafeInteger(value["generation"])) return null;
    if (typeof value["reason"] !== "string" || typeof value["origin"] !== "string") return null;
    if (typeof value["emittedAt"] !== "number") return null;
    const event: MetaEntityRuntimeInvalidationEvent = {
      generation: value["generation"],
      reason: value["reason"],
      emittedAt: value["emittedAt"],
      origin: value["origin"],
    };
    for (const key of ["tenant", "plane", "realm", "entity", "principal", "permissionStamp"] as const) {
      const field = value[key];
      if (typeof field === "string" && field.length > 0) event[key] = field;
    }
    return event;
  } catch {
    return null;
  }
}

async function createSubscriber(
  invalidate: (event: MetaEntityRuntimeInvalidationEvent) => void,
): Promise<DocumentEditRedisClient> {
  const redis = await createDocumentEditRedisClient({ logPrefix: "[meta-entity/cache-events]" });
  const subscriber = redis.duplicate();
  await subscriber.connect();
  await subscriber.subscribe(META_ENTITY_RUNTIME_INVALIDATION_CHANNEL, (raw) => {
    const event = parseMetaEntityRuntimeInvalidationEvent(raw);
    if (event) invalidate(event);
  });
  const persistedGeneration = Number(await redis.get(META_ENTITY_RUNTIME_GENERATION_KEY));
  if (Number.isSafeInteger(persistedGeneration) && persistedGeneration > 0) {
    invalidate({
      generation: persistedGeneration,
      reason: "subscriber_bootstrap",
      emittedAt: Date.now(),
      origin: "redis-generation",
    });
  }
  return subscriber;
}
