import { describe } from "vitest";
import { defineSourceAdapterContractSuite } from "@athyper/runtime-add-item/test-harness";
import { createManualInvoiceLineAdapter } from "../manual-invoice-line";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 acceptance gate: the manual_invoice_line adapter passes the full
// framework contract suite. If this goes red, either the adapter has
// regressed against the SourceAdapter contract or the framework contract
// itself has shifted.
// ─────────────────────────────────────────────────────────────────────────────

describe("Contract suite — manual_invoice_line", () => {
  defineSourceAdapterContractSuite(
    "manual_invoice_line",
    () => createManualInvoiceLineAdapter(),
    {
      parentCtx: {
        parentEntityCode: "purchase_invoice",
        parentRecordId: "inv-0042",
        lineEntityCode: "purchase_invoice_line",
        currencyCode: "USD",
      },
      validQuery: {},
      validSelection: {
        draftId: "draft-1",
        payload: { description: "Office supplies", quantity: 5, unitPrice: 12 },
      },
      invalidSelection: {
        // Missing draftId — validateSelection should reject.
        draftId: "" as string,
        payload: { description: "x" },
      },
    },
  );
});
