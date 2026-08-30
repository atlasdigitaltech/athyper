export type BusinessPartner360RolloutStage = "internal" | "canary" | "broad";
export const BUSINESS_PARTNER_360_APPROVAL_GATES = [
  "functional",
  "data",
  "security_privacy",
  "contract",
  "performance",
  "resilience",
  "ux",
  "operations",
] as const;
export type BusinessPartner360ApprovalGate =
  (typeof BUSINESS_PARTNER_360_APPROVAL_GATES)[number];
export interface BusinessPartner360ApprovalEvidence {
  readonly gate: BusinessPartner360ApprovalGate;
  readonly status: "approved";
  readonly approverId: string;
  readonly approvedAt: string;
  readonly evidenceRef: string;
}
export interface BusinessPartner360ReleaseEvidence {
  readonly stage: BusinessPartner360RolloutStage;
  readonly observationMinutes: number;
  readonly requestCount: number;
  readonly summaryP95Ms: number;
  readonly sectionP95Ms: number;
  readonly errorRate: number;
  readonly meshFallbackRate: number;
  readonly summaryPayloadP95Bytes: number;
  readonly sectionPayloadP95Bytes: number;
  readonly definitionUnavailableCount: number;
  readonly functionalPassed: boolean;
  readonly dataPassed: boolean;
  readonly securityPrivacyPassed: boolean;
  readonly contractPassed: boolean;
  readonly performancePassed: boolean;
  readonly resiliencePassed: boolean;
  readonly uxPassed: boolean;
  readonly operationsPassed: boolean;
  readonly approvals: readonly BusinessPartner360ApprovalEvidence[];
}
export interface BusinessPartner360ReleaseDecision {
  readonly decision: "promote" | "hold" | "rollback";
  readonly reasons: readonly string[];
  readonly nextStage?: BusinessPartner360RolloutStage;
}
export interface BusinessPartner360RetirementEvidence {
  readonly legacyCalls: number;
  readonly observationDays: number;
  readonly telemetryRetentionDays: number;
  readonly trafficEvidenceRef?: string;
  readonly zeroCallWindowStartedAt?: string;
  readonly zeroCallWindowEndedAt?: string;
  readonly knownConsumers: number;
  readonly compatibilityTestsPassed: boolean;
  readonly rollbackApproved: boolean;
  readonly rollbackApprovalRef?: string;
  readonly ownerApprovals: readonly BusinessPartner360RetirementApproval[];
}
export interface BusinessPartner360RetirementApproval {
  readonly ownerRole: string;
  readonly approverId: string;
  readonly approvedAt: string;
  readonly evidenceRef: string;
}

export function evaluateBusinessPartner360Release(
  input: BusinessPartner360ReleaseEvidence,
): BusinessPartner360ReleaseDecision {
  const reasons: string[] = [];
  if (input.observationMinutes < requiredObservation(input.stage))
    reasons.push("OBSERVATION_WINDOW_INCOMPLETE");
  if (input.requestCount < requiredSamples(input.stage))
    reasons.push("SAMPLE_SIZE_INSUFFICIENT");
  if (input.summaryP95Ms > 500) reasons.push("SUMMARY_P95_EXCEEDED");
  if (input.sectionP95Ms > 750) reasons.push("SECTION_P95_EXCEEDED");
  if (input.errorRate > 0.01) reasons.push("ERROR_RATE_EXCEEDED");
  if (input.meshFallbackRate > 0.05)
    reasons.push("MESH_FALLBACK_RATE_EXCEEDED");
  if (input.summaryPayloadP95Bytes > 75 * 1024)
    reasons.push("SUMMARY_PAYLOAD_EXCEEDED");
  if (input.sectionPayloadP95Bytes > 100 * 1024)
    reasons.push("SECTION_PAYLOAD_EXCEEDED");
  if (input.definitionUnavailableCount > 0)
    reasons.push("DEFINITION_UNAVAILABLE");
  for (const [gate, passed] of Object.entries({
    FUNCTIONAL: input.functionalPassed,
    DATA: input.dataPassed,
    SECURITY_PRIVACY: input.securityPrivacyPassed,
    CONTRACT: input.contractPassed,
    PERFORMANCE: input.performancePassed,
    RESILIENCE: input.resiliencePassed,
    UX: input.uxPassed,
    OPERATIONS: input.operationsPassed,
  }))
    if (!passed) reasons.push(`${gate}_GATE_FAILED`);
  reasons.push(...evaluateBusinessPartner360Approvals(input.approvals));
  const rollback = reasons.some(
    (reason) =>
      reason.endsWith("EXCEEDED") ||
      reason === "SECURITY_PRIVACY_GATE_FAILED" ||
      reason === "CONTRACT_GATE_FAILED" ||
      reason === "DEFINITION_UNAVAILABLE",
  );
  if (reasons.length)
    return {
      decision: rollback ? "rollback" : "hold",
      reasons: Object.freeze(reasons),
    };
  const nextStage =
    input.stage === "internal"
      ? "canary"
      : input.stage === "canary"
        ? "broad"
        : undefined;
  return {
    decision: "promote",
    reasons: [],
    ...(nextStage ? { nextStage } : {}),
  };
}
export function evaluateBusinessPartner360Approvals(
  approvals: readonly BusinessPartner360ApprovalEvidence[],
) {
  const reasons: string[] = [],
    byGate = new Map<string, BusinessPartner360ApprovalEvidence[]>();
  for (const approval of approvals)
    byGate.set(approval.gate, [...(byGate.get(approval.gate) ?? []), approval]);
  for (const gate of BUSINESS_PARTNER_360_APPROVAL_GATES) {
    const records = byGate.get(gate) ?? [];
    if (records.length !== 1) {
      reasons.push(`${gate.toUpperCase()}_APPROVAL_${records.length ? "DUPLICATE" : "MISSING"}`);
      continue;
    }
    const record = records[0]!;
    if (
      record.status !== "approved" ||
      !/^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$/.test(record.approverId) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(record.approvedAt) ||
      Number.isNaN(Date.parse(record.approvedAt)) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{5,255}$/.test(record.evidenceRef)
    )
      reasons.push(`${gate.toUpperCase()}_APPROVAL_INVALID`);
  }
  for (const gate of byGate.keys())
    if (!BUSINESS_PARTNER_360_APPROVAL_GATES.includes(gate as BusinessPartner360ApprovalGate))
      reasons.push("UNKNOWN_APPROVAL_GATE");
  return Object.freeze(reasons);
}
export function evaluateBusinessPartner360Retirement(
  input: BusinessPartner360RetirementEvidence,
) {
  const reasons: string[] = [];
  if (input.legacyCalls !== 0) reasons.push("LEGACY_TRAFFIC_PRESENT");
  if (input.knownConsumers !== 0) reasons.push("KNOWN_CONSUMERS_REMAIN");
  if (input.observationDays < 30) reasons.push("OBSERVATION_WINDOW_INCOMPLETE");
  if (input.telemetryRetentionDays < 30)
    reasons.push("TELEMETRY_RETENTION_INSUFFICIENT");
  if (!durableReference(input.trafficEvidenceRef))
    reasons.push("TRAFFIC_EVIDENCE_MISSING");
  if (!validZeroCallWindow(input)) reasons.push("ZERO_CALL_WINDOW_INVALID");
  if (!input.compatibilityTestsPassed)
    reasons.push("COMPATIBILITY_GATE_FAILED");
  if (!input.rollbackApproved) reasons.push("ROLLBACK_NOT_APPROVED");
  else if (!durableReference(input.rollbackApprovalRef))
    reasons.push("ROLLBACK_APPROVAL_INVALID");
  if (
    input.ownerApprovals.length < 3 ||
    new Set(input.ownerApprovals.map((approval) => approval.approverId)).size < 3 ||
    input.ownerApprovals.some((approval) =>
      !approval.ownerRole.trim() ||
      !actor(approval.approverId) ||
      !timestamp(approval.approvedAt) ||
      !durableReference(approval.evidenceRef))
  )
    reasons.push("OWNER_APPROVALS_INCOMPLETE");
  return { approved: reasons.length === 0, reasons: Object.freeze(reasons) };
}
function validZeroCallWindow(input: BusinessPartner360RetirementEvidence) {
  if (!timestamp(input.zeroCallWindowStartedAt) || !timestamp(input.zeroCallWindowEndedAt)) return false;
  const elapsedDays = (Date.parse(input.zeroCallWindowEndedAt) - Date.parse(input.zeroCallWindowStartedAt)) / 86_400_000;
  return elapsedDays >= 30 && input.observationDays >= 30 && input.telemetryRetentionDays >= Math.ceil(elapsedDays);
}
function actor(value: string | undefined): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$/.test(value); }
function timestamp(value: string | undefined): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)); }
function durableReference(value: string | undefined): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/#-]{5,255}$/.test(value); }
function requiredObservation(stage: BusinessPartner360RolloutStage) {
  return stage === "internal" ? 60 : stage === "canary" ? 24 * 60 : 7 * 24 * 60;
}
function requiredSamples(stage: BusinessPartner360RolloutStage) {
  return stage === "internal" ? 100 : stage === "canary" ? 1_000 : 10_000;
}
