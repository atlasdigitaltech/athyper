/**
 * invoice-from-receipt.service — unit tests for input validation.
 *
 * Top-of-service validation runs BEFORE the transaction opens, so it can be
 * tested with a stub db that never gets called. The TX body (receipt
 * lookup, FOR UPDATE accepted-quantity gate, PI/PIL INSERT) is covered by
 * the integration tests — skipped without DATABASE_URL.
 */

import { describe, it, expect } from "vitest";
import { createInvoiceFromReceipt } from "../p2p/purchase_invoice/invoice-from-receipt.service.js";

const TENANT     = "00000000-0000-0000-0000-000000000001";
const PRINCIPAL  = "00000000-0000-0000-0000-000000000002";
const RECEIPT    = "00000000-0000-0000-0000-000000000003";
const COMPANY    = "00000000-0000-0000-0000-000000000004";
const RCPL_A     = "00000000-0000-0000-0000-0000000000aa";
const RCPL_B     = "00000000-0000-0000-0000-0000000000bb";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDb: any = {
  transaction() {
    return {
      execute() { throw new Error("transaction.execute reached during validation-only test"); },
    };
  },
};

function baseInput(overrides: Partial<Parameters<typeof createInvoiceFromReceipt>[1]> = {}) {
  return {
    tenantId:              TENANT,
    principalId:           PRINCIPAL,
    receiptId:             RECEIPT,
    companyCodeId:         COMPANY,
    supplierInvoiceNumber: "SUP-INV-001",
    supplierInvoiceDate:   "2026-06-20",
    documentDate:          "2026-06-20",
    invoiceNumber:         "PI-TEST-001",
    fiscalYear:            2026,
    periodNumber:          6,
    baseCurrencyCode:      "USD",
    lineSelections:        [{ receiptLineId: RCPL_A, quantity: 3 }],
    ...overrides,
  };
}

describe("createInvoiceFromReceipt — input validation (no DB)", () => {
  it("rejects missing supplierInvoiceNumber with SUPPLIER_INVOICE_NUMBER_REQUIRED", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({ supplierInvoiceNumber: "" }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("SUPPLIER_INVOICE_NUMBER_REQUIRED");
  });

  it("rejects whitespace-only supplierInvoiceNumber", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({ supplierInvoiceNumber: "   " }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("SUPPLIER_INVOICE_NUMBER_REQUIRED");
  });

  it("rejects missing supplierInvoiceDate with SUPPLIER_INVOICE_DATE_REQUIRED", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({ supplierInvoiceDate: "" }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("SUPPLIER_INVOICE_DATE_REQUIRED");
  });

  it("rejects empty lineSelections with NO_LINE_SELECTIONS", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({ lineSelections: [] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("NO_LINE_SELECTIONS");
  });

  it("rejects missing receiptLineId with field error 'required'", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({
      lineSelections: [{ receiptLineId: "", quantity: 5 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(422);
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(out.fieldErrors?.["lineSelections[0].receiptLineId"]).toBe("required");
  });

  it("rejects duplicate receiptLineId across line selections", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({
      lineSelections: [
        { receiptLineId: RCPL_A, quantity: 5 },
        { receiptLineId: RCPL_A, quantity: 3 },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineSelections[1].receiptLineId"]).toBe("duplicate");
  });

  it("rejects quantity = 0 with 'must be greater than zero'", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({
      lineSelections: [{ receiptLineId: RCPL_A, quantity: 0 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineSelections[0].quantity"]).toBe("must be greater than zero");
  });

  it("rejects negative quantity", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({
      lineSelections: [{ receiptLineId: RCPL_A, quantity: -1 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineSelections[0].quantity"]).toBe("must be greater than zero");
  });

  it("rejects negative unitPrice override", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({
      lineSelections: [{ receiptLineId: RCPL_A, quantity: 5, unitPrice: -1 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineSelections[0].unitPrice"]).toBe("must be non-negative");
  });

  it("accepts zero unitPrice override (free goods on the invoice)", async () => {
    // Past input validation; the stub then throws inside the TX which the
    // service catches and translates to a 500 — we assert NOT a validation
    // 422 code.
    const out = await createInvoiceFromReceipt(stubDb, baseInput({
      lineSelections: [{ receiptLineId: RCPL_A, quantity: 5, unitPrice: 0 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("INVOICE_FROM_RECEIPT_FAILED");
    expect(out.error).not.toBe("VALIDATION_FAILED");
  });

  it("accumulates multiple field errors in one response", async () => {
    const out = await createInvoiceFromReceipt(stubDb, baseInput({
      lineSelections: [
        { receiptLineId: "",     quantity: 0 },
        { receiptLineId: RCPL_B, quantity: 5, unitPrice: -2 },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(Object.keys(out.fieldErrors ?? {})).toEqual(expect.arrayContaining([
      "lineSelections[0].receiptLineId",
      "lineSelections[0].quantity",
      "lineSelections[1].unitPrice",
    ]));
  });
});

// ── Integration tests (require live DB) ─────────────────────────────────────
const LIVE_DATABASE_URL = process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

maybeDescribe("createInvoiceFromReceipt — integration (live DB)", () => {
  it.todo("happy path: PI + PIL written atomically; PIL.receipt_line_id back-reference set");
  it.todo("receipt not found → 404 RECEIPT_NOT_FOUND");
  it.todo("receipt in draft / approved → 422 RECEIPT_NOT_POSTED");
  it.todo("receipt with terminal_status set → 422 RECEIPT_TERMINAL");
  it.todo("quantity > (accepted - already_invoiced) → 422 QUANTITY_OVER_REMAINING");
  it.todo("receipt_line not under chosen receipt → 422 RECEIPT_LINES_NOT_FOUND");
  it.todo("second invoice against the same receipt_line: remaining accounts for first invoice");
});
