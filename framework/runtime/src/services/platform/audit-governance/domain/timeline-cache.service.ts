/**
 * Timeline Cache Service
 *
 * Redis-backed per-entity cache for Activity Timeline queries.
 * Caches the JSON-serialized result of timeline queries keyed by
 * a hash of the query parameters. TTL defaults to 60s.
 *
 * Cache key: timeline:{tenantId}:{entityType}:{entityId}:{queryHash}
 *
 * When no Redis is available, falls back to an in-memory LRU cache
 * suitable for single-process deployments.
 */

import { createHash } from "crypto";

import type { ActivityTimelineEntry, TimelineQuery } from "./activity-timeline.service.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal Redis client interface (subset of ioredis).
 */
export interface TimelineCacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

export interface TimelineCacheOptions {
  /** TTL in seconds (default: 60) */
  ttlSeconds?: number;
  /** Max in-memory entries for LRU fallback (default: 500) */
  maxMemoryEntries?: number;
  /** Key prefix (default: "timeline") */
  prefix?: string;
}

// ============================================================================
// Service
// ============================================================================

export class TimelineCacheService {
  private readonly ttlSeconds: number;
  private readonly prefix: string;
  private readonly redis: TimelineCacheBackend | null;

  // In-memory LRU fallback when Redis is not available
  private readonly memCache: Map<string, { data: string; expiresAt: number }>;
  private readonly maxMemoryEntries: number;

  constructor(redis: TimelineCacheBackend | null, options: TimelineCacheOptions = {}) {
    this.redis = redis;
    this.ttlSeconds = options.ttlSeconds ?? 60;
    this.prefix = options.prefix ?? "timeline";
    this.maxMemoryEntries = options.maxMemoryEntries ?? 500;
    this.memCache = new Map();
  }

  /**
   * Get cached timeline results for a query.
   * Returns null on cache miss.
   */
  async get(query: TimelineQuery): Promise<ActivityTimelineEntry[] | null> {
    const key = this.buildKey(query);

    if (this.redis) {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached, dateReviver);
      }
      return null;
    }

    // In-memory fallback
    const entry = this.memCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return JSON.parse(entry.data, dateReviver);
    }
    if (entry) {
      this.memCache.delete(key); // Expired
    }
    return null;
  }

  /**
   * Store timeline results in cache.
   */
  async set(query: TimelineQuery, results: ActivityTimelineEntry[]): Promise<void> {
    const key = this.buildKey(query);
    const data = JSON.stringify(results);

    if (this.redis) {
      await this.redis.set(key, data, "EX", this.ttlSeconds);
      return;
    }

    // In-memory fallback with LRU eviction
    if (this.memCache.size >= this.maxMemoryEntries) {
      // Evict oldest entry
      const firstKey = this.memCache.keys().next().value;
      if (firstKey) this.memCache.delete(firstKey);
    }

    this.memCache.set(key, {
      data,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    });
  }

  /**
   * Invalidate cached timeline entries for a tenant/entity.
   * Supports partial invalidation:
   *   - invalidate(tenantId) → all cached timelines for this tenant
   *   - invalidate(tenantId, entityType) → all for this entity type
   *   - invalidate(tenantId, entityType, entityId) → specific entity
   */
  async invalidate(tenantId: string, entityType?: string, entityId?: string): Promise<number> {
    let pattern: string;
    if (entityType && entityId) {
      pattern = `${this.prefix}:${tenantId}:${entityType}:${entityId}:*`;
    } else if (entityType) {
      pattern = `${this.prefix}:${tenantId}:${entityType}:*`;
    } else {
      pattern = `${this.prefix}:${tenantId}:*`;
    }

    if (this.redis) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        return this.redis.del(...keys);
      }
      return 0;
    }

    // In-memory: match pattern manually
    const regexPattern = pattern.replace(/\*/g, ".*");
    const regex = new RegExp(`^${regexPattern}$`);
    let count = 0;

    for (const key of this.memCache.keys()) {
      if (regex.test(key)) {
        this.memCache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all cached entries.
   */
  async clear(): Promise<void> {
    if (this.redis) {
      const keys = await this.redis.keys(`${this.prefix}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return;
    }

    this.memCache.clear();
  }

  /**
   * Get cache statistics.
   */
  get stats(): { size: number; backend: "redis" | "memory" } {
    return {
      size: this.memCache.size,
      backend: this.redis ? "redis" : "memory",
    };
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private buildKey(query: TimelineQuery): string {
    const entityType = query.entityType ?? "*";
    const entityId = query.entityId ?? "*";
    const hash = this.hashQuery(query);
    return `${this.prefix}:${query.tenantId}:${entityType}:${entityId}:${hash}`;
  }

  private hashQuery(query: TimelineQuery): string {
    const normalized = JSON.stringify({
      tenantId: query.tenantId,
      entityType: query.entityType,
      entityId: query.entityId,
      actorUserId: query.actorUserId,
      startDate: query.startDate?.toISOString(),
      endDate: query.endDate?.toISOString(),
      sources: query.sources?.sort(),
      limit: query.limit,
      offset: query.offset,
    });
    return createHash("sha256").update(normalized).digest("hex").substring(0, 12);
  }
}

// ============================================================================
// Utility
// ============================================================================

/**
 * JSON reviver that converts ISO date strings back to Date objects.
 */
function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value);
  }
  return value;
}

// ============================================================================
// Factory
// ============================================================================

export function createTimelineCacheService(
  redis: TimelineCacheBackend | null,
  options?: TimelineCacheOptions,
): TimelineCacheService {
  return new TimelineCacheService(redis, options);
}
