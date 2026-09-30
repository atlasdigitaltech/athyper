import { describe, it, expect } from "vitest";
import type {
  ApprovalRequest,
  CompiledWorkflowDefinition,
  WorkflowStageDraft,
} from "@athyper/server-contract-workflow";
import { createTaskApprovalRunner } from "../task-approval-runner.js";
const level = (
  code: string,
  quorum: WorkflowStageDraft["quorum"],
): WorkflowStageDraft => ({
  code,
  name: code,
  mode: "serial",
  approvers: [{ kind: "role", roleCode: code }],
  quorum,
});
function fixture(
  stages: readonly WorkflowStageDraft[],
  candidates: Record<string, string[]>,
) {
  let saved: ApprovalRequest | null = null;
  const resolved: string[] = [];
  const runner = createTaskApprovalRunner<undefined>({
    persistence: {
      get: async () => saved,
      create: async (r) => {
        saved = r;
      },
      save: async (r) => {
        saved = r;
      },
    },
    resolve: async (s) => {
      resolved.push(s.code);
      return {
        resolverVersion: "test/1",
        resolvedAt: new Date().toISOString(),
        strategy: "role",
        fallbackPath: [],
        candidates: (candidates[s.code] ?? []).map((principalId) => ({
          principalId,
          source: `role:${s.code}`,
        })),
      };
    },
  });
  const definition: CompiledWorkflowDefinition = {
    code: "task.test",
    name: "Test",
    entityType: "cycle_task",
    version: 1,
    artifactHash: "a".repeat(64),
    compiledAt: new Date().toISOString(),
    stages,
  };
  const start = () =>
    runner.start(
      { tenantId: "tenant", taskId: "task", makerIds: ["maker"], definition },
      undefined,
    );
  const vote = (r: ApprovalRequest, stage: number, principalId: string) =>
    runner.accept(
      {
        tenantId: "tenant",
        definition,
        workflowRequestId: r.id,
        workflowStageId: r.stages[stage]!.id,
        principalId,
        makerIds: ["maker"],
      },
      undefined,
    );
  return { start, vote, resolved, get: () => saved };
}
describe("task-owned level runner", () => {
  it("refreshes the next level's directory when it activates", async () => {
    const people = { first: ["a"], second: ["old"] };
    const f = fixture(
      [level("first", { kind: "all" }), level("second", { kind: "all" })],
      people,
    );
    const r = await f.start();
    people.second = ["new"];
    const advanced = await f.vote(r, 0, "a");
    expect(
      advanced.request.stages[1]!.eligibilityEvidence.candidates[0]!
        .principalId,
    ).toBe("new");
    await expect(f.vote(r, 1, "old")).rejects.toMatchObject({
      code: "TASK_VOTE_NOT_ACTIONABLE",
    });
    expect((await f.vote(r, 1, "new")).outcome).toBe("task_accepted");
  });

  it("resolves each level separately, excludes maker and preserves all/count quorum", async () => {
    const f = fixture(
      [
        level("first", { kind: "all" }),
        level("second", { kind: "count", value: 1 }),
      ],
      { first: ["maker", "a", "b", "a"], second: ["c", "d"] },
    );
    const r = await f.start();
    expect(f.resolved).toEqual(["first", "second"]);
    expect(
      r.stages[0]!.eligibilityEvidence.candidates.map((c) => c.principalId),
    ).toEqual(["a", "b"]);
    await expect(f.vote(r, 1, "c")).rejects.toMatchObject({
      code: "TASK_VOTE_NOT_ACTIONABLE",
    });
    expect((await f.vote(r, 0, "a")).outcome).toBe("pending");
    await expect(f.vote(r, 0, "a")).rejects.toMatchObject({
      code: "TASK_VOTE_NOT_ACTIONABLE",
    });
    expect((await f.vote(r, 0, "b")).request.stages[1]!.status).toBe("active");
    expect((await f.vote(r, 1, "c")).outcome).toBe("task_accepted");
    await expect(f.vote(r, 1, "d")).rejects.toMatchObject({
      code: "TASK_VOTE_NOT_ACTIONABLE",
    });
  });
  it("rejects maker and unassigned voters", async () => {
    const f = fixture([level("one", { kind: "any" })], { one: ["a", "maker"] });
    const r = await f.start();
    await expect(f.vote(r, 0, "maker")).rejects.toMatchObject({
      code: "TASK_MAKER_CHECKER",
    });
    await expect(f.vote(r, 0, "outsider")).rejects.toMatchObject({
      code: "TASK_VOTE_NOT_ACTIONABLE",
    });
    expect(f.get()!.status).toBe("pending");
  });
  it.each([{ ids: [] }, { ids: ["maker"] }])(
    "blocks an empty eligible level %j",
    async ({ ids }) => {
      const f = fixture([level("one", { kind: "all" })], { one: ids });
      await expect(f.start()).rejects.toMatchObject({
        code: "TASK_QUORUM_UNSATISFIABLE",
      });
      expect(f.get()).toBeNull();
    },
  );
  it.each([
    { kind: "count" as const, value: 3 },
    { kind: "count" as const, value: 0 },
    { kind: "percentage" as const, value: 101 },
  ])("blocks impossible quorum %j", async (quorum) => {
    const f = fixture([level("one", quorum)], { one: ["a", "b"] });
    await expect(f.start()).rejects.toMatchObject({
      code: "TASK_QUORUM_UNSATISFIABLE",
    });
  });
  it("uses percentage threshold without completing after a partial vote", async () => {
    const f = fixture([level("one", { kind: "percentage", value: 75 })], {
      one: ["a", "b", "c"],
    });
    const r = await f.start();
    expect((await f.vote(r, 0, "a")).outcome).toBe("pending");
    expect((await f.vote(r, 0, "b")).outcome).toBe("pending");
    expect((await f.vote(r, 0, "c")).outcome).toBe("task_accepted");
  });
});
