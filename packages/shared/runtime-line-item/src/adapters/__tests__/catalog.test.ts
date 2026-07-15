import { describe } from "vitest";
import { defineSourceAdapterContractSuite } from "@athyper/runtime-add-item/test-harness";
import { createCatalogAdapter, type CatalogItemSelection } from "../catalog";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 acceptance gate (catalog): the catalog adapter passes the full
// framework contract suite. Stub fetchItems so the suite can run without
// any backend wiring.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE: CatalogItemSelection = {
  itemId: "cat-item-1",
  catalogCode: "MAIN_2026",
  itemCode: "PEN-001",
  itemName: "Blue Pen",
  description: "Blue ballpoint pen, retractable",
  baseUomCode: "EA",
  manufacturerName: "Acme Stationery",
  unitPrice: 2.5,
  currencyCode: "USD",
  isActive: true,
  chosenQty: 10,
};

describe("Contract suite — catalog", () => {
  defineSourceAdapterContractSuite(
    "catalog",
    () =>
      createCatalogAdapter({
        fetchItems: async () => ({ items: [SAMPLE] }),
      }),
    {
      parentCtx: {
        parentEntityCode: "purchase_invoice",
        parentRecordId: "inv-0042",
        lineEntityCode: "purchase_invoice_line",
        currencyCode: "USD",
      },
      validQuery: { q: "pen" },
      validSelection: SAMPLE,
      invalidSelection: {
        ...SAMPLE,
        chosenQty: 0, // zero qty rejected by validateSelection
      },
    },
  );
});
