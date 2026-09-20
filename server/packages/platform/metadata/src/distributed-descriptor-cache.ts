import { createHash } from "node:crypto";
import type { EntityDescriptorCache, EntityDescriptorCoordinate, EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
  type CompiledEntityArtifactV2,
  type CompiledEntityReleaseEnvelopeV2,
} from "@athyper/server-contract-publication";
import type {
  CompiledEntityArtifactCache,
  CompiledEntityArtifactReadCoordinate,
  CompiledEntityReleaseCoordinate,
} from "./artifact-resolution.js";
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

export interface DistributedCompiledEntityArtifactCacheOptions {
  readonly namespace?: string;
}

/**
 * Cache for immutable split-artifact IR. It is keyed by its tenant/plane/preview
 * release coordinates only. Principal admission, access epoch, context and locale
 * are browser/data projection concerns and never contaminate immutable IR reuse.
 */
export function createDistributedCompiledEntityArtifactCache(
  store: DistributedDescriptorCacheStore,
  options: DistributedCompiledEntityArtifactCacheOptions = {},
): CompiledEntityArtifactCache {
  const namespace = normalizeNamespace(options.namespace ?? "metadata:compiled-entity:v2");
  return Object.freeze({
    async getRelease(coordinate: CompiledEntityReleaseCoordinate) {
      try {
        const value = await store.get(compiledReleaseKey(namespace, coordinate));
        return value === null ? undefined : parseCompiledEntityReleaseEnvelope(JSON.parse(value));
      } catch {
        return undefined;
      }
    },
    async setRelease(coordinate: CompiledEntityReleaseCoordinate, release: CompiledEntityReleaseEnvelopeV2, ttlMs: number) {
      try {
        await store.set(compiledReleaseKey(namespace, coordinate), JSON.stringify(release), {
          ttlSeconds: ttl(ttlMs),
        });
      } catch {
        // The source remains authoritative when Redis is unavailable.
      }
    },
    async getArtifact(input: CompiledEntityArtifactReadCoordinate) {
      try {
        const value = await store.get(compiledArtifactKey(namespace, input));
        return value === null ? undefined : parseCompiledEntityArtifact(JSON.parse(value));
      } catch {
        return undefined;
      }
    },
    async setArtifact(input: CompiledEntityArtifactReadCoordinate, artifact: CompiledEntityArtifactV2, ttlMs: number) {
      try {
        await store.set(compiledArtifactKey(namespace, input), JSON.stringify(artifact), {
          ttlSeconds: ttl(ttlMs),
        });
      } catch {
        // Best effort only; the reader re-verifies source content on a miss.
      }
    },
  });
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

function compiledReleaseKey(namespace: string, coordinate: CompiledEntityReleaseCoordinate): string {
  return `${namespace}:release:${digest({
    tenantId: coordinate.tenantId,
    planeKey: coordinate.planeKey,
    entityCode: coordinate.entityCode,
    previewScopeKey: coordinate.previewScopeKey ?? null,
    releaseId: coordinate.releaseId ?? null,
    releaseHash: coordinate.releaseHash ?? null,
  })}`;
}
function compiledArtifactKey(namespace: string, input: CompiledEntityArtifactReadCoordinate): string {
  return `${namespace}:artifact:${digest({
    releaseHash: input.release.releaseHash,
    artifactKey: input.entry.artifactKey,
    hash: input.entry.hash,
  })}`;
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function ttl(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Compiled entity cache TTL must be positive");
  return Math.max(1, Math.ceil(value / 1_000));
}
