import type {
  EntityDescriptorCache,
  EntityDescriptorCoordinate,
  EntityDescriptorRepository,
  EntityRuntimeDescriptor,
  MetadataReader,
  MetadataGenerationCheckpoint,
  MetadataGenerationEvent,
} from "@athyper/server-contract-metadata";

export interface MetadataServiceOptions {
  readonly repository: EntityDescriptorRepository;
  readonly cache?: EntityDescriptorCache;
  readonly cacheTtlMs?: number;
}

export function createMetadataService(options: MetadataServiceOptions): MetadataReader {
  const ttlMs = options.cacheTtlMs ?? 60_000;
  if (!Number.isInteger(ttlMs) || ttlMs < 1) throw new TypeError("Metadata cache TTL must be positive");
  return {
    async getEntityDescriptor(context, entityCode) {
      const coordinate = { tenantId: context.tenantId, principalId: context.principalId, planeKey: context.planeKey, entityCode: normalizeEntityCode(entityCode) };
      const cached = await options.cache?.get(coordinate);
      if (cached !== undefined) return cached;
      const descriptor = await options.repository.findActive(coordinate);
      if (descriptor && (descriptor.entityCode !== coordinate.entityCode || descriptor.planeKey !== coordinate.planeKey)) {
        throw new Error("Plane-local metadata repository returned a mismatched descriptor");
      }
      await options.cache?.set(coordinate, descriptor, ttlMs);
      return descriptor;
    },
  };
}

export function createInMemoryDescriptorCache(): EntityDescriptorCache {
  const values = new Map<string, { value: EntityRuntimeDescriptor | null; expiresAt: number }>();
  return {
    async get(coordinate) {
      const item = values.get(key(coordinate));
      if (!item) return undefined;
      if (item.expiresAt <= Date.now()) { values.delete(key(coordinate)); return undefined; }
      return item.value;
    },
    async set(coordinate, descriptor, ttlMs) { values.set(key(coordinate), { value: descriptor, expiresAt: Date.now() + ttlMs }); },
    async invalidate(coordinate) { values.delete(key(coordinate)); },
  };
}

/** Idempotent handler for durable generation events. Stale/replayed events are harmless. */
export function createMetadataGenerationHandler(options: { cache: EntityDescriptorCache; checkpoint: MetadataGenerationCheckpoint }) {
  return async (event: MetadataGenerationEvent): Promise<boolean> => {
    const coordinate: EntityDescriptorCoordinate = { planeKey: event.planeKey, tenantId: event.tenantId ?? "system", principalId: "generation-event", entityCode: normalizeEntityCode(event.entityCode) };
    const advanced = await options.checkpoint.advance(coordinate, event.generation, event.eventId);
    if (advanced) await options.cache.invalidate(coordinate);
    return advanced;
  };
}

export function createInMemoryGenerationCheckpoint(): MetadataGenerationCheckpoint {
  const generations = new Map<string, number>();
  return {
    async get(coordinate) { return generations.get(generationKey(coordinate)); },
    async advance(coordinate, generation) {
      if (!Number.isSafeInteger(generation) || generation < 1) throw new TypeError("Metadata generation must be a positive integer");
      const coordinateKey = generationKey(coordinate); const current = generations.get(coordinateKey) ?? 0;
      if (generation <= current) return false;
      generations.set(coordinateKey, generation); return true;
    },
  };
}

function key(coordinate: EntityDescriptorCoordinate): string {
  return `${coordinate.planeKey}\0${coordinate.tenantId}\0${coordinate.entityCode}`;
}

function generationKey(coordinate: EntityDescriptorCoordinate): string { return `${coordinate.planeKey}\0${coordinate.tenantId}\0${coordinate.entityCode}`; }

function normalizeEntityCode(value: string): string {
  const code = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(code)) throw new TypeError(`Invalid entity code: ${value}`);
  return code;
}
