import { describe, expect, it } from "vitest";
import { createApproverResolver, createWorkflowAuthoringService, evaluateQuorum, scheduleSla } from "../index.js";

describe("workflow bounded modules", () => {
  it("compiles stable immutable revisions", async () => {
    const saved: unknown[] = [];
    const service = createWorkflowAuthoringService({ nextVersion: async () => 3, saveImmutable: async (_tenant, value) => { saved.push(value); }, getActive: async () => null }, () => new Date("2026-08-10T00:00:00Z"));
    const result = await service.compileAndPublish("tenant", { code: "po.approval", name: "PO approval", entityType: "purchase_order", stages: [{ code: "manager", name: "Manager", mode: "serial", approvers: [{ kind: "role", roleCode: "buyer_manager" }], quorum: { kind: "any" } }] });
    expect(result).toMatchObject({ version: 3, artifactHash: expect.stringMatching(/^[a-f0-9]{64}$/) }); expect(saved).toHaveLength(1);
  });

  it("retains every sorted candidate and explicit fallback evidence", async () => {
    const resolver = createApproverResolver({ byRole: async () => [], byGroup: async () => ["b", "a"], hierarchy: async () => [] }, "resolver/2", () => new Date("2026-08-10T00:00:00Z"));
    const evidence = await resolver.resolve({ tenantId: "tenant", subjectPrincipalId: "subject", selectors: [{ kind: "role", roleCode: "missing" }], fallback: [{ kind: "group", groupCode: "controllers" }] });
    expect(evidence).toMatchObject({ strategy: "fallback", fallbackPath: ["fallback"], candidates: [{ principalId: "a" }, { principalId: "b" }] });
    expect(evidence.selectedPrincipalId).toBeUndefined();
  });

  it("evaluates quorum and creates versioned SLA schedules", () => {
    expect(evaluateQuorum({ kind: "count", value: 2 }, 3, [{ principalId: "a", decision: "approved" }, { principalId: "b", decision: "approved" }])).toBe("approved");
    expect(scheduleSla({ code: "standard", version: 4, durationMinutes: 60, reminderMinutes: [30] }, new Date("2026-08-10T00:00:00Z"))).toMatchObject({ policyVersion: 4, dueAt: "2026-08-10T01:00:00.000Z" });
  });
});
