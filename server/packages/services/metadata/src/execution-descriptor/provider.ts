import {
  hydrateExecutionDescriptor,
  serializeExecutionDescriptor,
  type ExecutionDescriptorV1,
  type SerializedExecutionDescriptorV1,
} from "./contract.js";
import { withFrameworkPhase } from "@athyper/adapter-telemetry";

export type ExecutionDescriptorPlane = "neon" | "mesh" | "admin";

export interface ExecutionDescriptorIdentity {
  readonly plane: ExecutionDescriptorPlane;
  readonly tenantId: string;
  readonly entityCode: string;
}

export interface ExecutionDescriptorRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export type ExecutionDescriptorCacheState = "L0" | "L1" | "L2" | "L3" | "L3_REDIS_DEGRADED";

export interface ExecutionDescriptorProviderResult {
  readonly descriptor: ExecutionDescriptorV1;
  readonly serialized: SerializedExecutionDescriptorV1;
  readonly generation: string;
  readonly cacheState: ExecutionDescriptorCacheState;
}

export interface ExecutionDescriptorProviderMetrics {
  readonly cacheState: ExecutionDescriptorCacheState;
  readonly identity: ExecutionDescriptorIdentity;
  readonly durationMs: number;
  readonly payloadBytes?: number;
}

export interface ExecutionDescriptorProviderStats {
  readonly l0Hits: number;
  readonly l1Hits: number;
  readonly l2Hits: number;
  readonly l3Loads: number;
  readonly redisDegradedLoads: number;
  readonly evictions: number;
  readonly invalidations: number;
}

export interface ExecutionDescriptorProviderOptions {
  readonly redis?: ExecutionDescriptorRedis;
  readonly loadFromL3: (identity: ExecutionDescriptorIdentity) => Promise<SerializedExecutionDescriptorV1 | ExecutionDescriptorV1 | null>;
  readonly l1Limit?: number;
  readonly l1TtlMs?: number;
  readonly l2TtlSeconds?: number;
  readonly now?: () => number;
  readonly observe?: (metric: ExecutionDescriptorProviderMetrics) => void;
  readonly logger?: { warn(event: string, fields?: Record<string, unknown>): void };
  readonly generationCacheTtlMs?: number;
}

interface L1Entry {
  readonly descriptor: ExecutionDescriptorV1;
  readonly serialized: SerializedExecutionDescriptorV1;
  readonly expiresAt: number;
}

interface GenerationRead { readonly value: string; readonly redisHealthy: boolean }

const GLOBAL_SCOPE = "__all__";
const DEFAULT_L1_LIMIT = 1_000;
const DEFAULT_L1_TTL_MS = 5 * 60_000;
const DEFAULT_L2_TTL_SECONDS = 24 * 60 * 60;
// Callers must opt into local generation caching once they have an exact
// invalidation subscription. Keeping the library default uncached preserves
// correctness for standalone workers and test adapters.
const DEFAULT_GENERATION_CACHE_TTL_MS = 0;

/** Exact generation key. `__all__` denotes an explicitly broad scope. */
export function executionDescriptorGenerationKey(plane: string, tenantId: string, entityCode: string): string {
  return `execdesc:gen:v1:${plane}:${tenantId}:${entityCode}`;
}

export function executionDescriptorPayloadKey(plane: string, tenantId: string, entityCode: string, compiledHash: string): string {
  return `execdesc:v1:${plane}:${tenantId}:${entityCode}:${compiledHash}`;
}

function executionDescriptorHeadKey(identity: ExecutionDescriptorIdentity, generation: string): string {
  return `execdesc:head:v1:${identity.plane}:${identity.tenantId}:${identity.entityCode}:${generation}`;
}

export function executionDescriptorGenerationKeys(identity: ExecutionDescriptorIdentity): readonly string[] {
  return [
    executionDescriptorGenerationKey(GLOBAL_SCOPE, GLOBAL_SCOPE, GLOBAL_SCOPE),
    executionDescriptorGenerationKey(identity.plane, GLOBAL_SCOPE, GLOBAL_SCOPE),
    executionDescriptorGenerationKey(identity.plane, GLOBAL_SCOPE, identity.entityCode),
    executionDescriptorGenerationKey(identity.plane, identity.tenantId, GLOBAL_SCOPE),
    executionDescriptorGenerationKey(identity.plane, identity.tenantId, identity.entityCode),
  ];
}

export class ExecutionDescriptorNotFoundError extends Error {
  constructor(readonly identity: ExecutionDescriptorIdentity) {
    super(`Execution descriptor '${identity.entityCode}' was not found for tenant '${identity.tenantId}'.`);
    this.name = "ExecutionDescriptorNotFoundError";
  }
}

export class ExecutionDescriptorProvider {
  private readonly l1 = new Map<string, L1Entry>();
  private readonly l1Heads = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<ExecutionDescriptorProviderResult>>();
  private readonly localDegradedGeneration = new Map<string, number>();
  private readonly generationCache = new Map<string, { value: string; expiresAt: number }>();
  private readonly counters = { l0Hits: 0, l1Hits: 0, l2Hits: 0, l3Loads: 0, redisDegradedLoads: 0, evictions: 0, invalidations: 0 };

  constructor(private readonly options: ExecutionDescriptorProviderOptions) {}

  async get(identity: ExecutionDescriptorIdentity, requestMemo?: Map<string, Promise<ExecutionDescriptorProviderResult>>): Promise<ExecutionDescriptorProviderResult> {
    return withFrameworkPhase("descriptor_hydrate", () => this.getMeasured(identity, requestMemo));
  }

  private async getMeasured(identity: ExecutionDescriptorIdentity, requestMemo?: Map<string, Promise<ExecutionDescriptorProviderResult>>): Promise<ExecutionDescriptorProviderResult> {
    const scope = scopeKey(identity);
    const existing = requestMemo?.get(scope);
    if (existing) {
      this.counters.l0Hits += 1;
      const result = await existing;
      return { ...result, cacheState: "L0" };
    }
    const promise = this.load(identity, 0);
    requestMemo?.set(scope, promise);
    try {
      return await promise;
    } catch (error) {
      requestMemo?.delete(scope);
      throw error;
    }
  }

  /** Called by an in-process subscriber so an outage cannot retain a known-stale L1 entry. */
  invalidate(identity: Partial<ExecutionDescriptorIdentity>): number {
    let removed = 0;
    for (const key of [...this.l1.keys()]) {
      const [plane, tenantId, entityCode] = key.split("\0", 3);
      if ((identity.plane === undefined || identity.plane === plane)
        && (identity.tenantId === undefined || identity.tenantId === tenantId)
        && (identity.entityCode === undefined || identity.entityCode === entityCode)) {
        this.deleteL1(key);
        removed += 1;
      }
    }
    this.applyInvalidation(identity);
    return removed;
  }

  /** Apply an exact Redis invalidation notification to this process. */
  applyInvalidation(identity: Partial<ExecutionDescriptorIdentity>): void {
    this.counters.invalidations += 1;
    for (const key of [...this.l1.keys()]) {
      const [plane, tenantId, entityCode] = key.split("\0", 3);
      if ((identity.plane === undefined || identity.plane === plane)
        && (identity.tenantId === undefined || identity.tenantId === tenantId)
        && (identity.entityCode === undefined || identity.entityCode === entityCode)) {
        this.deleteL1(key);
      }
    }
    for (const key of [...this.generationCache.keys()]) {
      const [plane, tenantId, entityCode] = key.split("\0", 3);
      if ((identity.plane === undefined || identity.plane === plane)
        && (identity.tenantId === undefined || identity.tenantId === tenantId)
        && (identity.entityCode === undefined || identity.entityCode === entityCode)) {
        this.generationCache.delete(key);
      }
    }
    const scope = `${identity.plane ?? GLOBAL_SCOPE}\0${identity.tenantId ?? GLOBAL_SCOPE}\0${identity.entityCode ?? GLOBAL_SCOPE}`;
    this.localDegradedGeneration.set(scope, (this.localDegradedGeneration.get(scope) ?? 0) + 1);
  }

  get size(): number { return this.l1.size; }
  get stats(): ExecutionDescriptorProviderStats { return Object.freeze({ ...this.counters }); }

  private async load(identity: ExecutionDescriptorIdentity, retry: number): Promise<ExecutionDescriptorProviderResult> {
    const startedAt = performance.now();
    const generation = await this.readGeneration(identity);
    const flightKey = `${scopeKey(identity)}\0${generation.value}`;
    const active = this.inFlight.get(flightKey);
    if (active) return active;
    const promise = this.loadAtGeneration(identity, generation, retry, startedAt);
    this.inFlight.set(flightKey, promise);
    try { return await promise; }
    finally { if (this.inFlight.get(flightKey) === promise) this.inFlight.delete(flightKey); }
  }

  private async loadAtGeneration(identity: ExecutionDescriptorIdentity, generation: GenerationRead, retry: number, startedAt: number): Promise<ExecutionDescriptorProviderResult> {
    const head = `${scopeKey(identity)}\0${generation.value}`;
    const cachedKey = this.l1Heads.get(head);
    if (cachedKey) {
      const entry = this.l1.get(cachedKey);
      if (entry && entry.expiresAt > this.now()) {
        this.touchL1(cachedKey, entry);
        return this.finish(identity, generation.value, "L1", entry, startedAt);
      }
      if (entry) this.deleteL1(cachedKey);
      else this.l1Heads.delete(head);
    }

    if (generation.redisHealthy && this.options.redis) {
      try {
        const hash = await this.options.redis.get(executionDescriptorHeadKey(identity, generation.value));
        if (hash) {
          const raw = await this.options.redis.get(executionDescriptorPayloadKey(identity.plane, identity.tenantId, identity.entityCode, hash));
          if (raw) {
            const descriptor = hydrateExecutionDescriptor(JSON.parse(raw) as unknown);
            const current = await this.readGeneration(identity);
            if (current.redisHealthy && current.value !== generation.value && retry < 2) return this.load(identity, retry + 1);
            if (current.redisHealthy && current.value === generation.value) {
              const entry = { descriptor, serialized: serializeExecutionDescriptor(descriptor), expiresAt: this.now() + this.l1TtlMs };
              this.setL1(l1Key(identity, generation.value, descriptor.identity.compiledHash), entry);
              return this.finish(identity, generation.value, "L2", entry, startedAt, raw.length);
            }
          }
        }
      } catch (error) {
        this.warnRedis("execution_descriptor_l2_read_failed", identity, error);
      }
    }

    const loaded = await this.options.loadFromL3(identity);
    if (!loaded) throw new ExecutionDescriptorNotFoundError(identity);
    const serialized = isExecutionDescriptor(loaded) ? serializeExecutionDescriptor(loaded) : loaded;
    const descriptor = hydrateExecutionDescriptor(serialized);
    const raw = JSON.stringify(serializeExecutionDescriptor(descriptor));
    const entry = { descriptor, serialized: JSON.parse(raw) as SerializedExecutionDescriptorV1, expiresAt: this.now() + this.l1TtlMs };

    if (!generation.redisHealthy || !this.options.redis) {
      return this.finish(identity, generation.value, "L3_REDIS_DEGRADED", entry, startedAt, raw.length);
    }

    const beforeFill = await this.readGeneration(identity);
    if (!beforeFill.redisHealthy) return this.finish(identity, generation.value, "L3_REDIS_DEGRADED", entry, startedAt, raw.length);
    if (beforeFill.value !== generation.value) {
      if (retry < 2) return this.load(identity, retry + 1);
      return this.finish(identity, beforeFill.value, "L3_REDIS_DEGRADED", entry, startedAt, raw.length);
    }

    try {
      await this.options.redis.set(executionDescriptorPayloadKey(identity.plane, identity.tenantId, identity.entityCode, descriptor.identity.compiledHash), raw, this.l2TtlSeconds);
      await this.options.redis.set(executionDescriptorHeadKey(identity, generation.value), descriptor.identity.compiledHash, this.l2TtlSeconds);
      const afterFill = await this.readGeneration(identity);
      if (afterFill.redisHealthy && afterFill.value === generation.value) {
        this.setL1(l1Key(identity, generation.value, descriptor.identity.compiledHash), entry);
      }
    } catch (error) {
      this.warnRedis("execution_descriptor_l2_write_failed", identity, error);
      return this.finish(identity, generation.value, "L3_REDIS_DEGRADED", entry, startedAt, raw.length);
    }
    return this.finish(identity, generation.value, "L3", entry, startedAt, raw.length);
  }

  private async readGeneration(identity: ExecutionDescriptorIdentity): Promise<GenerationRead> {
    if (!this.options.redis) return { value: `local:${this.degradedGeneration(identity)}`, redisHealthy: false };
    const scope = scopeKey(identity);
    const cached = this.generationCache.get(scope);
    if (cached && cached.expiresAt > this.now()) return { value: cached.value, redisHealthy: true };
    if (cached) this.generationCache.delete(scope);
    try {
      const values = await Promise.all(executionDescriptorGenerationKeys(identity).map((key) => this.options.redis!.get(key)));
      const value = values.map(normalizeGeneration).join(".");
      const ttlMs = this.options.generationCacheTtlMs ?? DEFAULT_GENERATION_CACHE_TTL_MS;
      if (ttlMs > 0) this.generationCache.set(scope, { value, expiresAt: this.now() + ttlMs });
      return { value, redisHealthy: true };
    } catch (error) {
      this.warnRedis("execution_descriptor_generation_read_failed", identity, error);
      return { value: `local:${this.degradedGeneration(identity)}`, redisHealthy: false };
    }
  }

  private degradedGeneration(identity: ExecutionDescriptorIdentity): number {
    return [
      `${GLOBAL_SCOPE}\0${GLOBAL_SCOPE}\0${GLOBAL_SCOPE}`,
      `${identity.plane}\0${GLOBAL_SCOPE}\0${GLOBAL_SCOPE}`,
      `${identity.plane}\0${GLOBAL_SCOPE}\0${identity.entityCode}`,
      `${identity.plane}\0${identity.tenantId}\0${GLOBAL_SCOPE}`,
      scopeKey(identity),
    ].reduce((sum, key) => sum + (this.localDegradedGeneration.get(key) ?? 0), 0);
  }

  private setL1(key: string, entry: L1Entry): void {
    this.deleteL1(key); this.l1.set(key, entry);
    this.l1Heads.set(key.slice(0, key.lastIndexOf("\0")), key);
    while (this.l1.size > (this.options.l1Limit ?? DEFAULT_L1_LIMIT)) {
      const oldest = this.l1.keys().next().value as string | undefined;
      if (!oldest) break;
      this.deleteL1(oldest);
      this.counters.evictions += 1;
    }
  }

  private touchL1(key: string, entry: L1Entry): void { this.l1.delete(key); this.l1.set(key, entry); }

  private deleteL1(key: string): void {
    this.l1.delete(key);
    const head = key.slice(0, key.lastIndexOf("\0"));
    if (this.l1Heads.get(head) === key) this.l1Heads.delete(head);
  }

  private finish(identity: ExecutionDescriptorIdentity, generation: string, cacheState: ExecutionDescriptorCacheState, entry: L1Entry, startedAt: number, payloadBytes?: number): ExecutionDescriptorProviderResult {
    if (cacheState === "L1") this.counters.l1Hits += 1;
    else if (cacheState === "L2") this.counters.l2Hits += 1;
    else if (cacheState === "L3") this.counters.l3Loads += 1;
    else if (cacheState === "L3_REDIS_DEGRADED") this.counters.redisDegradedLoads += 1;
    this.options.observe?.({ identity, cacheState, durationMs: performance.now() - startedAt, payloadBytes });
    return { descriptor: entry.descriptor, serialized: entry.serialized, generation, cacheState };
  }

  private warnRedis(event: string, identity: ExecutionDescriptorIdentity, error: unknown): void {
    this.options.logger?.warn(event, { ...identity, err: String(error) });
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }
  private get l1TtlMs(): number { return this.options.l1TtlMs ?? DEFAULT_L1_TTL_MS; }
  private get l2TtlSeconds(): number { return this.options.l2TtlSeconds ?? DEFAULT_L2_TTL_SECONDS; }
}

function scopeKey(identity: ExecutionDescriptorIdentity): string { return `${identity.plane}\0${identity.tenantId}\0${identity.entityCode}`; }
function l1Key(identity: ExecutionDescriptorIdentity, generation: string, hash: string): string { return `${scopeKey(identity)}\0${generation}\0${hash}`; }
function normalizeGeneration(value: string | null): string {
  if (value === null) return "0";
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? String(parsed) : "0";
}
function isExecutionDescriptor(value: SerializedExecutionDescriptorV1 | ExecutionDescriptorV1): value is ExecutionDescriptorV1 {
  return !Array.isArray(value.fields);
}
