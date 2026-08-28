import { createHash } from "node:crypto";
import type { EntityDescriptorCache, EntityDescriptorCoordinate, EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";

export interface DistributedDescriptorCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { readonly ttlSeconds: number }): Promise<boolean>;
  delete(key: string): Promise<number>;
}

export interface DistributedDescriptorCacheOptions {
  readonly namespace?: string;
  readonly invalidationNamespace?: string;
}

/**
 * Distributed metadata cache whose keys include both tenant and global
 * invalidation generations. Record data and effective authorization decisions
 * are deliberately excluded from this cache boundary.
 */
export function createDistributedDescriptorCache(
  store: DistributedDescriptorCacheStore,
  options: DistributedDescriptorCacheOptions = {},
): EntityDescriptorCache {
  const namespace = normalizeNamespace(options.namespace ?? "metadata:descriptor:v1");
  const invalidationNamespace = normalizeNamespace(options.invalidationNamespace ?? "invalidation");

  const cache: EntityDescriptorCache = {
    async get(coordinate: EntityDescriptorCoordinate) {
      let key: string | undefined;
      try {
        key = await descriptorKey(store, coordinate, namespace, invalidationNamespace);
        const value = await store.get(key);
        if (value === null) return undefined;
        const parsed = JSON.parse(value) as unknown;
        if (parsed === null) return null;
        return validateDescriptor(parsed);
      } catch {
        // Cache corruption or an unavailable Redis node must degrade to the
        // authoritative metadata repository, never fail the request.
        if (key) await store.delete(key).catch(() => 0);
        return undefined;
      }
    },
    async set(coordinate: EntityDescriptorCoordinate, descriptor: EntityRuntimeDescriptor | null, ttlMs: number) {
      try {
        const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1_000));
        await store.set(
          await descriptorKey(store, coordinate, namespace, invalidationNamespace),
          JSON.stringify(descriptor),
          { ttlSeconds },
        );
      } catch {
        // Best-effort cache population; repository reads remain authoritative.
      }
    },
    async invalidate(coordinate: EntityDescriptorCoordinate) {
      try {
        await store.delete(await descriptorKey(store, coordinate, namespace, invalidationNamespace));
      } catch {
        // Generation-based invalidation and TTL expiry still bound stale data.
      }
    },
  };
  return Object.freeze(cache);
}

async function descriptorKey(
  store: Pick<DistributedDescriptorCacheStore, "get">,
  coordinate: EntityDescriptorCoordinate,
  namespace: string,
  invalidationNamespace: string,
): Promise<string> {
  const tenantGenerationKey = generationKey(invalidationNamespace, coordinate, coordinate.tenantId);
  const globalGenerationKey = generationKey(invalidationNamespace, coordinate, "system");
  const [tenantGeneration, globalGeneration] = coordinate.tenantId === "system"
    ? await Promise.all([readGeneration(store, tenantGenerationKey), Promise.resolve(0)])
    : await Promise.all([readGeneration(store, tenantGenerationKey), readGeneration(store, globalGenerationKey)]);
  const coordinateDigest = createHash("sha256")
    .update(JSON.stringify({ planeKey: coordinate.planeKey, tenantId: coordinate.tenantId, entityCode: coordinate.entityCode }))
    .digest("hex");
  return `${namespace}:${coordinateDigest}:g${globalGeneration}.${tenantGeneration}`;
}

function generationKey(namespace: string, coordinate: EntityDescriptorCoordinate, tenantId: string): string {
  return `${namespace}:{metadata:${coordinate.planeKey}:${tenantId}:${coordinate.entityCode}}:generation`;
}

async function readGeneration(store: Pick<DistributedDescriptorCacheStore, "get">, key: string): Promise<number> {
  const value = await store.get(key);
  if (value === null) return 0;
  const generation = Number(value);
  if (!Number.isSafeInteger(generation) || generation < 0) throw new TypeError("Invalid metadata cache generation");
  return generation;
}

function validateDescriptor(value: unknown): EntityRuntimeDescriptor {
  if (!value || typeof value !== "object") throw new TypeError("Cached descriptor must be an object");
  const candidate = value as Partial<EntityRuntimeDescriptor>;
  return parseEntityRuntimeDescriptor({
    entity_code: String(candidate.entityCode ?? ""),
    release_id: String(candidate.releaseId ?? ""),
    release_no: candidate.releaseNo ?? 0,
    entity_contract_hash: String(candidate.contractHash ?? ""),
    plane_code: String(candidate.planeKey ?? ""),
    compiled_hash: String(candidate.compiledHash ?? ""),
    compiled_json: value,
  });
}

function normalizeNamespace(value: string): string {
  const normalized = value.trim().replace(/:+$/u, "");
  if (!normalized || !/^[a-z0-9:_-]+$/iu.test(normalized)) throw new TypeError("Invalid cache namespace");
  return normalized;
}
