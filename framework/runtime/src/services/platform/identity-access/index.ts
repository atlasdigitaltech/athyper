/**
 * Identity & Access Management Module
 *
 * Provides identity mapping, role binding, group sync, and tenant resolution services.
 */

export const moduleCode = "identity-access";
export const moduleName = "Identity & Access Management";

// Services
export { EntitlementSnapshotService } from "./entitlement-snapshot.service.js";
export { GroupSyncService } from "./group-sync.service.js";
export { IdentityMapperService } from "./identity-mapper.service.js";
export { OUMembershipService } from "./ou-membership.service.js";
export { RoleBindingService } from "./role-binding.service.js";
export { TenantResolverService } from "./tenant-resolver.service.js";

// Factory
export { createIAMServices, type IAMServices } from "./iam-factory.service.js";

// Types re-exported from services
export type {
  IdpIdentityInfo,
  PrincipalResult,
  PrincipalType,
} from "./identity-mapper.service.js";

export type {
  SubscriptionTier,
  TenantInfo,
  TenantProfileInfo,
  TenantStatus,
} from "./tenant-resolver.service.js";

export type {
  GroupInfo,
  GroupMemberInfo,
  GroupSourceType,
} from "./group-sync.service.js";

export type {
  RoleBindingInfo,
  RoleInfo,
  ScopeKind,
  ScopeMode,
} from "./role-binding.service.js";

export type {
  OUNodeInfo,
} from "./ou-membership.service.js";

export type { EntitlementSnapshot } from "./entitlement-snapshot.service.js";
