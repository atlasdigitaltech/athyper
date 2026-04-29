/**
 * @athyper/document-runtime
 *
 * Document rendering engine for transaction documents (PO, INV, GR, etc.).
 * Architecture: Chain Ribbon → Header → Status Lanes → Exceptions → Tabs
 */
export { ProcessChainRibbon, type ProcessChainRibbonProps } from "./chain";
export { DocumentHeader, type DocumentHeaderProps, type MetadataCluster } from "./header";
export {
  ApprovableDocumentHeader,
  type ApprovableDocumentHeaderProps,
  type ApprovableDocumentHeaderTab,
  type ApprovableDocumentHeaderDTO,
  type ApprovableIdentity,
  type ApprovableParty,
  type ApprovableMoney,
  type ApprovableDates,
  type ApprovableDueMeta,
  type ApprovableReference,
  type ApprovableFlowStep,
  type ApprovableAction,
  type HeaderMode,
  buildApprovableHeaderFromRecord,
  mapDocumentHeaderModel,
  type MapDocumentHeaderModelOpts,
} from "./header";
export { StatusLanes, type StatusLanesProps } from "./status";
export { StatusBadgeStrip, type StatusBadgeStripProps } from "./status";
export { ExceptionStack, type ExceptionStackProps } from "./exceptions";
export { OverviewGrid, type OverviewGridProps, type OverviewCard } from "./overview";
export {
  DocumentShell,
  type DocumentShellProps,
  ApprovableDocumentShell,
  type ApprovableDocumentShellProps,
} from "./shell";
export { useHeaderModePreference } from "./header";

// ── Items sub-module — generic document line items grid ───────────────────────
// PostingTrace + JournalGrid: @athyper/finance-workbench/views
export { ItemsGrid, type ItemsGridProps, type ItemsGridColumn } from "./items";
export { SplitAccountingPanel, type SplitAccountingPanelProps } from "./items/SplitAccountingPanel";
export { LineEditorSheet, type LineEditorSheetProps } from "./items/LineEditorSheet";
export { LinesGrid, type LinesGridProps } from "./items/LinesGrid";
export { JournalLinesGrid, type JournalLinesGridProps } from "./items/JournalLinesGrid";
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
  DerivedChip,
  useFlowEngine,
  canOverride,
  evaluateRule,
  isTruthy,
  type UseFlowEngineReturn,
  type SummaryLine,
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

// ── Boot-time renderer registration ──────────────────────────────────────────
// Call registerDocumentRenderers() once at app startup (root layout).
export { registerDocumentRenderers } from "./register";

// ── Approvable document detail page ─────────────────────────────────────────
export { ApprovableDetailPage, type ApprovableDetailPageProps } from "./pages/ApprovableDetailPage";

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
