/**
 * Atlas Intelligence Dashboard API
 *
 * GET /api/fin/atlas/dashboard?entityCode=ACME&fiscalYear=2026&periodNumber=3
 *   → Composite payload for the Atlas Insights panel
 *   → Anomaly summary, top anomalies, risk score, baseline health, predictions, narratives, recommendations
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
// Response cache — process-level, 60s TTL
// ---------------------------------------------------------------------------

interface DashboardCacheEntry {
  data: unknown;
  expiresAt: number;
}

const DASHBOARD_CACHE_TTL_MS = 60_000;
const _dashboardCache = new Map<string, DashboardCacheEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _dashboardCache) {
    if (v.expiresAt <= now) _dashboardCache.delete(k);
  }
}, 60_000).unref();

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

    // Cache check (60s TTL)
    const cacheKey = `atlas:dash:${tenantUuid}:${entityCode}:${fy}:${pn}`;
    const cached = _dashboardCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return successResponse(cached.data, 200, {
        "X-Atlas-Cache": "HIT",
        "Cache-Control": "private, max-age=60",
      });
    }

    const _t0 = performance.now();

    // 1. Anomaly summary
    const summaryResult = await sql<Record<string, number>>`
      SELECT
        count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED'))::int AS "activeCount",
        count(*) FILTER (WHERE severity = 'CRITICAL' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "criticalCount",
        count(*) FILTER (WHERE severity = 'WARNING' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "warningCount",
        count(*) FILTER (WHERE severity = 'INFO' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "infoCount",
        count(*) FILTER (WHERE status = 'RESOLVED')::int AS "resolvedCount",
        count(*) FILTER (WHERE status = 'FALSE_POSITIVE')::int AS "falsePositiveCount",
        count(*)::int AS "totalCount"
      FROM fin.atlas_anomaly
      WHERE tenant_id = ${tenantUuid}::uuid
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fy}
        AND period_number = ${pn}
    `.execute(db);

    // 2. Top anomalies (most severe, most recent)
    const topAnomalies = await sql<Record<string, unknown>>`
      SELECT
        a.id,
        a.anomaly_type AS "anomalyType",
        a.severity,
        a.title,
        a.z_score::text AS "zScore",
        a.observed_value::text AS "observedValue",
        a.expected_value::text AS "expectedValue",
        c.account_code AS "accountCode",
        a.status,
        a.detected_at AS "detectedAt"
      FROM fin.atlas_anomaly a
      LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
      WHERE a.tenant_id = ${tenantUuid}::uuid
        AND a.entity_code = ${entityCode}
        AND a.fiscal_year = ${fy}
        AND a.period_number = ${pn}
        AND a.status IN ('OPEN', 'ACKNOWLEDGED')
      ORDER BY
        CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
        a.detected_at DESC
      LIMIT 10
    `.execute(db);

    // 3. Risk score — weighted based on anomaly severity
    const activeCount = (summaryResult.rows[0] as any)?.activeCount ?? 0;
    const criticalCount = (summaryResult.rows[0] as any)?.criticalCount ?? 0;
    const warningCount = (summaryResult.rows[0] as any)?.warningCount ?? 0;
    const riskScore = criticalCount > 0 ? "HIGH" :
                      warningCount >= 3 ? "MEDIUM" :
                      activeCount > 0 ? "LOW" : "NONE";

    // 4. Baseline health — how many accounts have baselines
    const baselineHealth = await sql<Record<string, number>>`
      SELECT
        count(DISTINCT b.account_id)::int AS "accountsWithBaseline",
        count(DISTINCT c.id)::int AS "totalAccounts"
      FROM fin.chart_of_accounts c
      LEFT JOIN fin.atlas_anomaly_baseline b
        ON b.account_id = c.id
        AND b.tenant_id = c.tenant_id
        AND b.entity_code = ${entityCode}
      WHERE c.tenant_id = ${tenantUuid}::uuid
        AND c.entity_code = ${entityCode}
    `.execute(db);

    // 5. Atlas risk signals (from close_risk_signal linked via atlas_anomaly rules)
    const atlasSignals = await sql<Record<string, unknown>>`
      SELECT
        rs.id,
        rs.rule_code AS "ruleCode",
        rs.severity,
        rs.signal_state AS "signalState",
        rs.title,
        rs.fired_at AS "firedAt"
      FROM fin.close_risk_signal rs
      WHERE rs.tenant_id = ${tenantUuid}::uuid
        AND rs.entity_code = ${entityCode}
        AND rs.fiscal_year = ${fy}
        AND rs.period_number = ${pn}
        AND rs.rule_type = 'atlas_anomaly'
        AND rs.signal_state IN ('fired', 'acknowledged')
      ORDER BY rs.fired_at DESC
      LIMIT 5
    `.execute(db);

    // 6. Predictions + close/recon context for recommendations
    const [closeDuration, releaseReadiness, reconCompletion, closeProgress, reconStatus, glConsistency, riskSignalCounts] = await Promise.all([
      computeCloseDurationPrediction(db, tenantUuid, entityCode, fy, pn),
      computeReleaseReadinessPrediction(db, tenantUuid, entityCode, fy, pn),
      computeReconCompletionPrediction(db, tenantUuid, entityCode, fy, pn),
      computeCloseProgress(db, tenantUuid, entityCode, fy, pn),
      computeReconStatus(db, tenantUuid, entityCode, fy, pn),
      computeGlConsistency(db, tenantUuid, entityCode, fy, pn),
      computeRiskSignalCounts(db, tenantUuid, entityCode, fy, pn),
    ]);

    // 7. Narratives (dashboard summary + CFO brief)
    const narratives = generateDashboardNarratives(
      entityCode, fy, pn, summaryResult.rows[0] as any, riskScore,
      topAnomalies.rows as any[], { closeDuration, releaseReadiness },
    );

    // 8. Recommendations (deterministic, advisory)
    const recommendations = generateDashboardRecommendations({
      entityCode, fiscalYear: fy, periodNumber: pn,
      periodLabel: `${pn >= 1 && pn <= 12 ? MONTH_NAMES[pn - 1] : `P${pn}`} ${fy}`,
      anomalySummary: {
        activeCount, criticalCount, warningCount,
        infoCount: Number((summaryResult.rows[0] as any)?.infoCount ?? 0),
        resolvedCount: Number((summaryResult.rows[0] as any)?.resolvedCount ?? 0),
        totalCount: Number((summaryResult.rows[0] as any)?.totalCount ?? 0),
      },
      topAnomalies: (topAnomalies.rows as any[]).map((a: any) => ({
        anomalyType: a.anomalyType, severity: a.severity, title: a.title,
        accountCode: a.accountCode ?? null, zScore: a.zScore ?? null,
        observedValue: a.observedValue ?? null, expectedValue: a.expectedValue ?? null,
      })),
      riskScore,
      closeProgress,
      predictions: {
        closeDuration,
        releaseReadiness,
        reconCompletion: reconStatus.totalSessions > 0 ? {
          sessionsRemaining: reconStatus.totalSessions - reconStatus.completedSessions,
          totalSessions: reconStatus.totalSessions,
          completedSessions: reconStatus.completedSessions,
        } : null,
      },
      riskSignals: riskSignalCounts,
      reconStatus,
      consistency: glConsistency,
    });

    // 9. Composite risk score (numeric, with driver breakdown)
    const compositeRisk = computeCompositeRiskScore({
      criticalAnomalies: criticalCount,
      warningAnomalies: warningCount,
      activeRiskSignals: riskSignalCounts.activeCount,
      highCriticalSignals: riskSignalCounts.highCriticalCount,
      reconRemaining: reconStatus.totalSessions - reconStatus.completedSessions,
      failedTasks: closeProgress.failedTasks,
      blockedTasks: closeProgress.blockedTasks,
      glImbalanced: !glConsistency.balanced,
    });

    const _tTotal = performance.now();
    const result = {
      summary: summaryResult.rows[0],
      riskScore,
      compositeRisk,
      topAnomalies: topAnomalies.rows,
      baselineHealth: baselineHealth.rows[0],
      atlasSignals: atlasSignals.rows,
      predictions: {
        closeDuration,
        releaseReadiness,
        reconCompletion,
        computedAt: new Date().toISOString(),
      },
      narratives,
      recommendations,
      _profiling: {
        totalMs: Math.round(_tTotal - _t0),
      },
    };

    _dashboardCache.set(cacheKey, { data: result, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });

    return successResponse(result, 200, {
      "X-Atlas-Cache": "MISS",
      "Cache-Control": "private, max-age=60",
    });
  } catch (err) {
    console.error("[atlas/dashboard] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to fetch dashboard");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Prediction helpers (lightweight inline — shared logic with /api/fin/atlas/predictions)
// ---------------------------------------------------------------------------

async function computeCloseDurationPrediction(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
) {
  try {
    const histResult = await sql<{ closeDays: string }>`
      SELECT EXTRACT(EPOCH FROM (
        COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) - cr.started_at
      )) / 86400.0 AS "closeDays"
      FROM fin.close_run cr
      WHERE cr.tenant_id = ${tenantUuid}::uuid AND cr.entity_code = ${entityCode}
        AND cr.status IN ('SOFT_CLOSED', 'HARD_CLOSED')
        AND cr.started_at IS NOT NULL
        AND COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) IS NOT NULL
        AND NOT (cr.fiscal_year = ${fiscalYear} AND cr.period_number = ${periodNumber})
      ORDER BY cr.fiscal_year DESC, cr.period_number DESC LIMIT 12
    `.execute(db);

    if (histResult.rows.length < 2) return null;

    const histDays = histResult.rows.map((r: any) => Number(r.closeDays));
    const avgDays = histDays.reduce((a, b) => a + b, 0) / histDays.length;
    const stddev = Math.sqrt(histDays.reduce((s, d) => s + (d - avgDays) ** 2, 0) / histDays.length);
    const cv = avgDays > 0 ? stddev / avgDays : 1;

    return {
      expectedCloseDays: avgDays.toFixed(1),
      confidencePercent: Math.round(Math.max(30, Math.min(95, 85 - cv * 50 + Math.min(histDays.length, 6) * 2))),
      historicalAvgDays: avgDays.toFixed(1),
    };
  } catch { return null; }
}

async function computeReleaseReadinessPrediction(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
) {
  try {
    const taskResult = await sql<Record<string, number>>`
      SELECT
        COUNT(*)::int AS "total",
        COUNT(*) FILTER (WHERE task_status IN ('COMPLETED', 'WAIVED'))::int AS "done",
        COUNT(*) FILTER (WHERE task_status = 'FAILED')::int AS "failed"
      FROM fin.period_close_checklist
      WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear} AND period_number = ${periodNumber}
    `.execute(db);

    const t = taskResult.rows[0] as any;
    const total = Number(t?.total ?? 0);
    const done = Number(t?.done ?? 0);
    const failed = Number(t?.failed ?? 0);
    const rate = total > 0 ? done / total : 0;

    let prob = rate;
    const blockers: string[] = [];
    if (failed > 0) { blockers.push(`${failed} failed task(s)`); prob *= 0.3; }

    return {
      probability: Math.round(prob * 100) / 100,
      confidencePercent: total > 0 ? Math.min(90, 60 + total * 2) : 30,
      blockers,
    };
  } catch { return null; }
}

async function computeReconCompletionPrediction(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
) {
  try {
    const result = await sql<Record<string, unknown>>`
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

    const r = result.rows[0] as any;
    const total = Number(r?.total ?? 0);
    const completed = Number(r?.completed ?? 0);
    if (total === 0) return null;

    return {
      sessionsRemaining: total - completed,
      totalSessions: total,
      completedSessions: completed,
    };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Narrative helpers (lightweight dashboard + CFO brief)
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function generateDashboardNarratives(
  entityCode: string, fy: number, pn: number,
  summary: any, riskScore: string, topAnomalies: any[],
  predictions: { closeDuration: any; releaseReadiness: any },
) {
  const monthName = pn >= 1 && pn <= 12 ? MONTH_NAMES[pn - 1] : `P${pn}`;
  const periodLabel = `${monthName} ${fy}`;
  const activeCount = Number(summary?.activeCount ?? 0);
  const criticalCount = Number(summary?.criticalCount ?? 0);
  const warningCount = Number(summary?.warningCount ?? 0);

  // Dashboard summary
  const healthWord = riskScore === "HIGH" ? "elevated risk" :
                     riskScore === "MEDIUM" ? "moderate risk" :
                     riskScore === "LOW" ? "low risk" : "healthy";
  const parts: string[] = [`${entityCode} ${periodLabel} is in ${healthWord} status.`];

  if (activeCount > 0) {
    const severities: string[] = [];
    if (criticalCount > 0) severities.push(`${criticalCount} critical`);
    if (warningCount > 0) severities.push(`${warningCount} warning`);
    parts.push(`Atlas detected ${activeCount} active ${activeCount === 1 ? "anomaly" : "anomalies"} (${severities.join(", ")}).`);
  } else {
    parts.push("No active anomalies detected.");
  }

  if (predictions.releaseReadiness) {
    parts.push(`Release readiness is at ${Math.round(predictions.releaseReadiness.probability * 100)}%.`);
  }

  if (predictions.closeDuration) {
    parts.push(`Expected close duration: ${predictions.closeDuration.expectedCloseDays} days.`);
  }

  const dashboardSummary = parts.join(" ");

  // CFO brief — numbered bullets
  const bullets: string[] = [];
  const statusWord = riskScore === "NONE" ? "On track" :
                     riskScore === "LOW" ? "Minor items noted" :
                     riskScore === "MEDIUM" ? "Attention needed" : "Immediate attention required";
  bullets.push(`${entityCode} ${periodLabel}: ${statusWord}.`);

  if (predictions.releaseReadiness) {
    const pct = Math.round(predictions.releaseReadiness.probability * 100);
    let relText = `Release readiness: ${pct}%`;
    if (predictions.releaseReadiness.blockers?.length > 0) {
      relText += ` — ${predictions.releaseReadiness.blockers.length} blocker(s)`;
    }
    bullets.push(relText + ".");
  }

  if (predictions.closeDuration) {
    bullets.push(`Expected close: ${predictions.closeDuration.expectedCloseDays} days.`);
  }

  const critAnomaly = topAnomalies.find((a: any) => a.severity === "CRITICAL");
  if (critAnomaly) {
    bullets.push(`Top concern: ${critAnomaly.title}${critAnomaly.accountCode ? ` (${critAnomaly.accountCode})` : ""}.`);
  }

  const cfoBrief = bullets.map((b, i) => `${i + 1}. ${b}`).join("\n");

  const totalCount = Number(summary?.totalCount ?? 0);
  const predictionsAvailable = (predictions.closeDuration ? 1 : 0) + (predictions.releaseReadiness ? 1 : 0);
  const signalCount = (totalCount > 0 ? 1 : 0) + (predictionsAvailable > 0 ? 1 : 0);

  return {
    dashboardSummary,
    cfoBrief,
    generatedAt: new Date().toISOString(),
    provider: "template",
    provenance: {
      deterministic: true,
      completeness: signalCount >= 2 ? "full" : signalCount >= 1 ? "partial" : "minimal",
      sourceCounts: {
        anomalies: totalCount,
        predictionsAvailable,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Additional queries for recommendations context
// ---------------------------------------------------------------------------

async function computeCloseProgress(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  try {
    const result = await sql<Record<string, unknown>>`
      SELECT
        COUNT(*)::int AS "totalTasks",
        COUNT(*) FILTER (WHERE cc.task_status IN ('COMPLETED', 'WAIVED'))::int AS "completedTasks",
        COUNT(*) FILTER (WHERE cc.task_status = 'FAILED')::int AS "failedTasks",
        COUNT(*) FILTER (WHERE cc.task_status = 'BLOCKED')::int AS "blockedTasks",
        EXTRACT(EPOCH FROM (now() - MIN(cr.started_at))) / 86400.0 AS "elapsedDays",
        MIN(cr.status) AS "closeStatus"
      FROM fin.period_close_checklist cc
      LEFT JOIN fin.close_run cr ON cr.tenant_id = cc.tenant_id
        AND cr.entity_code = cc.entity_code AND cr.fiscal_year = cc.fiscal_year
        AND cr.period_number = cc.period_number
      WHERE cc.tenant_id = ${tenantUuid}::uuid AND cc.entity_code = ${entityCode}
        AND cc.fiscal_year = ${fy} AND cc.period_number = ${pn}
    `.execute(db);
    const r = result.rows[0] as any ?? {};
    return {
      totalTasks: Number(r.totalTasks ?? 0), completedTasks: Number(r.completedTasks ?? 0),
      failedTasks: Number(r.failedTasks ?? 0), blockedTasks: Number(r.blockedTasks ?? 0),
      elapsedDays: r.elapsedDays != null ? Number(r.elapsedDays) : null,
      closeStatus: (r.closeStatus as string) ?? null,
    };
  } catch { return { totalTasks: 0, completedTasks: 0, failedTasks: 0, blockedTasks: 0, elapsedDays: null, closeStatus: null }; }
}

async function computeReconStatus(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  try {
    const result = await sql<Record<string, number>>`
      SELECT COUNT(*)::int AS "totalSessions",
        COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS "completedSessions"
      FROM fin.reconciliation_session rs
      JOIN fin.bank_statement bs ON bs.id = rs.statement_id
      WHERE rs.tenant_id = ${tenantUuid}::uuid AND bs.entity_code = ${entityCode}
        AND EXISTS (SELECT 1 FROM fin.fiscal_period fp
          WHERE fp.tenant_id = ${tenantUuid}::uuid AND fp.entity_code = ${entityCode}
            AND fp.fiscal_year = ${fy} AND fp.period_number = ${pn}
            AND bs.statement_date BETWEEN fp.start_date AND fp.end_date)
    `.execute(db);
    const r = result.rows[0] as any ?? {};
    const total = Number(r.totalSessions ?? 0);
    const completed = Number(r.completedSessions ?? 0);
    return { totalSessions: total, completedSessions: completed, isComplete: total === 0 || completed === total };
  } catch { return { totalSessions: 0, completedSessions: 0, isComplete: true }; }
}

async function computeGlConsistency(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  try {
    const result = await sql<{ balanced: boolean }>`
      SELECT COALESCE(SUM(total_debit), 0) = COALESCE(SUM(total_credit), 0) AS balanced
      FROM fin.journal_entry WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
        AND fiscal_year = ${fy} AND period_number = ${pn} AND status = 'POSTED'
    `.execute(db);
    return { balanced: result.rows[0]?.balanced ?? true };
  } catch { return { balanced: true }; }
}

async function computeRiskSignalCounts(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  try {
    const result = await sql<Record<string, number>>`
      SELECT COUNT(*)::int AS "activeCount",
        COUNT(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS "highCriticalCount",
        COUNT(*) FILTER (WHERE rule_type = 'atlas_anomaly')::int AS "atlasSignalCount"
      FROM fin.close_risk_signal
      WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
        AND fiscal_year = ${fy} AND period_number = ${pn}
        AND signal_state IN ('fired', 'acknowledged')
    `.execute(db);
    const r = result.rows[0] as any ?? {};
    return {
      activeCount: Number(r.activeCount ?? 0),
      highCriticalCount: Number(r.highCriticalCount ?? 0),
      atlasSignalCount: Number(r.atlasSignalCount ?? 0),
    };
  } catch { return { activeCount: 0, highCriticalCount: 0, atlasSignalCount: 0 }; }
}

// ---------------------------------------------------------------------------
// Composite risk score — weighted numeric score (0–100)
// ---------------------------------------------------------------------------

interface CompositeRiskInput {
  criticalAnomalies: number;
  warningAnomalies: number;
  activeRiskSignals: number;
  highCriticalSignals: number;
  reconRemaining: number;
  failedTasks: number;
  blockedTasks: number;
  glImbalanced: boolean;
}

interface CompositeRiskDriver {
  source: string;
  label: string;
  points: number;
  count: number;
}

function computeCompositeRiskScore(input: CompositeRiskInput) {
  const drivers: CompositeRiskDriver[] = [];
  let total = 0;

  // Critical anomalies: 15 pts each (max 45)
  if (input.criticalAnomalies > 0) {
    const pts = Math.min(45, input.criticalAnomalies * 15);
    drivers.push({ source: "anomaly", label: "Critical anomalies", points: pts, count: input.criticalAnomalies });
    total += pts;
  }
  // Warning anomalies: 5 pts each (max 20)
  if (input.warningAnomalies > 0) {
    const pts = Math.min(20, input.warningAnomalies * 5);
    drivers.push({ source: "anomaly", label: "Warning anomalies", points: pts, count: input.warningAnomalies });
    total += pts;
  }
  // High/critical risk signals: 8 pts each (max 24)
  if (input.highCriticalSignals > 0) {
    const pts = Math.min(24, input.highCriticalSignals * 8);
    drivers.push({ source: "risk_signal", label: "High/critical risk signals", points: pts, count: input.highCriticalSignals });
    total += pts;
  }
  // Other active risk signals: 3 pts each (max 12)
  const otherSignals = input.activeRiskSignals - input.highCriticalSignals;
  if (otherSignals > 0) {
    const pts = Math.min(12, otherSignals * 3);
    drivers.push({ source: "risk_signal", label: "Active risk signals", points: pts, count: otherSignals });
    total += pts;
  }
  // Outstanding reconciliations: 5 pts each (max 15)
  if (input.reconRemaining > 0) {
    const pts = Math.min(15, input.reconRemaining * 5);
    drivers.push({ source: "reconciliation", label: "Outstanding reconciliations", points: pts, count: input.reconRemaining });
    total += pts;
  }
  // Failed close tasks: 8 pts each (max 16)
  if (input.failedTasks > 0) {
    const pts = Math.min(16, input.failedTasks * 8);
    drivers.push({ source: "close_task", label: "Failed close tasks", points: pts, count: input.failedTasks });
    total += pts;
  }
  // Blocked close tasks: 4 pts each (max 12)
  if (input.blockedTasks > 0) {
    const pts = Math.min(12, input.blockedTasks * 4);
    drivers.push({ source: "close_task", label: "Blocked close tasks", points: pts, count: input.blockedTasks });
    total += pts;
  }
  // GL imbalance: 20 pts (binary)
  if (input.glImbalanced) {
    drivers.push({ source: "gl_balance", label: "GL imbalance detected", points: 20, count: 1 });
    total += 20;
  }

  const score = Math.min(100, total);
  const level = score >= 70 ? "HIGH" as const :
                score >= 40 ? "MEDIUM" as const :
                score > 0 ? "LOW" as const : "NONE" as const;

  return {
    score,
    level,
    drivers: drivers.sort((a, b) => b.points - a.points),
    maxPossible: 100,
  };
}

// ---------------------------------------------------------------------------
// Recommendation generator (inline, deterministic)
// ---------------------------------------------------------------------------

interface RecInput {
  entityCode: string; fiscalYear: number; periodNumber: number; periodLabel: string;
  anomalySummary: { activeCount: number; criticalCount: number; warningCount: number; infoCount: number; resolvedCount: number; totalCount: number };
  topAnomalies: Array<{ anomalyType: string; severity: string; title: string; accountCode: string | null; zScore: string | null; observedValue: string | null; expectedValue: string | null }>;
  riskScore: string;
  closeProgress: { totalTasks: number; completedTasks: number; failedTasks: number; blockedTasks: number; elapsedDays: number | null; closeStatus: string | null };
  predictions: { closeDuration: any; releaseReadiness: any; reconCompletion: any };
  riskSignals: { activeCount: number; highCriticalCount: number; atlasSignalCount: number };
  reconStatus: { totalSessions: number; completedSessions: number; isComplete: boolean };
  consistency: { balanced: boolean };
}

interface Rec {
  key: string;
  type: string;
  priority: string;
  title: string;
  rationale: string;
  suggestedOwnerRole: string;
  linkedEvidence: Array<{ evidenceType: string; label: string; referenceId: string | null; detail: string | null }>;
  estimatedImpact: string | null;
}

const ANOMALY_GUIDANCE: Record<string, string> = {
  AMOUNT_OUTLIER: "Review account balance and recent journal entries for unusual postings.",
  UNUSUAL_ADJUSTMENT: "Check adjustment entries for proper approval and supporting documentation.",
  RECON_VARIANCE: "Investigate reconciliation discrepancy and ensure bank and GL balances align.",
  OVERRIDE_SPIKE: "Elevated waiver/override activity may indicate process gaps. Escalate to Controller.",
  MANUAL_JOURNAL_RATIO: "High proportion of manual entries increases error risk. Verify against source documents.",
  LARGE_ADJUSTMENT: "Large single adjustments flagged for size. Verify amount and authorization.",
};

function generateDashboardRecommendations(input: RecInput): { items: Rec[]; computedAt: string; provenance: Record<string, unknown> } {
  const recs: Rec[] = [];

  // Anomaly response
  for (const a of input.topAnomalies) {
    if (a.severity === "CRITICAL") {
      recs.push({
        key: `anomaly:critical:${a.anomalyType}:${a.accountCode ?? "global"}`,
        type: "ANOMALY_RESPONSE", priority: "CRITICAL",
        title: `Resolve ${a.title}`,
        rationale: ANOMALY_GUIDANCE[a.anomalyType] ?? `${a.anomalyType} anomaly detected.`,
        suggestedOwnerRole: a.anomalyType === "OVERRIDE_SPIKE" ? "CONTROLLER" : "ACCOUNTANT",
        linkedEvidence: [{ evidenceType: "anomaly", label: a.title, referenceId: null, detail: a.zScore ? `z-score: ${a.zScore}` : null }],
        estimatedImpact: "Blocks EXCEPTION_SIGNOFF gate until resolved or acknowledged.",
      });
    } else if (a.severity === "WARNING") {
      recs.push({
        key: `anomaly:warning:${a.anomalyType}:${a.accountCode ?? "global"}`,
        type: "ANOMALY_RESPONSE", priority: "HIGH",
        title: `Review ${a.title}`,
        rationale: ANOMALY_GUIDANCE[a.anomalyType] ?? `${a.anomalyType} anomaly detected.`,
        suggestedOwnerRole: a.anomalyType === "RECON_VARIANCE" ? "RECONCILIATION_ANALYST" : "ACCOUNTANT",
        linkedEvidence: [{ evidenceType: "anomaly", label: a.title, referenceId: null, detail: a.zScore ? `z-score: ${a.zScore}` : null }],
        estimatedImpact: "May escalate to a close risk signal if unresolved.",
      });
    }
  }

  // GL imbalance
  if (!input.consistency.balanced) {
    recs.push({
      key: "gate:gl_consistency", type: "RELEASE_GATE", priority: "CRITICAL",
      title: "Resolve GL debit/credit imbalance before certification",
      rationale: "GL consistency check is failing. This is a hard blocker for release certification.",
      suggestedOwnerRole: "ACCOUNTANT",
      linkedEvidence: [{ evidenceType: "gl_consistency", label: "GL debit/credit imbalance detected", referenceId: null, detail: null }],
      estimatedImpact: "Release certification will fail until resolved.",
    });
  }

  // Failed close tasks
  if (input.closeProgress.failedTasks > 0) {
    recs.push({
      key: "gate:failed_tasks", type: "RELEASE_GATE", priority: "HIGH",
      title: `Resolve ${input.closeProgress.failedTasks} failed close ${input.closeProgress.failedTasks === 1 ? "task" : "tasks"}`,
      rationale: "Failed close tasks reduce release readiness. Investigate and resolve or request waivers.",
      suggestedOwnerRole: "CLOSE_MANAGER",
      linkedEvidence: [{ evidenceType: "close_task", label: `${input.closeProgress.failedTasks} failed tasks`, referenceId: null, detail: `${input.closeProgress.completedTasks}/${input.closeProgress.totalTasks} tasks complete` }],
      estimatedImpact: input.predictions.releaseReadiness ? `Release readiness at ${Math.round(input.predictions.releaseReadiness.probability * 100)}%.` : null,
    });
  }

  // Incomplete reconciliation
  if (!input.reconStatus.isComplete && input.reconStatus.totalSessions > 0) {
    const remaining = input.reconStatus.totalSessions - input.reconStatus.completedSessions;
    recs.push({
      key: `recon:incomplete:${remaining}`, type: "RECON_FOLLOWUP", priority: remaining >= 3 ? "HIGH" : "MEDIUM",
      title: `Complete ${remaining} outstanding reconciliation ${remaining === 1 ? "session" : "sessions"}`,
      rationale: `${input.reconStatus.completedSessions} of ${input.reconStatus.totalSessions} sessions complete.`,
      suggestedOwnerRole: "RECONCILIATION_ANALYST",
      linkedEvidence: [{ evidenceType: "recon_session", label: `${remaining} sessions remaining`, referenceId: null, detail: null }],
      estimatedImpact: remaining >= 3 ? "Significant release delay likely." : null,
    });
  }

  // Close duration above baseline
  if (input.predictions.closeDuration) {
    const delta = Number(input.predictions.closeDuration.expectedCloseDays) - Number(input.predictions.closeDuration.historicalAvgDays);
    if (delta >= 1.0) {
      recs.push({
        key: "duration:above_baseline", type: "CLOSE_DURATION", priority: "MEDIUM",
        title: `Close duration ${delta.toFixed(1)} days above baseline — review bottlenecks`,
        rationale: `Expected ${input.predictions.closeDuration.expectedCloseDays} days vs ${input.predictions.closeDuration.historicalAvgDays}-day average.`,
        suggestedOwnerRole: "CLOSE_MANAGER",
        linkedEvidence: [{ evidenceType: "prediction", label: `Expected close: ${input.predictions.closeDuration.expectedCloseDays} days`, referenceId: null, detail: null }],
        estimatedImpact: `Expected release delay: ${delta.toFixed(1)} days beyond normal.`,
      });
    }
  }

  // High/critical risk signals
  if (input.riskSignals.highCriticalCount > 0) {
    recs.push({
      key: `risk:high_critical:${input.riskSignals.highCriticalCount}`, type: "RISK_MITIGATION", priority: "HIGH",
      title: `Address ${input.riskSignals.highCriticalCount} high/critical risk ${input.riskSignals.highCriticalCount === 1 ? "signal" : "signals"}`,
      rationale: "Active high or critical risk signals may block release gates.",
      suggestedOwnerRole: "CONTROLLER",
      linkedEvidence: [{ evidenceType: "risk_signal", label: `${input.riskSignals.highCriticalCount} signals`, referenceId: null, detail: null }],
      estimatedImpact: "May block release certification.",
    });
  }

  // Sort: CRITICAL > HIGH > MEDIUM > LOW
  const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  recs.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));

  // Build evidence keys — deduplicated, sorted
  const evidenceKeys = Array.from(new Set(
    recs.flatMap(r => r.linkedEvidence.map(ev => {
      const ref = ev.referenceId ?? r.key;
      return `${ev.evidenceType.toUpperCase()}:${ref}`;
    })),
  )).sort();

  // Recommendation hash — djb2 fingerprint
  const hashInput = [
    input.entityCode,
    String(input.fiscalYear),
    String(input.periodNumber),
    ...recs.map(r => `${r.type}:${r.key}`).sort(),
  ].join("|");
  let hash = 5381;
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) + hash + hashInput.charCodeAt(i)) >>> 0;
  }

  const now = new Date().toISOString();
  return {
    items: recs,
    provenance: {
      generator: "atlas.recommendation.deterministic" as const,
      generatorVersion: "1.0.0",
      deterministic: true as const,
      evidenceCount: recs.reduce((n, r) => n + r.linkedEvidence.length, 0),
      evidenceKeys,
      recommendationHash: hash.toString(16).padStart(8, "0"),
      generatedAt: now,
    },
    computedAt: now,
  };
}
