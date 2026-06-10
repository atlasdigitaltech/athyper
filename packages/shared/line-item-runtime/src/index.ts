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
  resolveLineColumns,
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
  buildProcureColumnCatalog,
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
  buildSalesColumnCatalog,
  normalizeSalesDraftLine,
} from "./variants/sales";

// Generic variant utilities
export {
  resolveGenericComposerSections,
  resolveGenericEditorTabs,
  resolveGenericAmountConfig,
  buildGenericColumnCatalog,
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

export { ProcureLineComposerSheet } from "./components/ProcureLineComposerSheet";
export { ProcureLineEditorSheet }   from "./components/ProcureLineEditorSheet";
export { SalesLineComposerSheet }   from "./components/SalesLineComposerSheet";
export { SalesLineEditorSheet }     from "./components/SalesLineEditorSheet";

// Unified panel-driven sheet (preferred over variant-specific sheets)
export { UnifiedLineItemSheet } from "./components/UnifiedLineItemSheet";
export type { UnifiedLineItemSheetProps } from "./components/UnifiedLineItemSheet";

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
