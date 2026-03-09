/**
 * Atlas Predictions API
 *
 * GET /api/fin/atlas/predictions?entityCode=ACME&fiscalYear=2026&periodNumber=3
 *   → Compute and return all predictions for a period
 *     - Close duration forecast
 *     - Release readiness probability
 *     - Reconciliation completion forecast
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
    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");

    if (!entityCode || !fiscalYear || !periodNumber) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }

    const fy = Number(fiscalYear);
    const pn = Number(periodNumber);

    // Compute all 3 predictions in parallel
    const [closeDuration, releaseReadiness, reconCompletion] = await Promise.all([
      computeCloseDuration(db, tenantUuid, entityCode, fy, pn),
      computeReleaseReadiness(db, tenantUuid, entityCode, fy, pn),
      computeReconCompletion(db, tenantUuid, entityCode, fy, pn),
    ]);

    return successResponse({
      closeDuration,
      releaseReadiness,
      reconCompletion,
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[atlas/predictions] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to compute predictions");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// 1. Close Duration Forecast
// ---------------------------------------------------------------------------

async function computeCloseDuration(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
) {
  // Historical close durations
  const histResult = await sql<{ close_days: string }>`
    SELECT
      EXTRACT(EPOCH FROM (
        COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) - cr.started_at
      )) / 86400.0 AS "closeDays"
    FROM fin.close_run cr
    WHERE cr.tenant_id = ${tenantUuid}::uuid
      AND cr.entity_code = ${entityCode}
      AND cr.status IN ('SOFT_CLOSED', 'HARD_CLOSED')
      AND cr.started_at IS NOT NULL
      AND COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) IS NOT NULL
      AND NOT (cr.fiscal_year = ${fiscalYear} AND cr.period_number = ${periodNumber})
    ORDER BY cr.fiscal_year DESC, cr.period_number DESC
    LIMIT 12
  `.execute(db);

  if (histResult.rows.length < 2) return null;

  const histDays = histResult.rows.map((r) => Number((r as any).closeDays));
  const avgDays = histDays.reduce((a, b) => a + b, 0) / histDays.length;

  // Current progress
  const progressResult = await sql<Record<string, unknown>>`
    SELECT
      COUNT(*)::int AS "totalTasks",
      COUNT(*) FILTER (WHERE cc.task_status IN ('COMPLETED', 'WAIVED'))::int AS "doneTasks",
      EXTRACT(EPOCH FROM (now() - MIN(cr.started_at))) / 86400.0 AS "elapsedDays"
    FROM fin.period_close_checklist cc
    JOIN fin.close_run cr
      ON cr.tenant_id = cc.tenant_id
      AND cr.entity_code = cc.entity_code
      AND cr.fiscal_year = cc.fiscal_year
      AND cr.period_number = cc.period_number
    WHERE cc.tenant_id = ${tenantUuid}::uuid
      AND cc.entity_code = ${entityCode}
      AND cc.fiscal_year = ${fiscalYear}
      AND cc.period_number = ${periodNumber}
  `.execute(db);

  const p = progressResult.rows[0] as any;
  const total = Number(p?.totalTasks ?? 0);
  const done = Number(p?.doneTasks ?? 0);
  const rate = total > 0 ? done / total : 0;
  const elapsed = Number(p?.elapsedDays ?? 0);

  // Critical path from latest snapshot
  const snapResult = await sql<{ critical_path_minutes: number }>`
    SELECT critical_path_minutes
    FROM fin.close_orchestration_snapshot
    WHERE tenant_id = ${tenantUuid}::uuid
      AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear}
      AND period_number = ${periodNumber}
    ORDER BY snapshot_at DESC LIMIT 1
  `.execute(db);

  // Risk + recon factors
  const riskResult = await sql<{ cnt: number }>`
    SELECT COUNT(*)::int AS cnt FROM fin.close_risk_signal
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear} AND period_number = ${periodNumber}
      AND signal_state IN ('fired', 'acknowledged')
  `.execute(db);

  const riskCount = Number(riskResult.rows[0]?.cnt ?? 0);

  // Weighted estimate
  const paceEst = rate > 0.1 ? elapsed / rate : avgDays * 1.5;
  const expectedDays = Math.max(0.5, avgDays * 0.7 + paceEst * 0.3 + riskCount * 0.2);

  const stddev = Math.sqrt(histDays.reduce((s, d) => s + (d - avgDays) ** 2, 0) / histDays.length);
  const cv = avgDays > 0 ? stddev / avgDays : 1;
  const confidence = Math.round(Math.max(30, Math.min(95, 85 - cv * 50 + Math.min(histDays.length, 6) * 2)));

  return {
    expectedCloseDays: expectedDays.toFixed(1),
    confidencePercent: confidence,
    historicalAvgDays: avgDays.toFixed(1),
    currentProgressPercent: Math.round(rate * 100),
    criticalPathMinutes: snapResult.rows[0]?.critical_path_minutes ?? null,
    factors: {
      taskCompletionRate: Math.round(rate * 100) / 100,
      riskSignalCount: riskCount,
      historicalCloseDays: histDays.map(d => Math.round(d * 10) / 10),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Release Readiness Probability
// ---------------------------------------------------------------------------

async function computeReleaseReadiness(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
) {
  // Tasks
  const taskResult = await sql<Record<string, number>>`
    SELECT
      COUNT(*)::int AS "total",
      COUNT(*) FILTER (WHERE task_status IN ('COMPLETED', 'WAIVED'))::int AS "done",
      COUNT(*) FILTER (WHERE task_status = 'FAILED')::int AS "failed",
      COUNT(*) FILTER (WHERE task_status = 'BLOCKED')::int AS "blocked"
    FROM fin.period_close_checklist
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear} AND period_number = ${periodNumber}
  `.execute(db);

  const t = taskResult.rows[0] as any;
  const totalT = Number(t?.total ?? 0);
  const doneT = Number(t?.done ?? 0);
  const failedT = Number(t?.failed ?? 0);
  const blockedT = Number(t?.blocked ?? 0);
  const taskRate = totalT > 0 ? doneT / totalT : 0;

  // Risk signals
  const riskResult = await sql<Record<string, number>>`
    SELECT
      COUNT(*)::int AS "active",
      COUNT(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS "highCritical"
    FROM fin.close_risk_signal
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear} AND period_number = ${periodNumber}
      AND signal_state IN ('fired', 'acknowledged')
  `.execute(db);

  const activeSignals = Number((riskResult.rows[0] as any)?.active ?? 0);
  const highCritical = Number((riskResult.rows[0] as any)?.highCritical ?? 0);

  // Critical anomalies
  const anomalyResult = await sql<{ cnt: number }>`
    SELECT COUNT(*)::int AS cnt FROM fin.atlas_anomaly
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear} AND period_number = ${periodNumber}
      AND severity = 'CRITICAL' AND status IN ('OPEN', 'ACKNOWLEDGED')
  `.execute(db);
  const criticalAnomalies = Number(anomalyResult.rows[0]?.cnt ?? 0);

  // Reconciliation
  const reconResult = await sql<Record<string, number>>`
    SELECT
      COUNT(*)::int AS "total",
      COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS "completed"
    FROM fin.reconciliation_session rs
    JOIN fin.bank_statement bs ON bs.id = rs.statement_id
    WHERE rs.tenant_id = ${tenantUuid}::uuid AND bs.entity_code = ${entityCode}
      AND EXISTS (
        SELECT 1 FROM fin.fiscal_period fp
        WHERE fp.tenant_id = ${tenantUuid}::uuid AND fp.entity_code = ${entityCode}
          AND fp.fiscal_year = ${fiscalYear} AND fp.period_number = ${periodNumber}
          AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
      )
  `.execute(db);
  const reconT = Number((reconResult.rows[0] as any)?.total ?? 0);
  const reconD = Number((reconResult.rows[0] as any)?.completed ?? 0);
  const reconComplete = reconT === 0 || reconD === reconT;

  // Consistency
  const consResult = await sql<{ balanced: boolean }>`
    SELECT COALESCE(SUM(total_debit), 0) = COALESCE(SUM(total_credit), 0) AS balanced
    FROM fin.journal_entry
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear} AND period_number = ${periodNumber}
      AND status = 'POSTED'
  `.execute(db);
  const consistencyPassing = consResult.rows[0]?.balanced ?? true;

  // Probability computation
  const blockers: string[] = [];
  let prob = 1.0;
  prob *= taskRate;
  if (failedT > 0) { blockers.push(`${failedT} failed task(s)`); prob *= 0.3; }
  if (blockedT > 0) { blockers.push(`${blockedT} blocked task(s)`); prob *= 0.5; }
  if (highCritical > 0) { blockers.push(`${highCritical} high/critical risk signal(s)`); prob *= Math.max(0.1, 1 - highCritical * 0.25); }
  if (criticalAnomalies > 0) { blockers.push(`${criticalAnomalies} critical anomaly(ies)`); prob *= Math.max(0.2, 1 - criticalAnomalies * 0.2); }
  if (!reconComplete) { blockers.push(`Reconciliation incomplete (${reconD}/${reconT})`); prob *= 0.4; }
  if (!consistencyPassing) { blockers.push("GL consistency check failing"); prob *= 0.2; }
  prob = Math.round(prob * 100) / 100;

  const confidence = totalT > 0 ? Math.min(90, 60 + totalT * 2) : 30;

  return {
    probability: prob,
    confidencePercent: confidence,
    blockers,
    factors: {
      taskCompletionRate: Math.round(taskRate * 100) / 100,
      activeRiskSignals: activeSignals,
      criticalAnomalies,
      reconComplete,
      consistencyPassing,
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Reconciliation Completion Forecast
// ---------------------------------------------------------------------------

async function computeReconCompletion(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
) {
  const currentResult = await sql<Record<string, unknown>>`
    SELECT
      COUNT(*)::int AS "total",
      COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS "completed",
      AVG(CASE WHEN rs.total_lines > 0
        THEN (rs.auto_matched + rs.manual_matched)::decimal / rs.total_lines
        ELSE 0 END) AS "avgMatchRate"
    FROM fin.reconciliation_session rs
    JOIN fin.bank_statement bs ON bs.id = rs.statement_id
    WHERE rs.tenant_id = ${tenantUuid}::uuid AND bs.entity_code = ${entityCode}
      AND EXISTS (
        SELECT 1 FROM fin.fiscal_period fp
        WHERE fp.tenant_id = ${tenantUuid}::uuid AND fp.entity_code = ${entityCode}
          AND fp.fiscal_year = ${fiscalYear} AND fp.period_number = ${periodNumber}
          AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
      )
  `.execute(db);

  const c = currentResult.rows[0] as any;
  const totalS = Number(c?.total ?? 0);
  const completedS = Number(c?.completed ?? 0);
  const remaining = totalS - completedS;
  const matchRate = Number(c?.avgMatchRate ?? 0);

  if (totalS === 0) return null;

  // Historical session durations
  const histResult = await sql<{ hours: string }>`
    SELECT EXTRACT(EPOCH FROM (rs.completed_at - rs.started_at)) / 3600.0 AS hours
    FROM fin.reconciliation_session rs
    WHERE rs.tenant_id = ${tenantUuid}::uuid
      AND rs.status = 'COMPLETED'
      AND rs.completed_at IS NOT NULL AND rs.started_at IS NOT NULL
    ORDER BY rs.completed_at DESC LIMIT 20
  `.execute(db);

  const histHours = histResult.rows.map((r) => Number((r as any).hours));
  const avgHours = histHours.length > 0
    ? histHours.reduce((a, b) => a + b, 0) / histHours.length
    : 4;

  const expectedHours = remaining * avgHours;
  const confidence = Math.min(90, 40 + Math.min(histHours.length, 10) * 5);

  return {
    expectedHours: expectedHours.toFixed(1),
    confidencePercent: confidence,
    sessionsRemaining: remaining,
    historicalAvgHours: avgHours.toFixed(1),
    factors: {
      totalSessions: totalS,
      completedSessions: completedS,
      avgMatchRate: Math.round(matchRate * 100) / 100,
      historicalCompletionHours: histHours.slice(0, 6).map(h => Math.round(h * 10) / 10),
    },
  };
}
