/**
 * Entitlement Snapshot Service
 *
 * B6: Effective Entitlement Snapshot Cache
 * Server-side "fast path" for principal entitlements
 *
 * Schema changes:
 * - core.entitlement_snapshot table removed; core.entitlement exists but is for individual records
 * - Snapshot generation is now compute-only (in-memory cache via Map with TTL)
 * - OU membership no longer has path/depth; attributes removed entirely
 *
 * After resolving principal + roles + groups + OU:
 * - Generate JSON entitlement snapshot
 * - Cache in-memory with TTL
 * - Invalidate on changes (principal_role, group_member, principal_ou)
 */

import type { GroupSyncService } from "./group-sync.service.js";
import type { OUMembershipService } from "./ou-membership.service.js";
import type { RoleBindingService } from "./role-binding.service.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Entitlement snapshot
 */
export type EntitlementSnapshot = {
  principalId: string;
  tenantId: string;
  roles: Array<{
    code: string;
    name: string;
  }>;
  groups: Array<{
    code: string;
    name: string;
  }>;
  ouMembership?: {
    nodeId: string;
    name: string;
  };
  generatedAt: Date;
  expiresAt: Date;
};

/**
 * Default TTL in seconds (1 hour)
 */
const DEFAULT_TTL_SECONDS = 3600;

/**
 * Cache entry
 */
type CacheEntry = {
  snapshot: EntitlementSnapshot;
  expiresAt: Date;
};

/**
 * Entitlement Snapshot Service
 */
export class EntitlementSnapshotService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly db: Kysely<DB>,
    private readonly roleBindingService: RoleBindingService,
    private readonly groupSyncService: GroupSyncService,
    private readonly ouMembershipService: OUMembershipService
  ) {}

  /**
   * Cache key for principal+tenant
   */
  private cacheKey(principalId: string, tenantId: string): string {
    return `${tenantId}:${principalId}`;
  }

  /**
   * Generate entitlement snapshot for principal
   */
  async generateSnapshot(
    principalId: string,
    tenantId: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): Promise<EntitlementSnapshot> {
    // 1. Get roles (direct + inherited from groups)
    const rolesWithBindings = await this.roleBindingService.getPrincipalRoles(
      principalId,
      tenantId
    );

    // 2. Get groups
    const groups = await this.groupSyncService.getPrincipalGroups(principalId);

    // 3. Get OU membership
    const ouNode = await this.ouMembershipService.getPrincipalOU(principalId);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const snapshot: EntitlementSnapshot = {
      principalId,
      tenantId,
      roles: rolesWithBindings.map((r) => ({
        code: r.code,
        name: r.name,
      })),
      groups: groups.map((g) => ({
        code: g.code,
        name: g.name,
      })),
      ouMembership: ouNode
        ? {
            nodeId: ouNode.id,
            name: ouNode.name,
          }
        : undefined,
      generatedAt: now,
      expiresAt,
    };

    // Store snapshot in memory cache
    this.cache.set(this.cacheKey(principalId, tenantId), {
      snapshot,
      expiresAt,
    });

    console.log(
      JSON.stringify({
        msg: "entitlement_snapshot_generated",
        principalId,
        tenantId,
        expiresAt: expiresAt.toISOString(),
      })
    );

    return snapshot;
  }

  /**
   * Get cached snapshot (or generate if expired/missing)
   */
  async getOrGenerateSnapshot(
    principalId: string,
    tenantId: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): Promise<EntitlementSnapshot> {
    const now = new Date();
    const key = this.cacheKey(principalId, tenantId);

    // Check cache
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      console.log(
        JSON.stringify({
          msg: "entitlement_snapshot_cache_hit",
          principalId,
          tenantId,
        })
      );
      return cached.snapshot;
    }

    // Cache miss - generate new
    console.log(
      JSON.stringify({
        msg: "entitlement_snapshot_cache_miss",
        principalId,
        tenantId,
      })
    );

    return this.generateSnapshot(principalId, tenantId, ttlSeconds);
  }

  /**
   * Get cached snapshot only (no regeneration)
   */
  async getCachedSnapshot(
    principalId: string,
    tenantId: string
  ): Promise<EntitlementSnapshot | undefined> {
    const now = new Date();
    const key = this.cacheKey(principalId, tenantId);

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.snapshot;
    }

    return undefined;
  }

  /**
   * Invalidate snapshot (force regeneration on next access)
   */
  async invalidateSnapshot(principalId: string, tenantId: string): Promise<void> {
    this.cache.delete(this.cacheKey(principalId, tenantId));

    console.log(
      JSON.stringify({
        msg: "entitlement_snapshot_invalidated",
        principalId,
        tenantId,
      })
    );
  }

  /**
   * Check if principal has a specific role
   */
  async hasRole(
    principalId: string,
    tenantId: string,
    roleCode: string
  ): Promise<boolean> {
    const snapshot = await this.getOrGenerateSnapshot(principalId, tenantId);
    return snapshot.roles.some((r) => r.code === roleCode);
  }

  /**
   * Check if principal is in a specific group
   */
  async isInGroup(
    principalId: string,
    tenantId: string,
    groupCode: string
  ): Promise<boolean> {
    const snapshot = await this.getOrGenerateSnapshot(principalId, tenantId);
    return snapshot.groups.some((g) => g.code === groupCode);
  }

  /**
   * Check if principal is in a specific OU
   */
  async isInOU(
    principalId: string,
    tenantId: string,
    ouNodeId: string
  ): Promise<boolean> {
    const snapshot = await this.getOrGenerateSnapshot(principalId, tenantId);
    if (!snapshot.ouMembership) return false;
    return snapshot.ouMembership.nodeId === ouNodeId;
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupExpiredSnapshots(): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        count++;
      }
    }

    console.log(
      JSON.stringify({
        msg: "expired_snapshots_cleaned",
        count,
      })
    );

    return count;
  }
}
