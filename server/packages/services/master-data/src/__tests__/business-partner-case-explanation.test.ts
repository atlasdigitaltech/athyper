import { describe, expect, it } from "vitest";
import type { BusinessPartnerRequestView } from "@athyper/server-contract-master-data";
import { projectBusinessPartnerCaseExplanation } from "../business-partner-case-explanation.js";
const view = {
  request: {id: "case-1", rowVersion: 7, schema: {hash: "hash"}, status: "draft", validationSummary: {outcome: "passed"}, proposedPayload: {requestedRole: "customer", bankAccount: "secret-current"}},
  snapshotId: "snapshot-7", validationCurrent: true,
  previousSnapshot: {id: "snapshot-6", revision: 6, payload: {requestedRole: "supplier", bankAccount: "secret-baseline"}},
  validationFindings: [
    {ruleCode: "organization.operating.required", outcome: "failed", evidenceReference: {secret: "secret-evidence"}},
    {ruleCode: "identity.legal_name.duplicate", outcome: "failed", evidenceReference: {candidateCount: 42}},
  ],
} as unknown as BusinessPartnerRequestView;
describe("saved case explanation disclosure", () => {
  it("pins partial changes to the previous saved snapshot and omits protected values and findings", () => {
    const result = projectBusinessPartnerCaseExplanation(view, true);
    expect(result).toMatchObject({caseId: "case-1", rowVersion: 7, snapshotId: "snapshot-7", coverage: "partial", diff: {baselineSnapshotId: "snapshot-6", baselineRevision: 6, changes: [{field: "requestedRole", before: "supplier", after: "customer"}]}});
    expect(result.findings).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/secret|candidateCount|duplicate/);
  });
  it("never treats a previous evaluation as current validation after an edit", () => {
    expect(projectBusinessPartnerCaseExplanation({...view, validationCurrent: false}, true)).toMatchObject({validation: "not_evaluated", findings: []});
  });
  it("withholds the entire diff when baseline scope is unauthorized", () => {
    expect(projectBusinessPartnerCaseExplanation(view, false).diff).toEqual({state: "unavailable", baseline: "previous_saved_snapshot", changes: []});
  });
  it("does not call an empty partial diff a complete no-change result", () => {
    expect(projectBusinessPartnerCaseExplanation({...view, previousSnapshot: {...view.previousSnapshot!, payload: view.request.proposedPayload}}, true).diff).toMatchObject({state: "partial", changes: []});
  });
  it("fails closed without a saved snapshot", () => {
    expect(() => projectBusinessPartnerCaseExplanation({...view, snapshotId: undefined}, true)).toThrow("Saved case evidence is unavailable");
  });
});
