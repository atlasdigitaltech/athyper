/**
 * Atlas Feedback API (Phase 6 — Adaptive Learning)
 *
 * POST /api/fin/atlas/feedback
 *   → Submit feedback on an anomaly or recommendation
 *
 * GET  /api/fin/atlas/feedback
 *   → Compute effectiveness metrics and calibration suggestions
 *
 * GET  /api/fin/atlas/feedback/calibrations — see calibrations/route.ts
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import type { NextRequest } from "next/server";

import {
  getApiContext,
  resolveTenantUuid,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// Validation constants (mirrors domain/feedback-types.ts enums)
// ---------------------------------------------------------------------------

const VALID_TARGETS = ["ANOMALY", "RECOMMENDATION"] as const;
const VALID_VERDICTS = ["CONFIRMED", "FALSE_POSITIVE", "ACCEPTED", "DISMISSED", "DEFERRED"] as const;
const VALID_REASON_CODES = [
  "SEASONAL_PATTERN", "ONE_TIME_EVENT", "KNOWN_ADJUSTMENT",
  "DATA_QUALITY", "THRESHOLD_TOO_SENSITIVE", "THRESHOLD_TOO_LOOSE",
  "NOT_ACTIONABLE", "ALREADY_ADDRESSED", "INCORRECT_OWNER",
  "IMMATERIAL", "OTHER",
] as const;

// ---------------------------------------------------------------------------
// POST — submit feedback
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const body = (await req.json()) as {
      entityCode: string;
      fiscalYear: number;
      periodNumber: number;
      feedbackTarget: string;
      targetId: string;
      anomalyType?: string;
      anomalySeverity?: string;
      accountCode?: string;
      verdict: string;
      reasonCode?: string;
      reasonDetail?: string;
      evidenceSnapshot?: Record<string, unknown>;
    };

    // Validate required fields
    if (!body.entityCode || !body.fiscalYear || !body.periodNumber) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }
    if (!body.feedbackTarget || !VALID_TARGETS.includes(body.feedbackTarget as any)) {
      return errorResponse("VALIDATION", `feedbackTarget must be one of: ${VALID_TARGETS.join(", ")}`, 400);
    }
    if (!body.targetId) {
      return errorResponse("VALIDATION", "targetId is required", 400);
    }
    if (!body.verdict || !VALID_VERDICTS.includes(body.verdict as any)) {
      return errorResponse("VALIDATION", `verdict must be one of: ${VALID_VERDICTS.join(", ")}`, 400);
    }
    if (body.reasonCode && !VALID_REASON_CODES.includes(body.reasonCode as any)) {
      return errorResponse("VALIDATION", `reasonCode must be one of: ${VALID_REASON_CODES.join(", ")}`, 400);
    }

    const result = await sql<Record<string, unknown>>`
      INSERT INTO fin.atlas_feedback (
        tenant_id, entity_code, fiscal_year, period_number,
        feedback_target, target_id, anomaly_type, anomaly_severity, account_code,
        verdict, reason_code, reason_detail, evidence_snapshot, submitted_by
      ) VALUES (
        ${tenantUuid}::uuid, ${body.entityCode}, ${body.fiscalYear}, ${body.periodNumber},
        ${body.feedbackTarget}, ${body.targetId},
        ${body.anomalyType ?? null}, ${body.anomalySeverity ?? null}, ${body.accountCode ?? null},
        ${body.verdict}, ${body.reasonCode ?? null}, ${body.reasonDetail ?? null},
        ${JSON.stringify(body.evidenceSnapshot ?? {})}::jsonb,
        ${apiCtx.context.userId ?? tenantUuid}::uuid
      ) RETURNING
        id,
        entity_code       AS "entityCode",
        fiscal_year       AS "fiscalYear",
        period_number     AS "periodNumber",
        feedback_target   AS "feedbackTarget",
        target_id         AS "targetId",
        verdict,
        reason_code       AS "reasonCode",
        submitted_at      AS "submittedAt"
    `.execute(db);

    return successResponse({ feedback: result.rows[0] }, 201);
  } catch (err) {
    console.error("[atlas/feedback] POST error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to submit feedback");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// GET — effectiveness metrics + calibration suggestions
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const url = new URL(req.url);
    const entityCode = url.searchParams.get("entityCode");
    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");

    // Parallel queries: false positive rates, recommendation feedback, active calibrations
    const [fpRatesResult, recFeedbackResult, calibrationsResult] = await Promise.all([
      sql<Record<string, unknown>>`
        SELECT
          entity_code         AS "entityCode",
          anomaly_type        AS "anomalyType",
          account_code        AS "accountCode",
          COUNT(*)::int       AS "totalFeedback",
          COUNT(*) FILTER (WHERE verdict = 'FALSE_POSITIVE')::int AS "falsePositiveCount",
          COUNT(*) FILTER (WHERE verdict = 'CONFIRMED')::int      AS "confirmedCount",
          ROUND(100.0 * COUNT(*) FILTER (WHERE verdict = 'FALSE_POSITIVE')
            / NULLIF(COUNT(*), 0), 2)::text AS "falsePositivePct",
          MODE() WITHIN GROUP (ORDER BY reason_code)
            FILTER (WHERE verdict = 'FALSE_POSITIVE') AS "topFpReason",
          MAX(submitted_at)::text AS "latestFeedbackAt"
        FROM fin.atlas_feedback
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ${entityCode}
          AND feedback_target = 'ANOMALY'
          AND anomaly_type IS NOT NULL
          AND (${fiscalYear ? Number(fiscalYear) : null}::int IS NULL OR fiscal_year = ${fiscalYear ? Number(fiscalYear) : null}::int)
          AND (${periodNumber ? Number(periodNumber) : null}::int IS NULL OR period_number = ${periodNumber ? Number(periodNumber) : null}::int)
        GROUP BY entity_code, anomaly_type, account_code
      `.execute(db),

      sql<Record<string, unknown>>`
        SELECT
          verdict,
          evidence_snapshot->>'type' AS "recommendationType"
        FROM fin.atlas_feedback
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ${entityCode}
          AND feedback_target = 'RECOMMENDATION'
          AND (${fiscalYear ? Number(fiscalYear) : null}::int IS NULL OR fiscal_year = ${fiscalYear ? Number(fiscalYear) : null}::int)
          AND (${periodNumber ? Number(periodNumber) : null}::int IS NULL OR period_number = ${periodNumber ? Number(periodNumber) : null}::int)
      `.execute(db),

      sql<Record<string, unknown>>`
        SELECT
          id,
          entity_code              AS "entityCode",
          account_code             AS "accountCode",
          anomaly_type             AS "anomalyType",
          warning_z_threshold::text AS "warningZThreshold",
          critical_z_threshold::text AS "criticalZThreshold",
          status,
          source,
          false_positive_rate::text AS "falsePositiveRate",
          sample_size              AS "sampleSize",
          confidence::text,
          suggested_at             AS "suggestedAt",
          suggested_by             AS "suggestedBy",
          approved_by              AS "approvedBy",
          approved_at              AS "approvedAt",
          rejection_reason         AS "rejectionReason"
        FROM fin.atlas_threshold_calibration
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ${entityCode}
          AND status IN ('SUGGESTED', 'APPROVED')
        ORDER BY anomaly_type, account_code NULLS FIRST
      `.execute(db),
    ]);

    // Compute effectiveness metrics
    const fpRates = fpRatesResult.rows;
    const recFeedback = recFeedbackResult.rows;
    const activeCalibrations = calibrationsResult.rows;

    // Anomaly effectiveness
    let totalAnomaly = 0, confirmed = 0, falsePositive = 0;
    const byAnomalyType: Record<string, { confirmed: number; falsePositive: number; total: number }> = {};
    for (const fp of fpRates) {
      const t = Number(fp.totalFeedback);
      const c = Number(fp.confirmedCount);
      const f = Number(fp.falsePositiveCount);
      totalAnomaly += t; confirmed += c; falsePositive += f;
      const key = fp.anomalyType as string;
      if (!byAnomalyType[key]) byAnomalyType[key] = { confirmed: 0, falsePositive: 0, total: 0 };
      byAnomalyType[key].confirmed += c;
      byAnomalyType[key].falsePositive += f;
      byAnomalyType[key].total += t;
    }

    // Recommendation effectiveness
    let totalRec = 0, accepted = 0, dismissed = 0, deferred = 0;
    const byRecType: Record<string, { accepted: number; dismissed: number; total: number }> = {};
    for (const rf of recFeedback) {
      totalRec++;
      if (rf.verdict === "ACCEPTED") accepted++;
      else if (rf.verdict === "DISMISSED") dismissed++;
      else if (rf.verdict === "DEFERRED") deferred++;
      const key = (rf.recommendationType as string) ?? "UNKNOWN";
      if (!byRecType[key]) byRecType[key] = { accepted: 0, dismissed: 0, total: 0 };
      if (rf.verdict === "ACCEPTED") byRecType[key].accepted++;
      else if (rf.verdict === "DISMISSED") byRecType[key].dismissed++;
      byRecType[key].total++;
    }

    // Calibration suggestions (pure computation)
    const calibrationSuggestions = computeCalibrationSuggestions(fpRates, activeCalibrations);

    return successResponse({
      effectiveness: {
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
        calibrationSuggestions,
      },
      activeCalibrations,
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[atlas/feedback] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to compute effectiveness");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Pure computation — calibration suggestions from false positive rates
// ---------------------------------------------------------------------------

const DEFAULT_Z_THRESHOLD = 2.5;
const CRITICAL_Z_THRESHOLD = 3.0;
const MIN_SAMPLES = 5;
const FP_LOOSEN_THRESHOLD = 0.30;
const CONFIRMED_TIGHTEN_THRESHOLD = 0.90;

function computeCalibrationSuggestions(
  fpRates: Record<string, unknown>[],
  activeCalibrations: Record<string, unknown>[],
) {
  const suggestions: Array<Record<string, unknown>> = [];

  for (const fp of fpRates) {
    const total = Number(fp.totalFeedback);
    if (total < MIN_SAMPLES) continue;

    const fpRate = Number(fp.falsePositivePct) / 100;
    const confirmedRate = total > 0 ? Number(fp.confirmedCount) / total : 0;

    const existing = activeCalibrations.find(
      (c) => c.anomalyType === fp.anomalyType
        && (c.accountCode ?? null) === (fp.accountCode ?? null)
        && c.status === "APPROVED",
    );
    const currentWarning = existing ? Number(existing.warningZThreshold) : DEFAULT_Z_THRESHOLD;
    const currentCritical = existing ? Number(existing.criticalZThreshold) : CRITICAL_Z_THRESHOLD;

    let suggestedWarning = currentWarning;
    let suggestedCritical = currentCritical;
    let rationale = "";

    if (fpRate >= FP_LOOSEN_THRESHOLD) {
      const adj = Math.min(0.5, (fpRate - 0.2) * 1.5);
      suggestedWarning = Math.round((currentWarning + adj) * 100) / 100;
      suggestedCritical = Math.round((currentCritical + adj) * 100) / 100;
      rationale = `False positive rate is ${fp.falsePositivePct}% (${fp.falsePositiveCount}/${total}). ` +
        `Top reason: ${fp.topFpReason ?? "unspecified"}. ` +
        `Suggesting raising z-score threshold by ${adj.toFixed(2)} to reduce noise.`;
    } else if (confirmedRate >= CONFIRMED_TIGHTEN_THRESHOLD && total >= 10) {
      const adj = Math.min(0.3, (confirmedRate - 0.85) * 1.0);
      suggestedWarning = Math.max(1.5, Math.round((currentWarning - adj) * 100) / 100);
      suggestedCritical = Math.max(2.0, Math.round((currentCritical - adj) * 100) / 100);
      rationale = `Confirmed rate is ${(confirmedRate * 100).toFixed(1)}% (${fp.confirmedCount}/${total}). ` +
        `All detected anomalies are real — consider lowering threshold to catch more.`;
    } else {
      continue;
    }

    if (suggestedWarning === currentWarning && suggestedCritical === currentCritical) continue;

    const confidence = Math.min(95, 50 + Math.min(total, 30) * 1.5);

    suggestions.push({
      anomalyType: fp.anomalyType,
      accountCode: fp.accountCode ?? null,
      currentWarningThreshold: currentWarning.toFixed(2),
      currentCriticalThreshold: currentCritical.toFixed(2),
      suggestedWarningThreshold: suggestedWarning.toFixed(2),
      suggestedCriticalThreshold: suggestedCritical.toFixed(2),
      falsePositiveRate: fp.falsePositivePct,
      sampleSize: total,
      confidence: confidence.toFixed(0),
      rationale,
    });
  }

  return suggestions;
}
