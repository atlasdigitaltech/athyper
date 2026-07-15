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
// open_service_sheet_line — Phase 6 PR #5.
//
// Picks certified-but-uninvoiced lines from service entry sheets (SES) for
// three-way-match invoicing of service POs. Conceptually parallel to
// open_receipt_line, but for services: the SES line certifies a quantity
// of *work performed* over a *service period* (start/end dates), not a
// delivery of physical goods at a point in time.
//
// Key differences from open_receipt_line:
//   • Source doc is the service entry sheet, not the GRN.
//   • Every line carries a service period (`servicePeriodStart` /
//     `servicePeriodEnd`); the period is preserved on both the draft and
//     the sourceBinding so downstream accrual logic reads from one place.
//   • "Accepted" semantics are replaced by "certified" — only certified
//     SES lines are invoicable.
//   • UOM is typically time-based (HOUR / DAY) or milestone-based (EACH).
//     The adapter treats UOM as opaque.
//
// Side effects per committed line:
//   1. reserve_remaining_quantity — decrements the SES line's remaining
//   2. link_source_line — records the binding for matching + audit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open-service-sheet-line selection shape. Aligns with the certified SES
 * line view served by the back end.
 */
export interface OpenServiceSheetLineSelection extends Record<string, unknown> {
  /** SES record id. */
  serviceSheetId: string;
  /** SES number for display. */
  serviceSheetNumber: string;
  /** ISO date the buyer certified the service. */
  certifiedDate: string;
  /** ISO date the service period started (controls accrual). */
  servicePeriodStart: string;
  /** ISO date the service period ended (controls accrual). */
  servicePeriodEnd: string;

  /** SES line id. */
  lineId: string;
  /** Line number on the SES. */
  lineNumber: number;

  /** Back-reference: which PO this service was performed under. */
  poId: string;
  poNumber: string;
  poLineId: string;
  poLineNumber: number;

  /** Optional service item code. */
  itemId?: string;
  itemCode?: string;
  description: string;

  /** UOM (HOUR / DAY / EACH for milestone-based services). */
  baseUomCode: string;

  /** Total qty certified at sign-off (does not change after certification). */
  certifiedQty: number;
  /** Live remaining = certifiedQty - already-invoiced qty. */
  remainingQty: number;

  /** Unit price from the SES (locked in at certification). */
  unitPrice: number;
  currencyCode: string;

  /** Supplier metadata for grid + filters. */
  supplierId?: string;
  supplierCode?: string;

  /** True when the SES line has been formally certified. Only certified
   *  lines are invoicable; pending/rejected are excluded by the picker. */
  isCertified?: boolean;
  /** True when the SES line is fully invoiced; picker hides these by
   *  default to avoid double-invoicing. */
  isFullyInvoiced?: boolean;

  // Picker-supplied selection inputs ─────────────────────────────────────
  /** Quantity (hours / days / each) the user chose to invoice. Capped by
   *  remainingQty. */
  chosenQty?: number;
}

/**
 * Invoice line shape produced by the adapter. matchType is pinned to
 * `three_way` because invoicing against an SES completes the PO+SES+Inv
 * triangle by definition.
 */
export interface OpenServiceSheetLineDraft extends DraftLine {
  serviceSheetId: string;
  serviceSheetLineId: string;
  serviceSheetNumber: string;
  certifiedDate: string;
  /** Service period preserved on the draft so consuming code (period
   *  accrual, deferred revenue) reads it without unwrapping sourceRef. */
  servicePeriodStart: string;
  servicePeriodEnd: string;
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

export interface OpenServiceSheetLineParentCtx extends Record<string, unknown> {
  parentEntityCode: string;
  parentRecordId: string;
  lineEntityCode: string;
  currencyCode?: string;
  /** Optional supplier narrowing. */
  supplierId?: string;
}

export type OpenServiceSheetLineFetchLines = (
  query: SourceQuery,
  parentCtx: OpenServiceSheetLineParentCtx,
) => Promise<Page<OpenServiceSheetLineSelection>>;

/**
 * Pluggable staleness check — apps inject a single-line refetch so the
 * adapter can compare live remainingQty / isCertified / isFullyInvoiced
 * against the staged line. When omitted, isStillValid trusts the staged
 * value (explicit opt-out).
 */
export type OpenServiceSheetLineCheckLive = (
  serviceSheetId: string,
  lineId: string,
  parentCtx: OpenServiceSheetLineParentCtx,
) => Promise<OpenServiceSheetLineSelection | null>;

export interface CreateOpenServiceSheetLineAdapterOptions {
  fetchLines: OpenServiceSheetLineFetchLines;
  checkLive?: OpenServiceSheetLineCheckLive;
  /**
   * Permission gate. Defaults to "INVOICE.LINE.ADD_FROM_SERVICE_SHEET".
   * Pass undefined to surface the picker unconditionally.
   */
  permissionCode?: string | undefined;
  /**
   * Override the staleness strategy. Defaults to `fail` — SES remaining-
   * qty is a hot field when multiple progress invoices are being raised
   * against the same service line.
   */
  stalenessStrategy?: "fail" | "warn" | "refresh";
}

function buildManifest(
  opts: CreateOpenServiceSheetLineAdapterOptions,
): SourceAdapterManifest {
  return {
    id: "open_service_sheet_line",
    version: 1,
    minFrameworkVersion: 1,
    label: "Add from certified service sheets",
    permissionCode:
      "permissionCode" in opts
        ? opts.permissionCode
        : "INVOICE.LINE.ADD_FROM_SERVICE_SHEET",
    entry: "picker",
    picker: {
      kind: "modal-select",
      columns: [
        { key: "serviceSheetNumber", label: "SES #",       kind: "text",     sortable: true,  filterable: true },
        { key: "certifiedDate",      label: "Certified",   kind: "date",     sortable: true,  filterable: false },
        { key: "servicePeriodStart", label: "From",        kind: "date",     sortable: true,  filterable: false },
        { key: "servicePeriodEnd",   label: "To",          kind: "date",     sortable: true,  filterable: false },
        { key: "lineNumber",         label: "Line",        kind: "number",   sortable: true,  filterable: false },
        { key: "poNumber",           label: "PO #",        kind: "text",     sortable: true,  filterable: true },
        { key: "itemCode",           label: "Service",     kind: "text",     sortable: true,  filterable: true },
        { key: "description",        label: "Description", kind: "text",     sortable: false, filterable: true },
        { key: "remainingQty",       label: "Open Qty",    kind: "quantity", sortable: true,  filterable: false },
        { key: "baseUomCode",        label: "UOM",         kind: "text",     sortable: false, filterable: false },
        { key: "unitPrice",          label: "Rate",        kind: "money",    sortable: true,  filterable: false },
      ],
      filters: [
        { key: "supplierCode",       label: "Supplier",            control: "reference",  required: false },
        { key: "servicePeriodRange", label: "Service period",      control: "date_range", required: false },
        { key: "isCertified",        label: "Certified only",      control: "select",     required: false, defaultValue: true },
        { key: "isFullyInvoiced",    label: "Hide fully invoiced", control: "select",     required: false, defaultValue: true },
      ],
      search: { enabled: true, placeholder: "Search by SES #, PO #, service, or description" },
      defaultSort: { field: "certifiedDate", direction: "desc" },
    },
    cacheStrategy: "session",
    stalenessStrategy: opts.stalenessStrategy ?? "fail",
    selectionShape: {
      kind: "id_qty",
      idField: "lineId",
      qtyField: "chosenQty",
    },
    // Dedupe by SES line — the same line can't appear twice in one staging
    // session even if the user re-opens the picker.
    dedupeKeys: ["serviceSheetId", "serviceSheetLineId"],
    fill: { fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] },
  };
}

/**
 * Factory for the open-service-sheet-line source adapter. Apps wire the
 * open-SES fetch at boot:
 *
 *   registry.register(createOpenServiceSheetLineAdapter({
 *     fetchLines: (q, ctx) => relayFetch("/api/service-sheet-lines/open", { query: q, supplier: ctx.supplierId }),
 *     checkLive: (sid, lid) => relayFetch(`/api/service-sheet-lines/${sid}/${lid}`),
 *   }));
 */
export function createOpenServiceSheetLineAdapter(
  opts: CreateOpenServiceSheetLineAdapterOptions,
): SourceAdapter<
  OpenServiceSheetLineSelection,
  OpenServiceSheetLineDraft,
  OpenServiceSheetLineParentCtx
> {
  const manifest = buildManifest(opts);
  return {
    manifest,

    async fetch(query, ctx) {
      return opts.fetchLines(query, ctx);
    },

    toDraftShape(selection): OpenServiceSheetLineDraft {
      const qty = selection.chosenQty ?? selection.remainingQty;
      const binding: SourceBinding = {
        sourceType: manifest.id,
        sourceDocType: "service_sheet",
        sourceDocId: selection.serviceSheetId,
        sourceLineId: selection.lineId,
        matchType: "three_way",
        sourceRef: {
          serviceSheetNumber: selection.serviceSheetNumber,
          certifiedDate: selection.certifiedDate,
          servicePeriodStart: selection.servicePeriodStart,
          servicePeriodEnd: selection.servicePeriodEnd,
          lineNumber: selection.lineNumber,
          poId: selection.poId,
          poNumber: selection.poNumber,
          poLineId: selection.poLineId,
          poLineNumber: selection.poLineNumber,
          certifiedQtyAtSelection: selection.certifiedQty,
          remainingQtyAtSelection: selection.remainingQty,
          unitPriceAtSelection: selection.unitPrice,
          currencyAtSelection: selection.currencyCode,
          supplierId: selection.supplierId,
          supplierCode: selection.supplierCode,
        },
      };
      return {
        serviceSheetId: selection.serviceSheetId,
        serviceSheetLineId: selection.lineId,
        serviceSheetNumber: selection.serviceSheetNumber,
        certifiedDate: selection.certifiedDate,
        servicePeriodStart: selection.servicePeriodStart,
        servicePeriodEnd: selection.servicePeriodEnd,
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
      // Accrual period resolution (mapping servicePeriodStart/End to an
      // accounting period) lives outside the framework. Apps wrap the
      // adapter if they need to attach period metadata at commit time.
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
            `Quantity ${qty} exceeds open ${selection.remainingQty} on SES ` +
            `${selection.serviceSheetNumber} line ${selection.lineNumber}`,
        });
      }
      if (selection.isCertified === false) {
        issues.push({
          message: `SES line ${selection.serviceSheetNumber}/${selection.lineNumber} is not certified`,
        });
      }
      if (selection.isFullyInvoiced === true) {
        issues.push({
          message: `SES line ${selection.serviceSheetNumber}/${selection.lineNumber} is already fully invoiced`,
        });
      }
      if (selection.unitPrice < 0) {
        issues.push({ message: "Unit rate cannot be negative" });
      }
      if (
        selection.servicePeriodStart &&
        selection.servicePeriodEnd &&
        selection.servicePeriodEnd < selection.servicePeriodStart
      ) {
        issues.push({
          message: `Service period end (${selection.servicePeriodEnd}) precedes start (${selection.servicePeriodStart})`,
        });
      }
      return issues.length > 0 ? { ok: false, issues } : { ok: true };
    },

    async isStillValid(stagedLine, ctx): Promise<ValidationResult> {
      if (!opts.checkLive) return { ok: true };
      const live = await opts.checkLive(
        stagedLine.serviceSheetId,
        stagedLine.serviceSheetLineId,
        ctx,
      );
      if (!live) {
        return { ok: false, issues: [{ message: "SES line no longer exists" }] };
      }
      if (live.isCertified === false) {
        return {
          ok: false,
          issues: [{ message: "SES line certification was revoked since staging" }],
        };
      }
      if (live.isFullyInvoiced === true) {
        return {
          ok: false,
          issues: [{ message: "SES line was fully invoiced since staging" }],
        };
      }
      if (stagedLine.quantity > live.remainingQty) {
        return {
          ok: false,
          issues: [
            {
              message:
                `Staged qty ${stagedLine.quantity} now exceeds open ${live.remainingQty} ` +
                `on SES ${stagedLine.serviceSheetNumber} line ${stagedLine.lineNumber}`,
            },
          ],
        };
      }
      return { ok: true };
    },

    dedupeKey(line): string {
      return `${line.serviceSheetId}:${line.serviceSheetLineId}`;
    },

    onCommitSideEffects(line): SourceSideEffect[] {
      return [
        {
          kind: "reserve_remaining_quantity",
          entityCode: "service_sheet_line",
          recordId: line.serviceSheetId,
          lineId: line.serviceSheetLineId,
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
