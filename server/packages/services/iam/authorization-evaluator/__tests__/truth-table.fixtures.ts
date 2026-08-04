import type {
  AllowProof,
  CanonicalDecisionRequest,
  CommonDecisionGates,
  DecisionFacts,
  DenyProof,
  EntitlementEvidence,
  ResolvedPermission,
  ScopeConstraint,
} from "../types.js";

export const NOW = new Date("2026-07-27T00:00:00.000Z");
export const SUBJECT = {
  plane: "neon",
  tenantOrAccountId: "tenant-1",
  principalId: "principal-1",
} as const;
export const PERMISSION: ResolvedPermission = {
  permissionId: "permission-update",
  canonicalCode: "neon.invoice.update",
  entityId: "invoice",
  entityOperationId: "invoice-update",
  registeredNonEntity: false,
  shareable: true,
  delegable: true,
};
export const AVAILABLE: EntitlementEvidence = {
  available: true,
  evidenceId: "entitlement-1",
  semantics: "neon_plan_module_feature",
};
export const PASSING_GATES: CommonDecisionGates = {
  identityActive: true,
  principalActive: true,
  planeMembershipActive: true,
  requestResolvedExactly: true,
  permissionPlaneEligible: true,
  hardPolicySatisfied: true,
  mfaSatisfied: true,
  sodSatisfied: true,
};

export function scope(
  scopeId: string,
  dimensions: ScopeConstraint["dimensions"],
): ScopeConstraint {
  return {
    scopeId,
    tenantOrAccountId: "tenant-1",
    tenantWide: false,
    dimensions,
  };
}

export function tenantScope(scopeId = "scope-tenant"): ScopeConstraint {
  return {
    scopeId,
    tenantOrAccountId: "tenant-1",
    tenantWide: true,
    dimensions: {},
  };
}

export function groupRole(
  proofId: string,
  constraints: readonly ScopeConstraint[],
  overrides: Partial<Extract<AllowProof, { kind: "group_role" }>> = {},
): Extract<AllowProof, { kind: "group_role" }> {
  return {
    kind: "group_role",
    proofId,
    permissionId: PERMISSION.permissionId,
    active: true,
    constraints,
    groupActive: true,
    groupMembershipActive: true,
    roleAssignmentActive: true,
    ...overrides,
  };
}

export function deny(
  denyRuleId: string,
  denyScope: ScopeConstraint,
  overrides: Partial<DenyProof> = {},
): DenyProof {
  return {
    denyRuleId,
    permissionId: PERMISSION.permissionId,
    subjectKind: "principal",
    active: true,
    scope: denyScope,
    ...overrides,
  };
}

export function request(
  requestId: string,
  recordId: string,
  dimensions: Readonly<Record<string, string>>,
): CanonicalDecisionRequest {
  return {
    requestId,
    mode: "entity_resource",
    subject: SUBJECT,
    evaluatedAt: NOW,
    entityOperationId: "invoice-update",
    resource: {
      tenantOrAccountId: "tenant-1",
      entityId: "invoice",
      recordId,
      dimensions,
    },
  };
}

export function facts(
  requestId: string,
  allowProofs: readonly AllowProof[],
  overrides: Partial<DecisionFacts> = {},
): DecisionFacts {
  return {
    requestId,
    permission: PERMISSION,
    gates: PASSING_GATES,
    entitlement: AVAILABLE,
    denies: [],
    allowProofs,
    catalogVersion: "catalog-v1",
    policyVersion: "policy-v1",
    ...overrides,
  };
}
