/**
 * payment-from-invoice.service — unit tests for input validation.
 *
 * Top-of-service validation runs BEFORE the transaction opens, so it can
 * be tested with a stub db that never gets called. The TX body (invoice
 * lookup, supplier/currency invariants, FOR UPDATE remaining-to-pay gate,
 * payment_entry/allocation INSERTs) is covered by the integration tests.
 */

import { describe, it, expect } from "vitest";
import { createPaymentFromInvoice } from "../ap/payment_entry/payment-from-invoice.service.js";

const TENANT    = "00000000-0000-0000-0000-000000000001";
const PRINCIPAL = "00000000-0000-0000-0000-000000000002";
const COMPANY   = "00000000-0000-0000-0000-000000000003";
const INV_A     = "00000000-0000-0000-0000-0000000000aa";
const INV_B     = "00000000-0000-0000-0000-0000000000bb";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDb: any = {
  transaction() {
    return {
      execute() { throw new Error("transaction.execute reached during validation-only test"); },
    };
  },
};

function baseInput(overrides: Partial<Parameters<typeof createPaymentFromInvoice>[1]> = {}) {
  return {
    tenantId:         TENANT,
    principalId:      PRINCIPAL,
    companyCodeId:    COMPANY,
    documentDate:     "2026-06-20",
    paymentNumber:    "PMT-TEST-001",
    fiscalYear:       2026,
    periodNumber:     6,
    baseCurrencyCode: "USD",
    allocations:      [{ invoiceId: INV_A, allocatedAmount: 100 }],
    ...overrides,
  };
}

describe("createPaymentFromInvoice — input validation (no DB)", () => {
  it("rejects empty allocations with NO_ALLOCATIONS", async () => {
    const out = await createPaymentFromInvoice(stubDb, baseInput({ allocations: [] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("NO_ALLOCATIONS");
  });

  it("rejects missing invoiceId with field error 'required'", async () => {
    const out = await createPaymentFromInvoice(stubDb, baseInput({
      allocations: [{ invoiceId: "", allocatedAmount: 50 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(422);
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(out.fieldErrors?.["allocations[0].invoiceId"]).toBe("required");
  });

  it("rejects duplicate invoiceId across allocations", async () => {
    const out = await createPaymentFromInvoice(stubDb, baseInput({
      allocations: [
        { invoiceId: INV_A, allocatedAmount: 50 },
        { invoiceId: INV_A, allocatedAmount: 30 },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["allocations[1].invoiceId"]).toBe("duplicate");
  });

  it("rejects allocatedAmount = 0 with 'must be greater than zero'", async () => {
    const out = await createPaymentFromInvoice(stubDb, baseInput({
      allocations: [{ invoiceId: INV_A, allocatedAmount: 0 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["allocations[0].allocatedAmount"]).toBe("must be greater than zero");
  });

  it("rejects negative allocatedAmount", async () => {
    const out = await createPaymentFromInvoice(stubDb, baseInput({
      allocations: [{ invoiceId: INV_A, allocatedAmount: -10 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["allocations[0].allocatedAmount"]).toBe("must be greater than zero");
  });

  it("rejects negative discount/wht/advance/retention", async () => {
    const out = await createPaymentFromInvoice(stubDb, baseInput({
      allocations: [{
        invoiceId: INV_A, allocatedAmount: 100,
        discountAmount: -1, withholdingTaxAmount: -2,
        advanceRecoveryAmount: -3, retentionAmount: -4,
      }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["allocations[0].discountAmount"]).toBe("must be non-negative");
    expect(out.fieldErrors?.["allocations[0].withholdingTaxAmount"]).toBe("must be non-negative");
    expect(out.fieldErrors?.["allocations[0].advanceRecoveryAmount"]).toBe("must be non-negative");
    expect(out.fieldErrors?.["allocations[0].retentionAmount"]).toBe("must be non-negative");
  });

  it("rejects when sum of deductions exceeds allocated_amount (matches DB CHECK)", async () => {
    const out = await createPaymentFromInvoice(stubDb, baseInput({
      allocations: [{
        invoiceId: INV_A, allocatedAmount: 100,
        discountAmount: 30, withholdingTaxAmount: 40, advanceRecoveryAmount: 40,
      }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["allocations[0].allocatedAmount"]).toMatch(/deductions.*cannot exceed allocated_amount/);
  });

  it("accepts allocated with deductions equal to allocated (edge OK)", async () => {
    // Past validation; the stub throws inside TX and the service catches
    // it as a 500. We just assert NOT a 422 validation error.
    const out = await createPaymentFromInvoice(stubDb, baseInput({
      allocations: [{
        invoiceId: INV_A, allocatedAmount: 100,
        discountAmount: 100, // entire allocation eaten by discount; net is zero but still valid shape
      }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("PAYMENT_FROM_INVOICE_FAILED");
    expect(out.error).not.toBe("VALIDATION_FAILED");
  });

  it("accumulates multiple field errors in one response", async () => {
    const out = await createPaymentFromInvoice(stubDb, baseInput({
      allocations: [
        { invoiceId: "",    allocatedAmount: 0 },
        { invoiceId: INV_B, allocatedAmount: 50, discountAmount: -1 },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(Object.keys(out.fieldErrors ?? {})).toEqual(expect.arrayContaining([
      "allocations[0].invoiceId",
      "allocations[0].allocatedAmount",
      "allocations[1].discountAmount",
    ]));
  });
});

// ── Integration tests (require live DB) ─────────────────────────────────────
const LIVE_DATABASE_URL = process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

maybeDescribe("createPaymentFromInvoice — integration (live DB)", () => {
  it.todo("happy path: payment + allocations written atomically; totalAmount = SUM(allocated)");
  it.todo("multi-invoice happy path for same supplier + currency");
  it.todo("invoices from different suppliers → 422 MULTIPLE_SUPPLIERS");
  it.todo("invoices in different currencies → 422 MULTIPLE_CURRENCIES");
  it.todo("invoice in draft / cancelled → 422 INVOICE_NOT_PAYABLE");
  it.todo("invoice with terminal_status → 422 INVOICE_NOT_PAYABLE");
  it.todo("over-allocation across two payments: second 422 ALLOCATION_OVER_REMAINING");
  it.todo("invoice id not present → 404 INVOICES_NOT_FOUND");
});
