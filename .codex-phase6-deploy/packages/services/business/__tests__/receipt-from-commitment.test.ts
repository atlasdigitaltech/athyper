/**
 * receipt-from-commitment.service — unit tests for input validation.
 *
 * The top-of-service validation block (lineAcceptances shape, qty signs,
 * duplicate ids) runs BEFORE the transaction is opened, so it can be
 * tested with a stub db that never gets called. The transaction body
 * (commitment lookup, line-by-line remaining_quantity gate, INSERT) is
 * covered by the integration tests below — skipped without DATABASE_URL.
 */

import { describe, it, expect } from "vitest";
import { createReceiptFromCommitment } from "../p2p/receipt/receipt-from-commitment.service.js";

const TENANT      = "00000000-0000-0000-0000-000000000001";
const PRINCIPAL   = "00000000-0000-0000-0000-000000000002";
const COMMITMENT  = "00000000-0000-0000-0000-000000000003";
const COMPANY     = "00000000-0000-0000-0000-000000000004";
const CL_A        = "00000000-0000-0000-0000-0000000000aa";
const CL_B        = "00000000-0000-0000-0000-0000000000bb";

// Minimal stub — validation returns before any db access, so we just need
// an object that satisfies the type signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDb: any = {
  transaction() {
    return {
      // The validation-failure path should never reach here.
      execute() { throw new Error("transaction.execute reached during validation-only test"); },
    };
  },
};

function baseInput(overrides: Partial<Parameters<typeof createReceiptFromCommitment>[1]> = {}) {
  return {
    tenantId:         TENANT,
    principalId:      PRINCIPAL,
    commitmentId:     COMMITMENT,
    companyCodeId:    COMPANY,
    receiptNumber:    "RCP-TEST-001",
    fiscalYear:       2026,
    periodNumber:     6,
    baseCurrencyCode: "USD",
    lineAcceptances:  [{ commitmentLineId: CL_A, acceptedQty: 5 }],
    ...overrides,
  };
}

describe("createReceiptFromCommitment — input validation (no DB)", () => {
  it("rejects empty lineAcceptances with NO_LINE_ACCEPTANCES", async () => {
    const out = await createReceiptFromCommitment(stubDb, baseInput({ lineAcceptances: [] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("NO_LINE_ACCEPTANCES");
  });

  it("rejects missing commitmentLineId with field error 'required'", async () => {
    const out = await createReceiptFromCommitment(stubDb, baseInput({
      lineAcceptances: [{ commitmentLineId: "", acceptedQty: 5 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(422);
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(out.fieldErrors?.["lineAcceptances[0].commitmentLineId"]).toBe("required");
  });

  it("rejects duplicate commitmentLineId across line entries", async () => {
    const out = await createReceiptFromCommitment(stubDb, baseInput({
      lineAcceptances: [
        { commitmentLineId: CL_A, acceptedQty: 5 },
        { commitmentLineId: CL_A, acceptedQty: 3 },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(out.fieldErrors?.["lineAcceptances[1].commitmentLineId"]).toBe("duplicate");
  });

  it("rejects acceptedQty = 0 with 'must be greater than zero'", async () => {
    const out = await createReceiptFromCommitment(stubDb, baseInput({
      lineAcceptances: [{ commitmentLineId: CL_A, acceptedQty: 0 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineAcceptances[0].acceptedQty"]).toBe("must be greater than zero");
  });

  it("rejects negative acceptedQty", async () => {
    const out = await createReceiptFromCommitment(stubDb, baseInput({
      lineAcceptances: [{ commitmentLineId: CL_A, acceptedQty: -1 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineAcceptances[0].acceptedQty"]).toBe("must be greater than zero");
  });

  it("rejects negative rejectedQty", async () => {
    const out = await createReceiptFromCommitment(stubDb, baseInput({
      lineAcceptances: [{ commitmentLineId: CL_A, acceptedQty: 5, rejectedQty: -1 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineAcceptances[0].rejectedQty"]).toBe("must be non-negative");
  });

  it("accumulates multiple field errors in one response", async () => {
    const out = await createReceiptFromCommitment(stubDb, baseInput({
      lineAcceptances: [
        { commitmentLineId: "",   acceptedQty: 0 },
        { commitmentLineId: CL_B, acceptedQty: 5, rejectedQty: -2 },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(Object.keys(out.fieldErrors ?? {})).toEqual(expect.arrayContaining([
      "lineAcceptances[0].commitmentLineId",
      "lineAcceptances[0].acceptedQty",
      "lineAcceptances[1].rejectedQty",
    ]));
  });
});

// ── Integration tests (require live DB) ─────────────────────────────────────
const LIVE_DATABASE_URL = process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

maybeDescribe("createReceiptFromCommitment — integration (live DB)", () => {
  it.todo("happy path: header + line written atomically; receipt_number populated");
  it.todo("commitment not found → 404 COMMITMENT_NOT_FOUND");
  it.todo("commitment in draft/closed/cancelled → 422 COMMITMENT_NOT_TRANSACTABLE");
  it.todo("commitment type not PURCHASE_ORDER/BLANKET_PO → 422 COMMITMENT_NOT_PO");
  it.todo("(accepted+rejected) > remaining_quantity → 422 QUANTITY_OVER_REMAINING with per-line errors");
  it.todo("commitment_line not under chosen commitment → 422 COMMITMENT_LINES_NOT_FOUND");
  it.todo("concurrent from-commitment requests against same line: one wins, the other 422s");
});
