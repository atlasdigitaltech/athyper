// framework/runtime/src/services/business/engines/atlas-ai/services/prediction.service.ts
//
// Atlas Prediction Service — computes forward-looking projections from
// historical close operations data.
//
// Architecture:
//   - Reads from fin.close_run, fin.close_calendar, fin.period_close_checklist,
//     fin.close_orchestration_snapshot, fin.reconciliation_session,
//     fin.close_risk_signal, fin.atlas_anomaly (all governed data)
//   - Writes predictions to fin.ai_prediction (existing table)
//   - Uses linear regression + historical averaging (no deep learning)
//   - Predictions are advisory — they never write to governed tables
//   - All numeric outputs as strings (MC-4)

import { ok, fail } from "../../shared/engine-base.js";
import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type {
  PredictionComputeInput,
  PredictionComputeResult,
  CloseDurationPrediction,
  ReleaseReadinessPrediction,
  ReconCompletionPrediction,
} from "../domain/prediction-types.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface PredictionService {
  /** Compute all predictions for a period */
  compute(
    ctx: OperationContext,
    input: PredictionComputeInput,
  ): Promise<ServiceResult<PredictionComputeResult>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultPredictionService implements PredictionService {
  constructor(
    private readonly container: { resolve: <T>(token: string) => T | Promise<T> },
  ) {}

  async compute(
    ctx: OperationContext,
    input: PredictionComputeInput,
  ): Promise<ServiceResult<PredictionComputeResult>> {
    const db = await this.container.resolve<any>("db");
    const { tenantId, entityCode, fiscalYear, periodNumber } = input;

    try {
      const [closeDuration, releaseReadiness, reconCompletion] = await Promise.all([
        this.predictCloseDuration(db, tenantId, entityCode, fiscalYear, periodNumber),
        this.predictReleaseReadiness(db, tenantId, entityCode, fiscalYear, periodNumber),
        this.predictReconCompletion(db, tenantId, entityCode, fiscalYear, periodNumber),
      ]);

      return ok({ closeDuration, releaseReadiness, reconCompletion });
    } catch (err) {
      return fail(
        "PREDICTION_FAILED",
        `Failed to compute predictions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 1. Close Duration Forecast
  // -----------------------------------------------------------------------

  private async predictCloseDuration(
    db: any,
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<CloseDurationPrediction | null> {
    // Historical close durations (up to 12 periods)
    const histResult = await db.query(
      `SELECT
        cr.fiscal_year,
        cr.period_number,
        EXTRACT(EPOCH FROM (
          COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) - cr.started_at
        )) / 86400.0 AS close_days
      FROM fin.close_run cr
      WHERE cr.tenant_id = $1::uuid
        AND cr.entity_code = $2
        AND cr.status IN ('SOFT_CLOSED', 'HARD_CLOSED')
        AND cr.started_at IS NOT NULL
        AND COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) IS NOT NULL
        AND NOT (cr.fiscal_year = $3 AND cr.period_number = $4)
      ORDER BY cr.fiscal_year DESC, cr.period_number DESC
      LIMIT 12`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );

    if (histResult.rows.length < 2) return null;

    const historicalDays = histResult.rows.map((r: any) => Number(r.close_days));
    const avgDays = historicalDays.reduce((a: number, b: number) => a + b, 0) / historicalDays.length;

    // Current progress
    const progressResult = await db.query(
      `SELECT
        COUNT(*)::int AS total_tasks,
        COUNT(*) FILTER (WHERE task_status IN ('COMPLETED', 'WAIVED'))::int AS done_tasks,
        EXTRACT(EPOCH FROM (now() - MIN(cr.started_at))) / 86400.0 AS elapsed_days
      FROM fin.period_close_checklist cc
      JOIN fin.close_run cr
        ON cr.tenant_id = cc.tenant_id
        AND cr.entity_code = cc.entity_code
        AND cr.fiscal_year = cc.fiscal_year
        AND cr.period_number = cc.period_number
      WHERE cc.tenant_id = $1::uuid
        AND cc.entity_code = $2
        AND cc.fiscal_year = $3
        AND cc.period_number = $4`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );

    const progress = progressResult.rows[0];
    const totalTasks = Number(progress?.total_tasks ?? 0);
    const doneTasks = Number(progress?.done_tasks ?? 0);
    const completionRate = totalTasks > 0 ? doneTasks / totalTasks : 0;

    // Latest snapshot for critical path
    const snapResult = await db.query(
      `SELECT critical_path_minutes
      FROM fin.close_orchestration_snapshot
      WHERE tenant_id = $1::uuid
        AND entity_code = $2
        AND fiscal_year = $3
        AND period_number = $4
      ORDER BY snapshot_at DESC LIMIT 1`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );
    const criticalPathMinutes = snapResult.rows[0]?.critical_path_minutes ?? null;

    // Risk signal count
    const riskResult = await db.query(
      `SELECT COUNT(*)::int AS cnt
      FROM fin.close_risk_signal
      WHERE tenant_id = $1::uuid
        AND entity_code = $2
        AND fiscal_year = $3
        AND period_number = $4
        AND signal_state IN ('fired', 'acknowledged')`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );
    const riskCount = Number(riskResult.rows[0]?.cnt ?? 0);

    // Recon completion rate
    const reconResult = await db.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS completed
      FROM fin.reconciliation_session rs
      JOIN fin.bank_statement bs ON bs.id = rs.statement_id
      WHERE rs.tenant_id = $1::uuid
        AND bs.entity_code = $2
        AND EXISTS (
          SELECT 1 FROM fin.fiscal_period fp
          WHERE fp.tenant_id = $1::uuid
            AND fp.entity_code = $2
            AND fp.fiscal_year = $3
            AND fp.period_number = $4
            AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
        )`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );
    const reconTotal = Number(reconResult.rows[0]?.total ?? 0);
    const reconDone = Number(reconResult.rows[0]?.completed ?? 0);
    const reconRate = reconTotal > 0 ? reconDone / reconTotal : 1;

    // Weighted prediction: 70% historical average, 30% pace-based estimate
    const paceEstimate = completionRate > 0.1
      ? Number(progress?.elapsed_days ?? 0) / completionRate
      : avgDays * 1.5;
    const riskPenalty = riskCount * 0.2;
    const reconPenalty = (1 - reconRate) * 1.0;

    const expectedDays = Math.max(
      0.5,
      avgDays * 0.7 + paceEstimate * 0.3 + riskPenalty + reconPenalty,
    );

    // Confidence based on sample size + variance
    const stddev = Math.sqrt(
      historicalDays.reduce((sum: number, d: number) => sum + (d - avgDays) ** 2, 0) /
        historicalDays.length,
    );
    const cv = avgDays > 0 ? stddev / avgDays : 1;
    const confidence = Math.round(
      Math.max(30, Math.min(95, 85 - cv * 50 + Math.min(histResult.rows.length, 6) * 2)),
    );

    return {
      expectedCloseDays: expectedDays.toFixed(1),
      confidencePercent: confidence,
      historicalAvgDays: avgDays.toFixed(1),
      currentProgressPercent: Math.round(completionRate * 100),
      criticalPathMinutes,
      factors: {
        taskCompletionRate: Math.round(completionRate * 100) / 100,
        riskSignalCount: riskCount,
        reconCompletionRate: Math.round(reconRate * 100) / 100,
        historicalCloseDays: historicalDays.map((d: number) => Math.round(d * 10) / 10),
      },
    };
  }

  // -----------------------------------------------------------------------
  // 2. Release Readiness Probability
  // -----------------------------------------------------------------------

  private async predictReleaseReadiness(
    db: any,
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ReleaseReadinessPrediction | null> {
    // Task completion
    const taskResult = await db.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE task_status IN ('COMPLETED', 'WAIVED'))::int AS done,
        COUNT(*) FILTER (WHERE task_status = 'FAILED')::int AS failed,
        COUNT(*) FILTER (WHERE task_status = 'BLOCKED')::int AS blocked
      FROM fin.period_close_checklist
      WHERE tenant_id = $1::uuid
        AND entity_code = $2
        AND fiscal_year = $3
        AND period_number = $4`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );

    const t = taskResult.rows[0];
    const totalTasks = Number(t?.total ?? 0);
    const doneTasks = Number(t?.done ?? 0);
    const failedTasks = Number(t?.failed ?? 0);
    const blockedTasks = Number(t?.blocked ?? 0);
    const taskRate = totalTasks > 0 ? doneTasks / totalTasks : 0;

    // Risk signals
    const riskResult = await db.query(
      `SELECT
        COUNT(*)::int AS active,
        COUNT(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS high_critical
      FROM fin.close_risk_signal
      WHERE tenant_id = $1::uuid
        AND entity_code = $2
        AND fiscal_year = $3
        AND period_number = $4
        AND signal_state IN ('fired', 'acknowledged')`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );
    const activeSignals = Number(riskResult.rows[0]?.active ?? 0);
    const highCriticalSignals = Number(riskResult.rows[0]?.high_critical ?? 0);

    // Critical anomalies
    const anomalyResult = await db.query(
      `SELECT COUNT(*)::int AS cnt
      FROM fin.atlas_anomaly
      WHERE tenant_id = $1::uuid
        AND entity_code = $2
        AND fiscal_year = $3
        AND period_number = $4
        AND severity = 'CRITICAL'
        AND status IN ('OPEN', 'ACKNOWLEDGED')`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );
    const criticalAnomalies = Number(anomalyResult.rows[0]?.cnt ?? 0);

    // Reconciliation status
    const reconResult = await db.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS completed
      FROM fin.reconciliation_session rs
      JOIN fin.bank_statement bs ON bs.id = rs.statement_id
      WHERE rs.tenant_id = $1::uuid
        AND bs.entity_code = $2
        AND EXISTS (
          SELECT 1 FROM fin.fiscal_period fp
          WHERE fp.tenant_id = $1::uuid
            AND fp.entity_code = $2
            AND fp.fiscal_year = $3
            AND fp.period_number = $4
            AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
        )`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );
    const reconTotal = Number(reconResult.rows[0]?.total ?? 0);
    const reconDone = Number(reconResult.rows[0]?.completed ?? 0);
    const reconComplete = reconTotal === 0 || reconDone === reconTotal;

    // GL consistency check (simplified)
    const consistencyResult = await db.query(
      `SELECT
        COALESCE(SUM(total_debit), 0) = COALESCE(SUM(total_credit), 0) AS balanced
      FROM fin.journal_entry
      WHERE tenant_id = $1::uuid
        AND entity_code = $2
        AND fiscal_year = $3
        AND period_number = $4
        AND status = 'POSTED'`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );
    const consistencyPassing = consistencyResult.rows[0]?.balanced ?? true;

    // Compute probability
    const blockers: string[] = [];
    let probability = 1.0;

    // Task completion impact
    probability *= taskRate;
    if (failedTasks > 0) {
      blockers.push(`${failedTasks} failed task(s)`);
      probability *= 0.3;
    }
    if (blockedTasks > 0) {
      blockers.push(`${blockedTasks} blocked task(s)`);
      probability *= 0.5;
    }

    // Risk signal impact
    if (highCriticalSignals > 0) {
      blockers.push(`${highCriticalSignals} high/critical risk signal(s)`);
      probability *= Math.max(0.1, 1 - highCriticalSignals * 0.25);
    }

    // Critical anomaly impact
    if (criticalAnomalies > 0) {
      blockers.push(`${criticalAnomalies} critical anomaly(ies)`);
      probability *= Math.max(0.2, 1 - criticalAnomalies * 0.2);
    }

    // Reconciliation impact
    if (!reconComplete) {
      blockers.push(`Reconciliation incomplete (${reconDone}/${reconTotal})`);
      probability *= 0.4;
    }

    // Consistency impact
    if (!consistencyPassing) {
      blockers.push("GL consistency check failing");
      probability *= 0.2;
    }

    probability = Math.round(probability * 100) / 100;

    // Confidence based on data completeness
    const confidence = totalTasks > 0 ? Math.min(90, 60 + totalTasks * 2) : 30;

    return {
      probability,
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

  // -----------------------------------------------------------------------
  // 3. Reconciliation Completion Forecast
  // -----------------------------------------------------------------------

  private async predictReconCompletion(
    db: any,
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ReconCompletionPrediction | null> {
    // Current sessions for this period
    const currentResult = await db.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE rs.status = 'OPEN')::int AS open_sessions,
        AVG(
          CASE WHEN rs.total_lines > 0
            THEN (rs.auto_matched + rs.manual_matched)::decimal / rs.total_lines
            ELSE 0
          END
        ) AS avg_match_rate
      FROM fin.reconciliation_session rs
      JOIN fin.bank_statement bs ON bs.id = rs.statement_id
      WHERE rs.tenant_id = $1::uuid
        AND bs.entity_code = $2
        AND EXISTS (
          SELECT 1 FROM fin.fiscal_period fp
          WHERE fp.tenant_id = $1::uuid
            AND fp.entity_code = $2
            AND fp.fiscal_year = $3
            AND fp.period_number = $4
            AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
        )`,
      [tenantId, entityCode, fiscalYear, periodNumber],
    );

    const current = currentResult.rows[0];
    const totalSessions = Number(current?.total ?? 0);
    const completedSessions = Number(current?.completed ?? 0);
    const sessionsRemaining = totalSessions - completedSessions;
    const avgMatchRate = Number(current?.avg_match_rate ?? 0);

    if (totalSessions === 0) return null;

    // Historical completion times
    const histResult = await db.query(
      `SELECT
        EXTRACT(EPOCH FROM (rs.completed_at - rs.started_at)) / 3600.0 AS hours
      FROM fin.reconciliation_session rs
      WHERE rs.tenant_id = $1::uuid
        AND rs.status = 'COMPLETED'
        AND rs.completed_at IS NOT NULL
        AND rs.started_at IS NOT NULL
      ORDER BY rs.completed_at DESC
      LIMIT 20`,
      [tenantId],
    );

    const historicalHours = histResult.rows.map((r: any) => Number(r.hours));
    const avgHours = historicalHours.length > 0
      ? historicalHours.reduce((a: number, b: number) => a + b, 0) / historicalHours.length
      : 4; // default 4 hours per session

    const expectedHours = sessionsRemaining * avgHours;

    // Confidence based on historical data
    const confidence = Math.min(
      90,
      40 + Math.min(historicalHours.length, 10) * 5,
    );

    return {
      expectedHours: expectedHours.toFixed(1),
      confidencePercent: confidence,
      sessionsRemaining,
      historicalAvgHours: avgHours.toFixed(1),
      factors: {
        totalSessions,
        completedSessions,
        avgMatchRate: Math.round(avgMatchRate * 100) / 100,
        historicalCompletionHours: historicalHours
          .slice(0, 6)
          .map((h: number) => Math.round(h * 10) / 10),
      },
    };
  }
}
