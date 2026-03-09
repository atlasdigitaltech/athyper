// framework/runtime/src/services/business/engines/document-registry/domain/close-command-center.ts
//
// Close Command Center domain types — bridges the document registry
// with close orchestration to provide document-aware close readiness.
//
// These types are consumed by:
//   - DocumentRegistryCloseHandler (system close handler)
//   - document_defect_detected risk rule evaluator
//   - Close Command Center UI components

import type { FinancialDocType, CanonicalDocStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Close Readiness Classification — per-document
// ---------------------------------------------------------------------------

export type CloseDocumentReadiness =
  | "READY"
  | "DEFECT_FAILED"
  | "DEFECT_APPROVED_NOT_POSTED"
  | "DEFECT_UNFINALIZED"
  | "DEFECT_POSTING_PENDING"
  | "UNKNOWN";

export type DefectSeverity = "HIGH" | "MEDIUM" | "LOW";

// ---------------------------------------------------------------------------
// Per-document readiness record (row from v_close_document_readiness)
// ---------------------------------------------------------------------------

export interface CloseDocumentReadinessRecord {
  docRegistryId: string;
  tenantId: string;
  entityCode: string;
  docId: string;
  txnId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  sourceStatus: string;
  postingDate: Date | null;
  totalAmount: string; // MC-4
  currencyCode: string;
  jeId: string | null;
  fiscalYear: number;
  periodNumber: number;
  closeReadiness: CloseDocumentReadiness;
  defectSeverity: DefectSeverity | null;
}

// ---------------------------------------------------------------------------
// Aggregate summary (row from v_close_document_summary)
// ---------------------------------------------------------------------------

export interface CloseDocumentSummaryRow {
  docType: FinancialDocType;
  closeReadiness: CloseDocumentReadiness;
  docCount: number;
  totalAmount: string; // MC-4
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
}

// ---------------------------------------------------------------------------
// Full Close Document Summary — computed from summary rows
// ---------------------------------------------------------------------------

export interface CloseDocumentSummary {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;

  /** Total documents in the period */
  totalDocuments: number;
  /** Documents ready for close */
  readyDocuments: number;
  /** Documents with defects blocking close */
  defectDocuments: number;

  /** Readiness percentage (0-100) */
  readinessPercent: number;

  /** Breakdown by document type */
  byDocType: CloseDocTypeBreakdown[];

  /** High-severity defects count */
  highSeverityDefects: number;
  /** Medium-severity defects count */
  mediumSeverityDefects: number;
  /** Low-severity defects count */
  lowSeverityDefects: number;

  /** Total amount in defect documents (MC-4) */
  defectTotalAmount: string;

  /** Whether all documents are close-ready */
  allReady: boolean;
}

export interface CloseDocTypeBreakdown {
  docType: FinancialDocType;
  totalCount: number;
  readyCount: number;
  defectCount: number;
  readinessPercent: number;
  defects: {
    failed: number;
    approvedNotPosted: number;
    unfinalized: number;
    postingPending: number;
  };
}

// ---------------------------------------------------------------------------
// Defect record (row from v_close_document_defects)
// ---------------------------------------------------------------------------

export interface CloseDocumentDefect {
  docRegistryId: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  sourceStatus: string;
  postingDate: Date | null;
  totalAmount: string; // MC-4
  currencyCode: string;
  defectType: CloseDocumentReadiness;
  defectSeverity: DefectSeverity;
}

// ---------------------------------------------------------------------------
// Accrual reversal gap (row from v_close_accrual_reversal_gap)
// ---------------------------------------------------------------------------

export type AccrualReversalUrgency = "REVERSAL_DUE_THIS_PERIOD" | "REVERSAL_DUE_FUTURE";

export interface AccrualReversalGap {
  accrualId: string;
  tenantId: string;
  entityCode: string;
  docNo: string;
  postingDate: Date;
  totalAmount: string; // MC-4
  currencyCode: string;
  reversalDate: Date;
  status: string;
  fiscalYear: number;
  periodNumber: number;
  reversalUrgency: AccrualReversalUrgency;
}

// ---------------------------------------------------------------------------
// Posting gap (row from v_close_posting_gap)
// ---------------------------------------------------------------------------

export interface PostingGapRecord {
  docRegistryId: string;
  tenantId: string;
  entityCode: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  sourceStatus: string;
  postingDate: Date | null;
  totalAmount: string; // MC-4
  currencyCode: string;
  approvalRoute: string | null;
  approvalInstanceId: string | null;
  fiscalYear: number;
  periodNumber: number;
  hoursSinceUpdate: number;
}

// ---------------------------------------------------------------------------
// Book-level posting readiness (row from v_close_document_book_readiness)
// ---------------------------------------------------------------------------

export type BookReadiness =
  | "READY"
  | "DEFECT_BOOK_POSTING_FAILED"
  | "DEFECT_BOOK_MISSING";

export interface CloseDocumentBookReadinessRecord {
  docRegistryId: string;
  tenantId: string;
  entityCode: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  postingDate: Date | null;
  totalAmount: string; // MC-4
  currencyCode: string;
  fiscalYear: number;
  periodNumber: number;
  bookCode: string;
  postingStatus: string | null;
  bookJeId: string | null;
  bookPostedAt: Date | null;
  bookReadiness: BookReadiness | null;
}

export interface CloseDocumentBookSummaryRow {
  bookCode: string;
  docType: FinancialDocType;
  docCount: number;
  readyCount: number;
  failedCount: number;
  missingCount: number;
}

// ---------------------------------------------------------------------------
// Reversed document alignment (row from v_close_reversed_still_counted)
// ---------------------------------------------------------------------------

export type ReversalAlignment =
  | "REVERSAL_MISSING"
  | "REVERSAL_DIFFERENT_PERIOD"
  | "REVERSAL_SAME_PERIOD";

export interface ReversedStillCountedRecord {
  docRegistryId: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  totalAmount: string; // MC-4
  currencyCode: string;
  postingDate: Date | null;
  reversedDocId: string;
  fiscalYear: number;
  periodNumber: number;
  reversalAlignment: ReversalAlignment;
}

// ---------------------------------------------------------------------------
// Approval evidence gap (row from v_close_approval_evidence_gap)
// ---------------------------------------------------------------------------

export type ApprovalGapType = "NO_APPROVAL_EVIDENCE" | "NO_DECISION_SCORE" | "PARTIAL";

export interface ApprovalEvidenceGapRecord {
  docRegistryId: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  postingDate: Date | null;
  totalAmount: string; // MC-4
  currencyCode: string;
  approvalRoute: string | null;
  approvalInstanceId: string | null;
  decisionScore: string | null;
  fiscalYear: number;
  periodNumber: number;
  gapType: ApprovalGapType;
}

// ---------------------------------------------------------------------------
// Defect aging (row from v_close_defect_aging)
// ---------------------------------------------------------------------------

export type AgingBucket = "CRITICAL" | "OVERDUE" | "AGING" | "RECENT";

export interface DefectAgingRecord {
  docRegistryId: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  defectType: CloseDocumentReadiness;
  defectSeverity: DefectSeverity;
  totalAmount: string; // MC-4
  currencyCode: string;
  hoursInDefect: number;
  agingBucket: AgingBucket;
  defectSince: Date;
}

// ---------------------------------------------------------------------------
// Document Health Score — composite 0-100 KPI (Phase 8C)
// ---------------------------------------------------------------------------

export type HealthRating = "GREEN" | "AMBER" | "RED" | "NOT_APPLICABLE";

export interface DocumentHealthScore {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;

  totalDocuments: number;
  readyDocuments: number;
  highDefects: number;
  mediumDefects: number;
  lowDefects: number;

  /** Individual penalty components (for explainability) */
  readinessPenalty: number;
  severityPenalty: number;
  agingPenalty: number;
  reconPenalty: number;
  approvalPenalty: number;

  /** Final composite score 0-100 */
  healthScore: number;
  /** Traffic-light classification: GREEN>=90, AMBER>=70, RED<70 */
  healthRating: HealthRating;
}

// ---------------------------------------------------------------------------
// Posting Reconciliation — cross-validation findings (Phase 8C)
// ---------------------------------------------------------------------------

export type PostingReconciliationFindingType =
  | "POSTED_NO_JE"
  | "JE_REVERSED_DOC_NOT"
  | "AMOUNT_MISMATCH"
  | "INCOMPLETE_MULTIBOOK";

export type ReconciliationFindingSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface PostingReconciliationFinding {
  docRegistryId: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  docAmount: string; // MC-4
  currencyCode: string;
  findingType: PostingReconciliationFindingType;
  findingSeverity: ReconciliationFindingSeverity;
  findingDetail: string;
  postingDate: Date | null;
}

export interface PostingReconciliationSummary {
  totalFindings: number;
  highFindings: number;
  mediumFindings: number;
  postedNoJeCount: number;
  jeReversedDocNotCount: number;
  amountMismatchCount: number;
  incompleteMultibookCount: number;
}

// ---------------------------------------------------------------------------
// Remediation Action — tracked fix workflow (Phase 8C)
// ---------------------------------------------------------------------------

export type RemediationSourceType =
  | "CLOSE_HANDLER"
  | "RECONCILIATION"
  | "RISK_SIGNAL"
  | "MANUAL";

export type RemediationActionType =
  | "REPOST_DOCUMENT"
  | "GENERATE_REVERSAL_JE"
  | "POST_TO_BOOK"
  | "REQUEST_REAPPROVAL"
  | "FILL_APPROVAL_EVIDENCE"
  | "MARK_VOID"
  | "WAIVE_DEFECT"
  | "MANUAL_CORRECTION";

export type RemediationStatus =
  | "SUGGESTED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export type RemediationPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface RemediationAction {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;

  sourceType: RemediationSourceType;
  sourceRef: string | null;

  docRegistryId: string | null;
  docId: string | null;
  docType: FinancialDocType | null;
  docNo: string | null;

  actionType: RemediationActionType;
  actionDetail: Record<string, unknown>;
  priority: RemediationPriority;

  status: RemediationStatus;

  suggestedBy: string | null;
  suggestedAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;

  executedBy: string | null;
  executedAt: Date | null;
  executionResult: Record<string, unknown> | null;
  failureReason: string | null;
}

export interface RemediationSummary {
  totalActions: number;
  suggestedCount: number;
  approvedCount: number;
  executingCount: number;
  completedCount: number;
  rejectedCount: number;
  failedCount: number;
  criticalCount: number;
  highCount: number;
}

// ---------------------------------------------------------------------------
// Close handler evidence — structured payload for CloseHandlerResult.evidence
// ---------------------------------------------------------------------------

export interface DocumentRegistryCloseEvidence {
  totalDocuments: number;
  readyDocuments: number;
  defectDocuments: number;
  readinessPercent: number;
  highSeverityDefects: number;
  defectsByType: Array<{
    docType: FinancialDocType;
    defectType: CloseDocumentReadiness;
    count: number;
    totalAmount: string;
  }>;
  accrualReversalGaps: number;
  postingGaps: number;
  bookPostingGaps: number;
  reversedMisaligned: number;
  approvalEvidenceGaps: number;
}

// ---------------------------------------------------------------------------
// Helper: compute summary from raw summary rows
// ---------------------------------------------------------------------------

export function computeCloseDocumentSummary(
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
  rows: CloseDocumentSummaryRow[],
): CloseDocumentSummary {
  let totalDocuments = 0;
  let readyDocuments = 0;
  let defectDocuments = 0;
  let highSeverityDefects = 0;
  let mediumSeverityDefects = 0;
  let lowSeverityDefects = 0;

  // Group by doc type
  const byTypeMap = new Map<FinancialDocType, CloseDocTypeBreakdown>();

  for (const row of rows) {
    totalDocuments += row.docCount;

    if (row.closeReadiness === "READY") {
      readyDocuments += row.docCount;
    } else {
      defectDocuments += row.docCount;
    }

    highSeverityDefects += row.highSeverityCount;
    mediumSeverityDefects += row.mediumSeverityCount;
    lowSeverityDefects += row.lowSeverityCount;

    if (!byTypeMap.has(row.docType)) {
      byTypeMap.set(row.docType, {
        docType: row.docType,
        totalCount: 0,
        readyCount: 0,
        defectCount: 0,
        readinessPercent: 0,
        defects: { failed: 0, approvedNotPosted: 0, unfinalized: 0, postingPending: 0 },
      });
    }

    const entry = byTypeMap.get(row.docType)!;
    entry.totalCount += row.docCount;

    if (row.closeReadiness === "READY") {
      entry.readyCount += row.docCount;
    } else {
      entry.defectCount += row.docCount;
      switch (row.closeReadiness) {
        case "DEFECT_FAILED":
          entry.defects.failed += row.docCount;
          break;
        case "DEFECT_APPROVED_NOT_POSTED":
          entry.defects.approvedNotPosted += row.docCount;
          break;
        case "DEFECT_UNFINALIZED":
          entry.defects.unfinalized += row.docCount;
          break;
        case "DEFECT_POSTING_PENDING":
          entry.defects.postingPending += row.docCount;
          break;
      }
    }
  }

  // Compute percentages
  for (const entry of byTypeMap.values()) {
    entry.readinessPercent =
      entry.totalCount > 0
        ? Math.round((entry.readyCount / entry.totalCount) * 100)
        : 100;
  }

  const readinessPercent =
    totalDocuments > 0
      ? Math.round((readyDocuments / totalDocuments) * 100)
      : 100;

  return {
    entityCode,
    fiscalYear,
    periodNumber,
    totalDocuments,
    readyDocuments,
    defectDocuments,
    readinessPercent,
    byDocType: Array.from(byTypeMap.values()),
    highSeverityDefects,
    mediumSeverityDefects,
    lowSeverityDefects,
    defectTotalAmount: "0", // Caller should sum from rows if needed
    allReady: defectDocuments === 0,
  };
}
