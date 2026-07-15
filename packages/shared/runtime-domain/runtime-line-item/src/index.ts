"use client";

// ─────────────────────────────────────────────────────────────────────────────
// @athyper/runtime-line-item — public API
//
// Consumers should import from the granular sub-paths for tree-shaking:
//   import { LineItemsSurface } from "@athyper/runtime-line-item/surface"
//   import { AccountingPanel }  from "@athyper/runtime-line-item/panels"
//   import { LineItemVariantRegistry } from "@athyper/runtime-line-item/registry"
//   import { ... } from "@athyper/runtime-line-item/variants/procure"
//   import { ... } from "@athyper/runtime-line-item/variants/sales"
//   import { ... } from "@athyper/runtime-line-item/meta"
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
  LinePricingComponentKind,
  LinePricingComponentLaunch,
  LineFieldChangeResolveInput,
  LineFieldChangeResolveResult,
  LineFieldChangeResolver,
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
  DocumentWorkspaceLineSubmitInput,
  DocumentWorkspaceLineSubmitResult,
  DocumentWorkspaceLineSubmit,
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
  isQuantityLikeFieldName,
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
  CompiledEntityCacheScopeProvider,
  buildCompiledEntityQueryKey,
} from "./meta";
export type { CompiledEntityCacheScope } from "./meta";

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
} from "./panels/accounting-panel";
export {
  AccountingPanel,
  SplitAccountingPanel,
} from "./panels/accounting-panel";

export type {
  ClassificationPanelProps,
  ClassificationDecisionPanelProps,
  ClassificationStatusBadgeProps,
} from "./panels/classification-panel";
export {
  ClassificationPanel,
  ClassificationDecisionPanel,
  ClassificationStatusBadge,
} from "./panels/classification-panel";

// Shared meta-field panels (meta-entity driven via groupKeys)
export type { MetaFieldPanelProps }  from "./panels/meta-field-panel";
export { MetaFieldPanel }            from "./panels/meta-field-panel";
export { TaxPanel }                  from "./panels/tax-panel";
export { DiscountPanel }             from "./panels/discount-panel";
export { ChargesPanel }              from "./panels/charges-panel";
export { RetentionPanel }            from "./panels/retention-panel";
export { ItemDescriptionPanel }      from "./panels/item-description-panel";

// Variant-specific panels
export { ProcureItemPanel }          from "./panels/procure/procure-item-panel";
export { ReferencePanel }            from "./panels/procure/reference-panel";
export { AccountingPanelAdapter }    from "./panels/procure/accounting-panel-adapter";
export { ClassifyPanelAdapter }      from "./panels/procure/classify-panel-adapter";
export { SalesItemPanel }            from "./panels/sales/sales-item-panel";
export { DeliveryPanel }             from "./panels/sales/delivery-panel";

// Panel arrays (use in custom variant definitions or register with LineItemVariantRegistry)
export { PROCURE_PANELS }  from "./variants/procure-panels";
export { SALES_PANELS }    from "./variants/sales-panels";

// Components
export { MetaFieldInput, UomFieldInput, CommodityCodeInput } from "./components/meta-field-input";
export { MetaLineForm } from "./components/meta-line-form";
export type { MetaLineFormProps } from "./components/meta-line-form";
export { QuantityUomValue } from "./components/quantity-uom-value";
export type { QuantityUomValueProps } from "./components/quantity-uom-value";

// Unified panel-driven sheet — the sole sheet implementation.
// The legacy variant-specific sheets (ProcureLineComposerSheet,
// ProcureLineEditorSheet, SalesLineComposerSheet, SalesLineEditorSheet)
// were deleted in Phase 7 — they were imported but never invoked, the
// dispatcher in LineItemSheet.tsx always picked UnifiedLineItemSheet for
// procure / sales variants and GenericLineComposerSheet for the fallback.
export { UnifiedLineItemSheet } from "./components/unified-line-item-sheet";
export type { UnifiedLineItemSheetProps } from "./components/unified-line-item-sheet";

// Footer amount summary strip — generic, meta-driven Net/Discount/Tax/Gross bar.
export { LineItemFooterAmountStrip } from "./components/line-item-footer-amount-strip";
export type {
  LineItemFooterAmountStripProps,
  LineItemFooterAmountStripStatus,
} from "./components/line-item-footer-amount-strip";

// Shared summary-strip resolver — reads display_config.line_summary_strip
// + per-field ui_hint.line_summary. Exposed so custom variants can reuse it.
export { resolveSummaryStripFromMeta } from "./variants/summary-strip";
export type { ResolvedSummaryStrip } from "./variants/summary-strip";

export {
  LineItemComposerSheet,
  LineItemEditorSheet,
} from "./components/line-item-sheet";
export type {
  LineItemComposerSheetProps,
  LineItemEditorSheetProps,
} from "./components/line-item-sheet";

// Surface
export { LineItemsSurface } from "./surface/line-items-surface";
export { LinesGrid }        from "./surface/lines-grid";
export { AddItemDropdown, type AddItemDropdownProps } from "./surface/add-item-dropdown";

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
