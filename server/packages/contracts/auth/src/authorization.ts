import type { PlaneKey } from "@athyper/server-foundation/context";
import type { VerifiedIdentity } from "./identity.js";

export type EffectiveGrantStatus = "allow" | "deny" | "not_in_plan" | "missing";

export type EffectiveGrantReason =
  | "allowed"
  | "missing_permission"
  | "denied_by_grant"
  | "plan_locked"
  | "module_disabled"
  | "feature_disabled"
  | "plane_excluded";

export interface EffectivePermissionEntry {
  readonly code: string;
  readonly status: EffectiveGrantStatus;
  readonly reason: EffectiveGrantReason;
}

export interface EffectivePermissionRequirement {
  readonly permissionCode: string;
  readonly moduleId: string;
  readonly riskTier: "low" | "medium" | "high" | "critical";
  readonly requiresMfa: boolean;
  readonly requiresSod: boolean;
  readonly entitled: boolean;
}

export interface EffectiveOperationBinding {
  readonly entityCode: string;
  readonly operationKey: string;
  readonly permissionCode: string;
  readonly decisionMode: string;
  readonly requiredScopeKinds: readonly string[];
}

/** JSON-safe authorization scope suitable for crossing package boundaries. */
export interface EffectiveAuthorizationScope {
  readonly permissionCode: string;
  readonly tenantWide: boolean;
  readonly legalEntityIds: readonly string[];
  readonly companyCodeIds: readonly string[];
  readonly operatingOrganizationIds: readonly string[];
  readonly networkMembershipIds: readonly string[];
  readonly visibility: "all" | "team" | "own";
}

export type EffectiveAuthorizationProofKind = "role" | "delegation" | "record_acl" | "override" | "deny";

/** Exact-plane evidence retained in the immutable request snapshot. */
export interface EffectiveAuthorizationEvidence {
  readonly permissionCode: string;
  readonly effect: "allow" | "deny";
  readonly proof: EffectiveAuthorizationProofKind;
  readonly scopeTargetId: string;
  readonly scopeKind: string;
  readonly targetId: string;
  readonly propagationMode: "exact" | "subtree" | "member_companies" | "relationship_participants";
  readonly resourceCode?: string;
  readonly recordId?: string;
  readonly effectiveUntil?: string;
}

export interface EffectivePermissionSnapshot {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly principalFingerprint: string;
  readonly profileHash: string;
  readonly schemaHash: string;
  readonly resolvedAt: number;
  readonly planVersionId?: string;
  readonly networkAccountId?: string;
  readonly allowed: readonly string[];
  readonly denied: readonly string[];
  readonly planLocked: readonly string[];
  readonly planeExcluded: readonly string[];
  readonly entries: readonly EffectivePermissionEntry[];
  readonly authorizationScopes: readonly EffectiveAuthorizationScope[];
  readonly evidence?: readonly EffectiveAuthorizationEvidence[];
  readonly requirements?: readonly EffectivePermissionRequirement[];
  readonly operationBindings?: readonly EffectiveOperationBinding[];
}

export interface VerifiedRequestContext extends VerifiedIdentity {
  readonly permissions: EffectivePermissionSnapshot;
  readonly profileHash: string;
  readonly requestId: string;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
}

export interface AuthorizationRequest {
  readonly context: VerifiedRequestContext;
  readonly permissionCode: string;
  readonly resource?: Readonly<Record<string, unknown>>;
}

export type AuthorizationDecision =
  | { readonly allowed: true; readonly scope?: EffectiveAuthorizationScope }
  | { readonly allowed: false; readonly reason: string };
