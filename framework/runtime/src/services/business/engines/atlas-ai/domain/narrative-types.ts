// framework/runtime/src/services/business/engines/atlas-ai/domain/narrative-types.ts
//
// Atlas AI Phase 3A — Template-based Narrative Generation domain types.
//
// Narratives are deterministic text summaries produced from structured
// Atlas data (anomalies, predictions, close progress, risk signals).
// No LLM dependency — pure template interpolation.

// ---------------------------------------------------------------------------
// Narrative types
// ---------------------------------------------------------------------------

export type NarrativeType =
  | "DASHBOARD_SUMMARY"      // one-paragraph period health overview
  | "RELEASE_SUMMARY"        // release readiness explanation with blockers
  | "ANOMALY_EXPLANATION"    // per-anomaly human-readable explanation
  | "CFO_BRIEF";             // executive digest: 3-5 bullet points

// ---------------------------------------------------------------------------
// Narrative input — structured data consumed by the template engine
// ---------------------------------------------------------------------------

/** Anomaly summary counts (from dashboard) */
export interface NarrativeAnomalySummary {
  activeCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  resolvedCount: number;
  totalCount: number;
}

/** Top anomaly for narrative context */
export interface NarrativeAnomalyItem {
  anomalyType: string;
  severity: string;
  title: string;
  accountCode: string | null;
  zScore: string | null;
  observedValue: string | null;
  expectedValue: string | null;
}

/** Close progress snapshot */
export interface NarrativeCloseProgress {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  elapsedDays: number | null;
  closeStatus: string | null;  // e.g. 'IN_PROGRESS', 'SOFT_CLOSED', 'HARD_CLOSED'
}

/** Prediction summaries (from Phase 2) */
export interface NarrativePredictions {
  closeDuration: {
    expectedCloseDays: string;
    confidencePercent: number;
    historicalAvgDays: string;
  } | null;
  releaseReadiness: {
    probability: number;
    confidencePercent: number;
    blockers: string[];
  } | null;
  reconCompletion: {
    sessionsRemaining: number;
    totalSessions: number;
    completedSessions: number;
  } | null;
}

/** Risk signal summary */
export interface NarrativeRiskSignals {
  activeCount: number;
  highCriticalCount: number;
  atlasSignalCount: number;
}

/** Reconciliation status */
export interface NarrativeReconStatus {
  totalSessions: number;
  completedSessions: number;
  isComplete: boolean;
}

/** GL consistency */
export interface NarrativeConsistency {
  balanced: boolean;
}

/** Full narrative input — everything the template engine needs */
export interface NarrativeInput {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  periodLabel: string;          // e.g. "March 2026" or "P3 FY2026"

  anomalySummary: NarrativeAnomalySummary;
  topAnomalies: NarrativeAnomalyItem[];
  riskScore: string;            // "NONE" | "LOW" | "MEDIUM" | "HIGH"

  closeProgress: NarrativeCloseProgress;
  predictions: NarrativePredictions;
  riskSignals: NarrativeRiskSignals;
  reconStatus: NarrativeReconStatus;
  consistency: NarrativeConsistency;
}

/** Per-anomaly explanation input */
export interface AnomalyExplanationInput {
  anomalyType: string;
  severity: string;
  title: string;
  accountCode: string | null;
  accountName: string | null;
  zScore: string | null;
  observedValue: string | null;
  expectedValue: string | null;
  baselineMean: string | null;
  baselineStddev: string | null;
  sampleCount: number | null;
  evidence: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Narrative output
// ---------------------------------------------------------------------------

/** Provider that produced the narrative text */
export type NarrativeProvider = "template" | "llm";

/** Provenance metadata — what data backed this narrative */
export interface NarrativeProvenance {
  /** Which provider produced the text */
  provider: NarrativeProvider;
  /** Whether the output is fully deterministic (template=true, llm=false) */
  deterministic: boolean;
  /** Data completeness — did all source queries return data? */
  completeness: "full" | "partial" | "minimal";
  /** Counts of source data points used */
  sourceCounts: {
    anomalies: number;
    closeTasksTotal: number;
    riskSignals: number;
    reconSessions: number;
    predictionsAvailable: number;   // 0-3 (closeDuration, releaseReadiness, reconCompletion)
  };
  /** If provider="llm", the template text that was sent as input */
  templateText?: string;
}

export interface NarrativeOutput {
  type: NarrativeType;
  text: string;
  generatedAt: string;          // ISO 8601
  provider: NarrativeProvider;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  provenance: NarrativeProvenance;
}

/** Build provenance from NarrativeInput */
export function buildProvenance(
  input: NarrativeInput,
  provider: NarrativeProvider = "template",
  templateText?: string,
): NarrativeProvenance {
  const predictionsAvailable =
    (input.predictions.closeDuration ? 1 : 0) +
    (input.predictions.releaseReadiness ? 1 : 0) +
    (input.predictions.reconCompletion ? 1 : 0);

  const sourceCounts: NarrativeProvenance["sourceCounts"] = {
    anomalies: input.anomalySummary.totalCount,
    closeTasksTotal: input.closeProgress.totalTasks,
    riskSignals: input.riskSignals.activeCount,
    reconSessions: input.reconStatus.totalSessions,
    predictionsAvailable,
  };

  // Completeness: full if all major sources returned data,
  // partial if some did, minimal if only anomaly summary
  const signalCount =
    (sourceCounts.anomalies > 0 ? 1 : 0) +
    (sourceCounts.closeTasksTotal > 0 ? 1 : 0) +
    (sourceCounts.reconSessions > 0 ? 1 : 0) +
    (predictionsAvailable > 0 ? 1 : 0);
  const completeness: NarrativeProvenance["completeness"] =
    signalCount >= 3 ? "full" : signalCount >= 1 ? "partial" : "minimal";

  return {
    provider,
    deterministic: provider === "template",
    completeness,
    sourceCounts,
    ...(templateText !== undefined ? { templateText } : {}),
  };
}

/** Build provenance for a single anomaly explanation */
export function buildAnomalyProvenance(
  provider: NarrativeProvider = "template",
  templateText?: string,
): NarrativeProvenance {
  return {
    provider,
    deterministic: provider === "template",
    completeness: "full",
    sourceCounts: {
      anomalies: 1,
      closeTasksTotal: 0,
      riskSignals: 0,
      reconSessions: 0,
      predictionsAvailable: 0,
    },
    ...(templateText !== undefined ? { templateText } : {}),
  };
}

export interface NarrativeComputeInput {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  types?: NarrativeType[];      // which narratives to generate (default: all)
}

export interface NarrativeComputeResult {
  narratives: NarrativeOutput[];
}
