import { describe } from "vitest";
import { defineSourceAdapterContractSuite } from "@athyper/runtime-add-item/test-harness";
import {
  createOpenServiceSheetLineAdapter,
  type OpenServiceSheetLineDraft,
  type OpenServiceSheetLineSelection,
} from "../open-service-sheet-line";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 PR #5 acceptance gate (open_service_sheet_line): adapter passes
// the full framework contract suite. Stub fetchLines + checkLive so the
// suite runs without backend wiring; staleStagedLine asserts isStillValid's
// negative branch under the default `fail` strategy.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE: OpenServiceSheetLineSelection = {
  serviceSheetId: "ses-3001",
  serviceSheetNumber: "SES-3001",
  certifiedDate: "2026-06-05",
  servicePeriodStart: "2026-05-01",
  servicePeriodEnd: "2026-05-31",
  lineId: "ses-3001-line-1",
  lineNumber: 1,
  poId: "po-1500",
  poNumber: "PO-1500",
  poLineId: "po-1500-line-1",
  poLineNumber: 1,
  itemId: "svc-consulting",
  itemCode: "CONS-SR",
  description: "Senior consulting (May 2026)",
  baseUomCode: "HOUR",
  certifiedQty: 160,
  remainingQty: 120,
  unitPrice: 175,
  currencyCode: "USD",
  supplierId: "sup-2",
  supplierCode: "ADVISORY",
  isCertified: true,
  isFullyInvoiced: false,
  chosenQty: 40,
};

const STALE_STAGED: OpenServiceSheetLineDraft = {
  serviceSheetId: "ses-3001",
  serviceSheetLineId: "ses-3001-line-1",
  serviceSheetNumber: "SES-3001",
  certifiedDate: "2026-06-05",
  servicePeriodStart: "2026-05-01",
  servicePeriodEnd: "2026-05-31",
  poId: "po-1500",
  poLineId: "po-1500-line-1",
  poNumber: "PO-1500",
  poLineNumber: 1,
  lineNumber: 1,
  description: "Senior consulting (May 2026)",
  itemId: "svc-consulting",
  itemCode: "CONS-SR",
  // staged qty is higher than the stale world will report
  quantity: 200,
  uomCode: "HOUR",
  unitPrice: 175,
  lineAmount: 35000,
  currencyCode: "USD",
  matchType: "three_way",
  sourceBinding: {
    sourceType: "open_service_sheet_line",
    sourceDocType: "service_sheet",
    sourceDocId: "ses-3001",
    sourceLineId: "ses-3001-line-1",
    matchType: "three_way",
  },
};

describe("Contract suite — open_service_sheet_line", () => {
  defineSourceAdapterContractSuite(
    "open_service_sheet_line",
    () =>
      createOpenServiceSheetLineAdapter({
        fetchLines: async () => ({ items: [SAMPLE] }),
        // Tighter remainingQty so staleStagedLine fails on the qty branch.
        checkLive: async () => ({ ...SAMPLE, remainingQty: 10 }),
      }),
    {
      parentCtx: {
        parentEntityCode: "purchase_invoice",
        parentRecordId: "inv-0042",
        lineEntityCode: "purchase_invoice_line",
        currencyCode: "USD",
      },
      validQuery: { q: "consulting" },
      validSelection: SAMPLE,
      invalidSelection: { ...SAMPLE, chosenQty: 999 }, // exceeds remainingQty
      staleStagedLine: STALE_STAGED,
    },
  );
});
