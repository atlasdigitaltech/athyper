// framework/runtime/src/services/business/engines/document-registry/index.ts
//
// Document Registry Engine — unified financial document registry.
//
// Provides cross-document query, compliance, and audit capabilities
// across all finance document types (invoices, payments, journals, etc.).

export type {
  FinancialDocument,
  FinancialDocType,
  CanonicalDocStatus,
  CounterpartyType,
  FinancialDocumentFilters,
  FinancialDocumentPosting,
  PostingBridgeStatus,
  CanonicalStatusMappingRecord,
  ApprovalRoute,
  PostingInconsistency,
  PostingInconsistencyType,
  RegistryStats,
} from "./domain/types.js";

export { mapCanonicalStatus } from "./domain/types.js";

export type { FinancialDocumentRepo } from "./persistence/financial-document-repo.js";

export type { FinancialDocumentRegistryService } from "./services/financial-document-registry-service.js";
export { DefaultFinancialDocumentRegistryService } from "./services/financial-document-registry-service.js";

export type { PolicyViolation } from "./domain/registry-guard.js";
export { DocumentRegistryGuard } from "./domain/registry-guard.js";

export {
  DocumentRegistryMetrics,
  createDocumentRegistryHealthChecker,
} from "./observability/metrics.js";

export type {
  DocTypeOnboardingContract,
  StatusMappingEntry,
  SyncTriggerContract,
  ApprovalEvidenceContract,
  PostingBridgeContract,
  ComplianceExpectations,
  TestTemplate,
} from "./domain/onboarding-contract.js";

export {
  DocTypeOnboardingRegistry,
  PURCHASE_INVOICE_CONTRACT,
} from "./domain/onboarding-contract.js";

export { CREDIT_NOTE_CONTRACT } from "./domain/credit-note-contract.js";
export { ACCRUAL_CONTRACT } from "./domain/accrual-contract.js";
export { RECLASS_CONTRACT } from "./domain/reclass-contract.js";
export { DEBIT_NOTE_CONTRACT } from "./domain/debit-note-contract.js";
export { FX_REVALUATION_CONTRACT } from "./domain/fx-revaluation-contract.js";
export { IC_ELIMINATION_CONTRACT } from "./domain/ic-elimination-contract.js";

// Close Command Center — document-registry ↔ close orchestration bridge
export type {
  CloseDocumentReadiness,
  DefectSeverity,
  CloseDocumentReadinessRecord,
  CloseDocumentSummaryRow,
  CloseDocumentSummary,
  CloseDocTypeBreakdown,
  CloseDocumentDefect,
  AccrualReversalUrgency,
  AccrualReversalGap,
  PostingGapRecord,
  DocumentRegistryCloseEvidence,
  // Phase 8B
  BookReadiness,
  CloseDocumentBookReadinessRecord,
  CloseDocumentBookSummaryRow,
  ReversalAlignment,
  ReversedStillCountedRecord,
  ApprovalGapType,
  ApprovalEvidenceGapRecord,
  AgingBucket,
  DefectAgingRecord,
} from "./domain/close-command-center.js";

export { computeCloseDocumentSummary } from "./domain/close-command-center.js";

// Phase 8C: Health Score, Reconciliation, Remediation
export type {
  HealthRating,
  DocumentHealthScore,
  PostingReconciliationFindingType,
  ReconciliationFindingSeverity,
  PostingReconciliationFinding,
  PostingReconciliationSummary,
  RemediationSourceType,
  RemediationActionType,
  RemediationStatus,
  RemediationPriority,
  RemediationAction,
  RemediationSummary,
} from "./domain/close-command-center.js";

export type {
  RemediationActionService,
  SuggestRemediationInput,
} from "./services/remediation-action-service.js";
export { DefaultRemediationActionService } from "./services/remediation-action-service.js";

// Phase 8D: Playbooks, Previews, Campaigns
export type {
  PlaybookRiskLevel,
  PlaybookStepType,
  PlaybookStep,
  PlaybookPrerequisite,
  PlaybookSideEffect,
  RemediationPlaybook,
  RemediationPreview,
  PrerequisiteCheckResult,
  PredictedSideEffect,
  CampaignStatus,
  RemediationCampaign,
} from "./domain/remediation-playbook.js";

export {
  PLAYBOOK_REGISTRY,
  getPlaybook,
  getPlaybookRiskLevel,
  requiresApproval,
} from "./domain/remediation-playbook.js";

export type {
  RemediationCampaignService,
  CreateCampaignInput,
} from "./services/remediation-campaign-service.js";
export { DefaultRemediationCampaignService } from "./services/remediation-campaign-service.js";
