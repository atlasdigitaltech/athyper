export { DragDropUploadZone, type DragDropUploadZoneProps, type UploadFile } from "./DragDropUploadZone";

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
  EditSessionProvider,
  useDocumentChangeStream,
  useDocumentDirtyMap,
  useDocumentEditSession,
  useEditSessionContext,
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
  type EditSessionProviderProps,
  type UseDocumentChangeStreamOptions,
  type DocumentChangeEvent,
  type DocumentChangeEventType,
  type UseDocumentDirtyMapOptions,
  type UseDocumentDirtyMapReturn,
  type UseDocumentEditSessionOptions,
  type UseDocumentEditSessionReturn,
  type UseLazyDocumentSectionsOptions,
  type UseLazyDocumentSectionsReturn,
  type UseScrollIntentReturn,
  type DocumentSaveStatus,
  type DocumentEditSessionLoadCallback,
  type DocumentEditSessionSaveCallback,
  type DocumentEditSessionSaveOutcome,
  type DocumentEditSessionSaveResult,
  type DocumentEditSessionConflictResult,
  type DocumentEditSessionValidationResult,
  type DocumentEditSessionNetworkErrorResult,
} from "./object-page";

// ── Document Components — reusable presentational primitives ─────────────────
// Canonical paths after Cleanup Plan v5 §P7. Per-component imports go through
// the document-components/ tree; the PI adapter folder only exposes the
// PI-shaped adapter pieces (composer + sidecar + strategy + domain types).

export {
  CurrencyTriad,
  type CurrencyTriadProps,
} from "./document-components/money/CurrencyTriad";

export {
  MatchBadge,
  type MatchBadgeProps,
} from "./document-components/match/MatchBadge";

export {
  PricingComponentWaterfall,
  PricingComponentOriginBadge,
  type PricingComponentWaterfallProps,
} from "./document-components/pricing-components/PricingComponentWaterfall";

export {
  HeaderScopePcStrip,
  type HeaderScopePcStripProps,
} from "./document-components/pricing-components/HeaderScopePcStrip";

export {
  AccountingDistributionPanel,
  type AccountingDistributionPanelProps,
} from "./document-components/distributions/AccountingDistributionPanel";

export {
  PiLineDrawer,
  type PiLineDrawerProps,
} from "./document-components/lines/PiLineDrawer";

export {
  PiHeader,
  type PiHeaderProps,
  type PiHeaderAction,
} from "./document-components/header/PiHeader";

export {
  PostingsPreviewSheet,
  type PostingsPreviewSheetProps,
} from "./document-components/postings-preview/PostingsPreviewSheet";

export {
  buildPostingsPreview,
  type BuildPostingsPreviewInput,
  type PostingsPreviewModel,
  type PostingsPreviewRow,
  type PostingsPreviewStatus,
  type PostingsPreviewSource,
  type PostingsPreviewDrift,
  type PostingsAccountLabels,
} from "./document-components/postings-preview/postingsPreviewBuilder";

export {
  useEditAffordance,
  resolveEditAffordance,
  type UseEditAffordanceOptions,
  type PiEditSurface,
} from "./document-components/shared/useEditAffordance";

export {
  DiscountDrawer,
  TaxDrawer,
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

// ── Purchase Invoice adapter — domain types + composer + strategy ────────────
// See packages/shared/content-ui/src/purchase-invoice/index.ts for what
// belongs in an adapter folder vs the generic document-components tree.

export {
  PaymentTermsCard,
  buildPurchaseInvoiceHeaderProps,
  apInvoicePostingStrategy,
  projectHeader,
  projectLine,
  projectPricingComponents,
  projectAccountingDistributions,
  projectHeaderScopeProjections,
  readPiStatus,
  readMatchStatus,
  readMatchType,

  type PaymentTermsCardProps,
  type PiStatus,
  type PiMatchStatus,
  type PiMatchType,
  type PcTermType,
  type PcBasis,
  type PcEntryLevel,
  type PcOrigin,
  type PcApportionBasis,
  type PcAccountSource,
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
