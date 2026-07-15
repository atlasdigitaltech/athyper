export { DragDropUploadZone, type DragDropUploadZoneProps, type UploadFile } from "./drag-drop-upload-zone";

export {
  MoneySummaryStrip,
  type MoneySummaryMetric,
  type MoneySummaryStripProps,
} from "./document-components/pricing-components/money-summary-strip";

export {
  FieldRow,
  FIELD_ROW_SPACING,
  type FieldRowProps,
  type FieldRowLabelProps,
  type FieldRowReadProps,
  type FieldRowEditProps,
  type FieldRowDensity,
  type LockedFieldReason,
  type FieldRowSpacing,
} from "./field-row";

export {
  DocumentObjectPage,
  DocumentSection,
  DocumentSectionSkeleton,
  useDocumentPageController,
  useDocumentScrollSpy,
  usePinOnScroll,
  EditDraftProvider,
  useDocumentDirtyMap,
  useDocumentEditDraft,
  useEditDraftContext,
  useLazyDocumentSections,
  useLineEditState,
  useScrollIntent,
  getSectionElementId,
  getSectionHash,
  parseCssVarPx,
  prefersReducedMotion,
  hasScrollEnd,
  composeRegisterSectionRef,
  type DocumentObjectPageProps,
  type DocumentSectionProps,
  type DocumentSectionSkeletonProps,
  type DocumentSectionDescriptor,
  type ScrollIntentSource,
  type SectionLoadPolicy,
  type UseDocumentPageControllerOptions,
  type UseDocumentPageControllerReturn,
  type UseDocumentScrollSpyOptions,
  type UseDocumentScrollSpyReturn,
  type UsePinOnScrollOptions,
  type EditDraftProviderProps,
  type UseDocumentDirtyMapOptions,
  type UseDocumentDirtyMapReturn,
  type UseDocumentEditDraftOptions,
  type UseDocumentEditDraftReturn,
  type UseLazyDocumentSectionsOptions,
  type UseLazyDocumentSectionsReturn,
  type UseScrollIntentReturn,
  type DocumentSaveStatus,
  type DocumentEditDraftLoadCallback,
  type DocumentEditDraftSaveCallback,
  type DocumentEditDraftSaveOutcome,
  type DocumentEditDraftSaveResult,
  type DocumentEditDraftConflictResult,
  type DocumentEditDraftValidationResult,
  type DocumentEditDraftNetworkErrorResult,
} from "./object-page";

// Ã¢â€â‚¬Ã¢â€â‚¬ Document Components Ã¢â‚¬â€ reusable presentational primitives Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Canonical paths after Cleanup Plan v5 Ã‚Â§P7. Per-component imports go through
// the document-components/ tree; the PI adapter folder only exposes the
// PI-shaped adapter pieces (composer + sidecar + strategy + domain types).

export {
  CurrencyTriad,
  type CurrencyTriadProps,
} from "./document-components/money/currency-triad";

export {
  MatchBadge,
  type MatchBadgeProps,
} from "./document-components/match/match-badge";

export {
  PricingComponentWaterfall,
  PricingComponentOriginBadge,
  type PricingComponentWaterfallProps,
} from "./document-components/pricing-components/pricing-component-waterfall";

export {
  HeaderScopePcStrip,
  type HeaderScopePcStripProps,
  type ApportionmentSummary,
  type LineRollupGroup,
} from "./document-components/pricing-components/header-scope-pc-strip";

// Streamlined Identity panel backed by document header fields and live master joins.
export * from "./document-components/identity-v2";

export {
  ApportionmentBreakupDrawer,
  type ApportionmentBreakupDrawerProps,
} from "./document-components/pricing-components/apportionment-breakup-drawer";

export {
  AccountingDistributionPanel,
  type AccountingDistributionPanelProps,
} from "./document-components/distributions/accounting-distribution-panel";

export { deriveDistributableCost } from "./document-components/distributions/distributable-cost";

export {
  AccountingDistributionDrawer,
  type AccountingDistributionDrawerProps,
  type AccountingDistributionDrawerMode,
  type AccountingDistributionDraft,
  type AccountingDistributionSplitDraft,
} from "./document-components/distributions/accounting-distribution-drawer";

export {
  PiLineDrawer,
  type PiLineDrawerProps,
} from "./document-components/lines/pi-line-drawer";

export {
  PostingsPreviewSheet,
  type PostingsPreviewSheetProps,
} from "./document-components/postings-preview/postings-preview-sheet";

export {
  buildPostingsPreview,
  type BuildPostingsPreviewInput,
  type PostingsPreviewModel,
  type PostingsPreviewRow,
  type PostingsPreviewStatus,
  type PostingsPreviewSource,
  type PostingsPreviewDrift,
  type PostingsAccountLabels,
} from "./document-components/postings-preview/postings-preview-builder";

export {
  useEditAffordance,
  resolveEditAffordance,
  type UseEditAffordanceOptions,
  type PiEditSurface,
} from "./document-components/shared/use-edit-affordance";

export {
  DiscountDrawer,
  TaxDrawer,
  WhtDrawer,
  computeApportionment,
  validatePcDraft,
  resolveBaseForCalculation,
  previewComputedAmount,
  describeBasisHint,
  SectionLabel,
  SegmentedToggle,
  LockedHint,
  ReplacingBlock,
  InheritedBlock,
  SupersedeModeBanner,
  MaterialChangeWarning,
  ErrorList,
  type DiscountDrawerProps,
  type DiscountDrawerMode,
  type ConditionTypeOption,
  type TaxDrawerProps,
  type TaxDrawerMode,
  type TaxGroupOption,
  type WhtDrawerProps,
  type WhtDrawerMode,
  type WhtGroupOption,
  type PcValidateContext,
  type ApportionmentInput,
  type ApportionmentRow,
  type ApportionmentResult,
  type ApportionmentIncompatibility,
  type PcDraft,
  type PcDraftError,
  type ComputesOnMode,
  type SegmentedToggleOption,
  type SegmentedToggleProps,
} from "./document-components/pricing-components/drawers";

// Ã¢â€â‚¬Ã¢â€â‚¬ Purchase Invoice adapter Ã¢â‚¬â€ domain types + composer + strategy Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// See packages/shared/ui-platform/content-ui/src/purchase-invoice/index.ts for what
// belongs in an adapter folder vs the generic document-components tree.

export {
  PaymentTermsCard,
  apInvoicePostingStrategy,
  projectHeader,
  projectLine,
  projectPricingComponents,
  projectAccountingDistributions,
  projectHeaderScopeProjections,
  enrichComponentsWithConditionType,
  readPiStatus,
  readMatchStatus,
  readMatchType,
  type ConditionTypeLookupEntry,

  type PaymentTermsCardProps,
  type PiStatus,
  type PiMatchStatus,
  type PiMatchType,
  type PcTermType,
  type PcBasis,
  type PcEntryLevel,
  type PcOrigin,
  type PcApportionBasis,
  type PricingComponent,
  type AdDistributionBasis,
  type AdAccountSource,
  type AdBudgetCheckResult,
  type AccountingDistribution,
  type PtaClauseType,
  type PtaApplicationStatus,
  type PtaSystemReasonCode,
  type PaymentTermApplication,
  type PtdrApplicationStatus,
  type PaymentTermDiscountResult,
  type PiAmountSummary,
  type PurchaseInvoiceHeader,
  type PurchaseInvoiceLine,
  type EditAffordance,
  type HeaderPcProjection,
  type PostingStrategy,
} from "./purchase-invoice";
