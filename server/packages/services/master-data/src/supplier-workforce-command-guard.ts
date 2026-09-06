import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  evaluateSupplierWorkforceGate,
  type ApprovedPolicyCoordinate,
  type SupplierWorkforceCommandBoundary,
  type SupplierWorkforcePolicyCoordinates,
} from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

export interface SupplierWorkforcePolicyProof {
  readonly boundary: SupplierWorkforceCommandBoundary;
  readonly policyHashes: readonly string[];
  readonly coordinates: readonly Readonly<{
    decisionId: ApprovedPolicyCoordinate["decisionId"];
    version: number;
    hash: string;
    approvalEvidenceId: string;
  }>[];
}

export interface SupplierWorkforceCommandGuard {
  execute<T>(input: Readonly<{
    context: VerifiedRequestContext;
    boundary: SupplierWorkforceCommandBoundary;
    permissionCode: string;
    resource: Readonly<Record<string, unknown>>;
  }>, work: (proof: SupplierWorkforcePolicyProof) => Promise<T>): Promise<T>;
}

export function createSupplierWorkforceCommandGuard(options: {
  authorizer: Authorizer;
  policies?: SupplierWorkforcePolicyCoordinates;
}): SupplierWorkforceCommandGuard {
  const policies = options.policies ?? {};
  return Object.freeze({
    async execute<T>(input: Readonly<{
      context: VerifiedRequestContext;
      boundary: SupplierWorkforceCommandBoundary;
      permissionCode: string;
      resource: Readonly<Record<string, unknown>>;
    }>, work: (proof: SupplierWorkforcePolicyProof) => Promise<T>) {
      if (input.context.planeKey !== "neon")
        throw new MasterDataError(400, "WORKFORCE_COMMAND_INVALID", "NEON context is required");
      if (!/^neon\.workforce\.[a-z0-9_.-]+$/.test(input.permissionCode))
        throw new MasterDataError(400, "WORKFORCE_COMMAND_INVALID", "A canonical Workforce permission is required");
      const authorization = await options.authorizer.authorize({
        context: input.context,
        permissionCode: input.permissionCode,
        resource: { tenantId: input.context.tenantId, ...input.resource },
      });
      if (!authorization.allowed)
        throw new MasterDataError(403, "FORBIDDEN", "Supplier Workforce command permission denied");
      const decision = evaluateSupplierWorkforceGate(input.boundary, policies);
      if (!decision.allowed)
        throw new MasterDataError(
          409,
          "SUPPLIER_WORKFORCE_POLICY_REQUIRED",
          decision.reasonCodes.join(", "),
        );
      return work(Object.freeze({
        boundary: input.boundary,
        policyHashes: decision.policyHashes,
        coordinates: Object.freeze(coordinates(input.boundary, policies)),
      }));
    },
  });
}

function coordinates(
  boundary: SupplierWorkforceCommandBoundary,
  policies: SupplierWorkforcePolicyCoordinates,
): SupplierWorkforcePolicyProof["coordinates"] {
  const required: ApprovedPolicyCoordinate[] = [];
  if (["commercial_approve", "engagement_activate", "placement_change", "compliance_change", "engagement_end", "iam_project"].includes(boundary) && policies.commercial)
    required.push(policies.commercial);
  if (boundary !== "requisition_publish" && policies.candidatePrivacy)
    required.push(policies.candidatePrivacy);
  return required.map(({ decisionId, version, hash, approvalEvidenceId }) =>
    Object.freeze({ decisionId, version, hash, approvalEvidenceId }),
  );
}
