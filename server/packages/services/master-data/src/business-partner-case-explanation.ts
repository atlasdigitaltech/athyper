import type { BusinessPartnerCaseExplanation, BusinessPartnerRequestView } from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

// Only case routing fields are approved here. Identity, bank, duplicate and
// relationship evidence need their own field-disclosure contracts.
const fields = ["requestedRole", "operatingOrganizationId", "companyCodeId"] as const;
const messages: Readonly<Record<string, string>> = {
  "role.requested.required": "Select the requested partner role.",
  "role.request_kind.compatible": "The requested role must match the case operation.",
  "organization.operating.required": "Select an operating organization.",
  "customer.sales_scope.required": "Select the customer sales scope.",
};
export function projectBusinessPartnerCaseExplanation(view: BusinessPartnerRequestView, baselineAllowed: boolean): BusinessPartnerCaseExplanation {
  const request = view.request;
  if (!view.snapshotId) throw new MasterDataError(503, "CASE_EVIDENCE_UNAVAILABLE", "Saved case evidence is unavailable");
  const outcome = request.validationSummary.outcome;
  const validation = view.validationCurrent === true && (outcome === "passed" || outcome === "failed") ? outcome : "not_evaluated";
  const previous = baselineAllowed ? view.previousSnapshot : undefined;
  const value = (payload: Readonly<Record<string, unknown>>, field: string): string | null => typeof payload[field] === "string" ? payload[field] as string : null;
  return {
    caseId: request.id, rowVersion: request.rowVersion, snapshotId: view.snapshotId,
    descriptorHash: request.schema.hash, status: request.status, validation,
    // Persisted outcome is an owner case assessment, not a completeness claim.
    findings: validation === "not_evaluated" ? [] : view.validationFindings.filter(f => f.outcome === "failed" && Object.hasOwn(messages, f.ruleCode)).map(f => ({code: f.ruleCode, message: messages[f.ruleCode]!})),
    coverage: "partial",
    diff: {
      state: previous ? "partial" : "unavailable", baseline: "previous_saved_snapshot",
      ...(previous ? {baselineSnapshotId: previous.id, baselineRevision: previous.revision} : {}),
      changes: previous ? fields.flatMap(field => {
        const before = value(previous.payload, field), after = value(request.proposedPayload, field);
        return before === after ? [] : [{field, before, after}];
      }) : [],
    },
  };
}
