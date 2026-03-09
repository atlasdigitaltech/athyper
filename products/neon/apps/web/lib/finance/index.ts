// lib/finance/index.ts — barrel export

export * from "./types";
export { FinanceHttpError } from "./errors";
export { finGet, finPost, finPatch, finPut, finDelete } from "./fetcher";

// Hooks
export { useInvoiceLines } from "./use-invoice-lines";
export type { UseInvoiceLinesResult } from "./use-invoice-lines";

export { useJournalEntry } from "./use-journal-entry";
export type { UseJournalEntryResult } from "./use-journal-entry";

export { usePaymentAllocations } from "./use-payment-allocations";
export type { UsePaymentAllocationsResult } from "./use-payment-allocations";

export { useGLReport } from "./use-gl-report";
export type { UseGLReportResult, GLReportTab } from "./use-gl-report";

export { useDecisionScore } from "./use-decision-score";
export type { UseDecisionScoreResult } from "./use-decision-score";


// Reporting
export * from "./reporting-types";

export { usePnLReport } from "./use-pnl-report";
export type { UsePnLReportResult } from "./use-pnl-report";

export { useDrilldown } from "./use-drilldown";
export type { UseDrilldownResult } from "./use-drilldown";

export { useMonthEnd } from "./use-month-end";
export type { UseMonthEndResult } from "./use-month-end";

export { useReportPresets } from "./use-report-presets";
export type { UseReportPresetsResult } from "./use-report-presets";

// Dimensions
export { useDimensionTypes, useDimensionValues, useDimensionSet } from "./use-dimensions";
export { useCreateJournalEntry } from "./use-create-journal-entry";
export type { UseCreateJournalEntryResult, ManualJELineInput, CreateManualJEInput } from "./use-create-journal-entry";

export {
  useDimensionResolutionMeta,
  useDimensionPolicyTrace,
  useDimensionOrphanScan,
  useDimensionHashCompare,
} from "./use-dimension-diagnostics";

// Cross-book audit
export {
  useCrossBookAudit,
  useBookCloseHistory,
  useCompareBooks,
  useReversalChain,
} from "./use-cross-book-audit";

export { useStatementReport } from "./use-statement-report";
export type { UseStatementReportResult } from "./use-statement-report";

export { useStatementCompare } from "./use-statement-compare";
export type { UseStatementCompareResult } from "./use-statement-compare";


// Pack Governance: Certification, Distribution, Activity, Forecast
export {
  usePackCertification,
  usePackDistributions,
  useDistributionRecipients,
  usePackActivity,
  useForecastScenarios,
} from "./use-pack-governance";
export type {
  UsePackCertificationResult,
  UsePackDistributionsResult,
  UseDistributionRecipientsResult,
  UsePackActivityResult,
  UseForecastScenariosResult,
} from "./use-pack-governance";

// Release Orchestration (207-208)
export * from "./release-types";

export {
  useReleaseDashboard,
  useReleaseDetail,
  useReleaseDecisions,
  useReleaseNotifications,
  useReleaseSLA,
  useReleaseOverrides,
  useReleaseManifest,
  useReleaseAuditChain,
  useReleaseTimeline,
  useReleasePreflight,
  useReleaseDetailWithPanels,
  useReleaseKPIs,
  useReleaseAuditPackage,
  useReleaseExportHistory,
} from "./use-releases";
export type {
  ReleaseDashboardFilters,
  UseReleaseDashboardResult,
  UseReleaseDetailResult,
  UseReleaseDecisionsResult,
  UseReleaseNotificationsResult,
  UseReleaseSLAResult,
  UseReleaseOverridesResult,
  UseReleaseManifestResult,
  UseReleaseAuditChainResult,
  UseReleaseTimelineResult,
  UseReleasePreflightResult,
  UseReleaseDetailWithPanelsResult,
  TimelineFilters,
  UseReleaseKPIsResult,
  UseReleaseAuditPackageResult,
  UseReleaseExportHistoryResult,
} from "./use-releases";

export { useReleaseCommands } from "./use-release-commands";
export type { UseReleaseCommandsResult } from "./use-release-commands";

// CFO Workspace: Pack Readiness & Intelligence
export { usePackReadiness, usePackDelta, useExecutiveBrief, useReadinessTrend } from "./use-pack-readiness";
export type {
  PackReadinessParams,
  PackReadinessFullDTO,
  PackReadinessDTO,
  PackDeltaDTO,
  GLChangeDTO,
  MaterialityInsightDTO,
  CloseStateDTO,
  PackSummaryDTO,
  CertificationSummaryDTO,
  ReleaseSummaryDTO,
  DistributionSummaryDTO,
  CleanCloseDTO,
  ExecutiveBriefDTO,
  AttentionItemDTO,
  ReadinessTrendDTO,
  PeriodTrendDTO,
  TrendSummaryDTO,
  ReadinessTrendParams,
} from "./use-pack-readiness";

// Risk Signals
export {
  useRiskSignals,
  useRiskSummary,
  useRiskSignalActions,
} from "./use-risk-signals";
export type { RiskSignalParams } from "./use-risk-signals";

// Close Command Center: Document Readiness
export { useCloseDocumentReadiness } from "./use-close-document-readiness";
export type { CloseDocumentReadinessParams } from "./use-close-document-readiness";

// Phase 8B: Enhanced Close Command Center types (re-exported from types.ts via *)
// BookPostingSummaryDTO, ReversedStillCountedDTO, ApprovalEvidenceGapDTO,
// DefectAgingDTO, DocumentReadinessTrendDTO — available via `export * from "./types"`

// CFO Action Workspace (Phase 12)
export {
  useCommentary,
  useActionItems,
  useActionItemMutations,
  useDecisionLog,
  useRecordDecision,
  useCarryForward,
} from "./use-cfo-actions";
export type {
  CommentaryDTO,
  CommentarySaveInput,
  UseCommentaryResult,
  ActionItemDTO,
  ActionItemFilters,
  ActionItemCreateInput,
  UseActionItemsResult,
  UseActionItemMutationsResult,
  DecisionDTO,
  DecisionFilters,
  DecisionCreateInput,
  UseDecisionLogResult,
  UseRecordDecisionResult,
  FollowupLinkDTO,
  CarryForwardFilters,
  UseCarryForwardResult,
} from "./use-cfo-actions";

// CFO Review Pack & Board Reporting (Phase 13)
export {
  useReviewPack,
  useReviewSnapshots,
  useReviewSnapshotDetail,
  useReviewSnapshotMutations,
} from "./use-review-pack";
export type {
  ReviewSectionDTO,
  ReviewPackDTO,
  ReviewPackParams,
  UseReviewPackResult,
  ReviewSnapshotSummaryDTO,
  ReviewSnapshotDetailDTO,
  UseReviewSnapshotsResult,
  UseReviewSnapshotDetailResult,
  SnapshotCaptureInput,
  UseReviewSnapshotMutationsResult,
} from "./use-review-pack";

// Review Governance: Diff, Traceability, Attestation (Phase 14)
export {
  useSnapshotDiff,
  useTraceability,
  useAttestations,
  useRecordAttestation,
} from "./use-review-governance";
export type {
  SnapshotDiffSummary,
  SectionDiffDTO,
  ItemDiffDTO,
  SnapshotDiffDTO,
  EvidenceLinkDTO,
  SectionProvenanceDTO,
  AttestationDTO,
  AttestationInput,
  UseSnapshotDiffResult,
  UseTraceabilityResult,
  UseAttestationsResult,
  UseRecordAttestationResult,
} from "./use-review-governance";

// Finance Assurance Hub & External Audit Workspace (Phase 15)
export {
  useEvidenceRequests,
  useEvidenceRequestMutations,
  useEvidenceBundles,
  useEvidenceBundleDetail,
  useEvidenceBundleMutations,
} from "./use-assurance-hub";
export type {
  EvidenceRequestDTO,
  EvidenceRequestCreateInput,
  EvidenceRequestFilters,
  EvidenceBundleDTO,
  EvidenceBundleItemDTO,
  EvidenceBundleDetailDTO,
  EvidenceBundleCreateInput,
  BundleItemInput,
  BundleDistributeInput,
  UseEvidenceRequestsResult,
  UseEvidenceRequestMutationsResult,
  UseEvidenceBundlesResult,
  UseEvidenceBundleDetailResult,
  UseEvidenceBundleMutationsResult,
} from "./use-assurance-hub";

// Continuous Controls Monitoring & Assurance Analytics (Phase 16)
export {
  useControlEffectiveness,
  useAssuranceWorkload,
  useChronicIssues,
  useAssuranceScorecard,
} from "./use-assurance-analytics";
export type {
  ControlEffectivenessDTO,
  WorkloadItemDTO,
  WorkloadSummaryDTO,
  WorkloadResultDTO,
  ChronicIssueDTO,
  AssuranceScorecardDTO,
  AssuranceAnalyticsFilters,
  UseControlEffectivenessResult,
  UseAssuranceWorkloadResult,
  UseChronicIssuesResult,
  UseAssuranceScorecardResult,
} from "./use-assurance-analytics";

// Control Benchmarking, Targets & Adaptive Policy Tuning (Phase 17)
export {
  useControlTargets,
  useControlBenchmark,
  usePolicyRecommendations,
  useTargetMutations,
} from "./use-control-benchmarking";
export type {
  ControlTargetDTO,
  BenchmarkDTO,
  PolicyRecommendationDTO,
  ControlTargetInput,
  UseControlTargetsResult,
  UseControlBenchmarkResult,
  UsePolicyRecommendationsResult,
  UseTargetMutationsResult,
} from "./use-control-benchmarking";

// Control Program Management & Remediation Portfolio (Phase 18)
export {
  useControlPrograms,
  useProgramDetail,
  useProgramImpact,
  useProgramMutations,
} from "./use-control-programs";
export type {
  ControlProgramDTO,
  ProgramDetailDTO,
  ProgramMilestoneDTO,
  ProgramImpactDTO,
  ImpactMetricDTO,
  ProgramCreateInput,
  MilestoneCreateInput,
  UseControlProgramsResult,
  UseProgramDetailResult,
  UseProgramImpactResult,
  UseProgramMutationsResult,
} from "./use-control-programs";

// Phase 8C: Document Health, Reconciliation, Remediation
export { useDocumentHealth } from "./use-document-health";
export type { DocumentHealthParams, UseDocumentHealthResult } from "./use-document-health";

export { useRemediationActions } from "./use-document-health";
export type { UseRemediationActionsResult } from "./use-document-health";

// Phase 8D: Campaigns, Previews, Remediation Audit
export { useCampaignList, useRemediationPreview } from "./use-remediation-campaigns";
export type {
  CampaignListParams,
  UseCampaignListResult,
  CreateCampaignInput,
  UseRemediationPreviewResult,
} from "./use-remediation-campaigns";

export { downloadRemediationAuditPackage } from "./export-remediation-package";
export type { RemediationAuditPackage } from "./export-remediation-package";

// Phase 9A: Close Control Tower
export {
  useCloseExecutiveSummary,
  useOverridePosture,
  useSlaPerformanceTrend,
} from "./use-close-control-tower";
export type {
  CloseControlTowerParams,
  UseCloseExecutiveSummaryResult,
  UseOverridePostureResult,
  SlaPerformanceTrendParams,
  UseSlaPerformanceTrendResult,
} from "./use-close-control-tower";

// Phase 9C: Close Certification Pack
export {
  useCloseCertification,
  useCloseTaskEvidence,
  useCloseCertificationPack,
} from "./use-close-certification";
export type {
  CloseCertificationParams,
  UseCloseCertificationResult,
  UseCloseTaskEvidenceResult,
  UseCloseCertificationPackResult,
} from "./use-close-certification";

export { downloadCloseCertificationPack } from "./export-close-certification";

// Phase 9B: Predictive Close Intelligence
export {
  useSlaBreachForecast,
  useCrossEntityRisk,
  useDefectDelayCorrelation,
  useRemediationForecast,
  useOverrideFailureCorrelation,
  useActionEffectiveness,
} from "./use-predictive-close";
export type {
  PredictiveCloseParams,
  CrossEntityParams,
  UseSlaBreachForecastResult,
  UseCrossEntityRiskResult,
  UseDefectDelayCorrelationResult,
  UseRemediationForecastResult,
  UseOverrideFailureCorrelationResult,
  UseActionEffectivenessResult,
} from "./use-predictive-close";

// Reporting utilities
export { cachedFetch, invalidateCache, invalidateCachePrefix, buildCacheKey } from "./reporting-cache";
export { downloadCsv } from "./export-csv";
export { downloadStatementXlsx, downloadXlsxFromRows } from "./export-xlsx";
export type { StatementExportRow } from "./export-xlsx";
export { downloadReleaseAuditPackage } from "./export-audit-package";

// Phase 10 — Autonomous Close Advisor
export {
  useAdvisorRemediation,
  useAdvisorDefectQueue,
  useAdvisorCompletionForecast,
  useAdvisorOverridePosture,
  useAdvisorEntityHeatmap,
  useAdvisorControllerAlerts,
} from "./use-close-advisor";
export type {
  AdvisorParams,
  AdvisorCrossEntityParams,
  UseAdvisorRemediationResult,
  UseAdvisorDefectQueueResult,
  UseAdvisorCompletionForecastResult,
  UseAdvisorOverridePostureResult,
  UseAdvisorEntityHeatmapResult,
  UseAdvisorControllerAlertsResult,
} from "./use-close-advisor";

// Phase 11B — Role-Aware Conversational Close Copilot
export { useCloseCopilot, QUICK_QUESTIONS } from "./use-close-copilot";
export type { CopilotParams, CopilotQuickQuestion, UseCloseCopilotResult } from "./use-close-copilot";
export { buildCopilotAnswer } from "./copilot-answer-builder";
export type { CopilotContext, CopilotAnswer } from "./copilot-answer-builder";
export { suggestCampaigns } from "./copilot-campaign-suggester";
export { parseCopilotIntent, registerEntityAliases } from "./copilot-intent-parser";
export { runSimulation, runAllSimulations, PRESET_SCENARIOS } from "./copilot-simulation-engine";
export { analyzeRootCauses } from "./copilot-root-cause-engine";
export { evaluateOrchestrationPlan } from "./copilot-orchestration-engine";
export type { OrchestrationInput } from "./copilot-orchestration-engine";

// Phase 19 — Autonomous Control Optimization
export {
  useProgramProposals,
  useEffectivenessLearning,
  useOptimizationSummary,
  useProposalActions,
} from "./use-control-optimization";
export type {
  ProgramProposalDTO,
  EffectivenessLearningDTO,
  OptimizationSummaryDTO,
  OptimizationFilters,
  UseProgramProposalsResult,
  UseEffectivenessLearningResult,
  UseOptimizationSummaryResult,
  UseProposalActionsResult,
} from "./use-control-optimization";

// Phase 20 — Governance Knowledge Graph & Control Memory
export {
  useGovernanceGraph,
  useControlMemory,
  useProposalProvenance,
  useGovernancePathways,
  useKnowledgeSummary,
} from "./use-governance-knowledge";
export type {
  GraphEdgeDTO,
  GraphNodeDTO,
  GraphDataDTO,
  ControlMemoryDTO,
  ProposalProvenanceDTO,
  GovernancePathwayDTO,
  PathwayStatsDTO,
  PathwayDataDTO,
  KnowledgeSummaryDTO,
  KnowledgeGraphFilters,
  UseGovernanceGraphResult,
  UseControlMemoryResult,
  UseProposalProvenanceResult,
  UseGovernancePathwaysResult,
  UseKnowledgeSummaryResult,
} from "./use-governance-knowledge";

// Phase 21 — Governance Copilot & Explainable Action Assistant
export {
  useGovernanceCopilot,
  GOVERNANCE_QUESTIONS,
} from "./use-governance-copilot";
export type {
  GovernanceCopilotQuestion,
  GovernanceCopilotParams,
  UseGovernanceCopilotResult,
} from "./use-governance-copilot";
export { buildGovernanceAnswer } from "./governance-answer-builder";
export type {
  GovernanceQuestionType,
  GovernanceContext,
  GovernanceAnswer,
} from "./governance-answer-builder";
