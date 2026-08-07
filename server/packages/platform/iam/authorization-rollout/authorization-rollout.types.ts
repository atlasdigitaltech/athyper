export const AUTHORIZATION_ROLLOUT_MODES = [
  "legacy",
  "shadow",
  "enforce",
] as const;

export type AuthorizationRolloutMode =
  typeof AUTHORIZATION_ROLLOUT_MODES[number];

export const AUTHORIZATION_ROLLOUT_PLANES = [
  "neon",
  "admin",
  "mesh",
] as const;

export type AuthorizationRolloutPlane =
  typeof AUTHORIZATION_ROLLOUT_PLANES[number];

/**
 * Physical policy authority. Admin authorization is hosted in Neon DB, while
 * Mesh must receive a policy from its own caller-supplied Mesh authority.
 */
export type AuthorizationRolloutAuthority = "neon" | "mesh";

export const AUTHORIZATION_ROLLOUT_AUTHORITY_BY_PLANE:
  Readonly<Record<AuthorizationRolloutPlane, AuthorizationRolloutAuthority>> =
  Object.freeze({
    neon: "neon",
    admin: "neon",
    mesh: "mesh",
  });

export interface AuthorizationRolloutApproval {
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly ticket: string;
  readonly rollbackOwner: string;
  readonly observationWindowEndsAt: string;
  /** SHA-256 of the independently verified golden decision corpus. */
  readonly goldenCorpusSha256: string;
  /** Durable plane-local capture source UUID certified by that corpus. */
  readonly sourceDatabaseId: string;
  /** Projector watermark that must be reached before this rule can match. */
  readonly minimumAppliedWatermark: string;
}

/**
 * A cohort is an exact list of permission codes. Optional tenant/principal
 * lists narrow that cohort; omitted lists mean all subjects in the plane.
 * Percentage or hash-based rollout fields are intentionally absent.
 */
export interface AuthorizationRolloutRule {
  readonly id: string;
  readonly cohortCode: string;
  readonly mode: AuthorizationRolloutMode;
  readonly permissionCodes: readonly string[];
  readonly tenantIds?: readonly string[];
  readonly principalIds?: readonly string[];
  readonly effectiveFrom?: string;
  readonly expiresAt?: string;
  readonly approval: AuthorizationRolloutApproval;
}

/**
 * One immutable, plane-local policy revision. A snapshot can never choose a
 * default other than legacy; shadow/enforce must be selected by an exact,
 * approved rule.
 */
export interface AuthorizationRolloutSnapshot {
  readonly schemaVersion: 1;
  readonly planeKey: AuthorizationRolloutPlane;
  readonly authority: AuthorizationRolloutAuthority;
  readonly revision: string;
  readonly defaultMode: "legacy";
  readonly rules: readonly AuthorizationRolloutRule[];
}

export interface AuthorizationRolloutContext {
  readonly planeKey: AuthorizationRolloutPlane;
  readonly permissionCode: string;
  /** Required to match a named rule; omission always leaves the request legacy. */
  readonly cohortCode?: string;
  readonly tenantId?: string;
  readonly principalId?: string;
  /**
   * Request/job-pinned certification state supplied by the plane-local
   * rollout integration. Omission or mismatch always selects legacy.
   */
  readonly certification?: {
    readonly goldenCorpusSha256: string;
    readonly sourceDatabaseId: string;
    readonly appliedWatermark: string;
  };
}

export type AuthorizationRolloutSelectionReason =
  | "matched_rule"
  | "default_legacy"
  | "policy_unavailable"
  | "invalid_policy"
  | "provider_mismatch"
  | "context_plane_mismatch"
  | "revision_mismatch"
  | "ambiguous_match"
  | "invalid_context";

export interface AuthorizationRolloutSelection {
  readonly mode: AuthorizationRolloutMode;
  readonly planeKey: AuthorizationRolloutPlane;
  readonly permissionCode: string;
  readonly reason: AuthorizationRolloutSelectionReason;
  readonly policyRevision?: string;
  readonly ruleId?: string;
  readonly cohortCode?: string;
  readonly certification?: {
    readonly goldenCorpusSha256: string;
    readonly sourceDatabaseId: string;
    readonly appliedWatermark: string;
  };
  readonly diagnosticCode?: string;
}

/**
 * Providers are deliberately caller-supplied and bound to one physical
 * authority and one plane. This module has no database or feature-flag reader.
 */
export interface AuthorizationRolloutPolicyProvider {
  readonly planeKey: AuthorizationRolloutPlane;
  readonly authority: AuthorizationRolloutAuthority;
  loadSnapshot(): Promise<unknown>;
}

export interface AuthorizationRolloutSelectionOptions {
  /**
   * Pin a request/job to one policy revision. A mismatch selects legacy rather
   * than silently moving the request between rollout revisions.
   */
  readonly requiredRevision?: string;
}
