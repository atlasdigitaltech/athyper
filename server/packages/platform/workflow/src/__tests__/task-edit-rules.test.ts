import { describe, expect, it } from "vitest";
import type { PolicyDecision, PolicyRuleOutcome } from "@athyper/server-contract-policy";
import { evaluateTaskEditOutcomes, taskFieldChanges } from "../task-edit-rules.js";

const revision = { definitionId: "policy", version: 2, hash: "a".repeat(64) };
const outcome = (ruleId: string, paths: string[], effect: "deny" | "metadata_only" | "full_reapproval"): PolicyRuleOutcome => ({
  policyId: "policy", policyVersionNo: 2, policyName: "Edits", ruleId,
  action: effect === "deny" ? "deny" : "require_workflow",
  actionConfig: { schema: "athyper.task-edit-result/1", paths, effect },
});
function evaluate(before: Record<string, unknown>, after: Record<string, unknown>, outcomes: PolicyRuleOutcome[]) {
  const decision: PolicyDecision = { action: "require_workflow", permitted: true, outcomes,
    evaluatedPolicyIds: ["policy"], evaluatedPolicies: [{ id: "policy", versionNo: 2 }] };
  return evaluateTaskEditOutcomes({ revision, evaluatedHash: revision.hash, evaluationMode: "all", decision,
    changes: taskFieldChanges(before, after), metadataPaths: ["/privateNote"] });
}

describe("server field changes", () => {
  it("distinguishes absent/null, nested changes, removed objects and replaced arrays", () => {
    expect(taskFieldChanges({ person: { name: "A" }, bank: { id: "x" }, lines: [1] }, { person: { name: "B" }, reason: null, lines: [2] }))
      .toMatchObject([{ path: "/bank", beforePresent: true, afterPresent: false },
        { path: "/lines", before: [1], after: [2] }, { path: "/person/name", before: "A", after: "B" },
        { path: "/reason", beforePresent: false, afterPresent: true, after: null }]);
  });
  it("ignores object property order and escapes JSON pointer keys", () => {
    expect(taskFieldChanges({ x: { b: 1, a: 2 } }, { x: { a: 2, b: 1 } })).toEqual([]);
    expect(taskFieldChanges({}, { "a/b~c": 1 })[0]?.path).toBe("/a~1b~0c");
  });
});

describe("conservative edit outcomes", () => {
  it("allows only covered metadata without resubmission", () => {
    expect(evaluate({}, { privateNote: "note" }, [outcome("note", ["/privateNote"], "metadata_only")]))
      .toMatchObject({ permitted: true, effect: "metadata_only", requiresResubmission: false });
  });
  it("requires resubmission for a material change mixed with metadata", () => {
    expect(evaluate({}, { privateNote: "note", bank: "new" }, [outcome("note", ["/privateNote"], "metadata_only"), outcome("bank", ["/bank"], "full_reapproval")]))
      .toMatchObject({ permitted: true, effect: "full_reapproval", requiresResubmission: true });
  });
  it("does not authorize an uncovered field or an absent result", () => {
    expect(evaluate({}, { bank: "new" }, [])).toMatchObject({ permitted: false, uncoveredPaths: ["/bank"] });
  });
  it("denial beats a material allow irrespective of outcome ordering", () => {
    for (const outcomes of [[outcome("allow", ["/bank"], "full_reapproval"), outcome("deny", ["/bank"], "deny")],
      [outcome("deny", ["/bank"], "deny"), outcome("allow", ["/bank"], "full_reapproval")]])
      expect(evaluate({}, { bank: "new" }, outcomes).permitted).toBe(false);
  });
  it("metadata permission cannot cover approval content", () => {
    expect(evaluate({}, { bank: "new" }, [outcome("bad", ["/bank"], "metadata_only")]).permitted).toBe(false);
  });
  it("a child field rule cannot authorize deletion of its parent object", () => {
    expect(evaluate({ bank: { id: "x" } }, {}, [outcome("child", ["/bank/id"], "full_reapproval")]).permitted).toBe(false);
  });
  it("rejects outcomes from another revision or unsafe action envelope", () => {
    expect(() => evaluate({}, { bank: "new" }, [{ ...outcome("bad", ["/bank"], "full_reapproval"), policyVersionNo: 3 }])).toThrow();
    expect(() => evaluate({}, { bank: "new" }, [{ ...outcome("bad", ["/bank"], "full_reapproval"), action: "allow" }])).toThrow();
  });
});
