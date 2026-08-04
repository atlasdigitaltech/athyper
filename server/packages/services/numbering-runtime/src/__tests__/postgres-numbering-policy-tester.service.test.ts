import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { NumberingAllocationError } from "../postgres-numbering-allocation.service";
import { PostgresNumberingPolicyTester } from "../postgres-numbering-policy-tester.service";

const db = {} as Kysely<Record<string, never>>;
const command = {
  tenantId: "019fc300-0000-7000-8000-000000000002",
  principalId: "019fc300-0000-7000-8000-000000000003",
  targetPlane: "neon" as const,
  policyCode: "business_partner.primary_number",
  policyRevision: 1,
  nextValue: 42,
  occurredAt: "2026-08-02T00:00:00Z",
};

describe("numbering policy tester boundary", () => {
  it("rejects a cross-plane request before opening a database transaction", async () => {
    await expect(new PostgresNumberingPolicyTester(db, "mesh").test(command)).rejects.toMatchObject({
      code: "NUMBERING_PLANE_MISMATCH",
      status: 422,
    });
  });

  it("rejects malformed actor context before opening a database transaction", async () => {
    await expect(new PostgresNumberingPolicyTester(db, "neon").test({ ...command, tenantId: "invalid" }))
      .rejects.toBeInstanceOf(NumberingAllocationError);
  });
});
