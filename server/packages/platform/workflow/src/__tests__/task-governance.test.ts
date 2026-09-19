import { describe, expect, it } from "vitest";
import type { TaskGovernanceContract, TaskCaseAuthority } from "@athyper/server-contract-workflow";
import { filterTaskCandidates, requiredTaskVotes, taskCaseActions, validateTaskGovernance } from "../task-governance.js";
import { evaluateQuorum } from "../approvals.js";

const authority: TaskCaseAuthority = { schema: "athyper.task-case-authority/1", returnForChanges: false, rejectProposal: false };
const catalog = (): TaskGovernanceContract => ({ schema: "athyper.task-governance/1", tasks: [
  { code: "collect", kind: "todo", responsibility: "Collect certificate", mandatory: true, outcomeScope: "task", caseAuthority: authority,
    inputPaths: ["/certificate"], predecessors: [], completionOwner: "document.evidence" },
  { code: "review", kind: "review", responsibility: "Verify identity", mandatory: true, outcomeScope: "task", caseAuthority: authority,
    inputPaths: ["/registeredName"], predecessors: ["collect"], completionOwner: "workflow.review" },
  { code: "approve", kind: "approval", responsibility: "Authorize onboarding", mandatory: true, outcomeScope: "case_final_decision", caseAuthority: authority,
    inputPaths: ["/registeredName"], predecessors: ["review"], completionOwner: "case.decision" },
] });

describe("published task authority", () => {
  it("retains legacy return/reject only when the authority is absent", () => {
    expect(taskCaseActions(undefined)).toEqual(["return", "reject"]);
    expect(taskCaseActions(authority)).toEqual([]);
    expect(taskCaseActions({ ...authority, returnForChanges: true })).toEqual(["return"]);
  });
  it.each([null, {}, { ...authority, schema: "unknown" }, { ...authority, rejectProposal: "true" }, { ...authority, approve: true }])(
    "fails closed for malformed authority %j", value => {
      expect(() => taskCaseActions(value as TaskCaseAuthority)).toThrow();
    });
  it("accepts a mandatory work/review/final-approval chain", () => expect(() => validateTaskGovernance(catalog())).not.toThrow());
  it.each([
    (c: TaskGovernanceContract) => ({ ...c, tasks: c.tasks.map(t => t.code === "review" ? { ...t, outcomeScope: "case_final_decision" as const } : t) }),
    (c: TaskGovernanceContract) => ({ ...c, tasks: c.tasks.map(t => t.code === "collect" ? { ...t, caseAuthority: { ...authority, rejectProposal: true } } : t) }),
    (c: TaskGovernanceContract) => ({ ...c, tasks: c.tasks.map(t => t.code === "approve" ? { ...t, predecessors: [] } : t) }),
    (c: TaskGovernanceContract) => ({ ...c, tasks: c.tasks.map(t => t.code === "collect" ? { ...t, predecessors: ["approve"] } : t) }),
    (c: TaskGovernanceContract) => ({ ...c, tasks: c.tasks.map(t => t.code === "review" ? { ...t, predecessors: ["missing"] } : t) }),
  ])("rejects unsafe task authority/dependencies", change => expect(() => validateTaskGovernance(change(catalog()))).toThrow());
});

describe("candidate filter controls", () => {
  it("cannot auto-approve an empty generic workflow or missing count threshold", () => {
    expect(() => evaluateQuorum({ kind: "all" }, 0, [])).toThrow();
    expect(() => evaluateQuorum({ kind: "count" }, 1, [{ principalId: "a", decision: "approved" }])).toThrow();
  });
  it("records exclusions without reducing the configured count quorum", () => {
    const result = filterTaskCandidates({ responsibility: "finance", makerIds: ["maker"], independentFrom: ["other-voter"],
      quorum: { kind: "count", value: 2 }, candidates: ["maker", "a", "a", "other-voter", "b"].map(principalId => ({ principalId, eligible: true })) });
    expect(result).toMatchObject({ eligiblePrincipalIds: ["a", "b"], requiredVotes: 2,
      excluded: [{ reason: "maker" }, { reason: "duplicate" }, { reason: "independence_conflict" }] });
  });
  it("cannot override ineligibility with a duplicate eligible observation", () => {
    expect(() => filterTaskCandidates({ responsibility: "finance", makerIds: [], quorum: { kind: "any" },
      candidates: [{ principalId: "a", eligible: false }, { principalId: "a", eligible: true }] })).toThrow();
  });
  it.each([
    [{ kind: "all" as const }, 0], [{ kind: "count" as const, value: 3 }, 2],
    [{ kind: "count" as const, value: 1.5 }, 2], [{ kind: "percentage" as const, value: 101 }, 2],
    [{ kind: "percentage" as const, value: 0 }, 2],
  ] as const)("blocks unsatisfiable quorum %j", (q, n) => expect(() => requiredTaskVotes(q, n)).toThrow());
});
