// framework/runtime/src/services/business/engines/atlas-ai/services/recommendation.service.ts
//
// Atlas Phase 4 — Deterministic Recommendation Generator
//
// Produces structured, evidence-backed recommendations from Atlas data:
// anomalies, predictions, risk signals, close progress, reconciliation,
// and GL consistency.
//
// Key properties:
//   - Deterministic: same input → same recommendations
//   - Advisory: never auto-triggers workflow state changes
//   - Evidence-backed: every recommendation links to source data
//   - Prioritized: CRITICAL > HIGH > MEDIUM > LOW
//   - Non-persisted: computed on-demand, ephemeral

import { ok, fail } from "../../shared/engine-base.js";
import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type { NarrativeInput, NarrativeAnomalyItem } from "../domain/narrative-types.js";
import type {
  AtlasRecommendation,
  AtlasRecommendationType,
  AtlasRecommendationPriority,
  AtlasOwnerRole,
  AtlasLinkedEvidence,
  RecommendationComputeInput,
  RecommendationComputeResult,
} from "../domain/recommendation-types.js";
import { buildRecommendationProvenance } from "../domain/recommendation-types.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface RecommendationService {
  compute(
    ctx: OperationContext,
    input: RecommendationComputeInput,
  ): Promise<ServiceResult<RecommendationComputeResult>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultRecommendationService implements RecommendationService {
  constructor(
    private readonly container: { resolve: <T>(token: string) => T | Promise<T> },
  ) {}

  async compute(
    ctx: OperationContext,
    input: RecommendationComputeInput,
  ): Promise<ServiceResult<RecommendationComputeResult>> {
    try {
      // Resolve narrative service to gather data (reuses the same data pipeline)
      const narrativeService = await this.container.resolve<any>("engine.atlas.narrativeService");
      const generateResult = await narrativeService.generate(ctx, {
        tenantId: input.tenantId,
        entityCode: input.entityCode,
        fiscalYear: input.fiscalYear,
        periodNumber: input.periodNumber,
        types: [], // skip narrative generation, we only need the data gathering
      });

      // If narrative service fails, gather data inline
      // We need to build a NarrativeInput — use inline gathering
      const db = await this.container.resolve<any>("db");
      const narrativeInput = await gatherRecommendationInput(
        db, input.tenantId, input.entityCode, input.fiscalYear, input.periodNumber,
      );

      const recommendations = generateRecommendations(narrativeInput);
      const provenance = buildRecommendationProvenance(recommendations, {
        entityCode: input.entityCode,
        fiscalYear: input.fiscalYear,
        periodNumber: input.periodNumber,
      });

      return ok({
        recommendations,
        provenance,
        computedAt: provenance.generatedAt,
      });
    } catch (err) {
      return fail(
        "RECOMMENDATION_FAILED",
        `Failed to compute recommendations: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Pure recommendation generator — deterministic, no side effects
// ---------------------------------------------------------------------------

export function generateRecommendations(input: NarrativeInput): AtlasRecommendation[] {
  const recs: AtlasRecommendation[] = [];

  // 1. Anomaly response recommendations
  generateAnomalyRecommendations(input, recs);

  // 2. Release gate recommendations
  generateReleaseGateRecommendations(input, recs);

  // 3. Reconciliation followup recommendations
  generateReconRecommendations(input, recs);

  // 4. Close duration recommendations
  generateCloseDurationRecommendations(input, recs);

  // 5. Risk mitigation recommendations
  generateRiskMitigationRecommendations(input, recs);

  // Sort by priority: CRITICAL > HIGH > MEDIUM > LOW
  const priorityOrder: Record<AtlasRecommendationPriority, number> = {
    CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
  };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recs;
}

// ---------------------------------------------------------------------------
// 1. Anomaly response recommendations
// ---------------------------------------------------------------------------

function generateAnomalyRecommendations(
  input: NarrativeInput,
  recs: AtlasRecommendation[],
) {
  for (const anomaly of input.topAnomalies) {
    if (anomaly.severity === "CRITICAL") {
      recs.push({
        key: `anomaly:critical:${anomaly.anomalyType}:${anomaly.accountCode ?? "global"}`,
        type: "ANOMALY_RESPONSE",
        priority: "CRITICAL",
        title: `Resolve ${anomaly.title}`,
        rationale: buildAnomalyRationale(anomaly),
        suggestedOwnerRole: anomaly.anomalyType === "OVERRIDE_SPIKE" ? "CONTROLLER" : "ACCOUNTANT",
        linkedEvidence: [{
          evidenceType: "anomaly",
          label: anomaly.title,
          referenceId: null,
          detail: anomaly.zScore ? `z-score: ${anomaly.zScore}` : null,
        }],
        estimatedImpact: "Blocks EXCEPTION_SIGNOFF gate until resolved or acknowledged.",
      });
    } else if (anomaly.severity === "WARNING") {
      recs.push({
        key: `anomaly:warning:${anomaly.anomalyType}:${anomaly.accountCode ?? "global"}`,
        type: "ANOMALY_RESPONSE",
        priority: "HIGH",
        title: `Review ${anomaly.title}`,
        rationale: buildAnomalyRationale(anomaly),
        suggestedOwnerRole: getOwnerForAnomalyType(anomaly.anomalyType),
        linkedEvidence: [{
          evidenceType: "anomaly",
          label: anomaly.title,
          referenceId: null,
          detail: anomaly.zScore ? `z-score: ${anomaly.zScore}` : null,
        }],
        estimatedImpact: "May escalate to a close risk signal if unresolved.",
      });
    }
  }
}

function buildAnomalyRationale(anomaly: NarrativeAnomalyItem): string {
  const parts: string[] = [];

  if (anomaly.observedValue && anomaly.expectedValue) {
    parts.push(
      `Observed value (${anomaly.observedValue}) deviates from expected (${anomaly.expectedValue}).`,
    );
  }

  const guidance = ANOMALY_RESPONSE_GUIDANCE[anomaly.anomalyType];
  if (guidance) parts.push(guidance);

  return parts.join(" ") || `${anomaly.anomalyType} anomaly detected.`;
}

const ANOMALY_RESPONSE_GUIDANCE: Record<string, string> = {
  AMOUNT_OUTLIER: "Review account balance and recent journal entries for unusual postings.",
  UNUSUAL_ADJUSTMENT: "Check adjustment entries for proper approval and supporting documentation.",
  RECON_VARIANCE: "Investigate reconciliation discrepancy and ensure bank and GL balances align.",
  PERIOD_END_SPIKE: "Verify journal volume near period-end for catch-up postings or misclassification.",
  MANUAL_JOURNAL_RATIO: "High proportion of manual entries increases error risk. Verify against source documents.",
  LATE_CLOSE_TASK: "Check for resource or dependency bottlenecks causing close delays.",
  OVERRIDE_SPIKE: "Elevated waiver/override activity may indicate process gaps. Escalate to Controller.",
  LARGE_ADJUSTMENT: "Large single adjustments flagged for size. Verify amount and authorization.",
  EXCEPTION_PATTERN: "Recurring exceptions suggest a systematic issue. Consider process review.",
  TIMING_ANOMALY: "Posting cadence differs from historical pattern. Verify correct period allocation.",
  MISSING_RECURRENCE: "Expected recurring entry not found this period. Check if missed or reclassified.",
};

function getOwnerForAnomalyType(anomalyType: string): AtlasOwnerRole {
  switch (anomalyType) {
    case "OVERRIDE_SPIKE":
    case "EXCEPTION_PATTERN":
      return "CONTROLLER";
    case "RECON_VARIANCE":
      return "RECONCILIATION_ANALYST";
    case "LATE_CLOSE_TASK":
      return "CLOSE_MANAGER";
    default:
      return "ACCOUNTANT";
  }
}

// ---------------------------------------------------------------------------
// 2. Release gate recommendations
// ---------------------------------------------------------------------------

function generateReleaseGateRecommendations(
  input: NarrativeInput,
  recs: AtlasRecommendation[],
) {
  const { anomalySummary, closeProgress, consistency } = input;

  // Critical anomalies block EXCEPTION_SIGNOFF
  if (anomalySummary.criticalCount > 0) {
    recs.push({
      key: "gate:exception_signoff:critical_anomalies",
      type: "RELEASE_GATE",
      priority: "CRITICAL",
      title: `Resolve ${anomalySummary.criticalCount} critical ${anomalySummary.criticalCount === 1 ? "anomaly" : "anomalies"} before EXCEPTION_SIGNOFF`,
      rationale: "Critical anomalies are blocking the EXCEPTION_SIGNOFF gate. All must be resolved or acknowledged before the period can be released.",
      suggestedOwnerRole: "CONTROLLER",
      linkedEvidence: [{
        evidenceType: "anomaly",
        label: `${anomalySummary.criticalCount} critical anomalies active`,
        referenceId: null,
        detail: `${anomalySummary.activeCount} total active anomalies`,
      }],
      estimatedImpact: "Release blocked until gate clears.",
    });
  }

  // GL imbalance is a hard blocker
  if (!consistency.balanced) {
    recs.push({
      key: "gate:gl_consistency",
      type: "RELEASE_GATE",
      priority: "CRITICAL",
      title: "Resolve GL debit/credit imbalance before certification",
      rationale: "GL consistency check is failing. This is a hard blocker for release certification. Investigate and correct the journal entries causing the imbalance.",
      suggestedOwnerRole: "ACCOUNTANT",
      linkedEvidence: [{
        evidenceType: "gl_consistency",
        label: "GL debit/credit imbalance detected",
        referenceId: null,
        detail: null,
      }],
      estimatedImpact: "Release certification will fail until resolved.",
    });
  }

  // Failed close tasks
  if (closeProgress.failedTasks > 0) {
    recs.push({
      key: "gate:failed_tasks",
      type: "RELEASE_GATE",
      priority: "HIGH",
      title: `Resolve ${closeProgress.failedTasks} failed close ${closeProgress.failedTasks === 1 ? "task" : "tasks"}`,
      rationale: "Failed close tasks reduce release readiness and may block release gates. Investigate failure causes and either resolve or request waivers.",
      suggestedOwnerRole: "CLOSE_MANAGER",
      linkedEvidence: [{
        evidenceType: "close_task",
        label: `${closeProgress.failedTasks} failed tasks`,
        referenceId: null,
        detail: `${closeProgress.completedTasks}/${closeProgress.totalTasks} tasks complete`,
      }],
      estimatedImpact: input.predictions.releaseReadiness
        ? `Release readiness reduced to ${Math.round(input.predictions.releaseReadiness.probability * 100)}%.`
        : "Release readiness negatively impacted.",
    });
  }
}

// ---------------------------------------------------------------------------
// 3. Reconciliation followup recommendations
// ---------------------------------------------------------------------------

function generateReconRecommendations(
  input: NarrativeInput,
  recs: AtlasRecommendation[],
) {
  const { reconStatus } = input;

  if (!reconStatus.isComplete && reconStatus.totalSessions > 0) {
    const remaining = reconStatus.totalSessions - reconStatus.completedSessions;
    const priority: AtlasRecommendationPriority = remaining >= 3 ? "HIGH" : "MEDIUM";

    recs.push({
      key: `recon:incomplete:${remaining}`,
      type: "RECON_FOLLOWUP",
      priority,
      title: `Complete ${remaining} outstanding reconciliation ${remaining === 1 ? "session" : "sessions"}`,
      rationale: `${reconStatus.completedSessions} of ${reconStatus.totalSessions} reconciliation sessions are complete. Remaining sessions must be completed before the period can be released.`,
      suggestedOwnerRole: "RECONCILIATION_ANALYST",
      linkedEvidence: [{
        evidenceType: "recon_session",
        label: `${remaining} sessions remaining`,
        referenceId: null,
        detail: `${reconStatus.completedSessions}/${reconStatus.totalSessions} complete`,
      }],
      estimatedImpact: remaining >= 3
        ? "Significant release delay likely if reconciliations are not completed soon."
        : "Minor delay possible if not completed before certification.",
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Close duration recommendations
// ---------------------------------------------------------------------------

function generateCloseDurationRecommendations(
  input: NarrativeInput,
  recs: AtlasRecommendation[],
) {
  const { predictions, closeProgress } = input;

  if (predictions.closeDuration) {
    const expected = Number(predictions.closeDuration.expectedCloseDays);
    const historical = Number(predictions.closeDuration.historicalAvgDays);
    const delta = expected - historical;

    // Only recommend if close is running significantly over baseline
    if (delta >= 1.0) {
      recs.push({
        key: "duration:above_baseline",
        type: "CLOSE_DURATION",
        priority: "MEDIUM",
        title: `Close duration ${delta.toFixed(1)} days above baseline — review bottlenecks`,
        rationale: `Expected close duration is ${predictions.closeDuration.expectedCloseDays} days versus a ${predictions.closeDuration.historicalAvgDays}-day historical average. Consider reviewing task dependencies and resource allocation.`,
        suggestedOwnerRole: "CLOSE_MANAGER",
        linkedEvidence: [{
          evidenceType: "prediction",
          label: `Expected close: ${predictions.closeDuration.expectedCloseDays} days`,
          referenceId: null,
          detail: `Historical avg: ${predictions.closeDuration.historicalAvgDays} days (${predictions.closeDuration.confidencePercent}% confidence)`,
        }],
        estimatedImpact: `Expected release delay: ${delta.toFixed(1)} days beyond normal timeline.`,
      });
    }
  }

  // Blocked tasks with no progress
  if (closeProgress.blockedTasks > 0) {
    recs.push({
      key: `duration:blocked_tasks:${closeProgress.blockedTasks}`,
      type: "CLOSE_DURATION",
      priority: closeProgress.blockedTasks >= 3 ? "HIGH" : "MEDIUM",
      title: `Unblock ${closeProgress.blockedTasks} blocked close ${closeProgress.blockedTasks === 1 ? "task" : "tasks"}`,
      rationale: "Blocked tasks extend the close timeline and may be on the critical path. Review dependencies and remove blockers.",
      suggestedOwnerRole: "CLOSE_MANAGER",
      linkedEvidence: [{
        evidenceType: "close_task",
        label: `${closeProgress.blockedTasks} blocked tasks`,
        referenceId: null,
        detail: `${closeProgress.completedTasks}/${closeProgress.totalTasks} total tasks complete`,
      }],
      estimatedImpact: null,
    });
  }
}

// ---------------------------------------------------------------------------
// 5. Risk mitigation recommendations
// ---------------------------------------------------------------------------

function generateRiskMitigationRecommendations(
  input: NarrativeInput,
  recs: AtlasRecommendation[],
) {
  const { riskSignals, anomalySummary, predictions } = input;

  // High/critical risk signals active
  if (riskSignals.highCriticalCount > 0) {
    recs.push({
      key: `risk:high_critical_signals:${riskSignals.highCriticalCount}`,
      type: "RISK_MITIGATION",
      priority: "HIGH",
      title: `Address ${riskSignals.highCriticalCount} high/critical risk ${riskSignals.highCriticalCount === 1 ? "signal" : "signals"}`,
      rationale: "Active high or critical risk signals may block release gates or indicate control weaknesses. Review and resolve or acknowledge each signal.",
      suggestedOwnerRole: "CONTROLLER",
      linkedEvidence: [{
        evidenceType: "risk_signal",
        label: `${riskSignals.highCriticalCount} high/critical signals`,
        referenceId: null,
        detail: `${riskSignals.activeCount} total active signals`,
      }],
      estimatedImpact: "May block release certification if unresolved.",
    });
  }

  // Low release readiness with blockers
  if (predictions.releaseReadiness && predictions.releaseReadiness.probability < 0.5 && predictions.releaseReadiness.blockers.length > 0) {
    recs.push({
      key: "risk:low_readiness",
      type: "RISK_MITIGATION",
      priority: "HIGH",
      title: `Release readiness at ${Math.round(predictions.releaseReadiness.probability * 100)}% — address blockers`,
      rationale: `Release readiness is below 50%. Blockers: ${predictions.releaseReadiness.blockers.join("; ")}. Prioritize blocker resolution to improve readiness.`,
      suggestedOwnerRole: "CLOSE_MANAGER",
      linkedEvidence: [
        {
          evidenceType: "prediction",
          label: `Release readiness: ${Math.round(predictions.releaseReadiness.probability * 100)}%`,
          referenceId: null,
          detail: `${predictions.releaseReadiness.blockers.length} blockers identified`,
        },
      ],
      estimatedImpact: "Period release may be delayed until blockers are resolved.",
    });
  }

  // Many warnings without critical — pattern concern
  if (anomalySummary.warningCount >= 5 && anomalySummary.criticalCount === 0) {
    recs.push({
      key: "risk:warning_pattern",
      type: "RISK_MITIGATION",
      priority: "MEDIUM",
      title: `${anomalySummary.warningCount} warning anomalies detected — review for systemic pattern`,
      rationale: "A high count of warning-level anomalies without critical escalation may indicate a systemic control or process issue. Consider a holistic review rather than addressing anomalies individually.",
      suggestedOwnerRole: "CONTROLLER",
      linkedEvidence: [{
        evidenceType: "anomaly",
        label: `${anomalySummary.warningCount} warning anomalies`,
        referenceId: null,
        detail: `${anomalySummary.totalCount} total anomalies this period`,
      }],
      estimatedImpact: "Potential escalation to critical if patterns persist.",
    });
  }
}

// ---------------------------------------------------------------------------
// Data gathering (inline, mirrors narrative service pattern)
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function gatherRecommendationInput(
  db: any, tenantId: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
): Promise<NarrativeInput> {
  const [
    anomalySummary,
    topAnomalies,
    closeProgress,
    riskSignals,
    reconStatus,
    consistency,
    closeDuration,
  ] = await Promise.all([
    queryAnomalySummary(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryTopAnomalies(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryCloseProgress(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryRiskSignals(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryReconStatus(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryConsistency(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryCloseDuration(db, tenantId, entityCode, fiscalYear, periodNumber),
  ]);

  const releaseReadiness = computeReleaseReadiness(closeProgress);
  const riskScore = anomalySummary.criticalCount > 0 ? "HIGH" :
                    anomalySummary.warningCount >= 3 ? "MEDIUM" :
                    anomalySummary.activeCount > 0 ? "LOW" : "NONE";
  const monthName = periodNumber >= 1 && periodNumber <= 12
    ? MONTH_NAMES[periodNumber - 1] : `P${periodNumber}`;

  return {
    entityCode,
    fiscalYear,
    periodNumber,
    periodLabel: `${monthName} ${fiscalYear}`,
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
}

// Inline query helpers (same as narrative service / dashboard API)

async function queryAnomalySummary(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT
      count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED'))::int AS active_count,
      count(*) FILTER (WHERE severity = 'CRITICAL' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS critical_count,
      count(*) FILTER (WHERE severity = 'WARNING' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS warning_count,
      count(*) FILTER (WHERE severity = 'INFO' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS info_count,
      count(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved_count,
      count(*)::int AS total_count
    FROM fin.atlas_anomaly
    WHERE tenant_id = $1::uuid AND entity_code = $2 AND fiscal_year = $3 AND period_number = $4`,
    [tenantId, entityCode, fy, pn],
  );
  const r = result.rows[0] ?? {};
  return {
    activeCount: Number(r.active_count ?? 0),
    criticalCount: Number(r.critical_count ?? 0),
    warningCount: Number(r.warning_count ?? 0),
    infoCount: Number(r.info_count ?? 0),
    resolvedCount: Number(r.resolved_count ?? 0),
    totalCount: Number(r.total_count ?? 0),
  };
}

async function queryTopAnomalies(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT a.anomaly_type, a.severity, a.title, c.account_code,
      a.z_score::text AS z_score, a.observed_value::text AS observed_value,
      a.expected_value::text AS expected_value
    FROM fin.atlas_anomaly a
    LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
    WHERE a.tenant_id = $1::uuid AND a.entity_code = $2
      AND a.fiscal_year = $3 AND a.period_number = $4
      AND a.status IN ('OPEN', 'ACKNOWLEDGED')
    ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
      a.detected_at DESC LIMIT 10`,
    [tenantId, entityCode, fy, pn],
  );
  return result.rows.map((r: any) => ({
    anomalyType: r.anomaly_type, severity: r.severity, title: r.title,
    accountCode: r.account_code ?? null, zScore: r.z_score ?? null,
    observedValue: r.observed_value ?? null, expectedValue: r.expected_value ?? null,
  }));
}

async function queryCloseProgress(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE cc.task_status IN ('COMPLETED', 'WAIVED'))::int AS completed_tasks,
      COUNT(*) FILTER (WHERE cc.task_status = 'FAILED')::int AS failed_tasks,
      COUNT(*) FILTER (WHERE cc.task_status = 'BLOCKED')::int AS blocked_tasks,
      EXTRACT(EPOCH FROM (now() - MIN(cr.started_at))) / 86400.0 AS elapsed_days,
      MIN(cr.status) AS close_status
    FROM fin.period_close_checklist cc
    LEFT JOIN fin.close_run cr ON cr.tenant_id = cc.tenant_id
      AND cr.entity_code = cc.entity_code AND cr.fiscal_year = cc.fiscal_year
      AND cr.period_number = cc.period_number
    WHERE cc.tenant_id = $1::uuid AND cc.entity_code = $2
      AND cc.fiscal_year = $3 AND cc.period_number = $4`,
    [tenantId, entityCode, fy, pn],
  );
  const r = result.rows[0] ?? {};
  return {
    totalTasks: Number(r.total_tasks ?? 0),
    completedTasks: Number(r.completed_tasks ?? 0),
    failedTasks: Number(r.failed_tasks ?? 0),
    blockedTasks: Number(r.blocked_tasks ?? 0),
    elapsedDays: r.elapsed_days != null ? Number(r.elapsed_days) : null,
    closeStatus: r.close_status ?? null,
  };
}

async function queryRiskSignals(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS active_count,
      COUNT(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS high_critical_count,
      COUNT(*) FILTER (WHERE rule_type = 'atlas_anomaly')::int AS atlas_signal_count
    FROM fin.close_risk_signal
    WHERE tenant_id = $1::uuid AND entity_code = $2
      AND fiscal_year = $3 AND period_number = $4
      AND signal_state IN ('fired', 'acknowledged')`,
    [tenantId, entityCode, fy, pn],
  );
  const r = result.rows[0] ?? {};
  return {
    activeCount: Number(r.active_count ?? 0),
    highCriticalCount: Number(r.high_critical_count ?? 0),
    atlasSignalCount: Number(r.atlas_signal_count ?? 0),
  };
}

async function queryReconStatus(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS total_sessions,
      COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS completed_sessions
    FROM fin.reconciliation_session rs
    JOIN fin.bank_statement bs ON bs.id = rs.statement_id
    WHERE rs.tenant_id = $1::uuid AND bs.entity_code = $2
      AND EXISTS (SELECT 1 FROM fin.fiscal_period fp
        WHERE fp.tenant_id = $1::uuid AND fp.entity_code = $2
          AND fp.fiscal_year = $3 AND fp.period_number = $4
          AND bs.statement_date BETWEEN fp.start_date AND fp.end_date)`,
    [tenantId, entityCode, fy, pn],
  );
  const r = result.rows[0] ?? {};
  const total = Number(r.total_sessions ?? 0);
  const completed = Number(r.completed_sessions ?? 0);
  return { totalSessions: total, completedSessions: completed, isComplete: total === 0 || completed === total };
}

async function queryConsistency(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT COALESCE(SUM(total_debit), 0) = COALESCE(SUM(total_credit), 0) AS balanced
    FROM fin.journal_entry
    WHERE tenant_id = $1::uuid AND entity_code = $2
      AND fiscal_year = $3 AND period_number = $4 AND status = 'POSTED'`,
    [tenantId, entityCode, fy, pn],
  );
  return { balanced: result.rows[0]?.balanced ?? true };
}

async function queryCloseDuration(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  try {
    const histResult = await db.query(
      `SELECT EXTRACT(EPOCH FROM (
        COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) - cr.started_at
      )) / 86400.0 AS close_days
      FROM fin.close_run cr
      WHERE cr.tenant_id = $1::uuid AND cr.entity_code = $2
        AND cr.status IN ('SOFT_CLOSED', 'HARD_CLOSED')
        AND cr.started_at IS NOT NULL
        AND COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) IS NOT NULL
        AND NOT (cr.fiscal_year = $3 AND cr.period_number = $4)
      ORDER BY cr.fiscal_year DESC, cr.period_number DESC LIMIT 12`,
      [tenantId, entityCode, fy, pn],
    );
    if (histResult.rows.length < 2) return null;
    const days = histResult.rows.map((r: any) => Number(r.close_days));
    const avg = days.reduce((a: number, b: number) => a + b, 0) / days.length;
    const stddev = Math.sqrt(days.reduce((s: number, d: number) => s + (d - avg) ** 2, 0) / days.length);
    const cv = avg > 0 ? stddev / avg : 1;
    return {
      expectedCloseDays: avg.toFixed(1),
      confidencePercent: Math.round(Math.max(30, Math.min(95, 85 - cv * 50 + Math.min(days.length, 6) * 2))),
      historicalAvgDays: avg.toFixed(1),
    };
  } catch { return null; }
}

function computeReleaseReadiness(cp: { totalTasks: number; completedTasks: number; failedTasks: number }) {
  const rate = cp.totalTasks > 0 ? cp.completedTasks / cp.totalTasks : 0;
  let prob = rate;
  const blockers: string[] = [];
  if (cp.failedTasks > 0) { blockers.push(`${cp.failedTasks} failed task(s)`); prob *= 0.3; }
  return {
    probability: Math.round(prob * 100) / 100,
    confidencePercent: cp.totalTasks > 0 ? Math.min(90, 60 + cp.totalTasks * 2) : 30,
    blockers,
  };
}
