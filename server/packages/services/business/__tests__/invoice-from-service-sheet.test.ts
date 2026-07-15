import { describe, expect, it } from "vitest";
import { createInvoiceFromServiceSheet } from "../p2p/purchase_invoice/invoice-from-service-sheet.service.js";

const TENANT = "00000000-0000-0000-0000-000000000001";
const PRINCIPAL = "00000000-0000-0000-0000-000000000002";
const SERVICE_SHEET = "00000000-0000-0000-0000-000000000003";
const COMPANY = "00000000-0000-0000-0000-000000000004";
const SSHL_A = "00000000-0000-0000-0000-0000000000aa";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDb: any = {
  transaction() {
    return {
      execute() { throw new Error("transaction.execute reached during validation-only test"); },
    };
  },
};

function baseInput(overrides: Partial<Parameters<typeof createInvoiceFromServiceSheet>[1]> = {}) {
  return {
    tenantId:              TENANT,
    principalId:           PRINCIPAL,
    serviceSheetId:        SERVICE_SHEET,
    companyCodeId:         COMPANY,
    supplierInvoiceNumber: "SUP-SES-001",
    supplierInvoiceDate:   "2026-06-20",
    documentDate:          "2026-06-20",
    invoiceNumber:         "PI-SES-001",
    fiscalYear:            2026,
    periodNumber:          6,
    baseCurrencyCode:      "USD",
    lineSelections:        [{ serviceSheetLineId: SSHL_A, quantity: 3 }],
    ...overrides,
  };
}

describe("createInvoiceFromServiceSheet - input validation (no DB)", () => {
  it("rejects missing supplierInvoiceNumber", async () => {
    const out = await createInvoiceFromServiceSheet(stubDb, baseInput({ supplierInvoiceNumber: "" }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("SUPPLIER_INVOICE_NUMBER_REQUIRED");
  });

  it("rejects missing supplierInvoiceDate", async () => {
    const out = await createInvoiceFromServiceSheet(stubDb, baseInput({ supplierInvoiceDate: "" }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("SUPPLIER_INVOICE_DATE_REQUIRED");
  });

  it("rejects empty lineSelections", async () => {
    const out = await createInvoiceFromServiceSheet(stubDb, baseInput({ lineSelections: [] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("NO_LINE_SELECTIONS");
  });

  it("rejects invalid serviceSheetLineId and quantity", async () => {
    const out = await createInvoiceFromServiceSheet(stubDb, baseInput({
      lineSelections: [{ serviceSheetLineId: "", quantity: 0 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(422);
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(out.fieldErrors?.["lineSelections[0].serviceSheetLineId"]).toBe("required");
    expect(out.fieldErrors?.["lineSelections[0].quantity"]).toBe("must be greater than zero");
  });

  it("accepts zero unitPrice override past validation", async () => {
    const out = await createInvoiceFromServiceSheet(stubDb, baseInput({
      lineSelections: [{ serviceSheetLineId: SSHL_A, quantity: 5, unitPrice: 0 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("INVOICE_FROM_SERVICE_SHEET_FAILED");
    expect(out.error).not.toBe("VALIDATION_FAILED");
  });
});
