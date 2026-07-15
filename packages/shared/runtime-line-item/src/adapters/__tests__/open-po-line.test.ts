import { describe } from "vitest";
import { defineSourceAdapterContractSuite } from "@athyper/runtime-add-item/test-harness";
import {
  createOpenPoLineAdapter,
  type OpenPoLineDraft,
  type OpenPoLineSelection,
} from "../open-po-line";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 PR #2 acceptance gate (open_po_line): the adapter passes the full
// framework contract suite. Stub fetchLines + checkLive so the suite runs
// without backend wiring; staleStagedLine asserts isStillValid's negative
// branch under the default fail strategy.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE: OpenPoLineSelection = {
  poId: "po-1001",
  poNumber: "PO-1001",
  lineId: "po-1001-line-1",
  lineNumber: 1,
  description: "Bulk paper, A4",
  itemId: "item-paper",
  itemCode: "PAP-A4",
  baseUomCode: "BX",
  remainingQty: 25,
  unitPrice: 12.5,
  currencyCode: "USD",
  supplierId: "sup-1",
  supplierCode: "ACME",
  isOpen: true,
  chosenQty: 10,
};

const STALE_STAGED: OpenPoLineDraft = {
  poId: "po-1001",
  poLineId: "po-1001-line-1",
  poNumber: "PO-1001",
  lineNumber: 1,
  description: "Bulk paper, A4",
  itemId: "item-paper",
  itemCode: "PAP-A4",
  quantity: 50, // exceeds what the stale world will report
  uomCode: "BX",
  unitPrice: 12.5,
  lineAmount: 625,
  currencyCode: "USD",
  matchType: "three_way",
  sourceBinding: {
    sourceType: "open_po_line",
    sourceDocType: "purchase_order",
    sourceDocId: "po-1001",
    sourceLineId: "po-1001-line-1",
    matchType: "three_way",
  },
};

describe("Contract suite — open_po_line", () => {
  defineSourceAdapterContractSuite(
    "open_po_line",
    () =>
      createOpenPoLineAdapter({
        fetchLines: async () => ({ items: [SAMPLE] }),
        // Returns a tighter remainingQty so the stale staged line fails
        // isStillValid; consumers that supply checkLive get the framework's
        // staleness guard wired automatically.
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
