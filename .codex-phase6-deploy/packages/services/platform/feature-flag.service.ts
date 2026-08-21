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
  tenant_overrides:  string | Record<string, boolean> | null;
  rollout_pct:       number | null;
  metadata:          string | Record<string, unknown> | null;
}

export interface FeatureFlagContext {
  tenantId?: string;
  plane: "admin" | "neon" | "mesh";
  accountId?: string;
  internalAdmin?: boolean;
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

      // 2. Try global cache — only when no tenantId is requested.
      // When a tenantId is present, tenant_overrides or rollout_pct may flip the
      // global default, so we must fall through to the DB (step 3) to resolve them.
      // Returning the global value here would cache and return the wrong result for
      // tenants that have an active per-tenant override.
      if (!tenantId) {
        const globalCached = await this.redis.get(`${CACHE_PREFIX}${code}`);
        if (globalCached !== null) return globalCached === "1";
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
      const tenantEnabled = this.resolveRow(row, tenantId);

      if (tenantId) {
        await this.setCached(`${CACHE_PREFIX}${code}:${tenantId}`, tenantEnabled);
      }
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
   * Uncached fail-closed resolution for authorization-sensitive execution
   * gates. Governed actions use this immediately before dispatch so a cached
   * rollout value cannot outlive an emergency tenant or tool revocation.
   */
  async isEnabledStrict(code: string, tenantId?: string): Promise<boolean> {
    try {
      const row = await this.loadFromDb(code);
      return row ? this.resolveRow(row, tenantId) : false;
    } catch (err) {
      this.logger?.error("feature_flag_strict_error", {
        code,
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Plane/surface rollout resolution. Account overrides are intentionally
   * evaluated server-side and never shipped to the browser.
   */
  async isEnabledForContext(code: string, context: FeatureFlagContext): Promise<boolean> {
    try {
      const accountKey = context.accountId ? `:${context.accountId}` : "";
      const cacheKey = `${CACHE_PREFIX}${code}:${context.tenantId ?? "global"}:${context.plane}${accountKey}`;
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) return cached === "1";
      const row = await this.loadFromDb(code);
      const enabled = row ? this.resolveContext(row, context) : false;
      await this.setCached(cacheKey, enabled);
      return enabled;
    } catch (err) {
      this.logger?.error("feature_flag_context_error", {
        code,
        plane: context.plane,
        tenantId: context.tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return false;
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
        "ff.metadata",
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

  private resolveRow(row: FlagRow, tenantId?: string): boolean {
    if (!tenantId) return row.is_enabled;
    const overrides = parseTenantOverrides(row.tenant_overrides);
    if (Object.prototype.hasOwnProperty.call(overrides, tenantId)) {
      return overrides[tenantId] === true;
    }
    if (row.rollout_pct !== null) {
      return this.inRollout(row.code, tenantId, row.rollout_pct);
    }
    return row.is_enabled;
  }

  private resolveContext(row: FlagRow, context: FeatureFlagContext): boolean {
    const metadata = parseFlagMetadata(row.metadata);
    const allowedPlanes = Array.isArray(metadata["allowed_planes"])
      ? metadata["allowed_planes"].filter((value): value is string => typeof value === "string")
      : [];
    if (allowedPlanes.length > 0 && !allowedPlanes.includes(context.plane)) return false;
    const accountOverrides = readBooleanMap(metadata["account_overrides"]);
    if (context.accountId && Object.prototype.hasOwnProperty.call(accountOverrides, context.accountId)) {
      return accountOverrides[context.accountId] === true;
    }
    if (context.plane === "admin"
      && context.internalAdmin
      && metadata["internal_admin_enabled"] === true) {
      return true;
    }
    return this.resolveRow(row, context.tenantId);
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

function parseFlagMetadata(value: FlagRow["metadata"]): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  }
  return value;
}

function readBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
}

function parseTenantOverrides(
  value: FlagRow["tenant_overrides"],
): Readonly<Record<string, boolean>> {
  if (!value) return {};
  if (typeof value !== "string") {
    if (Array.isArray(value)) {
      throw new Error("Feature flag tenant overrides must be an object.");
    }
    return value;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Feature flag tenant overrides must be an object.");
  }
  return parsed as Record<string, boolean>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createFeatureFlagService(deps: FeatureFlagDeps): FeatureFlagService {
  return new FeatureFlagService(deps);
}
