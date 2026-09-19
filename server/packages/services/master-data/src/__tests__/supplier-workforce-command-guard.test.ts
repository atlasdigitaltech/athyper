import { describe, expect, it, vi } from "vitest";
import type { ApprovedPolicyCoordinate } from "@athyper/server-contract-master-data";
import { createSupplierWorkforceCommandGuard } from "../supplier-workforce-command-guard.js";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
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
  version: 3,
  hash: (decisionId === "BP-Q004" ? "a" : "b").repeat(64),
  approvedAt: "2026-09-05T00:00:00.000Z",
  approvalEvidenceId: decisionId === "BP-Q004"
    ? "33333333-3333-4333-8333-333333333333"
    : "44444444-4444-4444-8444-444444444444",
  approvedByRoles: decisionId === "BP-Q004"
    ? ["workforce", "procurement", "legal"]
    : ["privacy", "legal", "workforce"],
});
const input = {
  context,
  boundary: "iam_project" as const,
  permissionCode: "neon.workforce.request.apply",
  resource: { engagementId: "55555555-5555-4555-8555-555555555555" },
};

describe("Supplier Workforce command guard", () => {
  it.each([
    "candidate_disclose",
    "candidate_session",
    "candidate_evaluate",
    "person_resolve",
    "commercial_approve",
    "engagement_activate",
    "placement_change",
    "compliance_change",
    "engagement_end",
    "iam_project",
  ] as const)("fails unresolved %s work before persistence", async (boundary) => {
    const work = vi.fn();
    const guard = createSupplierWorkforceCommandGuard({
      authorizer: { async authorize() { return { allowed: true }; } },
    });
    await expect(guard.execute({ ...input, boundary }, work)).rejects.toMatchObject({
      status: 409,
      code: "SUPPLIER_WORKFORCE_POLICY_REQUIRED",
    });
    expect(work).not.toHaveBeenCalled();
  });

  it("authorizes before evaluating policy readiness", async () => {
    const work = vi.fn();
    const guard = createSupplierWorkforceCommandGuard({
      authorizer: { async authorize() { return { allowed: false }; } },
    });
    await expect(guard.execute(input, work)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(work).not.toHaveBeenCalled();
  });

  it("pins both approved policy coordinates into downstream command work", async () => {
    const work = vi.fn(async (proof) => proof);
    const guard = createSupplierWorkforceCommandGuard({
      authorizer: { async authorize() { return { allowed: true }; } },
      policies: {
        commercial: coordinate("BP-Q004"),
        candidatePrivacy: coordinate("BP-Q006"),
      },
    });
    const proof = await guard.execute(input, work);
    expect(proof.coordinates.map((item) => item.decisionId)).toEqual([
      "BP-Q004",
      "BP-Q006",
    ]);
    expect(proof.policyHashes).toEqual(["a".repeat(64), "b".repeat(64)]);
    expect(work).toHaveBeenCalledOnce();
  });
});
