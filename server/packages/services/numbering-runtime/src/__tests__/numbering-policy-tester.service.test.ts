import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { NumberingPolicyTester } from "../numbering-policy-tester.service.js";
import { NumberingAllocationError } from "@athyper/numbering-contracts";

const db = {} as Kysely<Record<string, never>>;

const command = {
  tenantId:       "019fc300-0000-7000-8000-000000000002",
  principalId:    "019fc300-0000-7000-8000-000000000003",
  targetPlane:    "neon" as const,
  policyCode:     "business_partner.primary_number",
  policyRevision: 1,
  nextValue:      42,
  occurredAt:     "2026-08-02T00:00:00Z",
};

describe("NumberingPolicyTester — pre-SQL boundary guards", () => {
  it("rejects cross-plane test before opening a transaction", async () => {
    const tester = new NumberingPolicyTester(db, "mesh");
    await expect(tester.test(command)).rejects.toMatchObject({
      code:   "NUMBERING_PLANE_MISMATCH",
      status: 422,
    });
  });

  it("rejects malformed tenantId before opening a transaction", async () => {
    const tester = new NumberingPolicyTester(db, "neon");
    await expect(tester.test({ ...command, tenantId: "not-a-uuid" }))
      .rejects.toBeInstanceOf(NumberingAllocationError);
  });

  it("rejects malformed principalId before opening a transaction", async () => {
    const tester = new NumberingPolicyTester(db, "neon");
    await expect(tester.test({ ...command, principalId: "bad" }))
      .rejects.toBeInstanceOf(NumberingAllocationError);
  });

  it("passes mesh plane check when tester is configured for mesh", async () => {
    const tester = new NumberingPolicyTester(db, "mesh");
    await expect(tester.test({ ...command, targetPlane: "mesh" }))
      .rejects.not.toMatchObject({ code: "NUMBERING_PLANE_MISMATCH" });
  });
});
