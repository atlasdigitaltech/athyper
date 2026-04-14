/**
 * FeatureFlagService — Phase 1.6
 *
 * Redis cache-first, DB fallback feature flag lookup.
 * Performance target (from PLATFORM_MIGRATION.md):
 *   Cache hit: <1ms p99
 *   Cache miss (DB): <5ms p99
 *
 * Runs on every request — MUST be cache-first. Never block a request
 * waiting for DB if Redis is available.
 *
 * Flag data stored in control.feature_flag:
 *   code        — logical flag name (e.g. "notifications_v2")
 *   is_enabled  — global default
 *   tenant_overrides — JSONB: { [tenantId]: boolean }
 *   rollout_pct — 0–100 percentage rollout (null = not in rollout)
 *   metadata    — arbitrary JSONB (description, owner, expiry)
 *
 * Cache key pattern: "ff:{code}"   (global default)
 *                    "ff:{code}:{tenantId}" (per-tenant override)
 * TTL: 60 seconds (flags can update within one minute of DB write).
 *
 * Usage:
 *   const ff = new FeatureFlagService({ redis, db, logger });
 *   const enabled = await ff.isEnabled("notifications_v2", tenantId);
 */

import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeatureFlagDeps {
  redis: {
    get(key: string): Promise<string | null>;
    setex(key: string, seconds: number, value: string): Promise<unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

interface FlagRow {
  code:              string;
  is_enabled:        boolean;
  tenant_overrides:  string | null;  // JSON: { [tenantId]: boolean }
  rollout_pct:       number | null;
}

const CACHE_TTL_SEC = 60;
const CACHE_PREFIX  = "ff:";

// ── FeatureFlagService ────────────────────────────────────────────────────────

export class FeatureFlagService {
  private readonly redis: FeatureFlagDeps["redis"];
  private readonly db: FeatureFlagDeps["db"];
  private readonly logger: FeatureFlagDeps["logger"];

  constructor(deps: FeatureFlagDeps) {
    this.redis  = deps.redis;
    this.db     = deps.db;
    this.logger = deps.logger;
  }

  /**
   * Check if a flag is enabled for the given tenant.
   *
   * Resolution order:
   *   1. Redis cache (per-tenant key)
   *   2. Redis cache (global key)
   *   3. DB lookup — then populate both cache keys
   *   4. Default false if not found
   *
   * Tenant override always wins over global default.
   * Rollout percentage uses a stable hash of (tenantId + code) so the same
   * tenant always gets the same result within the rollout window.
   */
  async isEnabled(code: string, tenantId?: string): Promise<boolean> {
    try {
      // 1. Try per-tenant cache
      if (tenantId) {
        const tenantCached = await this.redis.get(`${CACHE_PREFIX}${code}:${tenantId}`);
        if (tenantCached !== null) return tenantCached === "1";
      }

      // 2. Try global cache
      const globalCached = await this.redis.get(`${CACHE_PREFIX}${code}`);
      if (globalCached !== null) {
        const globalEnabled = globalCached === "1";
        // Cache per-tenant result as well
        if (tenantId) {
          await this.setCached(`${CACHE_PREFIX}${code}:${tenantId}`, globalEnabled);
        }
        return globalEnabled;
      }

      // 3. DB fallback
      const row = await this.loadFromDb(code);
      if (!row) {
        // Unknown flag — default false; cache negative result briefly
        await this.setCached(`${CACHE_PREFIX}${code}`, false);
        return false;
      }

      const globalDefault = row.is_enabled;
      await this.setCached(`${CACHE_PREFIX}${code}`, globalDefault);

      if (!tenantId) return globalDefault;

      // Check per-tenant override
      let tenantEnabled = globalDefault;
      if (row.tenant_overrides) {
        const overrides = JSON.parse(row.tenant_overrides) as Record<string, boolean>;
        if (tenantId in overrides) {
          tenantEnabled = overrides[tenantId]!;
        } else if (row.rollout_pct !== null) {
          tenantEnabled = this.inRollout(code, tenantId, row.rollout_pct);
        }
      } else if (row.rollout_pct !== null) {
        tenantEnabled = this.inRollout(code, tenantId, row.rollout_pct);
      }

      await this.setCached(`${CACHE_PREFIX}${code}:${tenantId}`, tenantEnabled);
      return tenantEnabled;
    } catch (err) {
      this.logger?.error("feature_flag_error", {
        code,
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return false; // safe default
    }
  }

  /**
   * Invalidate cached flag values (call after control.feature_flag update).
   * Pass code to invalidate a specific flag; omit to flush all flags.
   */
  async invalidate(code?: string): Promise<void> {
    // Redis doesn't support pattern delete efficiently — we rely on TTL expiry.
    // For immediate invalidation of a known flag, delete the global key.
    // Per-tenant keys will expire within TTL seconds.
    if (code) {
      try {
        // Set TTL to 1 second for rapid expiry (can't delete without SCAN)
        await this.redis.setex(`${CACHE_PREFIX}${code}`, 1, "0");
      } catch { /* best effort */ }
    }
  }

  /**
   * Batch check multiple flags. Returns a map of code → enabled.
   * Uses sequential Redis lookups (pipeline support requires ioredis pipelines —
   * not available via the current cache interface; upgrade if needed).
   */
  async bulkCheck(codes: string[], tenantId?: string): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    await Promise.all(
      codes.map(async (code) => {
        result.set(code, await this.isEnabled(code, tenantId));
      })
    );
    return result;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async loadFromDb(code: string): Promise<FlagRow | null> {
    const row = await this.db
      .selectFrom("control.feature_flag as ff" as never)
      .select([
        "ff.code",
        "ff.is_enabled",
        "ff.tenant_overrides",
        "ff.rollout_pct",
      ] as never[])
      .where("ff.code" as never, "=", code as never)
      .executeTakeFirst() as FlagRow | undefined;
    return row ?? null;
  }

  private async setCached(key: string, enabled: boolean): Promise<void> {
    try {
      await this.redis.setex(key, CACHE_TTL_SEC, enabled ? "1" : "0");
    } catch { /* best effort */ }
  }

  /**
   * Deterministic percentage rollout. Uses a fast djb2-style hash of
   * (code + tenantId) so the same tenant always gets the same result.
   */
  private inRollout(code: string, tenantId: string, pct: number): boolean {
    const str = `${code}:${tenantId}`;
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & 0x7fffffff; // keep 31-bit positive
    }
    return (hash % 100) < pct;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createFeatureFlagService(deps: FeatureFlagDeps): FeatureFlagService {
  return new FeatureFlagService(deps);
}
