export const CANONICAL_AUTHORIZATION_CONTRACT_VERSION =
  "wave4.canonical-evaluator.v1" as const;

export type CanonicalPlane = "neon" | "admin" | "mesh";
export type DecisionMode =
  | "entity_resource"
  | "registered_capability"
  | "collection";
export type ScopeDimension =
  | "workspace"
  | "module"
  | "company_code"
  | "legal_entity"
  | "operating_organization"
  | "network_account"
  | "network_relationship"
  | "resource";

export interface AuthorizationSubject {
  readonly plane: CanonicalPlane;
  /** Plane-local tenant boundary. Required when tenantOrAccountId is a scoped resource. */
  readonly tenantId?: string;
  readonly tenantOrAccountId: string;
  readonly principalId: string;
}

export interface ResourceCoordinates {
  readonly tenantOrAccountId: string;
  readonly entityId?: string;
  readonly recordId?: string;
  readonly dimensions: Readonly<
    Partial<Record<ScopeDimension, string>>
  >;
}

/**
 * One canonical typed scope. tenantWide must be explicit. An empty,
 * non-tenant-wide scope is invalid and never matches.
 */
export interface ScopeConstraint {
  readonly scopeId: string;
  readonly tenantOrAccountId: string;
  readonly tenantWide: boolean;
  readonly dimensions: Readonly<
    Partial<Record<ScopeDimension, readonly string[]>>
  >;
}

interface DecisionRequestBase {
  readonly requestId: string;
  readonly subject: AuthorizationSubject;
  readonly evaluatedAt: Date;
  /**
   * Request assurance is supplied by the authenticated runtime boundary.
   * A repository must never infer MFA/SoD from roles or permission names.
   */
  readonly assurance?: {
    readonly mfaSatisfied: boolean;
    readonly sodSatisfied: boolean;
    readonly hardPolicySatisfied?: boolean;
  };
}

export interface EntityResourceDecisionRequest extends DecisionRequestBase {
  readonly mode: "entity_resource";
  readonly entityOperationId: string;
  readonly resource: ResourceCoordinates;
}

export interface RegisteredCapabilityDecisionRequest extends DecisionRequestBase {
  readonly mode: "registered_capability";
  readonly permissionId: string;
}

export interface CollectionDecisionRequest extends DecisionRequestBase {
  readonly mode: "collection";
  readonly entityOperationId: string;
}

export type CanonicalDecisionRequest =
  | EntityResourceDecisionRequest
  | RegisteredCapabilityDecisionRequest
  | CollectionDecisionRequest;

export interface ResolvedPermission {
  readonly permissionId: string;
  readonly canonicalCode: string;
  readonly entityId?: string;
  readonly entityOperationId?: string;
  readonly registeredNonEntity: boolean;
  readonly shareable: boolean;
  readonly delegable: boolean;
}

export interface EntitlementEvidence {
  readonly available: boolean;
  readonly evidenceId: string;
  readonly semantics:
    | "neon_plan_module_feature"
    | "admin_platform_managed"
    | "mesh_account_product";
  readonly reason?: string;
}

export interface CommonDecisionGates {
  readonly identityActive: boolean;
  readonly principalActive: boolean;
  readonly planeMembershipActive: boolean;
  readonly requestResolvedExactly: boolean;
  readonly permissionPlaneEligible: boolean;
  readonly hardPolicySatisfied: boolean;
  readonly mfaSatisfied: boolean;
  readonly sodSatisfied: boolean;
}

export type DenySubjectKind = "hard_policy" | "principal" | "group";

export interface DenyProof {
  readonly denyRuleId: string;
  readonly permissionId: string;
  readonly subjectKind: DenySubjectKind;
  readonly active: boolean;
  /** Required for group denies; inactive membership activates no deny. */
  readonly groupMembershipActive?: boolean;
  readonly scope: ScopeConstraint;
  readonly nextAuthorityChangeAt?: Date;
}

interface AllowProofBase {
  readonly proofId: string;
  readonly permissionId: string;
  readonly active: boolean;
  /** Constraints are intersected inside this one proof path. */
  readonly constraints: readonly ScopeConstraint[];
  readonly nextAuthorityChangeAt?: Date;
}

export interface GroupRoleAllowProof extends AllowProofBase {
  readonly kind: "group_role";
  readonly groupActive: boolean;
  readonly groupMembershipActive: boolean;
  readonly roleAssignmentActive: boolean;
}

export interface DelegationAllowProof extends AllowProofBase {
  readonly kind: "delegation";
  readonly delegationId: string;
  readonly permissionDelegable: boolean;
  readonly delegatorOrdinaryProofIds: readonly string[];
  readonly upstreamAuthorityKinds: readonly AllowProofKind[];
  readonly delegatedScopes: readonly ScopeConstraint[];
  readonly delegatorOrdinaryScopes: readonly ScopeConstraint[];
}

export interface RecordAclAllowProof extends AllowProofBase {
  readonly kind: "record_acl";
  readonly recordAclId: string;
  readonly permissionShareable: boolean;
  readonly entityId: string;
  readonly recordId: string;
}

export interface OverrideAllowProof extends AllowProofBase {
  readonly kind: "override";
  readonly overrideId: string;
  readonly approved: boolean;
  readonly expiresAt: Date;
}

export type AllowProof =
  | GroupRoleAllowProof
  | DelegationAllowProof
  | RecordAclAllowProof
  | OverrideAllowProof;
export type AllowProofKind = AllowProof["kind"];

export interface DecisionFacts {
  readonly requestId: string;
  readonly permission: ResolvedPermission;
  readonly gates: CommonDecisionGates;
  readonly entitlement: EntitlementEvidence;
  readonly denies: readonly DenyProof[];
  readonly allowProofs: readonly AllowProof[];
  readonly catalogVersion: string;
  readonly policyVersion: string;
  readonly planeMembershipEvidenceId?: string;
  readonly nextAuthorityChangeAt?: Date;
}

export interface MatchedAllowProofEvidence {
  readonly proofId: string;
  readonly kind: AllowProofKind;
}

export interface MatchedDenyProofEvidence {
  readonly denyRuleId: string;
  readonly subjectKind: DenySubjectKind;
}

export type DecisionReason =
  | "allowed"
  | "identity_inactive"
  | "principal_inactive"
  | "plane_membership_inactive"
  | "request_not_exact"
  | "permission_plane_ineligible"
  | "entitlement_unavailable"
  | "hard_policy_failed"
  | "mfa_required"
  | "sod_failed"
  | "explicit_deny"
  | "no_complete_allow_path";

export interface DecisionEvidence {
  readonly permissionId: string;
  readonly canonicalCode: string;
  readonly entitlementEvidenceId: string;
  readonly matchingDenyIds: readonly string[];
  readonly matchingAllowProofIds: readonly string[];
  readonly matchingDenyProofs: readonly MatchedDenyProofEvidence[];
  readonly matchingAllowProofs: readonly MatchedAllowProofEvidence[];
  readonly planeMembershipEvidenceId?: string;
  readonly catalogVersion: string;
  readonly policyVersion: string;
  readonly nextAuthorityChangeAt?: Date;
}

interface DecisionResultBase {
  readonly requestId: string;
  readonly decision: "allow" | "deny";
  readonly reason: DecisionReason;
  readonly evidence: DecisionEvidence;
}

export interface EntityResourceDecisionResult extends DecisionResultBase {
  readonly mode: "entity_resource";
}

export interface RegisteredCapabilityDecisionResult extends DecisionResultBase {
  readonly mode: "registered_capability";
}

export interface OrganizationalAllowClause {
  readonly proofId: string;
  readonly proofKind: "group_role" | "delegation" | "override";
  readonly intersection: readonly ScopeConstraint[];
}

export interface SharedRecordPredicate {
  readonly proofId: string;
  readonly entityId: string;
  readonly recordId: string;
}

export interface CollectionMaterialization {
  readonly organizationalAllowClauses: readonly OrganizationalAllowClause[];
  readonly denyScopes: readonly ScopeConstraint[];
  /** ACL records remain separate and never widen organizational scope. */
  readonly sharedRecords: readonly SharedRecordPredicate[];
}

export interface CollectionDecisionResult extends DecisionResultBase {
  readonly mode: "collection";
  readonly materialization: CollectionMaterialization;
}

export type CanonicalDecisionResult =
  | EntityResourceDecisionResult
  | RegisteredCapabilityDecisionResult
  | CollectionDecisionResult;

export interface CanonicalAuthorizationRepository {
  readonly authority: "neon_admin" | "mesh";
  readonly contractVersion: typeof CANONICAL_AUTHORIZATION_CONTRACT_VERSION;
  loadDecisionFacts(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<readonly DecisionFacts[]>;
}

export interface NeonAdminAuthorizationRepository
  extends CanonicalAuthorizationRepository {
  readonly authority: "neon_admin";
}

export interface MeshAuthorizationRepository
  extends CanonicalAuthorizationRepository {
  readonly authority: "mesh";
}
