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
} from "@athyper/runtime-add-item";

// ─────────────────────────────────────────────────────────────────────────────
// open_po_line — third source adapter (Phase 6 PR #2).
//
// Picks uninvoiced lines from open purchase orders for three-way-match
// invoicing. The picker is a `modal-select` grid (PO lines need columns:
// PO#, line#, item, remaining qty, price). Selection shape carries the
// user-chosen qty so partial invoicing is first-class.
//
// Concurrency model:
//   PO remaining-quantity is a hot field — multiple users invoicing the
//   same PO can mutate it underneath. Default stalenessStrategy is `fail`
//   so a stale qty cannot silently commit. Apps that want a softer policy
//   override via the options.
//
// Side effects per committed line:
//   1. reserve_remaining_quantity — decrements the PO line's open qty
//   2. link_source_line — records the audit binding for matching
//
// The committer's duplicate-source-line guard (DraftLineCommitter) catches
// the case where the user stages the same PO line twice in one session.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open-PO-line selection shape — aligns with mesh.purchase_order_line + the
 * matching open-balance view. `chosenQty` is the picker-supplied amount the
 * user wants to invoice; `remainingQty` is what the back end currently
 * reports for the line.
 */
export interface OpenPoLineSelection extends Record<string, unknown> {
  /** PO record id (purchase_order.id). */
  poId: string;
  /** Human-readable PO number for display. */
  poNumber: string;
  /** PO line id (purchase_order_line.id). */
  lineId: string;
  /** Line number on the PO. */
  lineNumber: number;
  /** Long description from the PO line. */
  description: string;
  /** Optional catalog item link from the PO. */
  itemId?: string;
  itemCode?: string;
  /** UOM the PO line is measured in. */
  baseUomCode: string;
  /** Live open quantity available to invoice. */
  remainingQty: number;
  /** Unit price from the PO line. */
  unitPrice: number;
  /** ISO currency code from the PO. */
  currencyCode: string;
  /** Supplier metadata for grid display + cross-checks. */
  supplierId?: string;
  supplierCode?: string;
  /** Filter convenience — true when the line is not closed or cancelled. */
  isOpen?: boolean;

  // Picker-supplied selection inputs ─────────────────────────────────────
  /** Quantity the user chose to invoice. Capped by remainingQty. */
  chosenQty?: number;
}

/**
 * Invoice line shape produced by the adapter. matchType is pinned to
 * "three_way" because every open_po_line commit participates in PO+GR+
 * Invoice matching by definition; consumers that want two-way matching
 * pick a different source.
 */
export interface OpenPoLineDraft extends DraftLine {
  poId: string;
  poLineId: string;
  poNumber: string;
  lineNumber: number;
  description: string;
  itemId?: string;
  itemCode?: string;
  quantity: number;
  uomCode: string;
  unitPrice: number;
  lineAmount: number;
  currencyCode: string;
  matchType: "three_way";
}

export interface OpenPoLineParentCtx extends Record<string, unknown> {
  parentEntityCode: string;
  parentRecordId: string;
  lineEntityCode: string;
  currencyCode?: string;
  /** Optional supplier filter — when set, fetchLines should narrow to this supplier. */
  supplierId?: string;
}

/** Pluggable picker fetcher. */
export type OpenPoLineFetchLines = (
  query: SourceQuery,
  parentCtx: OpenPoLineParentCtx,
) => Promise<Page<OpenPoLineSelection>>;

/**
 * Pluggable staleness check — apps inject a single-PO-line refetch so the
 * adapter can compare live remainingQty against the staged qty. When
 * omitted, isStillValid trusts the staged value (effectively disabling
 * staleness — apps that omit this opt out explicitly).
 */
export type OpenPoLineCheckLive = (
  poId: string,
  lineId: string,
  parentCtx: OpenPoLineParentCtx,
) => Promise<OpenPoLineSelection | null>;

export interface CreateOpenPoLineAdapterOptions {
  fetchLines: OpenPoLineFetchLines;
  checkLive?: OpenPoLineCheckLive;
  /**
   * Permission code gating picker visibility. Defaults to
   * "INVOICE.LINE.ADD_FROM_PO"; apps may pass undefined to surface the
   * picker unconditionally.
   */
  permissionCode?: string | undefined;
  /**
   * Override the staleness strategy. Default `fail` rejects commits when a
   * staged qty no longer fits the live remainingQty. `warn` lets the line
   * commit with a telemetry event so apps can surface a banner.
   */
  stalenessStrategy?: "fail" | "warn" | "refresh";
}

function buildManifest(opts: CreateOpenPoLineAdapterOptions): SourceAdapterManifest {
  return {
    id: "open_po_line",
    version: 1,
    minFrameworkVersion: 1,
    label: "Add from open PO lines",
    permissionCode:
      "permissionCode" in opts ? opts.permissionCode : "INVOICE.LINE.ADD_FROM_PO",
    entry: "picker",
    picker: {
      kind: "modal-select",
      columns: [
        { key: "poNumber",     label: "PO #",       kind: "text",     sortable: true,  filterable: true },
        { key: "lineNumber",   label: "Line",       kind: "number",   sortable: true,  filterable: false },
        { key: "itemCode",     label: "Item",       kind: "text",     sortable: true,  filterable: true },
        { key: "description",  label: "Description", kind: "text",    sortable: false, filterable: true },
        { key: "remainingQty", label: "Open Qty",   kind: "quantity", sortable: true,  filterable: false },
        { key: "baseUomCode",  label: "UOM",        kind: "text",     sortable: false, filterable: false },
        { key: "unitPrice",    label: "Price",      kind: "money",    sortable: true,  filterable: false },
      ],
      filters: [
        { key: "supplierCode", label: "Supplier", control: "reference", required: false },
        { key: "isOpen",       label: "Open only", control: "select",   required: false, defaultValue: true },
      ],
      search: { enabled: true, placeholder: "Search by PO #, item, or description" },
      defaultSort: { field: "poNumber", direction: "desc" },
    },
    cacheStrategy: "session",
    stalenessStrategy: opts.stalenessStrategy ?? "fail",
    selectionShape: {
      kind: "id_qty",
      idField: "lineId",
      qtyField: "chosenQty",
    },
    dedupeKeys: ["poId", "poLineId"],
    fill: { fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] },
  };
}

/**
 * Factory for the open-PO-line source adapter. Apps wire the open-PO fetch
 * at boot:
 *
 *   registry.register(createOpenPoLineAdapter({
 *     fetchLines: (q, ctx) => relayFetch("/api/po-lines/open", { query: q, supplier: ctx.supplierId }),
 *     checkLive: (poId, lineId) => relayFetch(`/api/po-lines/${poId}/${lineId}`),
 *   }));
 */
export function createOpenPoLineAdapter(
  opts: CreateOpenPoLineAdapterOptions,
): SourceAdapter<OpenPoLineSelection, OpenPoLineDraft, OpenPoLineParentCtx> {
  const manifest = buildManifest(opts);
  return {
    manifest,

    async fetch(query, ctx) {
      return opts.fetchLines(query, ctx);
    },

    toDraftShape(selection): OpenPoLineDraft {
      const qty = selection.chosenQty ?? selection.remainingQty;
      const binding: SourceBinding = {
        sourceType: manifest.id,
        sourceDocType: "purchase_order",
        sourceDocId: selection.poId,
        sourceLineId: selection.lineId,
        matchType: "three_way",
        sourceRef: {
          poNumber: selection.poNumber,
          lineNumber: selection.lineNumber,
          remainingQtyAtSelection: selection.remainingQty,
          unitPriceAtSelection: selection.unitPrice,
          currencyAtSelection: selection.currencyCode,
          supplierId: selection.supplierId,
          supplierCode: selection.supplierCode,
        },
      };
      return {
        poId: selection.poId,
        poLineId: selection.lineId,
        poNumber: selection.poNumber,
        lineNumber: selection.lineNumber,
        description: selection.description,
        itemId: selection.itemId,
        itemCode: selection.itemCode,
        quantity: qty,
        uomCode: selection.baseUomCode,
        unitPrice: selection.unitPrice,
        lineAmount: qty * selection.unitPrice,
        currencyCode: selection.currencyCode,
        matchType: "three_way",
        sourceBinding: binding,
      };
    },

    async resolveDefaults(draft) {
      // Tax / account resolution is a domain-service concern; apps that
      // need it wrap the adapter. The committer preserves whatever this
      // returns under the line's top-level fields.
      return draft;
    },

    applyParentContext(draft, ctx) {
      // Cross-currency annotation — apps decide whether to block, warn, or
      // FX-convert; the adapter only records the mismatch so audit can
      // reconstruct what happened.
      if (ctx.currencyCode && draft.currencyCode !== ctx.currencyCode) {
        return {
          ...draft,
          sourceBinding: {
            ...draft.sourceBinding,
            sourceRef: {
              ...(draft.sourceBinding.sourceRef ?? {}),
              parentCurrency: ctx.currencyCode,
              currencyMismatch: true,
            },
          },
        };
      }
      return draft;
    },

    validateSelection(selection): ValidationResult {
      const issues: { message: string }[] = [];
      const qty = selection.chosenQty ?? 0;
      if (qty <= 0) {
        issues.push({ message: "Quantity must be greater than zero" });
      } else if (qty > selection.remainingQty) {
        issues.push({
          message: `Quantity ${qty} exceeds remaining ${selection.remainingQty} on PO ${selection.poNumber} line ${selection.lineNumber}`,
        });
      }
      if (selection.isOpen === false) {
        issues.push({ message: "PO line is no longer open" });
      }
      if (selection.unitPrice < 0) {
        issues.push({ message: "Unit price cannot be negative" });
      }
      return issues.length > 0 ? { ok: false, issues } : { ok: true };
    },

    async isStillValid(stagedLine, ctx): Promise<ValidationResult> {
      if (!opts.checkLive) return { ok: true };
      const live = await opts.checkLive(stagedLine.poId, stagedLine.poLineId, ctx);
      if (!live) {
        return { ok: false, issues: [{ message: "PO line no longer exists" }] };
      }
      if (live.isOpen === false) {
        return { ok: false, issues: [{ message: "PO line was closed since staging" }] };
      }
      if (stagedLine.quantity > live.remainingQty) {
        return {
          ok: false,
          issues: [
            {
              message:
                `Staged qty ${stagedLine.quantity} now exceeds remaining ${live.remainingQty} on PO ${stagedLine.poNumber} line ${stagedLine.lineNumber}`,
            },
          ],
        };
      }
      return { ok: true };
    },

    dedupeKey(line): string {
      return `${line.poId}:${line.poLineId}`;
    },

    onCommitSideEffects(line): SourceSideEffect[] {
      return [
        {
          kind: "reserve_remaining_quantity",
          entityCode: "purchase_order_line",
          recordId: line.poId,
          lineId: line.poLineId,
          quantityField: "remainingQty",
          quantity: line.quantity,
        },
        {
          kind: "link_source_line",
          sourceBinding: line.sourceBinding,
        },
      ];
    },
  };
}
