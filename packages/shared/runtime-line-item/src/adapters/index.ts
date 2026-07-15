// ─────────────────────────────────────────────────────────────────────────────
// Line-item source adapters. Each adapter implements the SourceAdapter
// contract from @athyper/runtime-add-item and is registered with the app's
// SourceAdapterRegistry at boot. See ./manual-invoice-line.ts for the
// Phase 5 reference implementation.
// ─────────────────────────────────────────────────────────────────────────────

export {
  createManualInvoiceLineAdapter,
  type ManualInvoiceLineDraft,
  type ManualInvoiceLineParentCtx,
  type ManualInvoiceLineSelection,
} from "./manual-invoice-line";

export {
  createCatalogAdapter,
  type CatalogCheckLive,
  type CatalogDraft,
  type CatalogFetchItems,
  type CatalogItemSelection,
  type CatalogParentCtx,
  type CreateCatalogAdapterOptions,
} from "./catalog";

export {
  createOpenPoLineAdapter,
  type CreateOpenPoLineAdapterOptions,
  type OpenPoLineCheckLive,
  type OpenPoLineDraft,
  type OpenPoLineFetchLines,
  type OpenPoLineParentCtx,
  type OpenPoLineSelection,
} from "./open-po-line";

export {
  createOpenReceiptLineAdapter,
  type CreateOpenReceiptLineAdapterOptions,
  type OpenReceiptLineCheckLive,
  type OpenReceiptLineDraft,
  type OpenReceiptLineFetchLines,
  type OpenReceiptLineParentCtx,
  type OpenReceiptLineSelection,
} from "./open-receipt-line";

export {
  createOpenServiceSheetLineAdapter,
  type CreateOpenServiceSheetLineAdapterOptions,
  type OpenServiceSheetLineCheckLive,
  type OpenServiceSheetLineDraft,
  type OpenServiceSheetLineFetchLines,
  type OpenServiceSheetLineParentCtx,
  type OpenServiceSheetLineSelection,
} from "./open-service-sheet-line";
