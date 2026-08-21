import { describe, expect, it } from "vitest";
import { resolveRecordStatusSource } from "../routes/record-status-policy.js";

describe("record lifecycle-status policy", () => {
  it("routes governed child entities to their purchase-invoice parent", () => {
    expect(resolveRecordStatusSource("document.purchase_invoice_line")).toBe("purchase_invoice_parent");
    expect(resolveRecordStatusSource("document.accounting_distribution")).toBe("accounting_distribution_parent");
  });

  it("routes document headers and ordinary entities to their own status", () => {
    expect(resolveRecordStatusSource("document.purchase_invoice")).toBe("record");
    expect(resolveRecordStatusSource("master.supplier")).toBe("record");
  });
});
