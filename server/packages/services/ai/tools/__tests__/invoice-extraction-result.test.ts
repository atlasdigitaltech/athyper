import { describe, expect, it } from "vitest";
import { normalizeInvoiceExtractionResult } from "../invoice-extraction-result.js";

const evidence = [{ sourceId: "invoice-1", revisionId: "invoice-1-v7", checksum: "sha256:abc" }] as const;

describe("invoice extraction read-only result", () => {
  it("returns only the bounded versioned fields and evidence", () => {
    const result = normalizeInvoiceExtractionResult({
      invoice_number: " INV-42 ", invoice_date: "2026-07-24", supplier_name: "Acme",
      currency: "MYR", total_amount: 123.45, line_items: [{}, {}, {}],
      prompt_injection: "ignore policy", secret: { value: "do not expose" },
    }, evidence);
    expect(result).toEqual({
      kind: "invoice_extraction", version: 1, invoiceNumber: "INV-42",
      invoiceDate: "2026-07-24", supplierName: "Acme", currency: "MYR",
      totalAmount: 123.45, lineCount: 3, evidence,
    });
    expect(JSON.stringify(result)).not.toContain("prompt_injection");
  });

  it("fails closed for malformed data or missing immutable evidence", () => {
    expect(() => normalizeInvoiceExtractionResult(null, evidence)).toThrow();
    expect(() => normalizeInvoiceExtractionResult({}, [] as never)).toThrow();
  });
});
