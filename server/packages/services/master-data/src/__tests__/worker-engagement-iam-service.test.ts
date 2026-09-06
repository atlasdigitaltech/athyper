import { describe, expect, it, vi } from "vitest";
import type { ApprovedPolicyCoordinate } from "@athyper/server-contract-master-data";
import { createSupplierWorkforceCommandGuard } from "../supplier-workforce-command-guard.js";
import { createWorkerEngagementIamService } from "../worker-engagement-iam-service.js";

const ids = {
  tenant: "11111111-1111-4111-8111-111111111111",
  principal: "22222222-2222-4222-8222-222222222222",
  engagement: "33333333-3333-4333-8333-333333333333",
};
const context = { tenantId: ids.tenant, principalId: ids.principal, planeKey: "neon", realmKey: "tenant", authEpoch: 1, assurance: "baseline", requestId: "request", profileHash: "profile", permissions: {} } as never;
const coordinate = (decisionId: ApprovedPolicyCoordinate["decisionId"]): ApprovedPolicyCoordinate => ({
  decisionId,
  version: 1,
  hash: (decisionId === "BP-Q004" ? "a" : "b").repeat(64),
  approvedAt: "2026-09-05T00:00:00.000Z",
  approvalEvidenceId: decisionId === "BP-Q004" ? "44444444-4444-4444-8444-444444444444" : "55555555-5555-4555-8555-555555555555",
  approvedByRoles: decisionId === "BP-Q004" ? ["workforce", "procurement", "legal"] : ["privacy", "legal", "workforce"],
});
const input = { context, workerEngagementId: ids.engagement, expectedVersion: 2, idempotencyKey: "worker-iam-001" };

function fixture(approved: boolean) {
  const project = vi.fn(async () => ({ workerEngagementId: ids.engagement, desiredStatus: "deprovisioned" as const, desiredVersion: 2, desiredHash: "c".repeat(64), outboxId: "66666666-6666-4666-8666-666666666666", replayed: false }));
  const guard = createSupplierWorkforceCommandGuard({
    authorizer: { async authorize() { return { allowed: true }; } },
    ...(approved ? { policies: { commercial: coordinate("BP-Q004"), candidatePrivacy: coordinate("BP-Q006") } } : {}),
  });
  const service = createWorkerEngagementIamService({
    guard,
    repository: { project },
    transactions: { async run(_plane, _actor, work) { return work({}); } },
  });
  return { service, project };
}

describe("BP-WRK-007/BP-WRK-010 worker engagement IAM service", () => {
  it("does not enter a transaction or repository while policies are unresolved", async () => {
    const value = fixture(false);
    await expect(value.service.project(input)).rejects.toMatchObject({ code: "SUPPLIER_WORKFORCE_POLICY_REQUIRED" });
    expect(value.project).not.toHaveBeenCalled();
  });

  it("passes both pinned decisions to the guarded database command", async () => {
    const value = fixture(true);
    await expect(value.service.project(input)).resolves.toMatchObject({ desiredStatus: "deprovisioned", desiredVersion: 2 });
    expect(value.project).toHaveBeenCalledWith(expect.objectContaining({
      policyEvidence: expect.objectContaining({
        boundary: "iam_project",
        coordinates: [
          expect.objectContaining({ decisionId: "BP-Q004" }),
          expect.objectContaining({ decisionId: "BP-Q006" }),
        ],
      }),
    }), {});
  });
});
