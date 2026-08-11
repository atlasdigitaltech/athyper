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
