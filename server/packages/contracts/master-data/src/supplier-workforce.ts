/**
 * Supplier Workforce is deliberately separate from the internal employee
 * request contract. Candidate disclosures are proposals; only the dedicated
 * identity-resolution step may bind one to a tenant Person.
 */
export const supplierWorkforceScenarioIds = Object.freeze([
  "BP-WRK-001",
  "BP-WRK-002",
  "BP-WRK-003",
  "BP-WRK-004",
  "BP-WRK-005",
  "BP-WRK-006",
  "BP-WRK-007",
  "BP-WRK-008",
  "BP-WRK-009",
  "BP-WRK-010",
] as const);

export type SupplierWorkforceScenarioId =
  (typeof supplierWorkforceScenarioIds)[number];

export type SupplierWorkforceCommandBoundary =
  | "requisition_publish"
  | "candidate_disclose"
  | "candidate_session"
  | "candidate_evaluate"
  | "commercial_approve"
  | "person_resolve"
  | "engagement_activate"
  | "placement_change"
  | "compliance_change"
  | "engagement_end"
  | "iam_project";

export interface ApprovedPolicyCoordinate {
  readonly decisionId: "BP-Q004" | "BP-Q006";
  readonly version: number;
  readonly hash: string;
  readonly approvedAt: string;
  readonly approvalEvidenceId: string;
  readonly approvedByRoles: readonly string[];
}

export interface SupplierWorkforcePolicyCoordinates {
  readonly commercial?: ApprovedPolicyCoordinate;
  readonly candidatePrivacy?: ApprovedPolicyCoordinate;
}

export interface SupplierWorkforceGateDecision {
  readonly allowed: boolean;
  readonly reasonCodes: readonly (
    | "BP_Q004_COMMERCIAL_POLICY_REQUIRED"
    | "BP_Q006_CANDIDATE_PRIVACY_POLICY_REQUIRED"
  )[];
  readonly policyHashes: readonly string[];
}

export const supplierWorkforcePolicyApproverRoles = Object.freeze({
  "BP-Q004": Object.freeze(["workforce", "procurement", "legal"]),
  "BP-Q006": Object.freeze(["privacy", "legal", "workforce"]),
} as const);

export interface SupplierWorkforcePolicyReadiness {
  readonly decisions: Readonly<Record<"BP-Q004" | "BP-Q006", Readonly<{
    status: "approved" | "pending";
    version?: number;
    hash?: string;
    approvalEvidenceId?: string;
  }>>>;
  readonly boundaries: Readonly<Record<SupplierWorkforceCommandBoundary, SupplierWorkforceGateDecision>>;
}

export interface WorkforceRequisition {
  readonly id: string;
  readonly tenantId: string;
  readonly companyCodeId: string;
  readonly legalEntityId: string;
  readonly code: string;
  readonly name: string;
  readonly engagementModel: "contingent" | "independent_contractor";
  readonly requestedHeadcount: number;
  readonly expectedStartDate: string;
  readonly expectedEndDate?: string;
  readonly currencyCode: string;
  readonly status: "draft" | "pending_approval" | "approved" | "released" | "partially_filled" | "filled" | "cancelled" | "closed";
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface WorkforceRequisitionDistributionProof {
  readonly supplierId: string;
  readonly networkRelationshipId: string;
  readonly capabilityId: string;
  readonly qualificationId: string;
  readonly evidenceHash: string;
  readonly evaluatedAt: string;
  readonly responseDueAt?: string;
}

export interface SupplierWorkforceDistributionEligibility {
  evaluate(input: Readonly<{ context: import("@athyper/server-contract-auth").VerifiedRequestContext; requisition: WorkforceRequisition; supplierId: string; responseDueAt?: string }>): Promise<Readonly<{ allowed: boolean; reasonCodes: readonly string[]; proof?: WorkforceRequisitionDistributionProof }>>;
}

const commercialBoundaries = new Set<SupplierWorkforceCommandBoundary>([
  "commercial_approve",
  "engagement_activate",
  "placement_change",
  "compliance_change",
  "engagement_end",
  "iam_project",
]);
const candidateBoundaries = new Set<SupplierWorkforceCommandBoundary>([
  "candidate_disclose",
  "candidate_session",
  "candidate_evaluate",
  "commercial_approve",
  "person_resolve",
  "engagement_activate",
  "placement_change",
  "compliance_change",
  "engagement_end",
  "iam_project",
]);

/** Fail closed until both open architecture decisions have signed coordinates. */
export function evaluateSupplierWorkforceGate(
  boundary: SupplierWorkforceCommandBoundary,
  policies: SupplierWorkforcePolicyCoordinates,
): SupplierWorkforceGateDecision {
  const reasonCodes: SupplierWorkforceGateDecision["reasonCodes"][number][] =
    [];
  const policyHashes: string[] = [];
  if (commercialBoundaries.has(boundary)) {
    if (!validPolicy(policies.commercial, "BP-Q004"))
      reasonCodes.push("BP_Q004_COMMERCIAL_POLICY_REQUIRED");
    else policyHashes.push(policies.commercial.hash);
  }
  if (candidateBoundaries.has(boundary)) {
    if (!validPolicy(policies.candidatePrivacy, "BP-Q006"))
      reasonCodes.push("BP_Q006_CANDIDATE_PRIVACY_POLICY_REQUIRED");
    else policyHashes.push(policies.candidatePrivacy.hash);
  }
  return Object.freeze({
    allowed: reasonCodes.length === 0,
    reasonCodes: Object.freeze(reasonCodes),
    policyHashes: Object.freeze(policyHashes.sort()),
  });
}

export function parseSupplierWorkforcePolicyCoordinates(
  source: string | undefined,
): SupplierWorkforcePolicyCoordinates {
  if (!source?.trim()) return Object.freeze({});
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new TypeError("Supplier Workforce policy coordinates must be valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Supplier Workforce policy coordinates must be an object");
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row))
    if (!['commercial', 'candidatePrivacy'].includes(key))
      throw new TypeError(`Unknown Supplier Workforce policy coordinate: ${key}`);
  const commercial = row["commercial"] as ApprovedPolicyCoordinate | undefined;
  const candidatePrivacy = row["candidatePrivacy"] as ApprovedPolicyCoordinate | undefined;
  if (commercial !== undefined && !validPolicy(commercial, "BP-Q004"))
    throw new TypeError("BP-Q004 policy coordinate is not an approved Workforce/Procurement/Legal decision");
  if (candidatePrivacy !== undefined && !validPolicy(candidatePrivacy, "BP-Q006"))
    throw new TypeError("BP-Q006 policy coordinate is not an approved Privacy/Legal/Workforce decision");
  return Object.freeze({
    ...(commercial ? { commercial: freezeCoordinate(commercial) } : {}),
    ...(candidatePrivacy ? { candidatePrivacy: freezeCoordinate(candidatePrivacy) } : {}),
  });
}

export function getSupplierWorkforcePolicyReadiness(
  policies: SupplierWorkforcePolicyCoordinates,
): SupplierWorkforcePolicyReadiness {
  const boundaries = Object.fromEntries([
    "requisition_publish", "candidate_disclose", "candidate_session", "candidate_evaluate",
    "commercial_approve", "person_resolve", "engagement_activate",
    "placement_change", "compliance_change", "engagement_end", "iam_project",
  ].map((boundary) => [boundary, evaluateSupplierWorkforceGate(boundary as SupplierWorkforceCommandBoundary, policies)])) as SupplierWorkforcePolicyReadiness["boundaries"];
  return Object.freeze({
    decisions: Object.freeze({
      "BP-Q004": summary(policies.commercial, "BP-Q004"),
      "BP-Q006": summary(policies.candidatePrivacy, "BP-Q006"),
    }),
    boundaries: Object.freeze(boundaries),
  });
}

function validPolicy(
  value: ApprovedPolicyCoordinate | undefined,
  expected: ApprovedPolicyCoordinate["decisionId"],
): value is ApprovedPolicyCoordinate {
  return Boolean(
    value &&
    value.decisionId === expected &&
    Number.isSafeInteger(value.version) &&
    value.version > 0 &&
    /^[a-f0-9]{64}$/.test(value.hash) &&
    !Number.isNaN(Date.parse(value.approvedAt)) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.approvalEvidenceId) &&
    sameRoles(value.approvedByRoles, supplierWorkforcePolicyApproverRoles[expected]),
  );
}

function sameRoles(left: readonly string[] | undefined, right: readonly string[]) {
  return Array.isArray(left) && left.length === right.length && [...left].sort().join("|") === [...right].sort().join("|");
}
function freezeCoordinate(value: ApprovedPolicyCoordinate): ApprovedPolicyCoordinate { return Object.freeze({ ...value, approvedByRoles: Object.freeze([...value.approvedByRoles]) }); }
function summary(value: ApprovedPolicyCoordinate | undefined, expected: ApprovedPolicyCoordinate["decisionId"]){return validPolicy(value,expected)?Object.freeze({status:"approved" as const,version:value.version,hash:value.hash,approvalEvidenceId:value.approvalEvidenceId}):Object.freeze({status:"pending" as const});}
