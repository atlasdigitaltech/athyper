import { createHash } from "node:crypto";

import {
  isScopeSubset,
  proofPathMatches,
  scopeMatches,
} from "./scope.js";
import type {
  AllowProof,
  CanonicalAuthorizationRepository,
  CanonicalDecisionRequest,
  CanonicalDecisionResult,
  CollectionDecisionResult,
  CollectionMaterialization,
  DecisionEvidence,
  DecisionFacts,
  DecisionReason,
  DenyProof,
  EntityResourceDecisionResult,
  RegisteredCapabilityDecisionResult,
  ResourceCoordinates,
} from "./types.js";

export class CanonicalAuthorizationEvaluator {
  constructor(
    private readonly repository: CanonicalAuthorizationRepository,
  ) {}

  async evaluate(
    request: CanonicalDecisionRequest,
  ): Promise<CanonicalDecisionResult> {
    const [result] = await this.evaluateBatch([request]);
    if (!result) throw new Error("canonical evaluator returned no result");
    return result;
  }

  /**
   * Single evaluation is a one-item call to this method. There is no second
   * batch engine and therefore no divergent precedence implementation.
   */
  async evaluateBatch(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<readonly CanonicalDecisionResult[]> {
    if (new Set(requests.map((request) => request.requestId)).size
      !== requests.length) {
      throw new Error("canonical evaluator request IDs must be unique");
    }
    const facts = await this.repository.loadDecisionFacts(requests);
    const byRequest = new Map(facts.map((row) => [row.requestId, row]));
    if (
      facts.length !== requests.length
      || byRequest.size !== requests.length
      || requests.some((request) => !byRequest.has(request.requestId))
    ) {
      throw new Error(
        "authorization repository must return exactly one fact row per request",
      );
    }
    return requests.map((request) =>
      evaluateLoadedFacts(request, byRequest.get(request.requestId)!)
    );
  }
}

export function evaluateLoadedFacts(
  request: CanonicalDecisionRequest,
  facts: DecisionFacts,
): CanonicalDecisionResult {
  const typedRequestValid = requestIsExact(request, facts);
  const earlyReason = firstFailedGate(facts, typedRequestValid);
  if (earlyReason) return deniedResult(request, facts, earlyReason, [], []);

  const resource = request.mode === "entity_resource"
    ? request.resource
    : undefined;
  const matchingDenies = facts.denies.filter((deny) =>
    denyApplies(deny, facts.permission.permissionId, resource)
  );
  if (matchingDenies.length > 0) {
    return deniedResult(
      request,
      facts,
      "explicit_deny",
      matchingDenies,
      [],
    );
  }

  if (request.mode === "collection") {
    return evaluateCollection(request, facts);
  }

  const matchingAllows = facts.allowProofs.filter((proof) =>
    allowProofApplies(proof, facts, request.evaluatedAt, resource)
  );
  if (matchingAllows.length === 0) {
    return deniedResult(
      request,
      facts,
      "no_complete_allow_path",
      [],
      [],
    );
  }
  return allowedResult(request, facts, matchingAllows);
}

function firstFailedGate(
  facts: DecisionFacts,
  requestIsTypedExactly: boolean,
): DecisionReason | undefined {
  const gates = facts.gates;
  if (!gates.identityActive) return "identity_inactive";
  if (!gates.principalActive) return "principal_inactive";
  if (!gates.planeMembershipActive) return "plane_membership_inactive";
  if (!gates.requestResolvedExactly || !requestIsTypedExactly) {
    return "request_not_exact";
  }
  if (!gates.permissionPlaneEligible) return "permission_plane_ineligible";
  // Entitlement deliberately precedes every deny/role/ACL/delegation/override.
  if (!facts.entitlement.available) return "entitlement_unavailable";
  if (!gates.hardPolicySatisfied) return "hard_policy_failed";
  if (!gates.mfaSatisfied) return "mfa_required";
  if (!gates.sodSatisfied) return "sod_failed";
  return undefined;
}

function requestIsExact(
  request: CanonicalDecisionRequest,
  facts: DecisionFacts,
): boolean {
  const permission = facts.permission;
  if (request.mode === "registered_capability") {
    return permission.registeredNonEntity
      && permission.entityId === undefined
      && permission.entityOperationId === undefined
      && permission.permissionId === request.permissionId;
  }
  return !permission.registeredNonEntity
    && permission.entityId !== undefined
    && permission.entityOperationId === request.entityOperationId;
}

function denyApplies(
  deny: DenyProof,
  permissionId: string,
  resource?: ResourceCoordinates,
): boolean {
  if (!deny.active || deny.permissionId !== permissionId) return false;
  if (deny.subjectKind === "group" && deny.groupMembershipActive !== true) {
    return false;
  }
  if (!resource) return deny.scope.tenantWide;
  return scopeMatches(deny.scope, resource);
}

function allowProofApplies(
  proof: AllowProof,
  facts: DecisionFacts,
  evaluatedAt: Date,
  resource?: ResourceCoordinates,
): boolean {
  if (!proof.active || proof.permissionId !== facts.permission.permissionId) {
    return false;
  }
  if (proof.kind === "group_role") {
    if (
      !proof.groupActive
      || !proof.groupMembershipActive
      || !proof.roleAssignmentActive
    ) return false;
  }
  if (proof.kind === "override") {
    if (!proof.approved || proof.expiresAt <= evaluatedAt) return false;
  }
  if (proof.kind === "record_acl") {
    if (
      !facts.permission.shareable
      || !proof.permissionShareable
      || !resource?.entityId
      || !resource.recordId
      || resource.entityId !== proof.entityId
      || resource.recordId !== proof.recordId
    ) return false;
  }
  if (proof.kind === "delegation" && !delegationIsBounded(proof, facts)) {
    return false;
  }
  if (!resource) {
    return proof.kind !== "record_acl"
      && proof.constraints.some((scope) => scope.tenantWide);
  }
  return proofPathMatches(proof.constraints, resource);
}

function delegationIsBounded(
  proof: Extract<AllowProof, { kind: "delegation" }>,
  facts: DecisionFacts,
): boolean {
  if (
    !facts.permission.delegable
    || !proof.permissionDelegable
    || proof.delegatorOrdinaryProofIds.length === 0
    || proof.delegatedScopes.length === 0
    || proof.delegatorOrdinaryScopes.length === 0
    || proof.upstreamAuthorityKinds.some((kind) => kind !== "group_role")
  ) return false;
  return proof.delegatedScopes.every((delegated) =>
    proof.delegatorOrdinaryScopes.some((ordinary) =>
      isScopeSubset(delegated, ordinary)
    )
  );
}

function evaluateCollection(
  request: Extract<CanonicalDecisionRequest, { mode: "collection" }>,
  facts: DecisionFacts,
): CollectionDecisionResult {
  const validProofs = facts.allowProofs.filter((proof) =>
    allowProofValidForCollection(proof, facts, request.evaluatedAt)
  );
  const organizational = validProofs.flatMap((proof) =>
    proof.kind === "record_acl"
      ? []
      : [{
          proofId: proof.proofId,
          proofKind: proof.kind,
          intersection: proof.constraints,
        }]
  );
  const sharedRecords = validProofs.flatMap((proof) =>
    proof.kind === "record_acl"
      ? [{
          proofId: proof.proofId,
          entityId: proof.entityId,
          recordId: proof.recordId,
        }]
      : []
  );
  const denyScopes = facts.denies
    .filter((deny) =>
      deny.active
      && deny.permissionId === facts.permission.permissionId
      && (
        deny.subjectKind !== "group"
        || deny.groupMembershipActive === true
      )
    )
    .map((deny) => deny.scope);
  const materialization: CollectionMaterialization = {
    organizationalAllowClauses: organizational,
    denyScopes,
    sharedRecords,
  };
  const decision = organizational.length > 0 || sharedRecords.length > 0
    ? "allow"
    : "deny";
  const reason: DecisionReason = decision === "allow"
    ? "allowed"
    : "no_complete_allow_path";
  return {
    mode: "collection",
    requestId: request.requestId,
    decision,
    reason,
    materialization,
    evidence: evidence(facts, [], validProofs),
  };
}

function allowProofValidForCollection(
  proof: AllowProof,
  facts: DecisionFacts,
  evaluatedAt: Date,
): boolean {
  if (!proof.active || proof.permissionId !== facts.permission.permissionId) {
    return false;
  }
  if (proof.constraints.length === 0) return false;
  if (proof.kind === "group_role") {
    return proof.groupActive
      && proof.groupMembershipActive
      && proof.roleAssignmentActive;
  }
  if (proof.kind === "override") {
    return proof.approved && proof.expiresAt > evaluatedAt;
  }
  if (proof.kind === "record_acl") {
    return facts.permission.shareable && proof.permissionShareable;
  }
  return delegationIsBounded(proof, facts);
}

function allowedResult(
  request: Exclude<CanonicalDecisionRequest, { mode: "collection" }>,
  facts: DecisionFacts,
  matchingAllows: readonly AllowProof[],
): EntityResourceDecisionResult | RegisteredCapabilityDecisionResult {
  const base = {
    requestId: request.requestId,
    decision: "allow" as const,
    reason: "allowed" as const,
    evidence: evidence(
      facts,
      [],
      matchingAllows,
    ),
  };
  return request.mode === "entity_resource"
    ? { ...base, mode: "entity_resource" }
    : { ...base, mode: "registered_capability" };
}

function deniedResult(
  request: CanonicalDecisionRequest,
  facts: DecisionFacts,
  reason: DecisionReason,
  matchingDenies: readonly DenyProof[],
  matchingAllows: readonly AllowProof[],
): CanonicalDecisionResult {
  const base = {
    requestId: request.requestId,
    decision: "deny" as const,
    reason,
    evidence: evidence(
      facts,
      matchingDenies,
      matchingAllows,
    ),
  };
  if (request.mode === "collection") {
    return {
      ...base,
      mode: "collection",
      materialization: {
        organizationalAllowClauses: [],
        denyScopes: [],
        sharedRecords: [],
      },
    };
  }
  return request.mode === "entity_resource"
    ? { ...base, mode: "entity_resource" }
    : { ...base, mode: "registered_capability" };
}

function evidence(
  facts: DecisionFacts,
  matchingDenies: readonly DenyProof[],
  matchingAllows: readonly AllowProof[],
): DecisionEvidence {
  const dates = [
    facts.nextAuthorityChangeAt,
    ...facts.allowProofs.map((proof) => proof.nextAuthorityChangeAt),
  ].filter((value): value is Date => value instanceof Date);
  const nextAuthorityChangeAt = dates.sort(
    (left, right) => left.getTime() - right.getTime(),
  )[0];
  return {
    permissionId: facts.permission.permissionId,
    canonicalCode: facts.permission.canonicalCode,
    entitlementEvidenceId: facts.entitlement.evidenceId,
    matchingDenyIds: matchingDenies.map((deny) => deny.denyRuleId).sort(),
    matchingAllowProofIds: matchingAllows.map((proof) => proof.proofId).sort(),
    matchingDenyProofs: matchingDenies
      .map((deny) => ({
        denyRuleId: deny.denyRuleId,
        subjectKind: deny.subjectKind,
      }))
      .sort((left, right) => left.denyRuleId.localeCompare(right.denyRuleId)),
    matchingAllowProofs: matchingAllows
      .map((proof) => ({ proofId: proof.proofId, kind: proof.kind }))
      .sort((left, right) => left.proofId.localeCompare(right.proofId)),
    catalogVersion: facts.catalogVersion,
    policyVersion: facts.policyVersion,
    ...(facts.planeMembershipEvidenceId
      ? { planeMembershipEvidenceId: facts.planeMembershipEvidenceId }
      : {}),
    ...(nextAuthorityChangeAt ? { nextAuthorityChangeAt } : {}),
  };
}

export function authorizationFingerprint(
  result: CanonicalDecisionResult,
): string {
  return createHash("sha256").update(JSON.stringify({
    requestId: result.requestId,
    mode: result.mode,
    decision: result.decision,
    reason: result.reason,
    evidence: result.evidence,
  })).digest("hex");
}
