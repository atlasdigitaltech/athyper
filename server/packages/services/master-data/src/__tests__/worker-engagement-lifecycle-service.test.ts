import { describe, expect, it, vi } from "vitest";
import type { ApprovedPolicyCoordinate } from "@athyper/server-contract-master-data";
import { createSupplierWorkforceCommandGuard } from "../supplier-workforce-command-guard.js";
import { createWorkerEngagementLifecycleService } from "../worker-engagement-lifecycle-service.js";
const id = {
  tenant: "11111111-1111-4111-8111-111111111111",
  actor: "22222222-2222-4222-8222-222222222222",
  engagement: "33333333-3333-4333-8333-333333333333",
  company: "44444444-4444-4444-8444-444444444444",
  placement: "55555555-5555-4555-8555-555555555555",
  outbox: "66666666-6666-4666-8666-666666666666",
  iam: "77777777-7777-4777-8777-777777777777",
};
const context = {
  tenantId: id.tenant,
  principalId: id.actor,
  planeKey: "neon",
  realmKey: "tenant",
  authEpoch: 1,
  assurance: "baseline",
  requestId: "request",
  profileHash: "profile",
  permissions: {},
} as never;
const coordinate = (
  decisionId: ApprovedPolicyCoordinate["decisionId"],
): ApprovedPolicyCoordinate => ({
  decisionId,
  version: 1,
  hash: (decisionId === "BP-Q004" ? "a" : "b").repeat(64),
  approvedAt: "2026-09-05T00:00:00Z",
  approvalEvidenceId:
    decisionId === "BP-Q004"
      ? "88888888-8888-4888-8888-888888888888"
      : "99999999-9999-4999-8999-999999999999",
  approvedByRoles:
    decisionId === "BP-Q004"
      ? ["workforce", "procurement", "legal"]
      : ["privacy", "legal", "workforce"],
});
function fixture(approved: boolean) {
  const activatePlacement = vi.fn(async () => ({
    workerEngagementId: id.engagement,
    placementId: id.placement,
    engagementVersion: 3,
    outboxId: id.outbox,
    replayed: false,
  }));
  const endEngagement = vi.fn(async () => ({
    workerEngagementId: id.engagement,
    engagementVersion: 4,
    iamOutboxId: id.iam,
    iamDesiredHash: "c".repeat(64),
    outboxId: id.outbox,
    replayed: false,
  }));
  const transactions = {
    run: vi.fn(async (_p: any, _a: any, work: any) => work({})),
  };
  const guard = createSupplierWorkforceCommandGuard({
    authorizer: {
      async authorize() {
        return { allowed: true };
      },
    },
    ...(approved
      ? {
          policies: {
            commercial: coordinate("BP-Q004"),
            candidatePrivacy: coordinate("BP-Q006"),
          },
        }
      : {}),
  });
  return {
    service: createWorkerEngagementLifecycleService({
      guard,
      repository: { activatePlacement, endEngagement },
      transactions,
    }),
    activatePlacement,
    endEngagement,
    transactions,
  };
}
describe("BP-WRK-007/008/010 lifecycle commands", () => {
  it("fails closed before transaction and persistence without both decisions", async () => {
    const f = fixture(false);
    await expect(
      f.service.activatePlacement({
        context,
        workerEngagementId: id.engagement,
        expectedVersion: 2,
        idempotencyKey: "placement-001",
        effectiveFrom: "2026-09-05",
        companyCodeId: id.company,
      }),
    ).rejects.toMatchObject({ code: "SUPPLIER_WORKFORCE_POLICY_REQUIRED" });
    await expect(
      f.service.endEngagement({
        context,
        workerEngagementId: id.engagement,
        expectedVersion: 2,
        idempotencyKey: "termination-001",
        reasonCode: "CONTRACT_END",
        effectiveAt: "2026-09-05T00:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "SUPPLIER_WORKFORCE_POLICY_REQUIRED" });
    expect(f.transactions.run).not.toHaveBeenCalled();
    expect(f.activatePlacement).not.toHaveBeenCalled();
    expect(f.endEngagement).not.toHaveBeenCalled();
  });
  it("pins placement_change evidence", async () => {
    const f = fixture(true);
    await f.service.activatePlacement({
      context,
      workerEngagementId: id.engagement,
      expectedVersion: 2,
      idempotencyKey: "placement-001",
      effectiveFrom: "2026-09-05",
      companyCodeId: id.company,
    });
    expect(f.activatePlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        policyEvidence: expect.objectContaining({
          boundary: "placement_change",
          coordinates: [
            expect.objectContaining({ decisionId: "BP-Q004" }),
            expect.objectContaining({ decisionId: "BP-Q006" }),
          ],
        }),
      }),
      {},
    );
  });
  it("pins engagement_end evidence for atomic termination and IAM deprovision", async () => {
    const f = fixture(true);
    await expect(
      f.service.endEngagement({
        context,
        workerEngagementId: id.engagement,
        expectedVersion: 2,
        idempotencyKey: "termination-001",
        reasonCode: "CONTRACT_END",
        effectiveAt: "2026-09-05T00:00:00Z",
      }),
    ).resolves.toMatchObject({ iamDesiredHash: "c".repeat(64) });
    expect(f.endEngagement).toHaveBeenCalledWith(
      expect.objectContaining({
        policyEvidence: expect.objectContaining({ boundary: "engagement_end" }),
      }),
      {},
    );
  });
});
