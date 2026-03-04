/**
 * IAM Factory Service
 *
 * Creates and wires all IAM services together
 * Provides unified IAM subsystem interface
 */

import { EntitlementSnapshotService } from "./entitlement-snapshot.service.js";
import { GroupSyncService } from "./group-sync.service.js";
import { IdentityMapperService } from "./identity-mapper.service.js";
import { OUMembershipService } from "./ou-membership.service.js";
import { RoleBindingService } from "./role-binding.service.js";
import { TenantResolverService } from "./tenant-resolver.service.js";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";


/**
 * IAM Services container
 */
export type IAMServices = {
  /** Identity mapper (B1) */
  identityMapper: IdentityMapperService;

  /** Tenant resolver (B2) */
  tenantResolver: TenantResolverService;

  /** Group sync (B3) */
  groupSync: GroupSyncService;

  /** Role binding (B4) */
  roleBinding: RoleBindingService;

  /** OU membership (B5) */
  ouMembership: OUMembershipService;

  /** Entitlement snapshot (B6) */
  entitlementSnapshot: EntitlementSnapshotService;
};

/**
 * Create IAM services
 *
 * Wires all IAM services together with correct dependencies
 */
export function createIAMServices(db: Kysely<DB>): IAMServices {
  // B1: Identity Mapper
  const identityMapper = new IdentityMapperService(db);

  // B2: Tenant Resolver
  const tenantResolver = new TenantResolverService(db);

  // B3: Group Sync
  const groupSync = new GroupSyncService(db);

  // B4: Role Binding
  const roleBinding = new RoleBindingService(db);

  // B5: OU Membership
  const ouMembership = new OUMembershipService(db);

  // B6: Entitlement Snapshot (depends on B3, B4, B5)
  const entitlementSnapshot = new EntitlementSnapshotService(
    db,
    roleBinding,
    groupSync,
    ouMembership
  );

  return {
    identityMapper,
    tenantResolver,
    groupSync,
    roleBinding,
    ouMembership,
    entitlementSnapshot,
  };
}

// Re-export types for convenience
export type { IdpIdentityInfo, PrincipalResult, PrincipalType } from "./identity-mapper.service.js";
export type { SubscriptionTier, TenantInfo, TenantProfileInfo, TenantStatus } from "./tenant-resolver.service.js";
export type { GroupInfo, GroupMemberInfo, GroupSourceType } from "./group-sync.service.js";
export type { RoleBindingInfo, RoleInfo, ScopeKind, ScopeMode } from "./role-binding.service.js";
export type { OUNodeInfo } from "./ou-membership.service.js";
export type { EntitlementSnapshot } from "./entitlement-snapshot.service.js";
