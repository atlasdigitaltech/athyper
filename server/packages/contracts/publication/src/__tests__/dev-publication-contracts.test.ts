import { describe, expect, it } from "vitest";
import { parseDevPublicationPolicy } from "../policy/dev-publication-policy.js";
import { parseDevPublicationAssessment } from "../evidence/dev-publication-decision.js";

const target = { tenantId: "11111111-1111-4111-8111-111111111111", plane: "neon", entityCode: "reference_example" };
const policy = { schema: "athyper.dev-publication-policy/1", mode: "assessment_only", environment: "dev", policyId: "reference.presentation", revision: 1, targets: [target], allowedChanges: ["labels"], maxLabelLength: 80 };
const digest = `sha256:${"a".repeat(64)}`;
const receipt = { schema: "athyper.dev-publication-assessment/1", authority: "none", hashSchema: "dev-assessment-json/1",
  policyId: policy.policyId, policyRevision: policy.revision,
  policyHash: digest, candidateHash: digest, baselineHash: digest, target,
  initiatingPrincipalId: target.tenantId, assessorId: "22222222-2222-4222-8222-222222222222",
  assessedAt: "2026-09-26T10:00:00.000Z", outcome: "eligible", reasons: [], changedPaths: [] };

describe("versioned DEV assessment contracts", () => {
  it("detaches and freezes policy coordinates and assessment collections", () => {
    const source = structuredClone(policy), parsed = parseDevPublicationPolicy(source);
    source.targets[0]!.entityCode = "changed";
    expect(parsed.targets[0]!.entityCode).toBe("reference_example");
    expect(Object.isFrozen(parsed.targets[0])).toBe(true);
    const parsedReceipt = parseDevPublicationAssessment(receipt);
    expect(Object.isFrozen(parsedReceipt.reasons)).toBe(true);
    expect(parsedReceipt.authority).toBe("none");
  });
  it.each([
    { schema: "athyper.dev-publication-policy/2" }, { mode: "automatic" }, { environment: "prod" },
    { targets: [] }, { targets: [target, target] }, { targets: [{ ...target, plane: "common" }] },
    { targets: [{ ...target, plane: ["neon"] }] }, { targets: [{ ...target, tenantId: "*" }] },
    { allowedChanges: ["labels", "labels"] }, { allowedChanges: ["grants"] }, { allowedChanges: [] },
    { maxLabelLength: 10000 }, { maxLabelLength: 0 }, { revision: 1.5 }, { revision: 0 },
    { approved: true },
    { allowedChanges: Array(1) }, { targets: Array(1) },
  ])("rejects unsupported policy %#", override => {
    expect(() => parseDevPublicationPolicy({ ...policy, ...override })).toThrow();
  });
  it.each([
    { schema: "athyper.dev-publication-assessment/2" }, { authority: "activate" }, { signature: "fake" },
    { hashSchema: "release-hash" }, { policyHash: "unknown" }, { candidateHash: null },
    { baselineHash: null }, { reasons: ["BASELINE_REQUIRED"] }, { assessedAt: "yesterday" },
    { assessedAt: "2026-09-26" }, { initiatingPrincipalId: "anonymous" },
    { outcome: "approved" }, { outcome: ["review_required"], reasons: ["UNSUPPORTED_CHANGE"] },
    { outcome: "review_required", reasons: [] }, { outcome: "review_required", reasons: ["OTHER"] },
    { outcome: "review_required", reasons: ["UNSUPPORTED_CHANGE", "UNSUPPORTED_CHANGE"] },
    { changedPaths: ["not-a-pointer"] }, { changedPaths: ["/fields", "/fields"] },
    { changedPaths: ["/fields/~2"] }, { policyRevision: 0 }, { policyId: "*" },
    { changedPaths: Array(1) }, { outcome: "review_required", reasons: Array(1) },
  ])("rejects malformed or authority-bearing assessment %#", override => {
    expect(() => parseDevPublicationAssessment({ ...receipt, ...override })).toThrow();
  });
  it("represents missing baseline only as review required", () => {
    expect(parseDevPublicationAssessment({ ...receipt, baselineHash: null, outcome: "review_required", reasons: ["BASELINE_REQUIRED"] }).outcome).toBe("review_required");
  });
});
