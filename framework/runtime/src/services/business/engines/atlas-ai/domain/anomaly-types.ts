// framework/runtime/src/services/business/engines/atlas-ai/domain/anomaly-types.ts
//
// Atlas AI Phase 1 — Anomaly Detection domain types.

// --- Anomaly Types ---

export type AnomalyType =
  | "UNUSUAL_ADJUSTMENT"
  | "RECON_VARIANCE"
  | "EXCEPTION_PATTERN"
  | "AMOUNT_OUTLIER"
  | "TIMING_ANOMALY"
  | "MISSING_RECURRENCE"
  | "PERIOD_END_SPIKE"
  | "MANUAL_JOURNAL_RATIO"
  | "LATE_CLOSE_TASK"
  | "OVERRIDE_SPIKE"
  | "LARGE_ADJUSTMENT";

export type AnomalySeverity = "INFO" | "WARNING" | "CRITICAL";

export type AnomalyStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";

export const ANOMALY_TRANSITIONS: Record<AnomalyStatus, AnomalyStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"],
  ACKNOWLEDGED: ["RESOLVED", "FALSE_POSITIVE"],
  RESOLVED: [],
  FALSE_POSITIVE: [],
};

// --- Baseline Types ---

export type BaselineMetricType =
  | "PERIOD_DEBIT"
  | "PERIOD_CREDIT"
  | "NET_MOVEMENT"
  | "ADJUSTMENT_COUNT"
  | "POSTING_DAY_OF_MONTH"
  | "RECON_VARIANCE"
  | "LAST_3_DAYS_VOLUME"
  | "MANUAL_ENTRY_RATIO"
  | "CLOSE_TASK_DURATION"
  | "WAIVER_COUNT"
  | "MAX_ADJUSTMENT_AMOUNT";

export interface AnomalyBaseline {
  id: string;
  tenantId: string;
  entityCode: string;
  accountId: string;
  metricType: BaselineMetricType;
  baselineMean: string;    // MC-4: monetary as string
  baselineStddev: string;
  sampleCount: number;
  windowPeriods: number;
  fiscalYearFrom: number;
  periodFrom: number;
  fiscalYearTo: number;
  periodTo: number;
  bookCode: string;
  currencyCode: string;
  computedAt: Date;
  expiresAt: Date | null;
}

// --- Anomaly Types ---

export interface AtlasAnomaly {
  id: string;
  tenantId: string;
  entityCode: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  accountId: string | null;
  fiscalYear: number;
  periodNumber: number;
  bookCode: string;
  observedValue: string | null;   // MC-4: monetary as string
  expectedValue: string | null;
  zScore: string | null;
  baselineId: string | null;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  riskSignalId: string | null;
  status: AnomalyStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// --- Detection Config ---

/** Parameters for atlas_anomaly risk rules */
export interface AtlasAnomalyRuleParams {
  /** Minimum z-score to fire (default: 2.5) */
  z_score_threshold?: number;
  /** Minimum anomaly severity to escalate to risk signal */
  min_severity?: AnomalySeverity;
  /** Anomaly types to evaluate (empty = all) */
  anomaly_types?: AnomalyType[];
}

/** Default thresholds */
export const DEFAULT_Z_SCORE_THRESHOLD = 2.5;
export const CRITICAL_Z_SCORE_THRESHOLD = 3.0;

/** Severity assignment based on z-score */
export function computeAnomalySeverity(zScore: number): AnomalySeverity {
  if (Math.abs(zScore) >= CRITICAL_Z_SCORE_THRESHOLD) return "CRITICAL";
  if (Math.abs(zScore) >= DEFAULT_Z_SCORE_THRESHOLD) return "WARNING";
  return "INFO";
}

// --- Detector Input/Output ---

export interface AnomalyDetectionInput {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  bookCode?: string;
}

export interface AnomalyDetectionResult {
  detected: number;
  created: number;
  escalated: number;
  anomalies: Array<{
    anomalyType: AnomalyType;
    severity: AnomalySeverity;
    accountId: string | null;
    title: string;
    zScore: string | null;
  }>;
}

export interface BaselineComputeInput {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  bookCode?: string;
  windowPeriods?: number;
}

export interface BaselineComputeResult {
  computed: number;
  updated: number;
  accounts: number;
}
