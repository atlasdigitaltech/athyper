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

// ── Orchestrator components (Spec v1.2) ──────────────────────────────────────
export { ProcessHealthStrip, type ProcessHealthStripProps } from "./health";
export { SatelliteCardGroup, type SatelliteCardGroupProps, SatelliteDetailSheet, type SatelliteDetailSheetProps } from "./satellites";
export { AmountSummaryCard, type AmountSummaryCardProps } from "./amounts";
export { ValidationBanner, type ValidationBannerProps } from "./validation";
export { DocumentActionBar, type DocumentActionBarProps } from "./actions";
export { buildOrchestratorFromRecord, type OrchestratorData } from "./orchestrator";
