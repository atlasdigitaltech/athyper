import { describe } from "vitest";
import { defineSourceAdapterContractSuite } from "../defineSourceAdapterContractSuite";
import {
  createCatalogAdapter,
  createPoLineAdapter,
  type PoLineDraft,
  type PoLineWorld,
} from "../synthetic-adapter";

// ─────────────────────────────────────────────────────────────────────────────
// Smoke-runs of the contract suite against the two synthetic adapters. If
// either suite goes red, the framework contract has shifted in a way that
// breaks every adapter — fix the contract or the synthetic first.
// ─────────────────────────────────────────────────────────────────────────────

describe("Contract suite — catalog adapter", () => {
  defineSourceAdapterContractSuite(
    "catalog",
    () => createCatalogAdapter(),
    {
      parentCtx: { parentId: "invoice-1", currencyCode: "USD" },
      validQuery: {},
      validSelection: { itemId: "item-1", description: "Pen", unitPrice: 2.5 },
      invalidSelection: { itemId: "item-bad", description: "Bad", unitPrice: -1 },
    },
  );
});

describe("Contract suite — open_po_line adapter", () => {
  function world(): PoLineWorld {
    return {
      remainingQty: new Map([
        ["po-1:line-1", 50],
        ["po-1:line-2", 0],
      ]),
    };
  }

  // Build a stale staged line: chosenQty exceeds what the world reports.
  const staleStaged: PoLineDraft = {
    poId: "po-1",
    poLineId: "line-2",
    description: "Will be stale",
    qty: 5, // world has 0 remaining
    unitPrice: 100,
    sourceBinding: {
      sourceType: "open_po_line",
      sourceDocType: "purchase_order",
      sourceDocId: "po-1",
      sourceLineId: "line-2",
      matchType: "three_way",
    },
  };

  defineSourceAdapterContractSuite(
    "open_po_line",
    () => createPoLineAdapter({ world: world() }),
    {
      parentCtx: { parentId: "invoice-1", currencyCode: "USD" },
      validQuery: {},
      validSelection: {
        poId: "po-1",
        lineId: "line-1",
        description: "PO 1 line 1",
        remainingQty: 50,
        unitPrice: 100,
        chosenQty: 5,
      },
      invalidSelection: {
        poId: "po-1",
        lineId: "line-1",
        description: "PO 1 line 1",
        remainingQty: 50,
        unitPrice: 100,
        chosenQty: 999, // exceeds remaining
      },
      staleStagedLine: staleStaged,
    },
  );
});
