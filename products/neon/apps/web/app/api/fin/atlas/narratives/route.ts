/**
 * Atlas Narratives API
 *
 * GET /api/fin/atlas/narratives?entityCode=ACME&fiscalYear=2026&periodNumber=3
 *   → Generate all narrative types (or specific ones via &types=DASHBOARD_SUMMARY,CFO_BRIEF)
 *
 * Optional query params:
 *   types — comma-separated list of narrative types to generate
 *           Valid: DASHBOARD_SUMMARY, RELEASE_SUMMARY, ANOMALY_EXPLANATION, CFO_BRIEF
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

const VALID_TYPES = new Set([
  "DASHBOARD_SUMMARY",
  "RELEASE_SUMMARY",
  "ANOMALY_EXPLANATION",
  "CFO_BRIEF",
]);

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
    const typesParam = url.searchParams.get("types");

    if (!entityCode || !fiscalYear || !periodNumber) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }

    const fy = Number(fiscalYear);
    const pn = Number(periodNumber);

    // Parse requested types
    let requestedTypes: string[] | undefined;
    if (typesParam) {
      requestedTypes = typesParam.split(",").map(t => t.trim());
      const invalid = requestedTypes.filter(t => !VALID_TYPES.has(t));
      if (invalid.length > 0) {
        return errorResponse("VALIDATION", `Invalid narrative types: ${invalid.join(", ")}`, 400);
      }
    }

    // Gather all data in parallel
    const [
      anomalySummary,
      topAnomalies,
      closeProgress,
      riskSignals,
      reconStatus,
      consistency,
      closeDuration,
    ] = await Promise.all([
      queryAnomalySummary(db, tenantUuid, entityCode, fy, pn),
      queryTopAnomalies(db, tenantUuid, entityCode, fy, pn),
      queryCloseProgress(db, tenantUuid, entityCode, fy, pn),
      queryRiskSignals(db, tenantUuid, entityCode, fy, pn),
      queryReconStatus(db, tenantUuid, entityCode, fy, pn),
      queryConsistency(db, tenantUuid, entityCode, fy, pn),
      queryCloseDuration(db, tenantUuid, entityCode, fy, pn),
    ]);

    // Release readiness (depends on closeProgress)
    const releaseReadiness = computeReleaseReadiness(closeProgress);

    // Build narrative input
    const riskScore = anomalySummary.criticalCount > 0 ? "HIGH" :
                      anomalySummary.warningCount >= 3 ? "MEDIUM" :
                      anomalySummary.activeCount > 0 ? "LOW" : "NONE";

    const MONTH_NAMES = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const monthName = pn >= 1 && pn <= 12 ? MONTH_NAMES[pn - 1] : `P${pn}`;
    const periodLabel = `${monthName} ${fy}`;

    const narrativeInput = {
      entityCode,
      fiscalYear: fy,
      periodNumber: pn,
      periodLabel,
      anomalySummary,
      topAnomalies,
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
      riskSignals,
      reconStatus,
      consistency,
    };

    // Compute provenance
    const predictionsAvailable =
      (closeDuration ? 1 : 0) +
      (releaseReadiness ? 1 : 0) +
      (reconStatus.totalSessions > 0 ? 1 : 0);
    const signalCount =
      (anomalySummary.totalCount > 0 ? 1 : 0) +
      (closeProgress.totalTasks > 0 ? 1 : 0) +
      (reconStatus.totalSessions > 0 ? 1 : 0) +
      (predictionsAvailable > 0 ? 1 : 0);
    const provenance = {
      provider: "template" as const,
      deterministic: true,
      completeness: (signalCount >= 3 ? "full" : signalCount >= 1 ? "partial" : "minimal") as "full" | "partial" | "minimal",
      sourceCounts: {
        anomalies: anomalySummary.totalCount,
        closeTasksTotal: closeProgress.totalTasks,
        riskSignals: riskSignals.activeCount,
        reconSessions: reconStatus.totalSessions,
        predictionsAvailable,
      },
    };

    const anomalyProvenance = {
      provider: "template" as const,
      deterministic: true,
      completeness: "full" as const,
      sourceCounts: { anomalies: 1, closeTasksTotal: 0, riskSignals: 0, reconSessions: 0, predictionsAvailable: 0 },
    };

    // Generate narratives
    const typesToGenerate = requestedTypes ?? ["DASHBOARD_SUMMARY", "RELEASE_SUMMARY", "ANOMALY_EXPLANATION", "CFO_BRIEF"];
    const narratives: Array<{ type: string; text: string; generatedAt: string; provider: string; provenance: typeof provenance }> = [];
    const now = new Date().toISOString();

    for (const type of typesToGenerate) {
      if (type === "ANOMALY_EXPLANATION") {
        for (const anomaly of topAnomalies.slice(0, 5)) {
          narratives.push({
            type: "ANOMALY_EXPLANATION",
            text: renderAnomalyExplanation(anomaly),
            generatedAt: now,
            provider: "template",
            provenance: anomalyProvenance,
          });
        }
        continue;
      }

      const text =
        type === "DASHBOARD_SUMMARY" ? renderDashboardSummary(narrativeInput) :
        type === "RELEASE_SUMMARY" ? renderReleaseSummary(narrativeInput) :
        type === "CFO_BRIEF" ? renderCfoBrief(narrativeInput) : null;

      if (text) {
        narratives.push({ type, text, generatedAt: now, provider: "template", provenance });
      }
    }

    return successResponse({
      entityCode,
      fiscalYear: fy,
      periodNumber: pn,
      narratives,
    });
  } catch (err) {
    console.error("[atlas/narratives] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to generate narratives");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Data queries
// ---------------------------------------------------------------------------

async function queryAnomalySummary(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<Record<string, number>>`
    SELECT
      count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED'))::int AS "activeCount",
      count(*) FILTER (WHERE severity = 'CRITICAL' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "criticalCount",
      count(*) FILTER (WHERE severity = 'WARNING' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "warningCount",
      count(*) FILTER (WHERE severity = 'INFO' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "infoCount",
      count(*) FILTER (WHERE status = 'RESOLVED')::int AS "resolvedCount",
      count(*)::int AS "totalCount"
    FROM fin.atlas_anomaly
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fy} AND period_number = ${pn}
  `.execute(db);
  const r = result.rows[0] as any ?? {};
  return {
    activeCount: Number(r.activeCount ?? 0),
    criticalCount: Number(r.criticalCount ?? 0),
    warningCount: Number(r.warningCount ?? 0),
    infoCount: Number(r.infoCount ?? 0),
    resolvedCount: Number(r.resolvedCount ?? 0),
    totalCount: Number(r.totalCount ?? 0),
  };
}

async function queryTopAnomalies(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT
      a.anomaly_type AS "anomalyType",
      a.severity,
      a.title,
      c.account_code AS "accountCode",
      a.z_score::text AS "zScore",
      a.observed_value::text AS "observedValue",
      a.expected_value::text AS "expectedValue"
    FROM fin.atlas_anomaly a
    LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
    WHERE a.tenant_id = ${tenantUuid}::uuid AND a.entity_code = ${entityCode}
      AND a.fiscal_year = ${fy} AND a.period_number = ${pn}
      AND a.status IN ('OPEN', 'ACKNOWLEDGED')
    ORDER BY
      CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
      a.detected_at DESC
    LIMIT 10
  `.execute(db);
  return result.rows.map((r: any) => ({
    anomalyType: r.anomalyType as string,
    severity: r.severity as string,
    title: r.title as string,
    accountCode: (r.accountCode as string) ?? null,
    zScore: (r.zScore as string) ?? null,
    observedValue: (r.observedValue as string) ?? null,
    expectedValue: (r.expectedValue as string) ?? null,
  }));
}

async function queryCloseProgress(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT
      COUNT(*)::int AS "totalTasks",
      COUNT(*) FILTER (WHERE cc.task_status IN ('COMPLETED', 'WAIVED'))::int AS "completedTasks",
      COUNT(*) FILTER (WHERE cc.task_status = 'FAILED')::int AS "failedTasks",
      COUNT(*) FILTER (WHERE cc.task_status = 'BLOCKED')::int AS "blockedTasks",
      EXTRACT(EPOCH FROM (now() - MIN(cr.started_at))) / 86400.0 AS "elapsedDays",
      MIN(cr.status) AS "closeStatus"
    FROM fin.period_close_checklist cc
    LEFT JOIN fin.close_run cr
      ON cr.tenant_id = cc.tenant_id
      AND cr.entity_code = cc.entity_code
      AND cr.fiscal_year = cc.fiscal_year
      AND cr.period_number = cc.period_number
    WHERE cc.tenant_id = ${tenantUuid}::uuid AND cc.entity_code = ${entityCode}
      AND cc.fiscal_year = ${fy} AND cc.period_number = ${pn}
  `.execute(db);
  const r = result.rows[0] as any ?? {};
  return {
    totalTasks: Number(r.totalTasks ?? 0),
    completedTasks: Number(r.completedTasks ?? 0),
    failedTasks: Number(r.failedTasks ?? 0),
    blockedTasks: Number(r.blockedTasks ?? 0),
    elapsedDays: r.elapsedDays != null ? Number(r.elapsedDays) : null,
    closeStatus: (r.closeStatus as string) ?? null,
  };
}

async function queryRiskSignals(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<Record<string, number>>`
    SELECT
      COUNT(*)::int AS "activeCount",
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
}

async function queryReconStatus(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<Record<string, number>>`
    SELECT
      COUNT(*)::int AS "totalSessions",
      COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS "completedSessions"
    FROM fin.reconciliation_session rs
    JOIN fin.bank_statement bs ON bs.id = rs.statement_id
    WHERE rs.tenant_id = ${tenantUuid}::uuid AND bs.entity_code = ${entityCode}
      AND EXISTS (
        SELECT 1 FROM fin.fiscal_period fp
        WHERE fp.tenant_id = ${tenantUuid}::uuid AND fp.entity_code = ${entityCode}
          AND fp.fiscal_year = ${fy} AND fp.period_number = ${pn}
          AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
      )
  `.execute(db);
  const r = result.rows[0] as any ?? {};
  const total = Number(r.totalSessions ?? 0);
  const completed = Number(r.completedSessions ?? 0);
  return { totalSessions: total, completedSessions: completed, isComplete: total === 0 || completed === total };
}

async function queryConsistency(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<{ balanced: boolean }>`
    SELECT COALESCE(SUM(total_debit), 0) = COALESCE(SUM(total_credit), 0) AS balanced
    FROM fin.journal_entry
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fy} AND period_number = ${pn} AND status = 'POSTED'
  `.execute(db);
  return { balanced: result.rows[0]?.balanced ?? true };
}

async function queryCloseDuration(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
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
        AND NOT (cr.fiscal_year = ${fy} AND cr.period_number = ${pn})
      ORDER BY cr.fiscal_year DESC, cr.period_number DESC LIMIT 12
    `.execute(db);

    if (histResult.rows.length < 2) return null;
    const days = histResult.rows.map((r: any) => Number(r.closeDays));
    const avg = days.reduce((a, b) => a + b, 0) / days.length;
    const stddev = Math.sqrt(days.reduce((s, d) => s + (d - avg) ** 2, 0) / days.length);
    const cv = avg > 0 ? stddev / avg : 1;
    return {
      expectedCloseDays: avg.toFixed(1),
      confidencePercent: Math.round(Math.max(30, Math.min(95, 85 - cv * 50 + Math.min(days.length, 6) * 2))),
      historicalAvgDays: avg.toFixed(1),
    };
  } catch { return null; }
}

function computeReleaseReadiness(closeProgress: { totalTasks: number; completedTasks: number; failedTasks: number }) {
  const { totalTasks, completedTasks, failedTasks } = closeProgress;
  const rate = totalTasks > 0 ? completedTasks / totalTasks : 0;
  let prob = rate;
  const blockers: string[] = [];
  if (failedTasks > 0) { blockers.push(`${failedTasks} failed task(s)`); prob *= 0.3; }
  return {
    probability: Math.round(prob * 100) / 100,
    confidencePercent: totalTasks > 0 ? Math.min(90, 60 + totalTasks * 2) : 30,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// Template rendering (inline — matches narrative-templates.ts logic)
// ---------------------------------------------------------------------------

function pluralize(word: string, count: number): string {
  if (count === 1) return word;
  if (word.endsWith("y") && !word.endsWith("ay") && !word.endsWith("ey")) return word.slice(0, -1) + "ies";
  return word + "s";
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

function renderDashboardSummary(input: any): string {
  const { entityCode, periodLabel, anomalySummary, riskScore, closeProgress, predictions, reconStatus, consistency } = input;
  const parts: string[] = [];

  const healthWord = riskScore === "HIGH" ? "elevated risk" :
                     riskScore === "MEDIUM" ? "moderate risk" :
                     riskScore === "LOW" ? "low risk" : "healthy";
  parts.push(`${entityCode} ${periodLabel} is in ${healthWord} status.`);

  if (closeProgress.totalTasks > 0) {
    const pct = Math.round((closeProgress.completedTasks / closeProgress.totalTasks) * 100);
    const taskSummary = `Close tasks are ${pct}% complete (${closeProgress.completedTasks}/${closeProgress.totalTasks})`;
    if (closeProgress.failedTasks > 0) parts.push(`${taskSummary}, with ${closeProgress.failedTasks} failed.`);
    else if (closeProgress.blockedTasks > 0) parts.push(`${taskSummary}, with ${closeProgress.blockedTasks} blocked.`);
    else parts.push(`${taskSummary}.`);
  }

  if (anomalySummary.activeCount > 0) {
    const ap: string[] = [];
    if (anomalySummary.criticalCount > 0) ap.push(`${anomalySummary.criticalCount} critical`);
    if (anomalySummary.warningCount > 0) ap.push(`${anomalySummary.warningCount} warning`);
    parts.push(`Atlas detected ${anomalySummary.activeCount} active ${pluralize("anomaly", anomalySummary.activeCount)} (${ap.join(", ")}).`);
  } else {
    parts.push("No active anomalies detected.");
  }

  if (predictions.closeDuration) {
    const expected = Number(predictions.closeDuration.expectedCloseDays);
    const baseline = Number(predictions.closeDuration.historicalAvgDays);
    const delta = expected - baseline;
    if (Math.abs(delta) >= 0.5) {
      parts.push(`Expected close duration is ${predictions.closeDuration.expectedCloseDays} days (${Math.abs(delta).toFixed(1)} days ${delta > 0 ? "above" : "below"} baseline).`);
    } else {
      parts.push(`Expected close duration is ${predictions.closeDuration.expectedCloseDays} days, in line with baseline.`);
    }
  }

  if (predictions.releaseReadiness) {
    parts.push(`Release readiness is at ${Math.round(predictions.releaseReadiness.probability * 100)}%.`);
  }

  if (!reconStatus.isComplete && reconStatus.totalSessions > 0) {
    const rem = reconStatus.totalSessions - reconStatus.completedSessions;
    parts.push(`${rem} reconciliation ${pluralize("session", rem)} ${rem === 1 ? "remains" : "remain"} open.`);
  }

  if (!consistency.balanced) {
    parts.push("GL consistency check is failing — debit/credit imbalance detected.");
  }

  return parts.join(" ");
}

function renderReleaseSummary(input: any): string {
  const { entityCode, periodLabel, predictions, anomalySummary, closeProgress, reconStatus, consistency, riskSignals } = input;
  const parts: string[] = [];

  if (!predictions.releaseReadiness) {
    return `Release readiness for ${entityCode} ${periodLabel} cannot be assessed — insufficient data for prediction.`;
  }

  const pct = Math.round(predictions.releaseReadiness.probability * 100);
  const readinessWord = pct >= 90 ? "ready for release" :
                        pct >= 70 ? "approaching readiness" :
                        pct >= 40 ? "not yet ready" : "at significant risk";
  parts.push(`${entityCode} ${periodLabel} is ${readinessWord} (${pct}% probability).`);

  if (predictions.releaseReadiness.blockers.length > 0) {
    parts.push(`Blockers: ${predictions.releaseReadiness.blockers.join("; ")}.`);
  }

  if (closeProgress.totalTasks > 0) {
    const rem = closeProgress.totalTasks - closeProgress.completedTasks;
    parts.push(rem > 0
      ? `${rem} close ${pluralize("task", rem)} ${rem === 1 ? "is" : "are"} still outstanding.`
      : "All close tasks are complete.");
  }

  if (anomalySummary.criticalCount > 0) {
    parts.push(`${anomalySummary.criticalCount} critical ${pluralize("anomaly", anomalySummary.criticalCount)} must be resolved before the EXCEPTION_SIGNOFF gate can clear.`);
  }

  if (riskSignals.highCriticalCount > 0) {
    parts.push(`${riskSignals.highCriticalCount} high/critical risk ${pluralize("signal", riskSignals.highCriticalCount)} ${riskSignals.highCriticalCount === 1 ? "is" : "are"} active.`);
  }

  if (!reconStatus.isComplete && reconStatus.totalSessions > 0) {
    const rem = reconStatus.totalSessions - reconStatus.completedSessions;
    parts.push(`Reconciliation is incomplete (${reconStatus.completedSessions}/${reconStatus.totalSessions} sessions done, ${rem} remaining).`);
  }

  if (!consistency.balanced) {
    parts.push("GL consistency check is failing — this is a hard blocker for release certification.");
  }

  if (predictions.closeDuration) {
    parts.push(`Expected close duration: ${predictions.closeDuration.expectedCloseDays} days (${predictions.closeDuration.confidencePercent}% confidence).`);
  }

  return parts.join(" ");
}

function renderCfoBrief(input: any): string {
  const { entityCode, periodLabel, anomalySummary, riskScore, closeProgress, predictions, reconStatus, consistency, topAnomalies } = input;
  const bullets: string[] = [];

  const statusWord = riskScore === "NONE" ? "On track" :
                     riskScore === "LOW" ? "Minor items noted" :
                     riskScore === "MEDIUM" ? "Attention needed" : "Immediate attention required";
  bullets.push(`${entityCode} ${periodLabel}: ${statusWord}.`);

  if (closeProgress.totalTasks > 0) {
    const pct = Math.round((closeProgress.completedTasks / closeProgress.totalTasks) * 100);
    let closeText = `Close progress: ${pct}%`;
    if (predictions.closeDuration) closeText += `, expected completion in ${predictions.closeDuration.expectedCloseDays} days`;
    bullets.push(closeText + ".");
  }

  if (predictions.releaseReadiness) {
    const pct = Math.round(predictions.releaseReadiness.probability * 100);
    let relText = `Release readiness: ${pct}%`;
    if (predictions.releaseReadiness.blockers.length > 0) {
      relText += ` — ${predictions.releaseReadiness.blockers.length} ${pluralize("blocker", predictions.releaseReadiness.blockers.length)}`;
    }
    bullets.push(relText + ".");
  }

  const risks: string[] = [];
  if (anomalySummary.criticalCount > 0) risks.push(`${anomalySummary.criticalCount} critical ${pluralize("anomaly", anomalySummary.criticalCount)}`);
  if (!consistency.balanced) risks.push("GL imbalance");
  if (!reconStatus.isComplete && reconStatus.totalSessions > 0) {
    risks.push(`${reconStatus.totalSessions - reconStatus.completedSessions} open ${pluralize("reconciliation", reconStatus.totalSessions - reconStatus.completedSessions)}`);
  }
  if (closeProgress.failedTasks > 0) risks.push(`${closeProgress.failedTasks} failed ${pluralize("task", closeProgress.failedTasks)}`);
  if (risks.length > 0) bullets.push(`Key risks: ${risks.join(", ")}.`);

  const critAnomaly = topAnomalies.find((a: any) => a.severity === "CRITICAL");
  if (critAnomaly) {
    bullets.push(`Top concern: ${critAnomaly.title}${critAnomaly.accountCode ? ` (${critAnomaly.accountCode})` : ""}.`);
  }

  return bullets.map((b, i) => `${i + 1}. ${b}`).join("\n");
}

const ANOMALY_GUIDANCE: Record<string, string> = {
  AMOUNT_OUTLIER: "Review the account balance and recent journal entries for unusual postings.",
  UNUSUAL_ADJUSTMENT: "Check whether the adjustment entries have proper approval and supporting documentation.",
  RECON_VARIANCE: "Investigate the reconciliation discrepancy and ensure bank and GL balances align.",
  PERIOD_END_SPIKE: "Unusual journal volume near period-end may indicate catch-up postings or misclassification.",
  MANUAL_JOURNAL_RATIO: "A high proportion of manual entries increases error risk. Verify entries against source documents.",
  LATE_CLOSE_TASK: "Close tasks are taking longer than historical average. Check for resource or dependency bottlenecks.",
  OVERRIDE_SPIKE: "Elevated waiver/override activity may indicate process gaps. Escalate to Controller for review.",
  LARGE_ADJUSTMENT: "Large single adjustments are flagged for size. Verify amount and authorization.",
};

function renderAnomalyExplanation(anomaly: any): string {
  const parts: string[] = [anomaly.title];

  if (anomaly.zScore && anomaly.observedValue) {
    const zAbs = Math.abs(Number(anomaly.zScore));
    parts.push(
      `The observed value of ${formatNumber(Number(anomaly.observedValue))} is ${zAbs.toFixed(1)} standard deviations from the baseline.`
    );
  } else if (anomaly.observedValue && anomaly.expectedValue) {
    parts.push(
      `Observed: ${formatNumber(Number(anomaly.observedValue))}. Expected: ${formatNumber(Number(anomaly.expectedValue))}.`
    );
  }

  if (anomaly.severity === "CRITICAL") {
    parts.push("This is classified as CRITICAL and will block the EXCEPTION_SIGNOFF gate until resolved or acknowledged.");
  } else if (anomaly.severity === "WARNING") {
    parts.push("This is classified as WARNING. It may escalate to a close risk signal if matching rules are configured.");
  }

  const guidance = ANOMALY_GUIDANCE[anomaly.anomalyType];
  if (guidance) parts.push(guidance);

  return parts.join(" ");
}
