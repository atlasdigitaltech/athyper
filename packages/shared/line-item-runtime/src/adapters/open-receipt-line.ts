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
// open_receipt_line — Phase 6 PR #4.
//
// Picks accepted-but-uninvoiced lines from goods-receipt notes (GRNs) for
// three-way-match invoicing. The receipt completes the PO → GR → Invoice
// triangle; selecting a receipt line is the canonical path for matching
// physically received goods to a supplier invoice.
//
// Differences from open_po_line:
//   • Source doc is the receipt (GRN), not the PO. The PO line is recorded
//     in `sourceRef.poId`/`sourceRef.poLineId` so audit can reconstruct
//     the full chain.
//   • `remainingQty` semantics: accepted_qty - already_invoiced_qty. The
//     adapter does not need to know how the back end computes it; it only
//     consumes the value the picker fetcher returns.
//   • `acceptedQty` is preserved in `sourceRef` so consumers can show
//     "5 of 10 accepted" UX without a second fetch.
//   • `receiptDate` is preserved in `sourceRef` for period-aware accruals.
//
// Side effects per committed line:
//   1. reserve_remaining_quantity — decrements the GRN line's remaining
//   2. link_source_line — records the binding for matching + audit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open-receipt-line selection shape. Aligns with the accepted GRN line view.
 */
export interface OpenReceiptLineSelection extends Record<string, unknown> {
  /** GRN record id. */
  receiptId: string;
  /** GRN number for display. */
  receiptNumber: string;
  /** ISO date the goods were received (controls period accrual). */
  receiptDate: string;

  /** GRN line id (primary key for the source line). */
  lineId: string;
  /** Line number on the GRN. */
  lineNumber: number;

  /** Back-reference: which PO this receipt was made against. */
  poId: string;
  poNumber: string;
  poLineId: string;
  poLineNumber: number;

  /** Optional catalog item link. */
  itemId?: string;
  itemCode?: string;
  description: string;

  /** UOM the GRN line is measured in. */
  baseUomCode: string;

  /** Total qty accepted at receipt time (does not change after acceptance). */
  acceptedQty: number;
  /** Live remaining = acceptedQty - already-invoiced qty. */
  remainingQty: number;

  /** Unit price from the receipt (may differ from PO if adjusted). */
  unitPrice: number;
  currencyCode: string;

  /** Supplier metadata for grid + filters. */
  supplierId?: string;
  supplierCode?: string;

  /** True when the GRN line has been formally accepted. Only accepted
   *  lines are invoicable; rejected/pending are excluded by the picker. */
  isAccepted?: boolean;
  /** True when the GRN line is fully invoiced; picker hides these by
   *  default to avoid double-invoicing. */
  isFullyInvoiced?: boolean;

  // Picker-supplied selection inputs ─────────────────────────────────────
  /** Quantity the user chose to invoice. Capped by remainingQty. */
  chosenQty?: number;
}

/**
 * Invoice line shape produced by the adapter. matchType is pinned to
 * `three_way` because invoicing against a receipt completes the PO+GR+Inv
 * triangle by definition.
 */
export interface OpenReceiptLineDraft extends DraftLine {
  receiptId: string;
  receiptLineId: string;
  receiptNumber: string;
  receiptDate: string;
  poId: string;
  poLineId: string;
  poNumber: string;
  poLineNumber: number;
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

export interface OpenReceiptLineParentCtx extends Record<string, unknown> {
  parentEntityCode: string;
  parentRecordId: string;
  lineEntityCode: string;
  currencyCode?: string;
  /** Optional supplier narrowing. */
  supplierId?: string;
}

export type OpenReceiptLineFetchLines = (
  query: SourceQuery,
  parentCtx: OpenReceiptLineParentCtx,
) => Promise<Page<OpenReceiptLineSelection>>;

/**
 * Pluggable staleness check — apps inject a fresh single-line fetch so the
 * adapter can compare live remainingQty / isFullyInvoiced against the
 * staged line. When omitted, isStillValid trusts the staged value (an
 * explicit opt-out).
 */
export type OpenReceiptLineCheckLive = (
  receiptId: string,
  lineId: string,
  parentCtx: OpenReceiptLineParentCtx,
) => Promise<OpenReceiptLineSelection | null>;

export interface CreateOpenReceiptLineAdapterOptions {
  fetchLines: OpenReceiptLineFetchLines;
  checkLive?: OpenReceiptLineCheckLive;
  /**
   * Permission gate. Defaults to "INVOICE.LINE.ADD_FROM_RECEIPT". Pass
   * undefined to surface the picker unconditionally.
   */
  permissionCode?: string | undefined;
  /**
   * Override the staleness strategy. Defaults to `fail` — receipt
   * remaining-qty is a hot field once multiple invoices are being raised.
   */
  stalenessStrategy?: "fail" | "warn" | "refresh";
}

function buildManifest(opts: CreateOpenReceiptLineAdapterOptions): SourceAdapterManifest {
  return {
    id: "open_receipt_line",
    version: 1,
    minFrameworkVersion: 1,
    label: "Add from open receipt lines",
    permissionCode:
      "permissionCode" in opts ? opts.permissionCode : "INVOICE.LINE.ADD_FROM_RECEIPT",
    entry: "picker",
    picker: {
      kind: "modal-select",
      columns: [
        { key: "receiptNumber", label: "Receipt #",   kind: "text",     sortable: true,  filterable: true },
        { key: "receiptDate",   label: "Received",    kind: "date",     sortable: true,  filterable: false },
        { key: "lineNumber",    label: "Line",        kind: "number",   sortable: true,  filterable: false },
        { key: "poNumber",      label: "PO #",        kind: "text",     sortable: true,  filterable: true },
        { key: "itemCode",      label: "Item",        kind: "text",     sortable: true,  filterable: true },
        { key: "description",   label: "Description", kind: "text",     sortable: false, filterable: true },
        { key: "remainingQty",  label: "Open Qty",    kind: "quantity", sortable: true,  filterable: false },
        { key: "baseUomCode",   label: "UOM",         kind: "text",     sortable: false, filterable: false },
        { key: "unitPrice",     label: "Price",       kind: "money",    sortable: true,  filterable: false },
      ],
      filters: [
        { key: "supplierCode",      label: "Supplier",        control: "reference",    required: false },
        { key: "receiptDateRange",  label: "Received between", control: "date_range",  required: false },
        { key: "isAccepted",        label: "Accepted only",   control: "select",       required: false, defaultValue: true },
        { key: "isFullyInvoiced",   label: "Hide fully invoiced", control: "select",  required: false, defaultValue: true },
      ],
      search: { enabled: true, placeholder: "Search by receipt #, PO #, item, or description" },
      defaultSort: { field: "receiptDate", direction: "desc" },
    },
    cacheStrategy: "session",
    stalenessStrategy: opts.stalenessStrategy ?? "fail",
    selectionShape: {
      kind: "id_qty",
      idField: "lineId",
      qtyField: "chosenQty",
    },
    // Dedupe by GRN line — the same physical receipt line can't be split
    // across two staged entries in one session.
    dedupeKeys: ["receiptId", "receiptLineId"],
    fill: { fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] },
  };
}

/**
 * Factory for the open-receipt-line source adapter. Apps wire the open-GR
 * fetch at boot:
 *
 *   registry.register(createOpenReceiptLineAdapter({
 *     fetchLines: (q, ctx) => relayFetch("/api/receipt-lines/open", { query: q, supplier: ctx.supplierId }),
 *     checkLive: (rid, lid) => relayFetch(`/api/receipt-lines/${rid}/${lid}`),
 *   }));
 */
export function createOpenReceiptLineAdapter(
  opts: CreateOpenReceiptLineAdapterOptions,
): SourceAdapter<
  OpenReceiptLineSelection,
  OpenReceiptLineDraft,
  OpenReceiptLineParentCtx
> {
  const manifest = buildManifest(opts);
  return {
    manifest,

    async fetch(query, ctx) {
      return opts.fetchLines(query, ctx);
    },

    toDraftShape(selection): OpenReceiptLineDraft {
      const qty = selection.chosenQty ?? selection.remainingQty;
      const binding: SourceBinding = {
        sourceType: manifest.id,
        sourceDocType: "goods_receipt",
        sourceDocId: selection.receiptId,
        sourceLineId: selection.lineId,
        matchType: "three_way",
        sourceRef: {
          receiptNumber: selection.receiptNumber,
          receiptDate: selection.receiptDate,
          lineNumber: selection.lineNumber,
          poId: selection.poId,
          poNumber: selection.poNumber,
          poLineId: selection.poLineId,
          poLineNumber: selection.poLineNumber,
          acceptedQtyAtSelection: selection.acceptedQty,
          remainingQtyAtSelection: selection.remainingQty,
          unitPriceAtSelection: selection.unitPrice,
          currencyAtSelection: selection.currencyCode,
          supplierId: selection.supplierId,
          supplierCode: selection.supplierCode,
        },
      };
      return {
        receiptId: selection.receiptId,
        receiptLineId: selection.lineId,
        receiptNumber: selection.receiptNumber,
        receiptDate: selection.receiptDate,
        poId: selection.poId,
        poLineId: selection.poLineId,
        poNumber: selection.poNumber,
        poLineNumber: selection.poLineNumber,
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
      // Period / accrual resolution lives outside the framework; apps wrap
      // the adapter if they need to attach an accounting period derived
      // from receiptDate at commit time.
      return draft;
    },

    applyParentContext(draft, ctx) {
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
          message:
            `Quantity ${qty} exceeds open ${selection.remainingQty} on receipt ` +
            `${selection.receiptNumber} line ${selection.lineNumber}`,
        });
      }
      if (selection.isAccepted === false) {
        issues.push({
          message: `Receipt line ${selection.receiptNumber}/${selection.lineNumber} is not accepted`,
        });
      }
      if (selection.isFullyInvoiced === true) {
        issues.push({
          message: `Receipt line ${selection.receiptNumber}/${selection.lineNumber} is already fully invoiced`,
        });
      }
      if (selection.unitPrice < 0) {
        issues.push({ message: "Unit price cannot be negative" });
      }
      return issues.length > 0 ? { ok: false, issues } : { ok: true };
    },

    async isStillValid(stagedLine, ctx): Promise<ValidationResult> {
      if (!opts.checkLive) return { ok: true };
      const live = await opts.checkLive(
        stagedLine.receiptId,
        stagedLine.receiptLineId,
        ctx,
      );
      if (!live) {
        return { ok: false, issues: [{ message: "Receipt line no longer exists" }] };
      }
      if (live.isAccepted === false) {
        return {
          ok: false,
          issues: [{ message: "Receipt line was un-accepted since staging" }],
        };
      }
      if (live.isFullyInvoiced === true) {
        return {
          ok: false,
          issues: [{ message: "Receipt line was fully invoiced since staging" }],
        };
      }
      if (stagedLine.quantity > live.remainingQty) {
        return {
          ok: false,
          issues: [
            {
              message:
                `Staged qty ${stagedLine.quantity} now exceeds open ${live.remainingQty} ` +
                `on receipt ${stagedLine.receiptNumber} line ${stagedLine.lineNumber}`,
            },
          ],
        };
      }
      return { ok: true };
    },

    dedupeKey(line): string {
      return `${line.receiptId}:${line.receiptLineId}`;
    },

    onCommitSideEffects(line): SourceSideEffect[] {
      return [
        {
          kind: "reserve_remaining_quantity",
          entityCode: "goods_receipt_line",
          recordId: line.receiptId,
          lineId: line.receiptLineId,
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
