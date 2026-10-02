import { sha256 } from "./deterministic.js";
import { describe, expect, it } from "vitest";
import type { AtlasLearningHandoff } from "@athyper/server-contract-metadata";
import { createLearningEvaluationReceipt, assertLearningEvaluationReceipt } from "./learning-evaluation-receipt.js";
const input = {
  proposal: { candidateId: "candidate", proposalHash: "proposal", sourceReleaseId: "source", sourceDescriptorHash: "descriptor", sourceContractHash: "contract", entityCode: "country", tenantId: "tenant", originPlane: "studio", submittedBy: "proposer" } as AtlasLearningHandoff,
  descriptorHash: "persisted", ai: { enabled: true }, reviewerId: "reviewer", evaluatedAt: "2026-10-01T00:00:00.000Z",
  evaluation: { passed: true, fixtureHash: "fixtures", resolverVersion: "resolver/1", scoringVersion: "scoring/1", fixtures: [{ question: "summary" }], results: [{ passed: true }] },
};
describe("learning evaluation receipt", () => {
  it("binds reviewed evaluation to persisted artifact without claiming frozen fixtures", () => {
    const receipt = createLearningEvaluationReceipt(input);
    expect(receipt.fixtureGovernance).toBe("reviewer-submitted");
    expect(() => assertLearningEvaluationReceipt({ ...input, receipt })).not.toThrow();
  });
  it("rejects changes to source, persisted semantics, fixture results and reviewer", () => {
    const receipt = createLearningEvaluationReceipt(input);
    for (const patch of [
      { descriptorHash: "edited" }, { ai: { enabled: false } }, { reviewerId: "another" },
      { proposal: { ...input.proposal, sourceReleaseId: "new-source" } },
      { evaluation: { ...input.evaluation, fixtures: [{ question: "different" }] } },
      { evaluation: { ...input.evaluation, scoringVersion: "scoring/2" } },
      { evaluation: { ...input.evaluation, results: [{ passed: false }] } },
    ]) expect(() => assertLearningEvaluationReceipt({ ...input, ...patch, receipt })).toThrow();
    expect(() => assertLearningEvaluationReceipt(input)).toThrow();
  });
  it("accepts provider-controlled fixtures only with bound content and separate authorship", () => {
    const controlledFixtureSet = { id: "benchmark/1", contentHash: sha256(input.evaluation.fixtures), authorId: "benchmark-author", approvedBy: "benchmark-approver", lockedAt: "2026-09-30T00:00:00.000Z" };
    const receipt = createLearningEvaluationReceipt({ ...input, controlledFixtureSet });
    expect(receipt.fixtureGovernance).toBe("independently-controlled");
    expect(() => assertLearningEvaluationReceipt({ ...input, receipt })).not.toThrow();
    for (const patch of [{ lockedAt: "2027-01-01T00:00:00.000Z" }, { lockedAt: "bad" }, { contentHash: "wrong" }, { authorId: "reviewer" }, { approvedBy: "proposer" }, { approvedBy: "benchmark-author" }])
      expect(() => createLearningEvaluationReceipt({ ...input, controlledFixtureSet: { ...controlledFixtureSet, ...patch } })).toThrow();
  });
  it("requires successful versioned results and separated reviewer", () => {
    for (const patch of [{ reviewerId: "proposer" }, { evaluation: { ...input.evaluation, passed: false } },
      { evaluation: { ...input.evaluation, scoringVersion: undefined } }, { evaluatedAt: "invalid" }])
      expect(() => createLearningEvaluationReceipt({ ...input, ...patch })).toThrow();
  });
});
