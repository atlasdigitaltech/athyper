/**
 * SharePolicyResolver — Resolves effective permissions for a user on a record.
 *
 * Combines: own RBAC permissions + delegated access + record shares.
 * Returns the highest effective permission level.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DelegationGrantRepo } from "../../persistence/DelegationGrantRepo.js";
import type { RecordShareRepo } from "../../persistence/RecordShareRepo.js";
import type {
  PermissionLevel,
  EffectiveSharePermission,
  ShareAccessAction,
} from "../types.js";

/** Permission level hierarchy: admin > edit > view */
const LEVEL_RANK: Record<PermissionLevel, number> = {
  admin: 3,
  edit: 2,
  view: 1,
};

/** Maps permission level to allowed actions */
const LEVEL_ACTIONS: Record<PermissionLevel, Set<ShareAccessAction>> = {
  view: new Set(["read"]),
  edit: new Set(["read", "write"]),
  admin: new Set(["read", "write", "share"]),
};

export class SharePolicyResolver {
  constructor(
    private readonly shareRepo: RecordShareRepo,
    private readonly delegationRepo: DelegationGrantRepo,
    private readonly logger: Logger,
  ) {}

  /**
   * Resolve the effective share permission for a user on a specific record.
   * Returns the highest permission granted via any sharing mechanism.
   */
  async resolveEffectivePermission(
    tenantId: string,
    userId: string,
    entityType: string,
    entityId: string,
  ): Promise<EffectiveSharePermission> {
    // 1. Check direct record share
    const directShare = await this.shareRepo.findActiveShare(
      tenantId,
      entityType,
      entityId,
      userId,
    );

    // 2. Check delegation grants for this entity scope
    const delegations = await this.delegationRepo.findActiveForScope(
      tenantId,
      userId,
      "entity",
      `${entityType}:${entityId}`,
    );

    // 3. Check broader workflow/module delegations
    const workflowDelegations = await this.delegationRepo.findActiveForScope(
      tenantId,
      userId,
      "workflow",
    );
    const moduleDelegations = await this.delegationRepo.findActiveForScope(
      tenantId,
      userId,
      "module",
    );

    // Determine best permission
    let bestLevel: PermissionLevel | undefined;
    let bestSource: EffectiveSharePermission["source"];
    let bestGrantId: string | undefined;
    let bestExpiresAt: Date | undefined;

    // Direct share
    if (directShare) {
      const level = directShare.permissionLevel as PermissionLevel;
      if (!bestLevel || LEVEL_RANK[level] > LEVEL_RANK[bestLevel]) {
        bestLevel = level;
        bestSource = "direct_share";
        bestGrantId = directShare.id;
        bestExpiresAt = directShare.expiresAt;
      }
    }

    // Entity-scoped delegation
    for (const d of delegations) {
      const level = this.delegationToPermissionLevel(d.permissions);
      if (level && (!bestLevel || LEVEL_RANK[level] > LEVEL_RANK[bestLevel])) {
        bestLevel = level;
        bestSource = "delegation";
        bestGrantId = d.id;
        bestExpiresAt = d.expiresAt;
      }
    }

    // Broader delegations (workflow + module) — grant view-level access
    const broaderDelegations = [...workflowDelegations, ...moduleDelegations];
    for (const d of broaderDelegations) {
      const level = this.delegationToPermissionLevel(d.permissions);
      if (level && (!bestLevel || LEVEL_RANK[level] > LEVEL_RANK[bestLevel])) {
        bestLevel = level;
        bestSource = "delegation";
        bestGrantId = d.id;
        bestExpiresAt = d.expiresAt;
      }
    }

    if (!bestLevel) {
      return { allowed: false };
    }

    return {
      allowed: true,
      permissionLevel: bestLevel,
      source: bestSource,
      grantId: bestGrantId,
      expiresAt: bestExpiresAt,
    };
  }

  /**
   * Check if a user can perform a specific action on a record via sharing.
   */
  async canPerformAction(
    tenantId: string,
    userId: string,
    entityType: string,
    entityId: string,
    action: ShareAccessAction,
  ): Promise<boolean> {
    const effective = await this.resolveEffectivePermission(
      tenantId,
      userId,
      entityType,
      entityId,
    );

    if (!effective.allowed || !effective.permissionLevel) {
      return false;
    }

    return LEVEL_ACTIONS[effective.permissionLevel].has(action);
  }

  /**
   * Derive a permission level from delegation permissions array.
   */
  private delegationToPermissionLevel(
    permissions: string[],
  ): PermissionLevel | undefined {
    const permSet = new Set(permissions);
    if (permSet.has("admin") || permSet.has("share")) return "admin";
    if (permSet.has("write") || permSet.has("edit")) return "edit";
    if (permSet.has("read") || permSet.has("view")) return "view";
    // If any permissions exist, grant at least view
    return permissions.length > 0 ? "view" : undefined;
  }
}
