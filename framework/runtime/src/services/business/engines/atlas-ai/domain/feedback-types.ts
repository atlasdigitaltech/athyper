// framework/runtime/src/services/business/engines/atlas-ai/domain/feedback-types.ts
//
// Atlas Phase 6 — Adaptive Learning domain types.
//
// Feedback tracking for anomalies and recommendations,
// false positive rate computation, and threshold calibration suggestions.
//
// Key constraints:
//   - Calibrations are SUGGESTED, never auto-applied
//   - No mutation of finance truth — only tunes detection sensitivity
//   - Reason codes use enum taxonomy (not free-text)
//   - Append-only feedback — immutable for audit

// ---------------------------------------------------------------------------
// Feedback types
// ---------------------------------------------------------------------------

export type FeedbackTarget = "ANOMALY" | "RECOMMENDATION";

export type FeedbackVerdict =
  | "CONFIRMED"           // user confirms issue is real
  | "FALSE_POSITIVE"      // user marks anomaly as false positive
  | "ACCEPTED"            // user accepts recommendation
  | "DISMISSED"           // user dismisses recommendation
  | "DEFERRED";           // user defers action

export type FeedbackReasonCode =
  | "SEASONAL_PATTERN"
  | "ONE_TIME_EVENT"
  | "KNOWN_ADJUSTMENT"
  | "DATA_QUALITY"
  | "THRESHOLD_TOO_SENSITIVE"
  | "THRESHOLD_TOO_LOOSE"
  | "NOT_ACTIONABLE"
  | "ALREADY_ADDRESSED"
  | "INCORRECT_OWNER"
  | "IMMATERIAL"
  | "OTHER";

export interface AtlasFeedback {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  feedbackTarget: FeedbackTarget;
  targetId: string;
  anomalyType: string | null;
  anomalySeverity: string | null;
  accountCode: string | null;
  verdict: FeedbackVerdict;
  reasonCode: FeedbackReasonCode | null;
  reasonDetail: string | null;
  outcomeVerified: boolean | null;
  outcomeNotes: string | null;
  evidenceSnapshot: Record<string, unknown>;
  submittedBy: string;
  submittedAt: string;
}

export interface SubmitFeedbackInput {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  feedbackTarget: FeedbackTarget;
  targetId: string;
  anomalyType?: string;
  anomalySeverity?: string;
  accountCode?: string;
  verdict: FeedbackVerdict;
  reasonCode?: FeedbackReasonCode;
  reasonDetail?: string;
  evidenceSnapshot?: Record<string, unknown>;
  submittedBy: string;
}

// ---------------------------------------------------------------------------
// Threshold calibration types
// ---------------------------------------------------------------------------

export type CalibrationStatus = "SUGGESTED" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type CalibrationSource = "FEEDBACK" | "MANUAL" | "BASELINE_DRIFT";

export interface ThresholdCalibration {
  id: string;
  tenantId: string;
  entityCode: string;
  accountCode: string | null;
  anomalyType: string;
  warningZThreshold: string;
  criticalZThreshold: string;
  status: CalibrationStatus;
  source: CalibrationSource;
  falsePositiveRate: string | null;
  sampleSize: number | null;
  confidence: string | null;
  suggestedAt: string;
  suggestedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
}

// ---------------------------------------------------------------------------
// False positive rate analysis
// ---------------------------------------------------------------------------

export interface FalsePositiveRate {
  entityCode: string;
  anomalyType: string;
  accountCode: string | null;
  totalFeedback: number;
  falsePositiveCount: number;
  confirmedCount: number;
  falsePositivePct: string;
  topFpReason: FeedbackReasonCode | null;
  latestFeedbackAt: string;
}

// ---------------------------------------------------------------------------
// Calibration suggestion (computed, not persisted until approved)
// ---------------------------------------------------------------------------

export interface CalibrationSuggestion {
  anomalyType: string;
  accountCode: string | null;
  currentWarningThreshold: string;
  currentCriticalThreshold: string;
  suggestedWarningThreshold: string;
  suggestedCriticalThreshold: string;
  falsePositiveRate: string;
  sampleSize: number;
  confidence: string;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Effectiveness metrics (computed from feedback)
// ---------------------------------------------------------------------------

export interface FeedbackEffectiveness {
  anomalyEffectiveness: {
    totalFeedback: number;
    confirmedCount: number;
    falsePositiveCount: number;
    confirmedRate: string;
    falsePositiveRate: string;
    byType: Record<string, { confirmed: number; falsePositive: number; total: number }>;
  };
  recommendationEffectiveness: {
    totalFeedback: number;
    acceptedCount: number;
    dismissedCount: number;
    deferredCount: number;
    acceptanceRate: string;
    byType: Record<string, { accepted: number; dismissed: number; total: number }>;
  };
  calibrationSuggestions: CalibrationSuggestion[];
}

// ---------------------------------------------------------------------------
// Compute input / result
// ---------------------------------------------------------------------------

export interface FeedbackComputeInput {
  tenantId: string;
  entityCode: string;
  /** If provided, only compute for this period; otherwise compute across all periods */
  fiscalYear?: number;
  periodNumber?: number;
}

export interface FeedbackComputeResult {
  effectiveness: FeedbackEffectiveness;
  activeCalibrations: ThresholdCalibration[];
  computedAt: string;
}
