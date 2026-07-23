export { GlWorkbench } from "./views/GlWorkbench";
export { CoaWorkbench } from "./views/CoaWorkbench";
export type { FinanceScope, ScopeType } from "./lib/scope";
export { FINANCE_SETUP_WORKSPACE } from "./lib/finance-setup.workspace";

// ── Finance Setup Workbench (Phase 1) ──────────────────────────────────────
export { CompanyHubView, FinanceSetupCompanyEntry } from "./views/company-hub/CompanyHubView";
export { ReadinessJourney } from "./views/company-hub/ReadinessJourney";
export { NeedsAttentionInbox } from "./views/company-hub/NeedsAttentionInbox";
export { WorkspaceCards } from "./views/company-hub/WorkspaceCards";
export { PostabilityChip } from "./views/company-hub/PostabilityChip";
export { DefinitionStateChip } from "./views/company-hub/DefinitionStateChip";
export { useCompanyHub } from "./hooks/useCompanyHub";
export { FoundationView, type FoundationViewProps } from "./views/foundation/FoundationView";
export { BooksFoundationPanel } from "./views/foundation/BooksFoundationPanel";
export { useCompanyFoundation } from "./hooks/useCompanyFoundation";
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
export { FiscalCalendarDesigner } from "./views/configure/FiscalCalendarDesigner";
export { PostingRoleCoverageMatrix } from "./views/configure/PostingRoleCoverageMatrix";
export { OpeningBalanceWorkbench, type OpeningBalanceWorkbenchProps } from "./views/OpeningBalanceWorkbench";
export { FinanceReadinessWorkbench, type FinanceReadinessWorkbenchProps } from "./views/FinanceReadinessWorkbench";
export { CloseCycleWorkbench, type CloseCycleWorkbenchProps } from "./views/CloseCycleWorkbench";
export { CrossBookPostingMonitor, type CrossBookPostingMonitorProps } from "./views/CrossBookPostingMonitor";
export { useCrossBookPostingMonitor } from "./hooks/useCrossBookPostingMonitor";
export { FinanceWorkbenchHub } from "./views/FinanceWorkbenchHub";
export { FinanceAggregateEditor, type FinanceAggregateKind } from "./views/configure/FinanceAggregateEditor";
export {
  useFiscalCalendarDesigner,
  useFiscalCalendarPreview,
  useFiscalPeriodMatrix,
  useSaveFiscalCalendar,
  useAssignFiscalCalendar,
  useGenerateFiscalPeriods,
  useRetireFiscalCalendar,
} from "./hooks/useFiscalCalendarDesigner";
export type { FiscalPeriodMatrixPayload } from "./hooks/useFiscalCalendarDesigner";
export {
  usePostingRoleCoverage,
  usePostingRoleResolutionTrace,
  useSavePostingRoleAccountMap,
  useRetirePostingRoleAccountMap,
} from "./hooks/usePostingRoleCoverage";
export {
  useExploreChartTree,
  useExploreGlAccounts,
  useExploreBooks,
  useExploreHouseBanks,
} from "./hooks/useFinanceExplore";
export {
  useConfigureGlControls,
  useConfigureChartAssignments,
  useConfigureChartOptions,
  useConfigureBookAssignments,
  useConfigureBookOptions,
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
  CompanyFoundationPayload,
  FoundationDomainKey,
  FoundationDomainStatus,
  FoundationDomainCompletion,
  FoundationReadiness,
  FoundationReadinessStatus,
  FoundationDeterministicCheck,
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
  useSaveChartAssignment,
  useDeactivateChartAssignment,
  useBulkGlControls,
  useSetCompanyDefaultBook,
  useSaveBookAssignment,
  useDeactivateBookAssignment,
  useToggleHouseBank,
} from "./hooks/useFinanceSetupMutations";
export type {
  AssignGlControlPayload,
  UpdateGlControlPayload,
  DeactivateGlControlPayload,
  SetPrimaryChartAssignmentPayload,
  SaveChartAssignmentPayload,
  DeactivateChartAssignmentPayload,
  BulkGlControlsPayload,
  SetCompanyDefaultBookPayload,
  SaveBookAssignmentPayload,
  DeactivateBookAssignmentPayload,
  ToggleHouseBankPayload,
} from "./hooks/useFinanceSetupMutations";
export { GlControlAssignDialog, GlControlEditDialog } from "./views/configure/GlControlDialogs";

// Phase 2 · Currency and FX
export { CurrencyFxSetupView } from "./views/currency-fx/CurrencyFxSetupView";
export { FxRateWorkbench } from "./views/currency-fx/FxRateWorkbench";
export {
  useCurrencyFxSetup, useFxResolutionTrace, useSaveFxPolicy,
  useFxRates, useValidateFxImport, useImportFxRates,
} from "./hooks/useCurrencyFxSetup";
export type { CurrencyFxSetupPayload, FxResolutionTrace, FxPolicy, FxRateRow, FxImportValidation } from "./hooks/useCurrencyFxSetup";

// Phase 2 · Tax
export { CompanyTaxProfileView } from "./views/tax/CompanyTaxProfileView";
export { TaxConfigurationWorkbench } from "./views/tax/TaxConfigurationWorkbench";
export * from "./hooks/useTaxSetup";
export * from "./hooks/usePaymentsSetup";
export * from "./hooks/useBankingSetup";
export * from "./hooks/useCertificationReadiness";
export { PaymentTermWorkbench } from "./views/payments/PaymentTermWorkbench";
export { CompanyPaymentsSetupView } from "./views/payments/CompanyPaymentsSetupView";
export { PaymentPolicyControls } from "./views/payments/PaymentPolicyControls";
export { CompanyBankingTreasuryView } from "./views/banking/CompanyBankingTreasuryView";
export { CertificationReadinessPanel } from "./views/company-hub/CertificationReadinessPanel";
