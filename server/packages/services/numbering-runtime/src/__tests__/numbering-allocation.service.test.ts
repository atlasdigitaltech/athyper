import { describe, expect, it } from "vitest";
import type { Kysely, Transaction } from "kysely";
import { NumberingAllocationService } from "../numbering-allocation.service.js";
import { NumberingAllocationError } from "@athyper/numbering-contracts";

const transaction = {} as Transaction<Record<string, never>>;
const db = {} as Kysely<Record<string, never>>;

const base = {
  allocationId:   "019fc300-0000-7000-8000-000000000001",
  tenantId:       "019fc300-0000-7000-8000-000000000002",
  principalId:    "019fc300-0000-7000-8000-000000000003",
  targetPlane:    "neon" as const,
  policyCode:     "example.primary_number",
  policyRevision: 1,
  occurredAt:     "2026-08-02T00:00:00Z",
};

describe("NumberingAllocationService — pre-SQL boundary guards", () => {
  it("rejects cross-plane allocation before touching SQL", async () => {
    const svc = new NumberingAllocationService(db, "mesh");
    await expect(svc.allocateWithinTransaction(transaction, base)).rejects.toMatchObject({
      code:   "NUMBERING_PLANE_MISMATCH",
      status: 422,
    });
  });

  it("rejects malformed tenantId", async () => {
    const svc = new NumberingAllocationService(db, "neon");
    await expect(
      svc.allocateWithinTransaction(transaction, { ...base, tenantId: "not-a-uuid" }),
    ).rejects.toBeInstanceOf(NumberingAllocationError);
  });

  it("rejects malformed principalId", async () => {
    const svc = new NumberingAllocationService(db, "neon");
    await expect(
      svc.allocateWithinTransaction(transaction, { ...base, principalId: "bad" }),
    ).rejects.toBeInstanceOf(NumberingAllocationError);
  });

  it("rejects malformed allocationId", async () => {
    const svc = new NumberingAllocationService(db, "neon");
    await expect(
      svc.allocateWithinTransaction(transaction, { ...base, allocationId: "bad" }),
    ).rejects.toBeInstanceOf(NumberingAllocationError);
  });

  it("rejects non-positive policyRevision", async () => {
    const svc = new NumberingAllocationService(db, "neon");
    await expect(
      svc.allocateWithinTransaction(transaction, { ...base, policyRevision: 0 }),
    ).rejects.toMatchObject({
      code:   "POLICY_REVISION_INVALID",
      status: 400,
    });
  });

  it("rejects fractional policyRevision", async () => {
    const svc = new NumberingAllocationService(db, "neon");
    await expect(
      svc.allocateWithinTransaction(transaction, { ...base, policyRevision: 1.5 }),
    ).rejects.toMatchObject({ code: "POLICY_REVISION_INVALID" });
  });

  it("accepts valid correlationId UUID", async () => {
    const svc = new NumberingAllocationService(db, "neon");
    // Will fail at SQL layer, not at guard layer — no throw from UUID guard
    await expect(
      svc.allocateWithinTransaction(transaction, {
        ...base,
        correlationId: "019fc300-0000-7000-8000-000000000099",
      }),
    ).rejects.not.toMatchObject({ code: "CORRELATION_ID_INVALID" });
  });

  it("rejects malformed correlationId", async () => {
    const svc = new NumberingAllocationService(db, "neon");
    await expect(
      svc.allocateWithinTransaction(transaction, { ...base, correlationId: "bad-id" }),
    ).rejects.toMatchObject({ code: "CORRELATION_ID_INVALID" });
  });
});
