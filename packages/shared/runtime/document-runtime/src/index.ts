/**
 * @athyper/document-runtime
 *
 * Document rendering engine for transaction documents (PO, INV, GR, etc.).
 * Architecture: Chain Ribbon → Header → Status Lanes → Exceptions → Tabs
 */
export { ProcessChainRibbon, type ProcessChainRibbonProps } from "./chain";
export {
  buildDocumentHeaderModel,
  type MapDocumentHeaderModelOpts,
} from "./header";
export { StatusLanes, type StatusLanesProps } from "./status";
export { StatusBadgeStrip, type StatusBadgeStripProps } from "./status";
export { ExceptionStack, type ExceptionStackProps } from "./exceptions";
export { OverviewGrid, type OverviewGridProps, type OverviewCard } from "./overview";
// ── Items sub-module — generic document line items grid ───────────────────────
// PostingTrace + JournalGrid: @athyper/finance-workbench/views
export { ItemsGrid, type ItemsGridProps, type ItemsGridColumn } from "./items";
export { SplitAccountingPanel, type SplitAccountingPanelProps } from "./items/SplitAccountingPanel";
export { LineEditorSheet, type LineEditorSheetProps } from "./items/LineEditorSheet";
export { LinesGrid, type LinesGridProps } from "./items/LinesGrid";
export {
  JournalIntakeLinesGrid,
  JournalLinesGrid,
  type JournalIntakeLinesGridProps,
  type JournalLineGridPayload,
  type JournalLinesGridProps,
} from "./items/JournalLinesGrid";
export {
  InvoiceIntakeLinesGrid,
  type InvoiceIntakeLinesGridProps,
  type InvoiceLineGridPayload,
  type InvoiceLineValidationStatus,
} from "./items/InvoiceIntakeLinesGrid";
export { PaymentAllocationLinesGrid, type PaymentAllocationLinesGridProps } from "./items/PaymentAllocationLinesGrid";
export {
  ClassificationDecisionPanel,
  type ClassificationDecisionPanelProps,
  ClassificationStatusBadge,
  type ClassificationStatusBadgeProps,
} from "./items/ClassificationDecisionPanel";
export { LineComposerSheet, type LineComposerSheetProps } from "./items/LineComposerSheet";

// ── Orchestrator components (Spec v1.2) ──────────────────────────────────────
export { ProcessHealthStrip, type ProcessHealthStripProps } from "./health";
export { SatelliteCardGroup, type SatelliteCardGroupProps, SatelliteDetailSheet, type SatelliteDetailSheetProps } from "./satellites";
export { AmountSummaryCard, type AmountSummaryCardProps } from "./amounts";
export { ValidationBanner, type ValidationBannerProps } from "./validation";
export { DocumentActionBar, type DocumentActionBarProps } from "./actions";
export { buildOrchestratorFromRecord, type OrchestratorData } from "./orchestrator";

// ── Intake wizard — metadata-driven multi-step intake FlowWizard ─────────────
// FlowWizard: full-page wizard for /app/[entity]/new
// FlowModal:  dialog wrapper for MODAL-type entity operations (handler_type='MODAL')
export {
  FlowWizard,
  FlowWizardSkeleton,
  type FlowWizardProps,
  FlowModal,
  type FlowModalProps,
  FlowStepNav,
  FlowSummaryPanel,
  FlowFieldBinding,
  FlowPreflightChooser,
  FlowPreflightLockedSummary,
  FlowPreflightRestartButton,
  getFlowPreflightConfig,
  DerivedChip,
  useFlowEngine,
  canOverride,
  evaluateRule,
  isTruthy,
  type UseFlowEngineReturn,
  type SummaryLine,
  type FlowPreflightConfig,
  type FlowPreflightSelection,
  type RuleContext,
} from "./intake";

// ── Standalone primitives ────────────────────────────────────────────────────
export {
  DocumentIdentityCard,
  type DocumentIdentityCardProps,
  type IdentityAction,
  type IdentityDueMeta,
} from "./identity";
export {
  DocumentKpiStrip,
  type DocumentKpiStripProps,
  type KpiStripCell,
} from "./kpi";

// ── Composite intake wizard (multi-entity onboarding) ────────────────────────
// CompositeFlowWizard: accepts injected engine for multi-entity intake (e.g. supplier)
// useCompositeIntakeEngine: manages flat fields + child rows + step navigation
// ChildRecordRepeater: generic repeater for child-entity rows
// CompletionSummaryPanel: right-rail section completion tracker
// DuplicateCheckBanner: debounced pre-submit duplicate check
export {
  CompositeFlowWizard,
  type CompositeFlowWizardProps,
  ChildRecordRepeater,
  type ChildRecordRepeaterProps,
  CompletionSummaryPanel,
  type CompletionSummaryPanelProps,
  DuplicateCheckBanner,
  type DuplicateCheckBannerProps,
  useCompositeIntakeEngine,
  type CompositeIntakeEngineReturn,
  type CompositeIntakeState,
  childFieldToBinding,
} from "./composite";
export type {
  CompositeFlowBundle,
  CompositeFlowStep,
  FlowSectionDescriptor,
  SectionType,
  ChildFieldSpec,
  SupplierIntakePayload,
  SectionCompletionReport,
  SectionCompletionStatus,
  DuplicateCheckResult,
  DuplicateMatch,
  DuplicateMatchSeverity,
} from "./composite";

// ── Boot-time renderer registration ──────────────────────────────────────────
// Call registerDocumentRenderers() once at app startup (root layout).
export { registerDocumentRenderers } from "./register";

// ── Document detail page ─────────────────────────────────────────────────────
export { DocumentDetailPage, type DocumentDetailPageProps } from "./pages/DocumentDetailPage";

// ── Entity view descriptors + registry ──────────────────────────────────────
// Types and registry for optional descriptor overrides.
// The generic edit runtime derives config from CompiledEntity metadata by default.
export {
  registerEntityDescriptor,
  getEntityDescriptor,
  type EntityViewDescriptor,
  type EntityFactDescriptor,
  type EntityStatusDescriptor,
  type EntityAuditDescriptor,
  type EntityEditFieldDescriptor,
  type EntityDescriptorEditConfig,
} from "./descriptors";
