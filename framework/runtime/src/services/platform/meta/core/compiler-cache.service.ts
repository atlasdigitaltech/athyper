/**
 * Compiler Cache Service
 *
 * Provides multi-tier caching for compiled entity models:
 * - L1: In-memory LRU cache per tenant
 * - L2: Redis (optional second level)
 * - Stampede protection: Single-flight compilation per tenant+entityVersionId
 *
 * Phase 15.3: Caching strategy for compiled + policy + route
 */

import { createHash } from "node:crypto";

import type {
  CompiledModel,
  EntitySchema,
  MetaCompiler,
  ValidationResult,
} from "@athyper/core/meta";
import type { Redis } from "ioredis";

/**
 * LRU Cache entry
 */
type CacheEntry<T> = {
  value: T;
  timestamp: number;
  accessCount: number;
};

/**
 * In-flight compilation promise
 * For stampede protection
 */
type InFlightCompilation = Promise<CompiledModel>;

/**
 * Simple LRU Cache implementation
 */
class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];

  constructor(private readonly maxSize: number = 1000) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Update access count and order
    entry.accessCount++;
    entry.timestamp = Date.now();
    this.updateAccessOrder(key);

    return entry.value;
  }

  set(key: string, value: T): void {
    // If at capacity, evict LRU entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Add/update entry
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 1,
    });

    this.updateAccessOrder(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  private evictLRU(): void {
    // Remove least recently used (first in access order)
    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: (this.cache.size / this.maxSize) * 100,
    };
  }
}

/**
 * Compiler cache configuration
 */
export type CompilerCacheConfig = {
  /** Redis client for L2 cache (optional) */
  redis?: Redis;

  /** L1 cache max size per tenant (default: 100) */
  l1MaxSize?: number;

  /** L2 TTL in seconds (default: 3600 = 1 hour) */
  l2TTL?: number;

  /** Enable L2 cache (default: true if redis provided) */
  enableL2?: boolean;
};

/**
 * Cache metrics for monitoring (Phase 1.3)
 */
type CacheMetrics = {
  /** L1 cache hits */
  l1Hits: number;

  /** L2 cache hits */
  l2Hits: number;

  /** Cache misses */
  misses: number;

  /** Stampede protection saves (requests that reused in-flight compilation) */
  stampedeSaves: number;

  /** Total compilations */
  totalCompilations: number;

  /** Total cache size (L1 entries) */
  l1Size: number;

  /** In-flight compilations count */
  inFlightCount: number;
};

/**
 * Compiler Cache Service
 *
 * Wraps MetaCompiler with multi-tier caching and stampede protection
 */
export class CompilerCacheService implements MetaCompiler {
  // L1: In-memory LRU per tenant
  private l1Cache = new Map<string, LRUCache<CompiledModel>>();

  // Stampede protection: Track in-flight compilations
  private inFlight = new Map<string, InFlightCompilation>();

  // Cache metrics (Phase 1.3)
  private metrics: CacheMetrics = {
    l1Hits: 0,
    l2Hits: 0,
    misses: 0,
    stampedeSaves: 0,
    totalCompilations: 0,
    l1Size: 0,
    inFlightCount: 0,
  };

  private readonly config: Required<CompilerCacheConfig>;

  constructor(
    private readonly compiler: MetaCompiler,
    config: CompilerCacheConfig = {}
  ) {
    this.config = {
      redis: config.redis,
      l1MaxSize: config.l1MaxSize ?? 100,
      l2TTL: config.l2TTL ?? 3600,
      enableL2: config.enableL2 ?? !!config.redis,
    } as Required<CompilerCacheConfig>;
  }

  /**
   * Compile entity model with caching
   */
  async compile(entityName: string, version: string): Promise<CompiledModel> {
    // CRITICAL: Always use tenant isolation for cache keys
    // For now, use "default" tenant - should be passed from RequestContext
    const tenantId = "default";

    // TODO: Accept overlaySet as parameter
    const overlaySet: string[] = [];

    const cacheKey = this.getCacheKey(tenantId, entityName, version, overlaySet);

    // L1: Check in-memory cache first
    const l1Result = await this.checkL1Cache(tenantId, cacheKey);
    if (l1Result) {
      this.metrics.l1Hits++;
      console.log(
        JSON.stringify({
          msg: "compiler_cache_hit_l1",
          entityName,
          version,
          tenantId,
        })
      );
      return l1Result;
    }

    // L2: Check Redis cache
    if (this.config.enableL2 && this.config.redis) {
      const l2Result = await this.checkL2Cache(cacheKey);
      if (l2Result) {
        this.metrics.l2Hits++;
        console.log(
          JSON.stringify({
            msg: "compiler_cache_hit_l2",
            entityName,
            version,
            tenantId,
          })
        );
        // Promote to L1
        this.setL1Cache(tenantId, cacheKey, l2Result);
        return l2Result;
      }
    }

    // Cache miss
    this.metrics.misses++;

    // Cache miss: Compile with stampede protection
    return this.compileWithStampedeProtection(tenantId, entityName, version, cacheKey);
  }

  /**
   * Compile with stampede protection (single-flight)
   * Prevents multiple concurrent compilations of the same entity+version
   */
  private async compileWithStampedeProtection(
    tenantId: string,
    entityName: string,
    version: string,
    cacheKey: string
  ): Promise<CompiledModel> {
    // Check if compilation already in flight
    const inFlightPromise = this.inFlight.get(cacheKey);
    if (inFlightPromise) {
      this.metrics.stampedeSaves++;
      console.log(
        JSON.stringify({
          msg: "compiler_stampede_protected",
          entityName,
          version,
          tenantId,
          stampedeSaves: this.metrics.stampedeSaves,
        })
      );
      return inFlightPromise;
    }

    // Start new compilation
    console.log(
      JSON.stringify({
        msg: "compiler_cache_miss",
        entityName,
        version,
        tenantId,
      })
    );

    const compilationPromise = this.compiler.compile(entityName, version);

    // Track in-flight
    this.inFlight.set(cacheKey, compilationPromise);
    this.metrics.inFlightCount = this.inFlight.size;
    this.metrics.totalCompilations++;

    try {
      const result = await compilationPromise;

      // Store in L1 cache
      this.setL1Cache(tenantId, cacheKey, result);

      // Store in L2 cache (Redis)
      if (this.config.enableL2 && this.config.redis) {
        await this.setL2Cache(cacheKey, result);
      }

      return result;
    } finally {
      // Remove from in-flight tracking
      this.inFlight.delete(cacheKey);
      this.metrics.inFlightCount = this.inFlight.size;
    }
  }

  /**
   * Force recompilation (bypass cache)
   */
  async recompile(entityName: string, version: string): Promise<CompiledModel> {
    // Invalidate cache first
    await this.invalidateCache(entityName, version);

    // Then compile (will populate cache again)
    return this.compile(entityName, version);
  }

  /**
   * Get compiled model from cache (if exists)
   */
  async getCached(
    entityName: string,
    version: string
  ): Promise<CompiledModel | undefined> {
    const tenantId = "default";
    const overlaySet: string[] = [];
    const cacheKey = this.getCacheKey(tenantId, entityName, version, overlaySet);

    // Check L1
    const l1Result = await this.checkL1Cache(tenantId, cacheKey);
    if (l1Result) {
      return l1Result;
    }

    // Check L2
    if (this.config.enableL2 && this.config.redis) {
      const l2Result = await this.checkL2Cache(cacheKey);
      if (l2Result) {
        // Promote to L1
        this.setL1Cache(tenantId, cacheKey, l2Result);
        return l2Result;
      }
    }

    return undefined;
  }

  /**
   * Precompile all active entity versions
   * Useful for warming cache on startup
   */
  async precompileAll(): Promise<CompiledModel[]> {
    // Delegate to underlying compiler
    const results = await this.compiler.precompileAll();

    // Populate cache with results
    const tenantId = "default";
    const overlaySet: string[] = [];
    for (const model of results) {
      const cacheKey = this.getCacheKey(tenantId, model.entityName, model.version, overlaySet);
      this.setL1Cache(tenantId, cacheKey, model);

      if (this.config.enableL2 && this.config.redis) {
        await this.setL2Cache(cacheKey, model);
      }
    }

    console.log(
      JSON.stringify({
        msg: "compiler_precompile_all_complete",
        count: results.length,
      })
    );

    return results;
  }

  /**
   * Invalidate cache for entity
   */
  async invalidateCache(entityName: string, version: string): Promise<void> {
    // For now, clear entire cache (should be tenant-specific)
    const tenantId = "default";
    const overlaySet: string[] = [];
    const cacheKey = this.getCacheKey(tenantId, entityName, version, overlaySet);

    // Clear L1
    const l1 = this.l1Cache.get(tenantId);
    if (l1) {
      l1.delete(cacheKey);
    }

    // Clear L2
    if (this.config.redis) {
      await this.config.redis.del(`compiler:${cacheKey}`);
    }

    // Delegate to underlying compiler
    await this.compiler.invalidateCache(entityName, version);

    console.log(
      JSON.stringify({
        msg: "compiler_cache_invalidated",
        entityName,
        version,
        tenantId,
      })
    );
  }

  /**
   * Validate entity schema
   */
  async validate(schema: EntitySchema): Promise<ValidationResult> {
    return this.compiler.validate(schema);
  }

  /**
   * Health check
   */
  /**
   * Get cache metrics (Phase 1.3)
   */
  getMetrics(): CacheMetrics {
    // Update L1 size
    let totalL1Size = 0;
    for (const cache of this.l1Cache.values()) {
      totalL1Size += cache.size; // size is a property, not a method
    }
    this.metrics.l1Size = totalL1Size;
    this.metrics.inFlightCount = this.inFlight.size;

    return { ...this.metrics };
  }

  /**
   * Get cache hit ratio
   */
  getCacheHitRatio(): number {
    const totalRequests = this.metrics.l1Hits + this.metrics.l2Hits + this.metrics.misses;
    if (totalRequests === 0) return 0;

    const hits = this.metrics.l1Hits + this.metrics.l2Hits;
    return hits / totalRequests;
  }

  async healthCheck() {
    const compilerHealth = await this.compiler.healthCheck();
    const metrics = this.getMetrics();
    const hitRatio = this.getCacheHitRatio();

    return {
      healthy: compilerHealth.healthy,
      message: compilerHealth.healthy
        ? "CompilerCache healthy"
        : "CompilerCache unhealthy (underlying compiler issue)",
      details: {
        compiler: compilerHealth,
        l1Stats: this.getL1Stats(),
        inFlightCount: this.inFlight.size,
        metrics: {
          ...metrics,
          hitRatio: (hitRatio * 100).toFixed(2) + "%",
        },
      },
    };
  }

  // ============================================================================
  // Cache Helpers
  // ============================================================================

  /**
   * Get cache key with overlay set included (Phase 1.3)
   *
   * Cache key format: {tenant}:{entity}:{version}:{overlayHash}
   * - tenant: tenant ID for isolation
   * - entity: entity name
   * - version: entity version
   * - overlayHash: SHA-256 hash of sorted overlay set (or "none")
   *
   * This ensures single-flight compilation per (tenantId, entityVersionId, overlaySet)
   */
  private getCacheKey(
    tenantId: string,
    entityName: string,
    version: string,
    overlaySet: string[] = []
  ): string {
    // Sort overlay set for deterministic hash
    const sortedOverlays = [...overlaySet].sort();

    // Hash overlay set if present
    const overlayHash =
      sortedOverlays.length > 0
        ? this.hashOverlaySet(sortedOverlays)
        : "none";

    return `${tenantId}:${entityName}:${version}:${overlayHash}`;
  }

  /**
   * Hash overlay set for cache key
   */
  private hashOverlaySet(overlaySet: string[]): string {
    const hash = createHash("sha256")
      .update(JSON.stringify(overlaySet))
      .digest("hex");
    return hash.substring(0, 16); // Use first 16 chars for brevity
  }

  private checkL1Cache(tenantId: string, cacheKey: string): CompiledModel | undefined {
    const cache = this.l1Cache.get(tenantId);
    return cache?.get(cacheKey);
  }

  private setL1Cache(tenantId: string, cacheKey: string, model: CompiledModel): void {
    let cache = this.l1Cache.get(tenantId);
    if (!cache) {
      cache = new LRUCache<CompiledModel>(this.config.l1MaxSize);
      this.l1Cache.set(tenantId, cache);
    }
    cache.set(cacheKey, model);
  }

  private async checkL2Cache(cacheKey: string): Promise<CompiledModel | undefined> {
    if (!this.config.redis) return undefined;

    try {
      const cached = await this.config.redis.get(`compiler:${cacheKey}`);
      if (!cached) return undefined;

      return JSON.parse(cached) as CompiledModel;
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "compiler_cache_l2_read_error",
          error: String(error),
        })
      );
      return undefined;
    }
  }

  private async setL2Cache(cacheKey: string, model: CompiledModel): Promise<void> {
    if (!this.config.redis) return;

    try {
      await this.config.redis.setex(
        `compiler:${cacheKey}`,
        this.config.l2TTL,
        JSON.stringify(model)
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "compiler_cache_l2_write_error",
          error: String(error),
        })
      );
    }
  }

  private getL1Stats() {
    const tenantStats: Record<string, any> = {};

    for (const [tenantId, cache] of this.l1Cache.entries()) {
      tenantStats[tenantId] = cache.getStats();
    }

    return tenantStats;
  }
}
