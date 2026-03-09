// lib/finance/release-types.ts
//
// Frontend DTOs for the Governed Release Orchestration layer (207-208).
// MC-4 compliant: all monetary values are string (never float).

// ---------------------------------------------------------------------------
// Pack Release (207 — fin.pack_release)
// ---------------------------------------------------------------------------

export type ReleaseStatus =
  | "ASSEMBLING"
  | "READY"
  | "RELEASED"
  | "SUPERSEDED"
  | "CANCELLED";

export type ReleaseType =
  | "MANAGEMENT_PACK"
  | "BOARD_PACK"
  | "REGULATORY"
  | "AD_HOC"
  | "INTERIM";

export interface PackReleaseDTO {
  id: string;
  entityCode: string;
  releaseCode: string;
  releaseName: string;
  description: string | null;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  releaseType: ReleaseType;

  // Component references
  packInstanceId: string | null;
  publicationBatchId: string | null;
  certificationId: string | null;
  closeRunId: string | null;
  readinessSnapshotId: string | null;

  // Lifecycle
  status: ReleaseStatus;
  assembledAt: string | null;
  readyAt: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  supersededAt: string | null;
  supersessionReason: string | null;
  supersedesId: string | null;

  // Governance posture
  isCleanClose: boolean | null;
  overrideCount: number;
  overrideImpactTotal: string | null;
  readinessScore: string | null;
  periodStatusAtRelease: string | null;

  // Exception governance
  requiresExceptionSignoff: boolean;
  exceptionSignoffBy: string | null;
  exceptionSignoffAt: string | null;
  exceptionSignoffNotes: string | null;

  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Release Dashboard View (207 — fin.vw_pack_release_dashboard)
// ---------------------------------------------------------------------------

export interface ReleaseDashboardDTO {
  releaseCode: string;
  releaseName: string;
  releaseType: ReleaseType;
  entityCode: string;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  status: ReleaseStatus;
  isCleanClose: boolean | null;
  overrideCount: number;
  overrideImpactTotal: string | null;
  readinessScore: string | null;
  requiresExceptionSignoff: boolean;
  hasExceptionSignoff: boolean;

  // Component status summary
  packStatus: string | null;
  batchStatus: PublicationBatchStatus | null;
  certificationStatus: string | null;
  manifestItemCount: number | null;
  hasManifestHash: boolean;

  // Distribution summary
  distributionCount: number;
  distributionsSent: number;

  // Timeline
  createdAt: string;
  assembledAt: string | null;
  readyAt: string | null;
  releasedAt: string | null;
  releaseDurationHours: number | null;
}

// ---------------------------------------------------------------------------
// Publication Batch (205 — fin.publication_batch)
// ---------------------------------------------------------------------------

export type PublicationBatchStatus =
  | "DRAFT"
  | "FINALIZED"
  | "PUBLISHED"
  | "SUPERSEDED";

export type PublicationBatchType = "KPI" | "PLANNING" | "MIXED";

export interface PublicationBatchDTO {
  id: string;
  entityCode: string;
  batchCode: string;
  description: string | null;
  fiscalYear: number;
  periodNumber: number;
  bookCode: string;
  batchType: PublicationBatchType;
  packInstanceId: string | null;
  status: PublicationBatchStatus;
  kpiItemCount: number;
  planningItemCount: number;
  manifestItemCount: number;
  manifestHash: string | null;
  finalizedBy: string | null;
  finalizedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  supersedesId: string | null;
  createdAt: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Publication Manifest Item (206 — fin.publication_manifest_item)
// ---------------------------------------------------------------------------

export type ManifestArtifactType =
  | "KPI_EXECUTION"
  | "PLANNING_OUTPUT"
  | "STATEMENT_INSTANCE";

export interface PublicationManifestItemDTO {
  id: string;
  publicationBatchId: string;
  artifactType: ManifestArtifactType;
  artifactId: string;
  definitionCode: string | null;
  definitionVersion: number | null;
  fiscalYear: number;
  periodNumber: number;
  bookCode: string;
  publishedValue: string | null;
  publishedCurrency: string | null;
  dimensionSetId: string | null;
  artifactHash: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Close Override (204 — fin.close_override + 205 enrichment)
// ---------------------------------------------------------------------------

export type OverrideScope = "TASK" | "CATEGORY" | "GATE";

export type OverrideReasonCode =
  | "IMMATERIAL"
  | "TIMING"
  | "EXTERNAL_DELAY"
  | "SYSTEM_ISSUE"
  | "PROCESS_GAP"
  | "MANAGEMENT_JUDGEMENT"
  | "REGULATORY"
  | "OTHER";

export type OverrideReasonSubcode =
  | "BELOW_THRESHOLD"
  | "SELF_CORRECTING"
  | "CUTOFF_ADJUSTMENT"
  | "VENDOR_DELAY"
  | "DATA_FEED_DELAY"
  | "AUDIT_REQUEST"
  | null;

export type OverrideStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED";

export type OverrideTransitionTarget =
  | "SOFT_CLOSE"
  | "HARD_CLOSE"
  | "BOTH"
  | null;

export interface CloseOverrideDTO {
  id: string;
  entityCode: string;
  overrideScope: OverrideScope;
  runId: string;
  taskId: string | null;
  checklistId: string | null;
  taskCategory: string | null;
  reasonCode: OverrideReasonCode;
  reasonSubcode: OverrideReasonSubcode;
  reasonDetail: string | null;
  appliesToTransition: OverrideTransitionTarget;
  effectiveFrom: string;
  effectiveTo: string | null;
  impactAmount: string | null;
  impactCurrency: string | null;
  status: OverrideStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  evidencePayload: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Release Decision Log (208 — fin.release_decision_log)
// ---------------------------------------------------------------------------

export type ReleaseCommand =
  | "ASSEMBLE"
  | "MARK_READY"
  | "RELEASE"
  | "CANCEL"
  | "SUPERSEDE"
  | "EXCEPTION_SIGNOFF"
  | "INTEGRITY_CHECK";

export type DecisionResult = "APPROVED" | "BLOCKED" | "DEFERRED";

export interface ReleaseDecisionLogDTO {
  id: string;
  entityCode: string;
  releaseId: string;
  command: ReleaseCommand;
  actorId: string | null;
  policyEvaluation: Record<string, unknown>;
  result: DecisionResult;
  correlationId: string | null;
  publicationBatchId: string | null;
  certificationId: string | null;
  distributionId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Release Notification Event (208 — fin.release_notification_event)
// ---------------------------------------------------------------------------

export type ReleaseEventCode =
  | "RELEASE_READY"
  | "RELEASE_COMPLETED"
  | "RELEASE_SUPERSEDED"
  | "RELEASE_CANCELLED"
  | "EXCEPTION_SIGNOFF_REQUIRED"
  | "EXCEPTION_SIGNOFF_GRANTED"
  | "INTEGRITY_VERIFICATION_FAILED"
  | "CLEAN_CLOSE_FAILED"
  | "CERTIFICATION_INVALIDATED"
  | "DISTRIBUTION_RECALLED"
  | "BATCH_SUPERSEDED";

export type NotificationSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export interface ReleaseNotificationEventDTO {
  id: string;
  entityCode: string;
  releaseId: string | null;
  eventCode: ReleaseEventCode;
  severity: NotificationSeverity;
  summary: string;
  detailPayload: Record<string, unknown>;
  processed: boolean;
  processedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Release SLA Snapshot (208 — fin.release_sla_snapshot)
// ---------------------------------------------------------------------------

export interface ReleaseSLASnapshotDTO {
  id: string;
  entityCode: string;
  releaseId: string;
  fiscalYear: number;
  periodNumber: number;
  closeStartDate: string | null;
  closeHardCloseTarget: string | null;
  closeHardCloseActual: string | null;
  closeDurationHours: string | null;
  assemblyDurationHours: string | null;
  certificationWaitHours: string | null;
  exceptionSignoffWaitHours: string | null;
  releaseToDistributionHours: string | null;
  totalPipelineHours: string | null;
  closeSlaMet: boolean | null;
  releaseType: ReleaseType | null;
  overrideCount: number;
  isCleanClose: boolean | null;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Audit Chain View (207 — fin.vw_pack_audit_chain)
// ---------------------------------------------------------------------------

export interface PackAuditChainDTO {
  entityCode: string;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  releaseCode: string | null;
  releaseStatus: ReleaseStatus | null;
  releasedAt: string | null;
  isCleanClose: boolean | null;
  packInstanceId: string | null;
  packStatus: string | null;
  batchCode: string | null;
  batchStatus: PublicationBatchStatus | null;
  manifestItemCount: number | null;
  manifestHash: string | null;
  certificationStatus: string | null;
  certifiedAt: string | null;
  distributionCount: number;
}

// ---------------------------------------------------------------------------
// Release Command Inputs
// ---------------------------------------------------------------------------

export interface AssembleReleaseInput {
  entityCode: string;
  releaseCode: string;
  releaseName: string;
  releaseType?: ReleaseType;
  fiscalYear?: number;
  periodFrom?: number;
  periodTo?: number;
  bookCode?: string;
  packInstanceId?: string;
  publicationBatchId?: string;
  certificationId?: string;
  closeRunId?: string;
}

export interface MarkReadyInput {
  releaseId: string;
}

export interface ReleasePackInput {
  releaseId: string;
}

export interface CancelReleaseInput {
  releaseId: string;
  reason?: string;
}

export interface SupersedeReleaseInput {
  releaseId: string;
  correctionReleaseCode: string;
  correctionReleaseName: string;
  supersessionReason: string;
}

export interface ExceptionSignoffInput {
  releaseId: string;
  notes: string;
}

export interface VerifyIntegrityInput {
  releaseId: string;
}

// ---------------------------------------------------------------------------
// Integrity Verification Result (from fin.verify_release_integrity)
// ---------------------------------------------------------------------------

export interface IntegrityCheckResult {
  releaseId: string;
  overallPass: boolean;
  checks: IntegrityCheck[];
  checkedAt: string;
}

export interface IntegrityCheck {
  checkName: string;
  passed: boolean;
  expected: string | null;
  actual: string | null;
  detail: string | null;
}

// ---------------------------------------------------------------------------
// Clean Close Evaluation (from fin.evaluate_clean_close)
// ---------------------------------------------------------------------------

export interface CleanCloseEvaluation {
  isCleanClose: boolean;
  overrideCount: number;
  overrideImpactTotal: string;
  readinessScore: string;
  maxOverridesAllowed: number;
  minReadinessRequired: string;
  maxImpactAllowed: string;
  requiresExceptionSignoff: boolean;
  failureReasons: string[];
}

// ---------------------------------------------------------------------------
// Release Command Result (unified response from command endpoints)
// ---------------------------------------------------------------------------

export interface PolicyBlocker {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface ReleaseStatusSnapshot {
  status: ReleaseStatus;
  isCleanClose: boolean | null;
  overrideCount: number;
  readinessScore: string | null;
  requiresExceptionSignoff: boolean;
  hasExceptionSignoff: boolean;
  packStatus: string | null;
  batchStatus: string | null;
  certificationStatus: string | null;
  distributionCount: number;
}

export interface ReleaseCommandResult {
  ok: boolean;
  releaseId: string;
  status: ReleaseStatus;
  message: string;
  command: ReleaseCommand;
  // Policy echo — always returned
  blockers: PolicyBlocker[];
  warnings: PolicyBlocker[];
  // Status snapshot after command execution
  snapshot?: ReleaseStatusSnapshot;
  // Command-specific payloads
  integrity?: IntegrityCheckResult;
  cleanClose?: CleanCloseEvaluation;
  // Supersession-specific
  supersededReleaseId?: string;
  newReleaseId?: string;
}

// ---------------------------------------------------------------------------
// Preflight Summary (for destructive action confirmation)
// ---------------------------------------------------------------------------

export interface PreflightSummary {
  releaseId: string;
  releaseCode: string;
  releaseName: string;
  status: ReleaseStatus;
  impactedCertifications: number;
  impactedDistributions: number;
  distributionRecipientCount: number;
  overrideCount: number;
  overrideImpactTotal: string | null;
  isCleanClose: boolean | null;
  integrityLastChecked: string | null;
  integrityPassed: boolean | null;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Release Timeline Event (unified chronological view)
// ---------------------------------------------------------------------------

export type TimelineEventSource =
  | "lifecycle"
  | "decision"
  | "notification"
  | "override"
  | "signoff";

export interface ReleaseTimelineEventDTO {
  id: string;
  timestamp: string;
  source: TimelineEventSource;
  title: string;
  detail: string | null;
  severity: NotificationSeverity;
  // Source-specific identifiers
  command?: ReleaseCommand;
  decisionResult?: DecisionResult;
  eventCode?: ReleaseEventCode;
  overrideReasonCode?: string;
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Release KPIs (dashboard-level aggregates)
// ---------------------------------------------------------------------------

export interface ReleaseKPIs {
  inProgress: number;
  policyBlocked: number;
  awaitingExceptionSignoff: number;
  supersededCount: number;
  releasedCount: number;
  avgReleaseHours: number | null;
  integrityFailures: number;
  refreshedAt: string | null;
}

// ---------------------------------------------------------------------------
// Audit Package (bundled export)
// ---------------------------------------------------------------------------

export interface ReleaseAuditPackage {
  exportedAt: string;
  release: PackReleaseDTO | null;
  decisions: ReleaseDecisionLogDTO[];
  overrides: CloseOverrideDTO[];
  manifestItems: PublicationManifestItemDTO[];
  notifications: ReleaseNotificationEventDTO[];
  sla: ReleaseSLASnapshotDTO | null;
  timeline: ReleaseTimelineEventDTO[];
  integrity: {
    valid: boolean;
    checks: IntegrityCheck[];
    checkedAt: string | null;
  } | null;
  // Governed export metadata
  exportId: string | null;
  contentHash: string | null;
}

// ---------------------------------------------------------------------------
// Export History (governed audit trail from fin.release_export_log)
// ---------------------------------------------------------------------------

export interface ReleaseExportLogDTO {
  id: string;
  exportedBy: string | null;
  exportedAt: string | null;
  exportFormat: string;
  contentHash: string;
  hashAlgorithm: string;
  includedSections: string[];
  releaseStatusAtExport: ReleaseStatus;
  isCleanCloseAtExport: boolean | null;
  overrideCountAtExport: number;
  integrityValidAtExport: boolean | null;
  exportVersion: number;
}

// ---------------------------------------------------------------------------
// Actionable Notification (notification event with suggested action)
// ---------------------------------------------------------------------------

export interface ActionableNotification {
  eventCode: ReleaseEventCode;
  severity: NotificationSeverity;
  summary: string;
  suggestedAction: ReleaseCommand | null;
  actionLabel: string | null;
}
