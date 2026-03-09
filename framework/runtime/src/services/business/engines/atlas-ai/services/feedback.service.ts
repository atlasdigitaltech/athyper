// framework/runtime/src/services/business/engines/atlas-ai/services/feedback.service.ts
//
// Atlas Phase 6 — Adaptive Learning Feedback Service
//
// Records user feedback on anomalies and recommendations,
// computes false positive rates and effectiveness metrics,
// and suggests threshold calibrations.
//
// Key constraints:
//   - Calibrations are SUGGESTED, never auto-applied
//   - Requires explicit human approval to become APPROVED
//   - Append-only feedback — immutable once recorded
//   - All threshold suggestions are advisory

import { ok, fail } from "../../shared/engine-base.js";
import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import { DEFAULT_Z_SCORE_THRESHOLD, CRITICAL_Z_SCORE_THRESHOLD } from "../domain/anomaly-types.js";
import type {
  SubmitFeedbackInput,
  AtlasFeedback,
  FeedbackComputeInput,
  FeedbackComputeResult,
  FeedbackEffectiveness,
  CalibrationSuggestion,
  ThresholdCalibration,
  FalsePositiveRate,
} from "../domain/feedback-types.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface FeedbackService {
  /** Record user feedback on an anomaly or recommendation */
  submit(
    ctx: OperationContext,
    input: SubmitFeedbackInput,
  ): Promise<ServiceResult<AtlasFeedback>>;

  /** Compute effectiveness metrics and calibration suggestions */
  computeEffectiveness(
    ctx: OperationContext,
    input: FeedbackComputeInput,
  ): Promise<ServiceResult<FeedbackComputeResult>>;

  /** Approve a suggested calibration */
  approveCalibration(
    ctx: OperationContext,
    calibrationId: string,
  ): Promise<ServiceResult<ThresholdCalibration>>;

  /** Reject a suggested calibration */
  rejectCalibration(
    ctx: OperationContext,
    calibrationId: string,
    reason: string,
  ): Promise<ServiceResult<ThresholdCalibration>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultFeedbackService implements FeedbackService {
  constructor(
    private readonly container: { resolve: <T>(token: string) => T | Promise<T> },
  ) {}

  async submit(
    ctx: OperationContext,
    input: SubmitFeedbackInput,
  ): Promise<ServiceResult<AtlasFeedback>> {
    try {
      const db = await this.container.resolve<any>("db");
      const result = await db.query(
        `INSERT INTO fin.atlas_feedback (
          tenant_id, entity_code, fiscal_year, period_number,
          feedback_target, target_id, anomaly_type, anomaly_severity, account_code,
          verdict, reason_code, reason_detail, evidence_snapshot, submitted_by
        ) VALUES (
          $1::uuid, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13::jsonb, $14::uuid
        ) RETURNING *`,
        [
          input.tenantId, input.entityCode, input.fiscalYear, input.periodNumber,
          input.feedbackTarget, input.targetId,
          input.anomalyType ?? null, input.anomalySeverity ?? null, input.accountCode ?? null,
          input.verdict, input.reasonCode ?? null, input.reasonDetail ?? null,
          JSON.stringify(input.evidenceSnapshot ?? {}), input.submittedBy,
        ],
      );

      const row = result.rows[0];
      return ok(mapFeedbackRow(row));
    } catch (err) {
      return fail(
        "FEEDBACK_SUBMIT_FAILED",
        `Failed to submit feedback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async computeEffectiveness(
    ctx: OperationContext,
    input: FeedbackComputeInput,
  ): Promise<ServiceResult<FeedbackComputeResult>> {
    try {
      const db = await this.container.resolve<any>("db");

      const [fpRates, recFeedback, activeCalibrations] = await Promise.all([
        queryFalsePositiveRates(db, input),
        queryRecommendationFeedback(db, input),
        queryActiveCalibrations(db, input),
      ]);

      const effectiveness = computeEffectivenessMetrics(fpRates, recFeedback);
      effectiveness.calibrationSuggestions = generateCalibrationSuggestions(
        fpRates, activeCalibrations,
      );

      return ok({
        effectiveness,
        activeCalibrations,
        computedAt: new Date().toISOString(),
      });
    } catch (err) {
      return fail(
        "EFFECTIVENESS_COMPUTE_FAILED",
        `Failed to compute effectiveness: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async approveCalibration(
    ctx: OperationContext,
    calibrationId: string,
  ): Promise<ServiceResult<ThresholdCalibration>> {
    try {
      const db = await this.container.resolve<any>("db");
      const result = await db.query(
        `UPDATE fin.atlas_threshold_calibration
         SET status = 'APPROVED', approved_by = $2::uuid, approved_at = now(), updated_at = now()
         WHERE id = $1::uuid AND status = 'SUGGESTED'
         RETURNING *`,
        [calibrationId, ctx.actorId],
      );
      if (!result.rows[0]) {
        return fail("CALIBRATION_NOT_FOUND", "Calibration not found or already processed");
      }
      return ok(mapCalibrationRow(result.rows[0]));
    } catch (err) {
      return fail("CALIBRATION_APPROVE_FAILED", `Failed to approve: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async rejectCalibration(
    ctx: OperationContext,
    calibrationId: string,
    reason: string,
  ): Promise<ServiceResult<ThresholdCalibration>> {
    try {
      const db = await this.container.resolve<any>("db");
      const result = await db.query(
        `UPDATE fin.atlas_threshold_calibration
         SET status = 'REJECTED', rejection_reason = $3, updated_at = now()
         WHERE id = $1::uuid AND status = 'SUGGESTED'
         RETURNING *`,
        [calibrationId, ctx.actorId, reason],
      );
      if (!result.rows[0]) {
        return fail("CALIBRATION_NOT_FOUND", "Calibration not found or already processed");
      }
      return ok(mapCalibrationRow(result.rows[0]));
    } catch (err) {
      return fail("CALIBRATION_REJECT_FAILED", `Failed to reject: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pure computation — effectiveness metrics from feedback data
// ---------------------------------------------------------------------------

function computeEffectivenessMetrics(
  fpRates: FalsePositiveRate[],
  recFeedback: Array<{ verdict: string; recommendation_type: string }>,
): FeedbackEffectiveness {
  // Anomaly effectiveness
  let totalAnomaly = 0, confirmed = 0, falsePositive = 0;
  const byAnomalyType: Record<string, { confirmed: number; falsePositive: number; total: number }> = {};

  for (const fp of fpRates) {
    totalAnomaly += fp.totalFeedback;
    confirmed += fp.confirmedCount;
    falsePositive += fp.falsePositiveCount;

    const key = fp.anomalyType;
    if (!byAnomalyType[key]) byAnomalyType[key] = { confirmed: 0, falsePositive: 0, total: 0 };
    byAnomalyType[key].confirmed += fp.confirmedCount;
    byAnomalyType[key].falsePositive += fp.falsePositiveCount;
    byAnomalyType[key].total += fp.totalFeedback;
  }

  // Recommendation effectiveness
  let totalRec = 0, accepted = 0, dismissed = 0, deferred = 0;
  const byRecType: Record<string, { accepted: number; dismissed: number; total: number }> = {};

  for (const rf of recFeedback) {
    totalRec++;
    if (rf.verdict === "ACCEPTED") accepted++;
    else if (rf.verdict === "DISMISSED") dismissed++;
    else if (rf.verdict === "DEFERRED") deferred++;

    const key = rf.recommendation_type ?? "UNKNOWN";
    if (!byRecType[key]) byRecType[key] = { accepted: 0, dismissed: 0, total: 0 };
    if (rf.verdict === "ACCEPTED") byRecType[key].accepted++;
    else if (rf.verdict === "DISMISSED") byRecType[key].dismissed++;
    byRecType[key].total++;
  }

  return {
    anomalyEffectiveness: {
      totalFeedback: totalAnomaly,
      confirmedCount: confirmed,
      falsePositiveCount: falsePositive,
      confirmedRate: totalAnomaly > 0 ? (confirmed / totalAnomaly * 100).toFixed(1) : "0.0",
      falsePositiveRate: totalAnomaly > 0 ? (falsePositive / totalAnomaly * 100).toFixed(1) : "0.0",
      byType: byAnomalyType,
    },
    recommendationEffectiveness: {
      totalFeedback: totalRec,
      acceptedCount: accepted,
      dismissedCount: dismissed,
      deferredCount: deferred,
      acceptanceRate: totalRec > 0 ? (accepted / totalRec * 100).toFixed(1) : "0.0",
      byType: byRecType,
    },
    calibrationSuggestions: [], // filled by caller
  };
}

// ---------------------------------------------------------------------------
// Pure computation — calibration suggestions from false positive rates
// ---------------------------------------------------------------------------

/** Minimum feedback samples required before suggesting calibration */
const MIN_CALIBRATION_SAMPLES = 5;

/** False positive rate threshold above which we suggest loosening */
const FP_RATE_LOOSEN_THRESHOLD = 0.30; // 30%

/** Confirmed rate threshold above which we suggest tightening */
const CONFIRMED_RATE_TIGHTEN_THRESHOLD = 0.90; // 90%

export function generateCalibrationSuggestions(
  fpRates: FalsePositiveRate[],
  activeCalibrations: ThresholdCalibration[],
): CalibrationSuggestion[] {
  const suggestions: CalibrationSuggestion[] = [];

  for (const fp of fpRates) {
    if (fp.totalFeedback < MIN_CALIBRATION_SAMPLES) continue;

    const fpRate = Number(fp.falsePositivePct) / 100;
    const confirmedRate = fp.totalFeedback > 0 ? fp.confirmedCount / fp.totalFeedback : 0;

    // Look up current calibration (or use defaults)
    const existing = activeCalibrations.find(
      c => c.anomalyType === fp.anomalyType
        && (c.accountCode ?? null) === (fp.accountCode ?? null)
        && c.status === "APPROVED",
    );
    const currentWarning = existing ? Number(existing.warningZThreshold) : DEFAULT_Z_SCORE_THRESHOLD;
    const currentCritical = existing ? Number(existing.criticalZThreshold) : CRITICAL_Z_SCORE_THRESHOLD;

    let suggestedWarning = currentWarning;
    let suggestedCritical = currentCritical;
    let rationale = "";

    if (fpRate >= FP_RATE_LOOSEN_THRESHOLD) {
      // Too many false positives → raise threshold (loosen sensitivity)
      const adjustment = Math.min(0.5, (fpRate - 0.2) * 1.5);
      suggestedWarning = Math.round((currentWarning + adjustment) * 100) / 100;
      suggestedCritical = Math.round((currentCritical + adjustment) * 100) / 100;
      rationale = `False positive rate is ${fp.falsePositivePct}% (${fp.falsePositiveCount}/${fp.totalFeedback}). ` +
        `Top reason: ${fp.topFpReason ?? "unspecified"}. ` +
        `Suggesting raising z-score threshold by ${adjustment.toFixed(2)} to reduce noise.`;
    } else if (confirmedRate >= CONFIRMED_RATE_TIGHTEN_THRESHOLD && fp.totalFeedback >= 10) {
      // Very high confirmation rate → could lower threshold (tighten sensitivity)
      const adjustment = Math.min(0.3, (confirmedRate - 0.85) * 1.0);
      suggestedWarning = Math.max(1.5, Math.round((currentWarning - adjustment) * 100) / 100);
      suggestedCritical = Math.max(2.0, Math.round((currentCritical - adjustment) * 100) / 100);
      rationale = `Confirmed rate is ${(confirmedRate * 100).toFixed(1)}% (${fp.confirmedCount}/${fp.totalFeedback}). ` +
        `All detected anomalies are real — consider lowering threshold to catch more.`;
    } else {
      continue; // No suggestion needed
    }

    // Only suggest if thresholds actually changed
    if (suggestedWarning === currentWarning && suggestedCritical === currentCritical) continue;

    // Confidence based on sample size
    const confidence = Math.min(95, 50 + Math.min(fp.totalFeedback, 30) * 1.5);

    suggestions.push({
      anomalyType: fp.anomalyType,
      accountCode: fp.accountCode ?? null,
      currentWarningThreshold: currentWarning.toFixed(2),
      currentCriticalThreshold: currentCritical.toFixed(2),
      suggestedWarningThreshold: suggestedWarning.toFixed(2),
      suggestedCriticalThreshold: suggestedCritical.toFixed(2),
      falsePositiveRate: fp.falsePositivePct,
      sampleSize: fp.totalFeedback,
      confidence: confidence.toFixed(0),
      rationale,
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

async function queryFalsePositiveRates(
  db: any, input: FeedbackComputeInput,
): Promise<FalsePositiveRate[]> {
  const periodFilter = input.fiscalYear
    ? `AND f.fiscal_year = ${input.fiscalYear} AND f.period_number = ${input.periodNumber}`
    : "";

  const result = await db.query(
    `SELECT
       f.entity_code,
       f.anomaly_type,
       f.account_code,
       COUNT(*)::int AS total_feedback,
       COUNT(*) FILTER (WHERE f.verdict = 'FALSE_POSITIVE')::int AS false_positive_count,
       COUNT(*) FILTER (WHERE f.verdict = 'CONFIRMED')::int AS confirmed_count,
       ROUND(100.0 * COUNT(*) FILTER (WHERE f.verdict = 'FALSE_POSITIVE') / NULLIF(COUNT(*), 0), 2)::text AS false_positive_pct,
       MODE() WITHIN GROUP (ORDER BY f.reason_code) FILTER (WHERE f.verdict = 'FALSE_POSITIVE') AS top_fp_reason,
       MAX(f.submitted_at)::text AS latest_feedback_at
     FROM fin.atlas_feedback f
     WHERE f.tenant_id = $1::uuid AND f.entity_code = $2
       AND f.feedback_target = 'ANOMALY'
       AND f.anomaly_type IS NOT NULL
       ${periodFilter}
     GROUP BY f.entity_code, f.anomaly_type, f.account_code`,
    [input.tenantId, input.entityCode],
  );

  return result.rows.map((r: any) => ({
    entityCode: r.entity_code,
    anomalyType: r.anomaly_type,
    accountCode: r.account_code ?? null,
    totalFeedback: Number(r.total_feedback),
    falsePositiveCount: Number(r.false_positive_count),
    confirmedCount: Number(r.confirmed_count),
    falsePositivePct: r.false_positive_pct ?? "0.00",
    topFpReason: r.top_fp_reason ?? null,
    latestFeedbackAt: r.latest_feedback_at,
  }));
}

async function queryRecommendationFeedback(
  db: any, input: FeedbackComputeInput,
): Promise<Array<{ verdict: string; recommendation_type: string }>> {
  const periodFilter = input.fiscalYear
    ? `AND f.fiscal_year = ${input.fiscalYear} AND f.period_number = ${input.periodNumber}`
    : "";

  const result = await db.query(
    `SELECT f.verdict, f.evidence_snapshot->>'type' AS recommendation_type
     FROM fin.atlas_feedback f
     WHERE f.tenant_id = $1::uuid AND f.entity_code = $2
       AND f.feedback_target = 'RECOMMENDATION'
       ${periodFilter}`,
    [input.tenantId, input.entityCode],
  );
  return result.rows;
}

async function queryActiveCalibrations(
  db: any, input: FeedbackComputeInput,
): Promise<ThresholdCalibration[]> {
  const result = await db.query(
    `SELECT * FROM fin.atlas_threshold_calibration
     WHERE tenant_id = $1::uuid AND entity_code = $2
       AND status IN ('SUGGESTED', 'APPROVED')
     ORDER BY anomaly_type, account_code NULLS FIRST`,
    [input.tenantId, input.entityCode],
  );
  return result.rows.map(mapCalibrationRow);
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapFeedbackRow(r: any): AtlasFeedback {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityCode: r.entity_code,
    fiscalYear: Number(r.fiscal_year),
    periodNumber: Number(r.period_number),
    feedbackTarget: r.feedback_target,
    targetId: r.target_id,
    anomalyType: r.anomaly_type ?? null,
    anomalySeverity: r.anomaly_severity ?? null,
    accountCode: r.account_code ?? null,
    verdict: r.verdict,
    reasonCode: r.reason_code ?? null,
    reasonDetail: r.reason_detail ?? null,
    outcomeVerified: r.outcome_verified ?? null,
    outcomeNotes: r.outcome_notes ?? null,
    evidenceSnapshot: r.evidence_snapshot ?? {},
    submittedBy: r.submitted_by,
    submittedAt: r.submitted_at,
  };
}

function mapCalibrationRow(r: any): ThresholdCalibration {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityCode: r.entity_code,
    accountCode: r.account_code ?? null,
    anomalyType: r.anomaly_type,
    warningZThreshold: String(r.warning_z_threshold),
    criticalZThreshold: String(r.critical_z_threshold),
    status: r.status,
    source: r.source,
    falsePositiveRate: r.false_positive_rate != null ? String(r.false_positive_rate) : null,
    sampleSize: r.sample_size != null ? Number(r.sample_size) : null,
    confidence: r.confidence != null ? String(r.confidence) : null,
    suggestedAt: r.suggested_at,
    suggestedBy: r.suggested_by ?? null,
    approvedBy: r.approved_by ?? null,
    approvedAt: r.approved_at ?? null,
    rejectionReason: r.rejection_reason ?? null,
  };
}
