/**
 * Audit Feature Flags / Kill-Switches
 *
 * Provides hot-reloadable feature flags for the audit pipeline:
 *   - AUDIT_WRITE_MODE: "off" | "sync" | "outbox" (controls ingestion path)
 *   - AUDIT_HASHCHAIN: on/off (toggle tamper-evidence hash chain)
 *   - AUDIT_TIMELINE: on/off (toggle unified activity timeline)
 *
 * Resolution order:
 *   1. core.feature_flag DB table (per-tenant override)
 *   2. Zod config defaults (from RuntimeConfig.audit)
 *
 * Results are cached in-memory with a configurable TTL (default 30s)
 * for hot-reload without restarting.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export type AuditWriteMode = "off" | "sync" | "outbox";

export interface AuditFeatureFlags {
  /** Controls the audit write path: off (drop), sync (direct write), outbox (async) */
  writeMode: AuditWriteMode;

  /** Whether SHA-256 hash chain tamper evidence is enabled */
  hashChainEnabled: boolean;

  /** Whether the unified activity timeline service is enabled */
  timelineEnabled: boolean;

  /** Whether column-level encryption is enabled */
  encryptionEnabled: boolean;
}

export interface AuditFeatureFlagConfig {
  /** Default flags from Zod config (startup values) */
  defaults: AuditFeatureFlags;

  /** Cache TTL in ms (default 30_000 = 30s) */
  cacheTtlMs?: number;
}

// ============================================================================
// Flag Keys (match core.feature_flag.flag_key)
// ============================================================================

const FLAG_KEYS = {
  writeMode: "AUDIT_WRITE_MODE",
  hashChain: "AUDIT_HASHCHAIN",
  timeline: "AUDIT_TIMELINE",
  encryption: "AUDIT_ENCRYPTION",
} as const;

const VALID_WRITE_MODES: AuditWriteMode[] = ["off", "sync", "outbox"];

const FEATURE_FLAG_TABLE = "core.feature_flag" as keyof DB & string;

// ============================================================================
// Resolver
// ============================================================================

interface CacheEntry {
  flags: AuditFeatureFlags;
  expiresAt: number;
}

export class AuditFeatureFlagResolver {
  private readonly defaults: AuditFeatureFlags;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly db: Kysely<DB> | null,
    config: AuditFeatureFlagConfig,
  ) {
    this.defaults = config.defaults;
    this.cacheTtlMs = config.cacheTtlMs ?? 30_000;
  }

  /**
   * Resolve feature flags for a tenant.
   * Uses in-memory cache with TTL for hot-reload semantics.
   */
  async resolve(tenantId: string): Promise<AuditFeatureFlags> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);

    if (cached && cached.expiresAt > now) {
      return cached.flags;
    }

    const flags = await this.loadFromDb(tenantId);
    this.cache.set(tenantId, { flags, expiresAt: now + this.cacheTtlMs });
    return flags;
  }

  /**
   * Invalidate cache for a tenant (force re-read on next resolve).
   */
  invalidateCache(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /**
   * Invalidate all cached entries.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get defaults without DB lookup (for startup / fallback).
   */
  getDefaults(): AuditFeatureFlags {
    return { ...this.defaults };
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private async loadFromDb(tenantId: string): Promise<AuditFeatureFlags> {
    if (!this.db) {
      return { ...this.defaults };
    }

    try {
      const rows = await this.db
        .selectFrom(FEATURE_FLAG_TABLE as any)
        .select(["flag_key", "is_enabled", "config"])
        .where("tenant_id", "=", tenantId)
        .where("flag_key", "in", Object.values(FLAG_KEYS))
        .execute() as Array<{ flag_key: string; is_enabled: boolean; config: any }>;

      const flags: AuditFeatureFlags = { ...this.defaults };

      for (const row of rows) {
        const config = typeof row.config === "string"
          ? JSON.parse(row.config)
          : row.config;

        switch (row.flag_key) {
          case FLAG_KEYS.writeMode: {
            const mode = config?.mode ?? (row.is_enabled ? "outbox" : "off");
            if (VALID_WRITE_MODES.includes(mode)) {
              flags.writeMode = mode;
            }
            break;
          }
          case FLAG_KEYS.hashChain:
            flags.hashChainEnabled = row.is_enabled;
            break;
          case FLAG_KEYS.timeline:
            flags.timelineEnabled = row.is_enabled;
            break;
          case FLAG_KEYS.encryption:
            flags.encryptionEnabled = row.is_enabled;
            break;
        }
      }

      return flags;
    } catch {
      // DB error — fall back to defaults (fail-open)
      return { ...this.defaults };
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAuditFeatureFlagResolver(
  db: Kysely<DB> | null,
  config: AuditFeatureFlagConfig,
): AuditFeatureFlagResolver {
  return new AuditFeatureFlagResolver(db, config);
}
