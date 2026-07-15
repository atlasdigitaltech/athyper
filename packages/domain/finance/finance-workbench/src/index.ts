export { GlWorkbench } from "./views/GlWorkbench";
export { CoaWorkbench } from "./views/CoaWorkbench";
export type { FinanceScope, ScopeType } from "./lib/scope";

// ── Finance Setup Workbench (Phase 1) ──────────────────────────────────────
export { CompanyHubView } from "./views/company-hub/CompanyHubView";
export { ReadinessJourney } from "./views/company-hub/ReadinessJourney";
export { NeedsAttentionInbox } from "./views/company-hub/NeedsAttentionInbox";
export { WorkspaceCards } from "./views/company-hub/WorkspaceCards";
export { PostabilityChip } from "./views/company-hub/PostabilityChip";
export { DefinitionStateChip } from "./views/company-hub/DefinitionStateChip";
export { useCompanyHub } from "./hooks/useCompanyHub";
export { useFinanceSetupConflicts } from "./hooks/useFinanceSetupConflicts";
export { useReasonCodeCatalog, resolveReasonEntry } from "./hooks/useReasonCodeCatalog";

// ── Phase 1.5 workspaces ───────────────────────────────────────────────────
export { ExploreWorkspaceView } from "./views/explore/ExploreWorkspaceView";
export { ConfigureWorkspaceView } from "./views/configure/ConfigureWorkspaceView";
export { OperateWorkspaceView } from "./views/operate/OperateWorkspaceView";
export { WorkspaceHeader } from "./views/workspace/WorkspaceHeader";
export { ChartTreePanel } from "./views/explore/ChartTreePanel";
export { InspectorPanel } from "./views/explore/InspectorPanel";
export { GlAccountsListPanel } from "./views/explore/GlAccountsListPanel";
export { BooksListPanel, HouseBanksExplorePanel } from "./views/explore/BooksAndBanksPanels";
export { GlControlsGrid } from "./views/configure/GlControlsGrid";
export { ChartAssignmentPanel, BookAssignmentPanel } from "./views/configure/ChartAndBookAssignmentPanels";
export {
  useExploreChartTree,
  useExploreGlAccounts,
  useExploreBooks,
  useExploreHouseBanks,
} from "./hooks/useFinanceExplore";
export {
  useConfigureGlControls,
  useConfigureChartAssignments,
  useConfigureBookAssignments,
} from "./hooks/useFinanceConfigure";
export {
  useOperateBlockers,
  useOperateReconciliationSignals,
} from "./hooks/useFinanceOperate";
export { useAccountPostability } from "./hooks/useAccountPostability";
export type {
  CompanyHubPayload,
  FinanceSetupConflict,
  FinanceSetupScopeType,
  JourneyStep,
  JourneyStepKey,
  PeriodPostability,
  AccountPostability,
  PostabilityChip as PostabilityChipValue,
  DefinitionState,
  ConflictSeverity,
  ConflictCategory,
  WorkspaceCardCounts,
  ReasonCodeEntry,
  RollupPayload,
  PostingPreviewPayload,
} from "./lib/finance-setup.types";

// ── Phase 1.6 — Rollup (Tenant / Legal Entity) ─────────────────────────────
export { RollupView } from "./views/rollup/RollupView";
export { RollupAggregateStrip } from "./views/rollup/RollupAggregateStrip";
export { RollupCompanyMatrix } from "./views/rollup/RollupCompanyMatrix";
export { useFinanceRollup } from "./hooks/useFinanceRollup";
export type {
  RollupScopeType,
  RollupCompanyRow,
  FinanceRollupPayload,
  UseFinanceRollupOptions,
} from "./hooks/useFinanceRollup";

// ── Phase 2 — Mutations ────────────────────────────────────────────────────
export {
  useAssignGlControl,
  useUpdateGlControl,
  useDeactivateGlControl,
  useSetPrimaryChartAssignment,
  useSetPrimaryBook,
  useToggleHouseBank,
} from "./hooks/useFinanceSetupMutations";
export type {
  AssignGlControlPayload,
  UpdateGlControlPayload,
  DeactivateGlControlPayload,
  SetPrimaryChartAssignmentPayload,
  SetPrimaryBookPayload,
  ToggleHouseBankPayload,
} from "./hooks/useFinanceSetupMutations";
export { GlControlAssignDialog, GlControlEditDialog } from "./views/configure/GlControlDialogs";
