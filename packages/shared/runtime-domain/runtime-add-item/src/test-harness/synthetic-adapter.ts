import type {
  DraftLine,
  SourceAdapterManifest,
  SourceBinding,
  SourceSideEffect,
} from "@athyper/runtime-contracts";
import type {
  Page,
  SourceAdapter,
  SourceQuery,
  ValidationResult,
} from "../adapter/types";

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic adapter — a fully-implemented SourceAdapter used by the contract
// test suite and by integration tests. Two flavors:
//   • catalog: id_only selection shape, no remote PO/contract semantics
//   • open_po_line: id_qty selection shape, demonstrates partial qty +
//                    isStillValid checks against an in-memory "world"
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogSelection extends Record<string, unknown> {
  itemId: string;
  description: string;
  unitPrice: number;
}

export interface CatalogDraft extends DraftLine {
  itemId: string;
  description: string;
  unitPrice: number;
}

export interface SyntheticParentCtx extends Record<string, unknown> {
  parentId: string;
  currencyCode: string;
}

export function createCatalogAdapter(opts: {
  items?: CatalogSelection[];
  failsOnFetch?: boolean;
} = {}): SourceAdapter<CatalogSelection, CatalogDraft, SyntheticParentCtx> {
  const items = opts.items ?? [
    { itemId: "item-1", description: "Pen", unitPrice: 2.5 },
    { itemId: "item-2", description: "Notebook", unitPrice: 9.95 },
  ];

  const manifest: SourceAdapterManifest = {
    id: "catalog",
    version: 1,
    minFrameworkVersion: 1,
    label: "Catalog",
    permissionCode: "INVOICE.LINE.ADD_FROM_CATALOG",
    entry: "picker",
    picker: {
      kind: "overlay",
      columns: [
        { key: "description", label: "Item", kind: "text", sortable: true, filterable: true },
        { key: "unitPrice", label: "Price", kind: "money", sortable: true, filterable: false },
      ],
      filters: [],
      search: { enabled: true },
    },
    cacheStrategy: "stale-while-revalidate",
    stalenessStrategy: "warn",
    selectionShape: { kind: "id_only", idField: "itemId" },
    dedupeKeys: ["itemId"],
    fill: { fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] },
  };

  return {
    manifest,
    async fetch(query: SourceQuery): Promise<Page<CatalogSelection>> {
      if (opts.failsOnFetch) throw new Error("Synthetic fetch failure");
      const filtered = query.q
        ? items.filter((i) =>
            i.description.toLowerCase().includes(String(query.q).toLowerCase()),
          )
        : items;
      return { items: filtered };
    },
    toDraftShape(selection, ctx): CatalogDraft {
      const binding: SourceBinding = {
        sourceType: manifest.id,
        sourceDocType: "catalog",
        sourceDocId: ctx.parentId,
        sourceLineId: selection.itemId,
      };
      return {
        itemId: selection.itemId,
        description: selection.description,
        unitPrice: selection.unitPrice,
        sourceBinding: binding,
      };
    },
    async resolveDefaults(draft) {
      return draft;
    },
    applyParentContext(draft) {
      return draft;
    },
    validateSelection(selection): ValidationResult {
      if (selection.unitPrice < 0) {
        return { ok: false, issues: [{ message: "Unit price must be non-negative" }] };
      }
      return { ok: true };
    },
    async isStillValid(): Promise<ValidationResult> {
      return { ok: true };
    },
    onCommitSideEffects(line): SourceSideEffect[] {
      return [
        {
          kind: "emit_event",
          eventType: "invoice.catalog_line_added",
          payload: { itemId: line.itemId },
        },
      ];
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PO-line adapter — demonstrates id_qty selection + isStillValid + reserve
// side-effect. Carries an in-memory `world` so tests can mutate remote
// remaining quantities to simulate staleness.
// ─────────────────────────────────────────────────────────────────────────────

export interface PoLineSelection extends Record<string, unknown> {
  poId: string;
  lineId: string;
  description: string;
  remainingQty: number;
  unitPrice: number;
  chosenQty?: number;
}

export interface PoLineDraft extends DraftLine {
  poId: string;
  poLineId: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface PoLineWorld {
  remainingQty: Map<string, number>; // key: `${poId}:${lineId}`
}

export function createPoLineAdapter(opts: {
  world: PoLineWorld;
  stalenessStrategy?: "fail" | "warn" | "refresh";
}): SourceAdapter<PoLineSelection, PoLineDraft, SyntheticParentCtx> {
  const manifest: SourceAdapterManifest = {
    id: "open_po_line",
    version: 1,
    minFrameworkVersion: 1,
    label: "Open PO lines",
    permissionCode: "INVOICE.LINE.ADD_FROM_PO",
    entry: "picker",
    picker: {
      kind: "modal-select",
      columns: [
        { key: "po", label: "PO #", kind: "text", sortable: true, filterable: true },
        { key: "remainingQty", label: "Open", kind: "quantity", sortable: true, filterable: false },
      ],
      filters: [],
      search: { enabled: true },
    },
    cacheStrategy: "session",
    stalenessStrategy: opts.stalenessStrategy ?? "fail",
    selectionShape: { kind: "id_qty", idField: "lineId", qtyField: "chosenQty" },
    dedupeKeys: ["poId", "poLineId"],
    fill: { fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] },
  };

  function worldKey(poId: string, lineId: string): string {
    return `${poId}:${lineId}`;
  }

  return {
    manifest,
    async fetch(): Promise<Page<PoLineSelection>> {
      const items: PoLineSelection[] = [];
      for (const [key, remainingQty] of opts.world.remainingQty.entries()) {
        const [poId, lineId] = key.split(":") as [string, string];
        items.push({
          poId,
          lineId,
          description: `PO ${poId} line ${lineId}`,
          remainingQty,
          unitPrice: 100,
        });
      }
      return { items };
    },
    toDraftShape(selection, ctx): PoLineDraft {
      const qty = selection.chosenQty ?? selection.remainingQty;
      return {
        poId: selection.poId,
        poLineId: selection.lineId,
        description: selection.description,
        qty,
        unitPrice: selection.unitPrice,
        sourceBinding: {
          sourceType: manifest.id,
          sourceDocType: "purchase_order",
          sourceDocId: selection.poId,
          sourceLineId: selection.lineId,
          matchType: "three_way",
        },
        parentId: ctx.parentId,
      };
    },
    async resolveDefaults(draft) {
      return draft;
    },
    applyParentContext(draft) {
      return draft;
    },
    validateSelection(selection): ValidationResult {
      const live = opts.world.remainingQty.get(
        worldKey(selection.poId, selection.lineId),
      );
      if (live === undefined) {
        return { ok: false, issues: [{ message: "PO line no longer exists" }] };
      }
      const chosen = selection.chosenQty ?? selection.remainingQty;
      if (chosen <= 0 || chosen > live) {
        return {
          ok: false,
          issues: [{ message: `Quantity ${chosen} exceeds remaining ${live}` }],
        };
      }
      return { ok: true };
    },
    async isStillValid(stagedLine): Promise<ValidationResult> {
      const live = opts.world.remainingQty.get(
        worldKey(stagedLine.poId, stagedLine.poLineId),
      );
      if (live === undefined) {
        return { ok: false, issues: [{ message: "PO line closed since staging" }] };
      }
      if (stagedLine.qty > live) {
        return {
          ok: false,
          issues: [{ message: `Chosen qty ${stagedLine.qty} now exceeds remaining ${live}` }],
        };
      }
      return { ok: true };
    },
    onCommitSideEffects(line): SourceSideEffect[] {
      return [
        {
          kind: "reserve_remaining_quantity",
          entityCode: "purchase_order",
          recordId: line.poId,
          lineId: line.poLineId,
          quantityField: "remainingQty",
          quantity: line.qty,
        },
        {
          kind: "link_source_line",
          sourceBinding: line.sourceBinding,
        },
      ];
    },
  };
}
