import { describe, expect, it } from "vitest";
import type { Kysely, Transaction } from "kysely";
import { NumberingAllocationError, PostgresNumberingAllocationService } from "../postgres-numbering-allocation.service";

const transaction = {} as Transaction<Record<string, never>>;
const db = {} as Kysely<Record<string, never>>;
const base = {
  allocationId: "019fc300-0000-7000-8000-000000000001",
  tenantId: "019fc300-0000-7000-8000-000000000002",
  principalId: "019fc300-0000-7000-8000-000000000003",
  targetPlane: "neon" as const,
  policyCode: "example.primary_number",
  policyRevision: 1,
  occurredAt: "2026-08-02T00:00:00Z",
};

describe("numbering allocation boundary", () => {
  it("rejects cross-plane allocation before accessing SQL", async () => {
    const service = new PostgresNumberingAllocationService(db, "mesh");
    await expect(service.allocateWithinTransaction(transaction, base)).rejects.toMatchObject({
      code: "NUMBERING_PLANE_MISMATCH",
      status: 422,
    });
  });

  it("rejects malformed actor coordinates before accessing SQL", async () => {
    const service = new PostgresNumberingAllocationService(db, "neon");
    await expect(service.allocateWithinTransaction(transaction, { ...base, tenantId: "not-a-uuid" })).rejects.toBeInstanceOf(NumberingAllocationError);
  });
});
