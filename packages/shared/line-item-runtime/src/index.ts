"use client";

// ─────────────────────────────────────────────────────────────────────────────
// @athyper/line-item-runtime — public API
//
// Consumers should import from the granular sub-paths for tree-shaking:
//   import { LineItemsSurface } from "@athyper/line-item-runtime/surface"
//   import { AccountingPanel }  from "@athyper/line-item-runtime/panels"
//   import { LineItemVariantRegistry } from "@athyper/line-item-runtime/registry"
//   import { ... } from "@athyper/line-item-runtime/variants/procure"
//   import { ... } from "@athyper/line-item-runtime/variants/sales"
//   import { ... } from "@athyper/line-item-runtime/meta"
//
// This barrel re-exports the most commonly needed symbols for convenience.
// ─────────────────────────────────────────────────────────────────────────────

// Registry
export { LineItemVariantRegistry } from "./registry";

// Types
export type {
  LineItemVariantKey,
  LineItemVariantDefinition,
  LineRecord,
  MetaLineColumn,
  MetaLineAlign,
  LineItemSection,
  LineItemSectionType,
  LineItemTab,
  LineItemTabType,
  LineItemAmountConfig,
  LineAmountSummaryField,
  LineFinancialBarField,
  DocumentChainLink,
  ReferenceTabConfig,
  FulfillmentTabConfig,
  LineQuantityProgress,
  MatchException,
  LineOrganizerConfig,
  LineOrganizerDensity,
  LineOrganizerFilter,
  LineOrganizerSort,
  LineOrganizerGroup,
  LineItemSheetContext,
  LineItemComposerProps,
  LineItemEditorProps,
  LinesGridProps,
  LineItemsSurfaceProps,
  // Panel architecture types
  LineItemPanelContext,
  LineItemPanelProps,
  LineItemPanel,
} from "./types";

// Meta utilities
export {
  asRecord,
  recordValue,
  recordId,
  textValue,
  fieldLabel,
  fieldOptions,
  isUomLikeField,
  isEditableLineField,
  resolveTitleField,
  formatFieldValue,
  coerceFieldValue,
  resolveSearchFields,
  resolveDefaultSortField,
  editableLineFields,
  resolveCopyFields,
  initialDraft,
  buildLinePatch,
  buildCreatePayload,
  buildCopyPayload,
  useCompiledEntityMetadata,
} from "./meta";

// Procure variant utilities
export {
  fieldsForGroups,
  resolveProcureComposerSections,
  resolveProcureEditorTabs,
  resolveProcureAmountConfig,
  resolveProcureItemTabConfig,
  resolveProcureTaxTabSections,
  resolveProcurePctTabConfig,
  resolveReferenceTabConfig,
  resolveLineQuantityProgress,
  computeTabBadge,
  resolveProcureGridSummary,
  normalizeProcureDraftLine,
  useProcureLineDistributions,
  useReferencedRecord,
  useMatchExceptions,
} from "./variants/procure";

export type {
  ProcureItemTabConfig,
  ProcureTaxTabSection,
  ProcurePctTabConfig,
} from "./variants/procure";

// Sales variant utilities
export {
  resolveSalesComposerSections,
  resolveSalesEditorTabs,
  resolveSalesAmountConfig,
  resolveFulfillmentTabConfig,
  normalizeSalesDraftLine,
} from "./variants/sales";

// Generic variant utilities
export {
  resolveGenericComposerSections,
  resolveGenericEditorTabs,
  resolveGenericAmountConfig,
} from "./variants/generic";

// Panels
export type {
  AccountingPanelProps,
  AccountingPanelHandle,
  SplitAccountingPanelProps,
  SplitAccountingPanelHandle,
} from "./panels/AccountingPanel";
export {
  AccountingPanel,
  SplitAccountingPanel,
} from "./panels/AccountingPanel";

export type {
  ClassificationPanelProps,
  ClassificationDecisionPanelProps,
  ClassificationStatusBadgeProps,
} from "./panels/ClassificationPanel";
export {
  ClassificationPanel,
  ClassificationDecisionPanel,
  ClassificationStatusBadge,
} from "./panels/ClassificationPanel";

// Shared meta-field panels (meta-entity driven via groupKeys)
export type { MetaFieldPanelProps }  from "./panels/MetaFieldPanel";
export { MetaFieldPanel }            from "./panels/MetaFieldPanel";
export { TaxPanel }                  from "./panels/TaxPanel";
export { DiscountPanel }             from "./panels/DiscountPanel";
export { ChargesPanel }              from "./panels/ChargesPanel";
export { RetentionPanel }            from "./panels/RetentionPanel";
export { ItemDescriptionPanel }      from "./panels/ItemDescriptionPanel";

// Variant-specific panels
export { ProcureItemPanel }          from "./panels/procure/ProcureItemPanel";
export { ReferencePanel }            from "./panels/procure/ReferencePanel";
export { AccountingPanelAdapter }    from "./panels/procure/AccountingPanelAdapter";
export { ClassifyPanelAdapter }      from "./panels/procure/ClassifyPanelAdapter";
export { SalesItemPanel }            from "./panels/sales/SalesItemPanel";
export { DeliveryPanel }             from "./panels/sales/DeliveryPanel";

// Panel arrays (use in custom variant definitions or register with LineItemVariantRegistry)
export { PROCURE_PANELS }  from "./variants/procure-panels";
export { SALES_PANELS }    from "./variants/sales-panels";

// Components
export { MetaFieldInput, UomFieldInput, CommodityCodeInput } from "./components/MetaFieldInput";
export { MetaLineForm } from "./components/MetaLineForm";
export type { MetaLineFormProps } from "./components/MetaLineForm";

// Unified panel-driven sheet — the sole sheet implementation.
// The legacy variant-specific sheets (ProcureLineComposerSheet,
// ProcureLineEditorSheet, SalesLineComposerSheet, SalesLineEditorSheet)
// were deleted in Phase 7 — they were imported but never invoked, the
// dispatcher in LineItemSheet.tsx always picked UnifiedLineItemSheet for
// procure / sales variants and GenericLineComposerSheet for the fallback.
export { UnifiedLineItemSheet } from "./components/UnifiedLineItemSheet";
export type { UnifiedLineItemSheetProps } from "./components/UnifiedLineItemSheet";

// Footer amount summary strip — generic, meta-driven Net/Discount/Tax/Gross bar.
export { LineItemFooterAmountStrip } from "./components/LineItemFooterAmountStrip";
export type {
  LineItemFooterAmountStripProps,
  LineItemFooterAmountStripStatus,
} from "./components/LineItemFooterAmountStrip";

// Shared summary-strip resolver — reads display_config.line_summary_strip
// + per-field ui_hint.line_summary. Exposed so custom variants can reuse it.
export { resolveSummaryStripFromMeta } from "./variants/summary-strip";
export type { ResolvedSummaryStrip } from "./variants/summary-strip";

export {
  LineItemComposerSheet,
  LineItemEditorSheet,
} from "./components/LineItemSheet";
export type {
  LineItemComposerSheetProps,
  LineItemEditorSheetProps,
} from "./components/LineItemSheet";

// Surface
export { LineItemsSurface } from "./surface/LineItemsSurface";
export { LinesGrid }        from "./surface/LinesGrid";
export { AddItemDropdown, type AddItemDropdownProps } from "./surface/AddItemDropdown";

// Source adapters (Phase 5+)
export {
  createManualInvoiceLineAdapter,
  type ManualInvoiceLineDraft,
  type ManualInvoiceLineParentCtx,
  type ManualInvoiceLineSelection,
  createCatalogAdapter,
  type CatalogCheckLive,
  type CatalogDraft,
  type CatalogFetchItems,
  type CatalogItemSelection,
  type CatalogParentCtx,
  type CreateCatalogAdapterOptions,
  createOpenPoLineAdapter,
  type CreateOpenPoLineAdapterOptions,
  type OpenPoLineCheckLive,
  type OpenPoLineDraft,
  type OpenPoLineFetchLines,
  type OpenPoLineParentCtx,
  type OpenPoLineSelection,
  createOpenReceiptLineAdapter,
  type CreateOpenReceiptLineAdapterOptions,
  type OpenReceiptLineCheckLive,
  type OpenReceiptLineDraft,
  type OpenReceiptLineFetchLines,
  type OpenReceiptLineParentCtx,
  type OpenReceiptLineSelection,
  createOpenServiceSheetLineAdapter,
  type CreateOpenServiceSheetLineAdapterOptions,
  type OpenServiceSheetLineCheckLive,
  type OpenServiceSheetLineDraft,
  type OpenServiceSheetLineFetchLines,
  type OpenServiceSheetLineParentCtx,
  type OpenServiceSheetLineSelection,
} from "./adapters";
