import { describe } from "vitest";
import { defineSourceAdapterContractSuite } from "@athyper/runtime-add-item/test-harness";
import {
  createOpenReceiptLineAdapter,
  type OpenReceiptLineDraft,
  type OpenReceiptLineSelection,
} from "../open-receipt-line";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 PR #4 acceptance gate (open_receipt_line): the adapter passes the
// full framework contract suite. Stub fetchLines + checkLive so the suite
// runs without backend wiring; staleStagedLine asserts isStillValid's
// negative branch under the default `fail` strategy.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE: OpenReceiptLineSelection = {
  receiptId: "grn-2001",
  receiptNumber: "GRN-2001",
  receiptDate: "2026-06-01",
  lineId: "grn-2001-line-1",
  lineNumber: 1,
  poId: "po-1001",
  poNumber: "PO-1001",
  poLineId: "po-1001-line-1",
  poLineNumber: 1,
  itemId: "item-paper",
  itemCode: "PAP-A4",
  description: "Bulk paper, A4",
  baseUomCode: "BX",
  acceptedQty: 30,
  remainingQty: 25,
  unitPrice: 12.5,
  currencyCode: "USD",
  supplierId: "sup-1",
  supplierCode: "ACME",
  isAccepted: true,
  isFullyInvoiced: false,
  chosenQty: 10,
};

const STALE_STAGED: OpenReceiptLineDraft = {
  receiptId: "grn-2001",
  receiptLineId: "grn-2001-line-1",
  receiptNumber: "GRN-2001",
  receiptDate: "2026-06-01",
  poId: "po-1001",
  poLineId: "po-1001-line-1",
  poNumber: "PO-1001",
  poLineNumber: 1,
  lineNumber: 1,
  description: "Bulk paper, A4",
  itemId: "item-paper",
  itemCode: "PAP-A4",
  // staged qty is higher than the stale world will report
  quantity: 50,
  uomCode: "BX",
  unitPrice: 12.5,
  lineAmount: 625,
  currencyCode: "USD",
  matchType: "three_way",
  sourceBinding: {
    sourceType: "open_receipt_line",
    sourceDocType: "receipt",
    sourceDocId: "grn-2001",
    sourceLineId: "grn-2001-line-1",
    matchType: "three_way",
  },
};

describe("Contract suite — open_receipt_line", () => {
  defineSourceAdapterContractSuite(
    "open_receipt_line",
    () =>
      createOpenReceiptLineAdapter({
        fetchLines: async () => ({ items: [SAMPLE] }),
        // Tighter remainingQty + isFullyInvoiced=false so the stale staged
        // line fails on the qty branch (not the closed branch).
        checkLive: async () => ({ ...SAMPLE, remainingQty: 5 }),
      }),
    {
      parentCtx: {
        parentEntityCode: "purchase_invoice",
        parentRecordId: "inv-0042",
        lineEntityCode: "purchase_invoice_line",
        currencyCode: "USD",
      },
      validQuery: { q: "paper" },
      validSelection: SAMPLE,
      invalidSelection: { ...SAMPLE, chosenQty: 999 }, // exceeds remainingQty
      staleStagedLine: STALE_STAGED,
    },
  );
});
