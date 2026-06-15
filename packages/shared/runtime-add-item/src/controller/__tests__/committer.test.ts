import { describe, expect, it } from "vitest";
import type { DraftLine } from "@athyper/runtime-contracts";
import { commitStagedLines, type CommitInput } from "../DraftLineCommitter";
import {
  createCatalogAdapter,
  createPoLineAdapter,
  type PoLineWorld,
} from "../../test-harness/synthetic-adapter";

function world(): PoLineWorld {
  return {
    remainingQty: new Map([
      ["po-1:line-1", 50],
      ["po-1:line-2", 20],
    ]),
  };
}

describe("commitStagedLines — happy path", () => {
  it("aggregates lines + side effects across multiple adapters", () => {
    const catalog = createCatalogAdapter();
    const po = createPoLineAdapter({ world: world() });
    const parentCtx = { parentId: "invoice-1", currencyCode: "USD" };

    const catalogLine = catalog.toDraftShape(
      { itemId: "item-1", description: "Pen", unitPrice: 2.5 },
      parentCtx,
    );
    const poLine = po.toDraftShape(
      { poId: "po-1", lineId: "line-1", description: "PO 1 line 1", remainingQty: 50, unitPrice: 100, chosenQty: 5 },
      parentCtx,
    );

    const result = commitStagedLines(
      [
        { adapter: catalog, line: catalogLine },
        { adapter: po, line: poLine },
      ] as CommitInput<DraftLine>[],
      { parentCtx },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.committedLines.length).toBe(2);
      expect(result.adapterIds.sort()).toEqual(["catalog", "open_po_line"]);
      // One emit_event from catalog, one reserve + one link from PO line
      expect(result.sideEffects.length).toBe(3);
      const kinds = result.sideEffects.map((e) => e.kind).sort();
      expect(kinds).toEqual(["emit_event", "link_source_line", "reserve_remaining_quantity"]);
    }
  });
});

describe("commitStagedLines — guard rails", () => {
  it("rejects a line whose sourceBinding.sourceType does not match the adapter id", () => {
    const catalog = createCatalogAdapter();
    const po = createPoLineAdapter({ world: world() });
    const parentCtx = { parentId: "invoice-1", currencyCode: "USD" };
    const poLine = po.toDraftShape(
      { poId: "po-1", lineId: "line-1", description: "x", remainingQty: 50, unitPrice: 100, chosenQty: 5 },
      parentCtx,
    );

    const result = commitStagedLines(
      [{ adapter: catalog, line: poLine }] as CommitInput<DraftLine>[],
      { parentCtx },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/sourceBinding\.sourceType/);
      expect(result.failedAtIndex).toBe(0);
    }
  });

  it("rejects duplicate link_source_line bindings in one commit set", () => {
    const po = createPoLineAdapter({ world: world() });
    const parentCtx = { parentId: "invoice-1", currencyCode: "USD" };
    const line = po.toDraftShape(
      { poId: "po-1", lineId: "line-1", description: "x", remainingQty: 50, unitPrice: 100, chosenQty: 5 },
      parentCtx,
    );

    const result = commitStagedLines(
      [
        { adapter: po, line },
        { adapter: po, line },
      ],
      { parentCtx },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Duplicate link_source_line/);
      expect(result.failedAtIndex).toBe(1);
    }
  });
});
