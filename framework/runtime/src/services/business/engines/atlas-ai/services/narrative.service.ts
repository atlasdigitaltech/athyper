// framework/runtime/src/services/business/engines/atlas-ai/services/narrative.service.ts
//
// Atlas Phase 3A — Narrative Generation Service
//
// Gathers structured data from the governed pipeline (anomalies, predictions,
// close progress, risk signals, reconciliation, GL consistency) and feeds
// it to deterministic template functions to produce human-readable narratives.
//
// Architecture:
//   - Reads from fin.atlas_anomaly, fin.period_close_checklist, fin.close_run,
//     fin.close_risk_signal, fin.reconciliation_session, fin.journal_entry
//   - Calls PredictionService for forward-looking estimates
//   - Passes structured NarrativeInput to pure template functions
//   - Never writes to governed tables — read-only, advisory

import { ok, fail } from "../../shared/engine-base.js";
import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type {
  NarrativeType,
  NarrativeInput,
  NarrativeOutput,
  NarrativeComputeInput,
  NarrativeComputeResult,
  NarrativeAnomalySummary,
  NarrativeAnomalyItem,
  NarrativeCloseProgress,
  NarrativePredictions,
  NarrativeRiskSignals,
  NarrativeReconStatus,
  NarrativeConsistency,
  AnomalyExplanationInput,
} from "../domain/narrative-types.js";
import {
  buildProvenance,
  buildAnomalyProvenance,
} from "../domain/narrative-types.js";
import {
  renderDashboardSummary,
  renderReleaseSummary,
  renderAnomalyExplanation,
  renderCfoBrief,
} from "./narrative-templates.js";
import type { NarrativeProvider } from "./narrative-provider.js";
import { TemplateNarrativeProvider } from "./narrative-provider.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface NarrativeService {
  /** Generate narratives for a period */
  generate(
    ctx: OperationContext,
    input: NarrativeComputeInput,
  ): Promise<ServiceResult<NarrativeComputeResult>>;

  /** Generate a single anomaly explanation */
  explainAnomaly(
    ctx: OperationContext,
    anomalyId: string,
  ): Promise<ServiceResult<NarrativeOutput>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

const ALL_TYPES: NarrativeType[] = [
  "DASHBOARD_SUMMARY",
  "RELEASE_SUMMARY",
  "ANOMALY_EXPLANATION",
  "CFO_BRIEF",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export class DefaultNarrativeService implements NarrativeService {
  private readonly provider: NarrativeProvider;

  constructor(
    private readonly container: { resolve: <T>(token: string) => T | Promise<T> },
    provider?: NarrativeProvider,
  ) {
    this.provider = provider ?? new TemplateNarrativeProvider();
  }

  async generate(
    ctx: OperationContext,
    input: NarrativeComputeInput,
  ): Promise<ServiceResult<NarrativeComputeResult>> {
    const db = await this.container.resolve<any>("db");
    const { tenantId, entityCode, fiscalYear, periodNumber } = input;
    const requestedTypes = input.types ?? ALL_TYPES;

    try {
      // Gather all data in parallel
      const narrativeInput = await this.gatherNarrativeInput(
        db, tenantId, entityCode, fiscalYear, periodNumber,
      );

      const narratives: NarrativeOutput[] = [];
      const now = new Date().toISOString();

      for (const type of requestedTypes) {
        if (type === "ANOMALY_EXPLANATION") {
          // Generate one explanation per active anomaly (top 5)
          for (const anomaly of narrativeInput.topAnomalies.slice(0, 5)) {
            const result = await this.provider.renderAnomaly(
              anomalyItemToExplanationInput(anomaly),
            );
            narratives.push({
              type: "ANOMALY_EXPLANATION",
              text: result.text,
              generatedAt: now,
              provider: result.provider,
              entityCode,
              fiscalYear,
              periodNumber,
              provenance: result.provenance,
            });
          }
          continue;
        }

        const result = await this.provider.render(type, narrativeInput);
        if (result.text) {
          narratives.push({
            type,
            text: result.text,
            generatedAt: now,
            provider: result.provider,
            entityCode,
            fiscalYear,
            periodNumber,
            provenance: result.provenance,
          });
        }
      }

      return ok({ narratives });
    } catch (err) {
      return fail(
        "NARRATIVE_FAILED",
        `Failed to generate narratives: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async explainAnomaly(
    ctx: OperationContext,
    anomalyId: string,
  ): Promise<ServiceResult<NarrativeOutput>> {
    const db = await this.container.resolve<any>("db");

    try {
      const result = await db.query(
        `SELECT
          a.anomaly_type, a.severity, a.title,
          a.z_score::text AS z_score,
          a.observed_value::text AS observed_value,
          a.expected_value::text AS expected_value,
          a.entity_code, a.fiscal_year, a.period_number,
          a.evidence,
          c.account_code, c.account_name,
          b.baseline_mean::text AS baseline_mean,
          b.baseline_stddev::text AS baseline_stddev,
          b.sample_count
        FROM fin.atlas_anomaly a
        LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
        LEFT JOIN fin.atlas_anomaly_baseline b ON b.id = a.baseline_id
        WHERE a.id = $1::uuid`,
        [anomalyId],
      );

      if (result.rows.length === 0) {
        return fail("NOT_FOUND", `Anomaly ${anomalyId} not found`);
      }

      const row = result.rows[0];
      const explanationInput: AnomalyExplanationInput = {
        anomalyType: row.anomaly_type,
        severity: row.severity,
        title: row.title,
        accountCode: row.account_code,
        accountName: row.account_name,
        zScore: row.z_score,
        observedValue: row.observed_value,
        expectedValue: row.expected_value,
        baselineMean: row.baseline_mean,
        baselineStddev: row.baseline_stddev,
        sampleCount: row.sample_count ? Number(row.sample_count) : null,
        evidence: row.evidence ?? {},
      };

      const narrativeResult = await this.provider.renderAnomaly(explanationInput);
      return ok({
        type: "ANOMALY_EXPLANATION" as const,
        text: narrativeResult.text,
        generatedAt: new Date().toISOString(),
        provider: narrativeResult.provider,
        entityCode: row.entity_code,
        fiscalYear: Number(row.fiscal_year),
        periodNumber: Number(row.period_number),
        provenance: result.provenance,
      });
    } catch (err) {
      return fail(
        "NARRATIVE_FAILED",
        `Failed to explain anomaly: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Data gathering — parallel queries to assemble NarrativeInput
  // -------------------------------------------------------------------------

  private async gatherNarrativeInput(
    db: any,
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<NarrativeInput> {
    const [
      anomalySummary,
      topAnomalies,
      closeProgress,
      riskSignals,
      reconStatus,
      consistency,
      predictions,
    ] = await Promise.all([
      this.queryAnomalySummary(db, tenantId, entityCode, fiscalYear, periodNumber),
      this.queryTopAnomalies(db, tenantId, entityCode, fiscalYear, periodNumber),
      this.queryCloseProgress(db, tenantId, entityCode, fiscalYear, periodNumber),
      this.queryRiskSignals(db, tenantId, entityCode, fiscalYear, periodNumber),
      this.queryReconStatus(db, tenantId, entityCode, fiscalYear, periodNumber),
      this.queryConsistency(db, tenantId, entityCode, fiscalYear, periodNumber),
      this.queryPredictions(db, tenantId, entityCode, fiscalYear, periodNumber),
    ]);

    // Risk score from anomaly summary
    const riskScore = anomalySummary.criticalCount > 0 ? "HIGH" :
                      anomalySummary.warningCount >= 3 ? "MEDIUM" :
                      anomalySummary.activeCount > 0 ? "LOW" : "NONE";

    // Period label
    const monthName = periodNumber >= 1 && periodNumber <= 12
      ? MONTH_NAMES[periodNumber - 1] : `P${periodNumber}`;
    const periodLabel = `${monthName} ${fiscalYear}`;

    return {
      entityCode,
      fiscalYear,
      periodNumber,
      periodLabel,
      anomalySummary,
      topAnomalies,
      riskScore,
      closeProgress,
      predictions,
      riskSignals,
      reconStatus,
      consistency,
    };
  }

  private async queryAnomalySummary(
    db: any, tenantId: string, entityCode: string, fy: number, pn: number,
  ): Promise<NarrativeAnomalySummary> {
    const result = await db.query(
      `SELECT
        count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED'))::int AS active_count,
        count(*) FILTER (WHERE severity = 'CRITICAL' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS critical_count,
        count(*) FILTER (WHERE severity = 'WARNING' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS warning_count,
        count(*) FILTER (WHERE severity = 'INFO' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS info_count,
        count(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved_count,
        count(*)::int AS total_count
      FROM fin.atlas_anomaly
      WHERE tenant_id = $1::uuid AND entity_code = $2
        AND fiscal_year = $3 AND period_number = $4`,
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

  private async queryTopAnomalies(
    db: any, tenantId: string, entityCode: string, fy: number, pn: number,
  ): Promise<NarrativeAnomalyItem[]> {
    const result = await db.query(
      `SELECT
        a.anomaly_type, a.severity, a.title,
        c.account_code,
        a.z_score::text AS z_score,
        a.observed_value::text AS observed_value,
        a.expected_value::text AS expected_value
      FROM fin.atlas_anomaly a
      LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
      WHERE a.tenant_id = $1::uuid AND a.entity_code = $2
        AND a.fiscal_year = $3 AND a.period_number = $4
        AND a.status IN ('OPEN', 'ACKNOWLEDGED')
      ORDER BY
        CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
        a.detected_at DESC
      LIMIT 10`,
      [tenantId, entityCode, fy, pn],
    );
    return result.rows.map((r: any) => ({
      anomalyType: r.anomaly_type,
      severity: r.severity,
      title: r.title,
      accountCode: r.account_code ?? null,
      zScore: r.z_score ?? null,
      observedValue: r.observed_value ?? null,
      expectedValue: r.expected_value ?? null,
    }));
  }

  private async queryCloseProgress(
    db: any, tenantId: string, entityCode: string, fy: number, pn: number,
  ): Promise<NarrativeCloseProgress> {
    const result = await db.query(
      `SELECT
        COUNT(*)::int AS total_tasks,
        COUNT(*) FILTER (WHERE cc.task_status IN ('COMPLETED', 'WAIVED'))::int AS completed_tasks,
        COUNT(*) FILTER (WHERE cc.task_status = 'FAILED')::int AS failed_tasks,
        COUNT(*) FILTER (WHERE cc.task_status = 'BLOCKED')::int AS blocked_tasks,
        EXTRACT(EPOCH FROM (now() - MIN(cr.started_at))) / 86400.0 AS elapsed_days,
        MIN(cr.status) AS close_status
      FROM fin.period_close_checklist cc
      LEFT JOIN fin.close_run cr
        ON cr.tenant_id = cc.tenant_id
        AND cr.entity_code = cc.entity_code
        AND cr.fiscal_year = cc.fiscal_year
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

  private async queryRiskSignals(
    db: any, tenantId: string, entityCode: string, fy: number, pn: number,
  ): Promise<NarrativeRiskSignals> {
    const result = await db.query(
      `SELECT
        COUNT(*)::int AS active_count,
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

  private async queryReconStatus(
    db: any, tenantId: string, entityCode: string, fy: number, pn: number,
  ): Promise<NarrativeReconStatus> {
    const result = await db.query(
      `SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS completed_sessions
      FROM fin.reconciliation_session rs
      JOIN fin.bank_statement bs ON bs.id = rs.statement_id
      WHERE rs.tenant_id = $1::uuid AND bs.entity_code = $2
        AND EXISTS (
          SELECT 1 FROM fin.fiscal_period fp
          WHERE fp.tenant_id = $1::uuid AND fp.entity_code = $2
            AND fp.fiscal_year = $3 AND fp.period_number = $4
            AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
        )`,
      [tenantId, entityCode, fy, pn],
    );
    const r = result.rows[0] ?? {};
    const total = Number(r.total_sessions ?? 0);
    const completed = Number(r.completed_sessions ?? 0);
    return {
      totalSessions: total,
      completedSessions: completed,
      isComplete: total === 0 || completed === total,
    };
  }

  private async queryConsistency(
    db: any, tenantId: string, entityCode: string, fy: number, pn: number,
  ): Promise<NarrativeConsistency> {
    const result = await db.query(
      `SELECT
        COALESCE(SUM(total_debit), 0) = COALESCE(SUM(total_credit), 0) AS balanced
      FROM fin.journal_entry
      WHERE tenant_id = $1::uuid AND entity_code = $2
        AND fiscal_year = $3 AND period_number = $4
        AND status = 'POSTED'`,
      [tenantId, entityCode, fy, pn],
    );
    return { balanced: result.rows[0]?.balanced ?? true };
  }

  private async queryPredictions(
    db: any, tenantId: string, entityCode: string, fy: number, pn: number,
  ): Promise<NarrativePredictions> {
    // Close duration — lightweight inline (same as dashboard)
    let closeDuration: NarrativePredictions["closeDuration"] = null;
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
      if (histResult.rows.length >= 2) {
        const days = histResult.rows.map((r: any) => Number(r.close_days));
        const avg = days.reduce((a: number, b: number) => a + b, 0) / days.length;
        const stddev = Math.sqrt(days.reduce((s: number, d: number) => s + (d - avg) ** 2, 0) / days.length);
        const cv = avg > 0 ? stddev / avg : 1;
        closeDuration = {
          expectedCloseDays: avg.toFixed(1),
          confidencePercent: Math.round(Math.max(30, Math.min(95, 85 - cv * 50 + Math.min(days.length, 6) * 2))),
          historicalAvgDays: avg.toFixed(1),
        };
      }
    } catch { /* graceful */ }

    // Release readiness
    let releaseReadiness: NarrativePredictions["releaseReadiness"] = null;
    try {
      const taskResult = await db.query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE task_status IN ('COMPLETED', 'WAIVED'))::int AS done,
          COUNT(*) FILTER (WHERE task_status = 'FAILED')::int AS failed
        FROM fin.period_close_checklist
        WHERE tenant_id = $1::uuid AND entity_code = $2
          AND fiscal_year = $3 AND period_number = $4`,
        [tenantId, entityCode, fy, pn],
      );
      const t = taskResult.rows[0];
      const total = Number(t?.total ?? 0);
      const done = Number(t?.done ?? 0);
      const failed = Number(t?.failed ?? 0);
      const rate = total > 0 ? done / total : 0;
      let prob = rate;
      const blockers: string[] = [];
      if (failed > 0) { blockers.push(`${failed} failed task(s)`); prob *= 0.3; }
      releaseReadiness = {
        probability: Math.round(prob * 100) / 100,
        confidencePercent: total > 0 ? Math.min(90, 60 + total * 2) : 30,
        blockers,
      };
    } catch { /* graceful */ }

    // Recon completion
    let reconCompletion: NarrativePredictions["reconCompletion"] = null;
    try {
      const reconResult = await db.query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS completed
        FROM fin.reconciliation_session rs
        JOIN fin.bank_statement bs ON bs.id = rs.statement_id
        WHERE rs.tenant_id = $1::uuid AND bs.entity_code = $2
          AND EXISTS (
            SELECT 1 FROM fin.fiscal_period fp
            WHERE fp.tenant_id = $1::uuid AND fp.entity_code = $2
              AND fp.fiscal_year = $3 AND fp.period_number = $4
              AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
          )`,
        [tenantId, entityCode, fy, pn],
      );
      const r = reconResult.rows[0];
      const total = Number(r?.total ?? 0);
      const completed = Number(r?.completed ?? 0);
      if (total > 0) {
        reconCompletion = {
          sessionsRemaining: total - completed,
          totalSessions: total,
          completedSessions: completed,
        };
      }
    } catch { /* graceful */ }

    return { closeDuration, releaseReadiness, reconCompletion };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function anomalyItemToExplanationInput(item: NarrativeAnomalyItem): AnomalyExplanationInput {
  return {
    anomalyType: item.anomalyType,
    severity: item.severity,
    title: item.title,
    accountCode: item.accountCode,
    accountName: null,  // not available in summary view
    zScore: item.zScore,
    observedValue: item.observedValue,
    expectedValue: item.expectedValue,
    baselineMean: null,
    baselineStddev: null,
    sampleCount: null,
    evidence: {},
  };
}
