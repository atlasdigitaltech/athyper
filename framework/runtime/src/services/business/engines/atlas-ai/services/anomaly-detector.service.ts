// framework/runtime/src/services/business/engines/atlas-ai/services/anomaly-detector.service.ts
//
// Anomaly Detector Service — compares current period data against statistical
// baselines to detect financial anomalies.
//
// Architecture:
//   - Reads GL balances for current period (governed data)
//   - Compares against baselines (mean + stddev)
//   - Produces anomalies in fin.atlas_anomaly
//   - Does NOT create risk signals directly — the risk signal dispatcher
//     picks up anomalies via the atlas_anomaly evaluator in close-risk-evaluator
//   - Deterministic, explainable, no LLM

import { ok, fail } from "../../shared/engine-base.js";
import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type {
  AnomalyDetectionInput,
  AnomalyDetectionResult,
  AnomalySeverity,
  AnomalyType,
} from "../domain/anomaly-types.js";
import { computeAnomalySeverity } from "../domain/anomaly-types.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface AnomalyDetectorService {
  /** Detect anomalies for a period by comparing GL data against baselines */
  detect(
    ctx: OperationContext,
    input: AnomalyDetectionInput,
  ): Promise<ServiceResult<AnomalyDetectionResult>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultAnomalyDetectorService implements AnomalyDetectorService {
  constructor(
    private readonly container: { resolve: <T>(token: string) => T | Promise<T> },
  ) {}

  async detect(
    ctx: OperationContext,
    input: AnomalyDetectionInput,
  ): Promise<ServiceResult<AnomalyDetectionResult>> {
    const db = await this.container.resolve<any>("db");
    const {
      tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      bookCode = "STAT",
    } = input;

    try {
      const anomalies: AnomalyDetectionResult["anomalies"] = [];
      let created = 0;
      let escalated = 0;

      // -----------------------------------------------------------------
      // Detection 1: AMOUNT_OUTLIER — GL balance vs baseline z-score
      // -----------------------------------------------------------------
      const outlierResult = await db.query(
        `SELECT
          g.account_id,
          c.account_code,
          c.account_name,
          c.account_type,
          SUM(g.period_debit)  AS current_debit,
          SUM(g.period_credit) AS current_credit,
          SUM(g.period_debit) - SUM(g.period_credit) AS current_net,
          b.baseline_mean,
          b.baseline_stddev,
          b.sample_count,
          b.id AS baseline_id,
          CASE
            WHEN b.baseline_stddev > 0 THEN
              (SUM(g.period_debit) - SUM(g.period_credit) - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END AS z_score
        FROM fin.gl_balance g
        JOIN fin.chart_of_accounts c ON c.id = g.account_id
        LEFT JOIN fin.atlas_anomaly_baseline b
          ON b.tenant_id = g.tenant_id
          AND b.entity_code = g.entity_code
          AND b.account_id = g.account_id
          AND b.metric_type = 'NET_MOVEMENT'
          AND b.book_code = g.book_code
        WHERE g.tenant_id = $1::uuid
          AND g.entity_code = $2
          AND g.book_code = $3
          AND g.fiscal_year = $4
          AND g.period_number = $5
          AND b.id IS NOT NULL
          AND b.baseline_stddev > 0
          AND b.sample_count >= 3
        GROUP BY g.account_id, c.account_code, c.account_name, c.account_type,
                 b.baseline_mean, b.baseline_stddev, b.sample_count, b.id
        HAVING ABS(
          CASE
            WHEN b.baseline_stddev > 0 THEN
              (SUM(g.period_debit) - SUM(g.period_credit) - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END
        ) >= 2.5`,
        [tenantId, entityCode, bookCode, fiscalYear, periodNumber],
      );

      for (const row of outlierResult.rows) {
        const zScore = Number(row.z_score);
        const severity = computeAnomalySeverity(zScore);
        const currentNet = Number(row.current_net);
        const expectedNet = Number(row.baseline_mean);

        const r = await this.upsertAnomaly(db, {
          tenantId,
          entityCode,
          anomalyType: "AMOUNT_OUTLIER" as AnomalyType,
          severity,
          accountId: row.account_id,
          fiscalYear,
          periodNumber,
          bookCode,
          observedValue: String(currentNet),
          expectedValue: String(expectedNet),
          zScore: String(Math.round(zScore * 100) / 100),
          baselineId: row.baseline_id,
          title: `${row.account_code} ${row.account_name} — ${Math.abs(zScore).toFixed(1)}σ ${zScore > 0 ? "above" : "below"} baseline`,
          description: `Account ${row.account_code} net movement of ${currentNet.toLocaleString()} is ${Math.abs(zScore).toFixed(1)} standard deviations ${zScore > 0 ? "above" : "below"} the ${row.sample_count}-period baseline mean of ${expectedNet.toLocaleString()}.`,
          evidence: {
            accountCode: row.account_code,
            accountName: row.account_name,
            accountType: row.account_type,
            currentNet,
            baselineMean: expectedNet,
            baselineStddev: Number(row.baseline_stddev),
            sampleCount: row.sample_count,
            zScore: Math.round(zScore * 100) / 100,
          },
        });

        if (r.created) created++;
        anomalies.push({
          anomalyType: "AMOUNT_OUTLIER",
          severity,
          accountId: row.account_id,
          title: r.anomaly.title,
          zScore: String(Math.round(zScore * 100) / 100),
        });
      }

      // -----------------------------------------------------------------
      // Detection 2: UNUSUAL_ADJUSTMENT — adjustment JE count outlier
      // -----------------------------------------------------------------
      const adjustmentResult = await db.query(
        `WITH current_adjustments AS (
          SELECT
            jl.account_id,
            COUNT(DISTINCT je.id) AS adj_count
          FROM fin.journal_entry je
          JOIN fin.journal_line jl ON jl.je_id = je.id
          WHERE je.tenant_id = $1::uuid
            AND je.entity_code = $2
            AND je.book_code = $3
            AND je.fiscal_year = $4
            AND je.period_number = $5
            AND je.status = 'POSTED'
            AND je.source_type IN ('ADJUSTMENT', 'MANUAL', 'RECLASS')
          GROUP BY jl.account_id
        )
        SELECT
          ca.account_id,
          c.account_code,
          c.account_name,
          ca.adj_count,
          b.baseline_mean,
          b.baseline_stddev,
          b.sample_count,
          b.id AS baseline_id,
          CASE
            WHEN b.baseline_stddev > 0 THEN
              (ca.adj_count - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END AS z_score
        FROM current_adjustments ca
        JOIN fin.chart_of_accounts c ON c.id = ca.account_id
        LEFT JOIN fin.atlas_anomaly_baseline b
          ON b.tenant_id = $1::uuid
          AND b.entity_code = $2
          AND b.account_id = ca.account_id
          AND b.metric_type = 'ADJUSTMENT_COUNT'
          AND b.book_code = $3
        WHERE b.id IS NOT NULL
          AND b.baseline_stddev > 0
          AND b.sample_count >= 3
          AND CASE
            WHEN b.baseline_stddev > 0 THEN
              (ca.adj_count - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END >= 2.5`,
        [tenantId, entityCode, bookCode, fiscalYear, periodNumber],
      );

      for (const row of adjustmentResult.rows) {
        const zScore = Number(row.z_score);
        const severity = computeAnomalySeverity(zScore);

        const r = await this.upsertAnomaly(db, {
          tenantId,
          entityCode,
          anomalyType: "UNUSUAL_ADJUSTMENT" as AnomalyType,
          severity,
          accountId: row.account_id,
          fiscalYear,
          periodNumber,
          bookCode,
          observedValue: String(row.adj_count),
          expectedValue: String(Math.round(Number(row.baseline_mean) * 10) / 10),
          zScore: String(Math.round(zScore * 100) / 100),
          baselineId: row.baseline_id,
          title: `${row.account_code} — ${row.adj_count} adjustments (${Math.abs(zScore).toFixed(1)}σ above baseline)`,
          description: `Account ${row.account_code} has ${row.adj_count} adjustment entries this period, ${Math.abs(zScore).toFixed(1)} standard deviations above the baseline mean of ${Number(row.baseline_mean).toFixed(1)}.`,
          evidence: {
            accountCode: row.account_code,
            accountName: row.account_name,
            adjustmentCount: Number(row.adj_count),
            baselineMean: Number(row.baseline_mean),
            baselineStddev: Number(row.baseline_stddev),
            sampleCount: row.sample_count,
            zScore: Math.round(zScore * 100) / 100,
          },
        });

        if (r.created) created++;
        anomalies.push({
          anomalyType: "UNUSUAL_ADJUSTMENT",
          severity,
          accountId: row.account_id,
          title: r.anomaly.title,
          zScore: String(Math.round(zScore * 100) / 100),
        });
      }

      // -----------------------------------------------------------------
      // Detection 3: RECON_VARIANCE — reconciliation discrepancy outlier
      // -----------------------------------------------------------------
      const reconResult = await db.query(
        `SELECT
          rs.id AS session_id,
          bs.bank_name,
          bs.statement_number,
          rs.discrepancy,
          ABS(rs.discrepancy) AS abs_discrepancy,
          rs.unmatched
        FROM fin.reconciliation_session rs
        JOIN fin.bank_statement bs ON bs.id = rs.statement_id
        WHERE rs.tenant_id = $1::uuid
          AND bs.entity_code = $2
          AND rs.status = 'COMPLETED'
          AND (ABS(rs.discrepancy) > 100 OR rs.unmatched > 0)
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

      for (const row of reconResult.rows) {
        const discrepancy = Number(row.discrepancy);
        const absDiscrepancy = Math.abs(discrepancy);
        const severity: AnomalySeverity =
          absDiscrepancy > 10000 ? "CRITICAL" :
          absDiscrepancy > 1000 ? "WARNING" : "INFO";

        const r = await this.upsertAnomaly(db, {
          tenantId,
          entityCode,
          anomalyType: "RECON_VARIANCE" as AnomalyType,
          severity,
          accountId: null,
          fiscalYear,
          periodNumber,
          bookCode,
          observedValue: String(discrepancy),
          expectedValue: "0",
          zScore: null,
          baselineId: null,
          title: `${row.bank_name} #${row.statement_number} — $${absDiscrepancy.toLocaleString()} reconciliation variance`,
          description: `Bank statement ${row.statement_number} from ${row.bank_name} has a reconciliation discrepancy of $${discrepancy.toLocaleString()}${row.unmatched > 0 ? ` with ${row.unmatched} unmatched lines` : ""}.`,
          evidence: {
            sessionId: row.session_id,
            bankName: row.bank_name,
            statementNumber: row.statement_number,
            discrepancy,
            unmatchedLines: Number(row.unmatched),
          },
        });

        if (r.created) created++;
        anomalies.push({
          anomalyType: "RECON_VARIANCE",
          severity,
          accountId: null,
          title: r.anomaly.title,
          zScore: null,
        });
      }

      // -----------------------------------------------------------------
      // Detection 4: PERIOD_END_SPIKE — journal volume in last 3 days
      // -----------------------------------------------------------------
      const spikeResult = await db.query(
        `WITH current_volume AS (
          SELECT
            jl.account_id,
            c.account_code,
            c.account_name,
            COUNT(*)::int AS late_count
          FROM fin.journal_entry je
          JOIN fin.journal_line jl ON jl.je_id = je.id
          JOIN fin.chart_of_accounts c ON c.id = jl.account_id
          JOIN fin.fiscal_period fp
            ON fp.tenant_id = je.tenant_id
            AND fp.entity_code = je.entity_code
            AND fp.fiscal_year = je.fiscal_year
            AND fp.period_number = je.period_number
          WHERE je.tenant_id = $1::uuid
            AND je.entity_code = $2
            AND je.fiscal_year = $3
            AND je.period_number = $4
            AND je.status = 'POSTED'
            AND je.posting_date >= (fp.end_date - interval '2 days')::date
          GROUP BY jl.account_id, c.account_code, c.account_name
        )
        SELECT
          cv.account_id,
          cv.account_code,
          cv.account_name,
          cv.late_count,
          b.baseline_mean,
          b.baseline_stddev,
          b.sample_count,
          b.id AS baseline_id,
          CASE WHEN b.baseline_stddev > 0
            THEN (cv.late_count - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END AS z_score
        FROM current_volume cv
        LEFT JOIN fin.atlas_anomaly_baseline b
          ON b.tenant_id = $1::uuid
          AND b.entity_code = $2
          AND b.account_id = cv.account_id
          AND b.metric_type = 'LAST_3_DAYS_VOLUME'
          AND b.book_code = $5
        WHERE b.id IS NOT NULL
          AND b.baseline_stddev > 0
          AND b.sample_count >= 3
          AND (cv.late_count - b.baseline_mean) / b.baseline_stddev >= 2.5`,
        [tenantId, entityCode, fiscalYear, periodNumber, bookCode],
      );

      for (const row of spikeResult.rows) {
        const zScore = Number(row.z_score);
        const severity = computeAnomalySeverity(zScore);
        const r = await this.upsertAnomaly(db, {
          tenantId, entityCode,
          anomalyType: "PERIOD_END_SPIKE" as AnomalyType,
          severity,
          accountId: row.account_id,
          fiscalYear, periodNumber, bookCode,
          observedValue: String(row.late_count),
          expectedValue: String(Math.round(Number(row.baseline_mean) * 10) / 10),
          zScore: String(Math.round(zScore * 100) / 100),
          baselineId: row.baseline_id,
          title: `${row.account_code} — ${row.late_count} entries in last 3 days (${Math.abs(zScore).toFixed(1)}σ spike)`,
          description: `Account ${row.account_code} ${row.account_name} has ${row.late_count} journal entries posted in the last 3 days of the period, ${Math.abs(zScore).toFixed(1)} standard deviations above the baseline of ${Number(row.baseline_mean).toFixed(1)}.`,
          evidence: {
            accountCode: row.account_code, accountName: row.account_name,
            lateEntryCount: Number(row.late_count),
            baselineMean: Number(row.baseline_mean),
            baselineStddev: Number(row.baseline_stddev),
            zScore: Math.round(zScore * 100) / 100,
          },
        });
        if (r.created) created++;
        anomalies.push({
          anomalyType: "PERIOD_END_SPIKE", severity,
          accountId: row.account_id, title: r.anomaly.title,
          zScore: String(Math.round(zScore * 100) / 100),
        });
      }

      // -----------------------------------------------------------------
      // Detection 5: MANUAL_JOURNAL_RATIO — manual entry ratio vs baseline
      // -----------------------------------------------------------------
      const manualResult = await db.query(
        `WITH current_ratio AS (
          SELECT
            COUNT(*) FILTER (WHERE doc_type IN ('MANUAL','ADJUSTMENT'))::decimal
              / GREATEST(COUNT(*), 1)::decimal AS manual_ratio,
            COUNT(*) AS total_entries,
            COUNT(*) FILTER (WHERE doc_type IN ('MANUAL','ADJUSTMENT'))::int AS manual_count
          FROM fin.journal_entry
          WHERE tenant_id = $1::uuid
            AND entity_code = $2
            AND fiscal_year = $3
            AND period_number = $4
            AND status = 'POSTED'
        )
        SELECT
          cr.manual_ratio,
          cr.total_entries,
          cr.manual_count,
          b.baseline_mean,
          b.baseline_stddev,
          b.sample_count,
          b.id AS baseline_id,
          CASE WHEN b.baseline_stddev > 0
            THEN (cr.manual_ratio - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END AS z_score
        FROM current_ratio cr
        LEFT JOIN fin.atlas_anomaly_baseline b
          ON b.tenant_id = $1::uuid
          AND b.entity_code = $2
          AND b.account_id IS NULL
          AND b.metric_type = 'MANUAL_ENTRY_RATIO'
          AND b.book_code = $5
        WHERE b.id IS NOT NULL
          AND b.baseline_stddev > 0
          AND b.sample_count >= 3
          AND cr.manual_ratio > 0
          AND (cr.manual_ratio - b.baseline_mean) / b.baseline_stddev >= 2.5`,
        [tenantId, entityCode, fiscalYear, periodNumber, bookCode],
      );

      for (const row of manualResult.rows) {
        const zScore = Number(row.z_score);
        const severity = computeAnomalySeverity(zScore);
        const ratio = (Number(row.manual_ratio) * 100).toFixed(1);
        const baselineRatio = (Number(row.baseline_mean) * 100).toFixed(1);
        const r = await this.upsertAnomaly(db, {
          tenantId, entityCode,
          anomalyType: "MANUAL_JOURNAL_RATIO" as AnomalyType,
          severity,
          accountId: null,
          fiscalYear, periodNumber, bookCode,
          observedValue: String(Number(row.manual_ratio).toFixed(4)),
          expectedValue: String(Number(row.baseline_mean).toFixed(4)),
          zScore: String(Math.round(zScore * 100) / 100),
          baselineId: row.baseline_id,
          title: `Manual journal ratio ${ratio}% (${Math.abs(zScore).toFixed(1)}σ above baseline ${baselineRatio}%)`,
          description: `${row.manual_count} of ${row.total_entries} journal entries (${ratio}%) are manual or adjustment entries, ${Math.abs(zScore).toFixed(1)} standard deviations above the baseline of ${baselineRatio}%.`,
          evidence: {
            manualRatio: Number(row.manual_ratio),
            manualCount: Number(row.manual_count),
            totalEntries: Number(row.total_entries),
            baselineMean: Number(row.baseline_mean),
            baselineStddev: Number(row.baseline_stddev),
            zScore: Math.round(zScore * 100) / 100,
          },
        });
        if (r.created) created++;
        anomalies.push({
          anomalyType: "MANUAL_JOURNAL_RATIO", severity,
          accountId: null, title: r.anomaly.title,
          zScore: String(Math.round(zScore * 100) / 100),
        });
      }

      // -----------------------------------------------------------------
      // Detection 6: LATE_CLOSE_TASK — close task duration exceeds baseline
      // -----------------------------------------------------------------
      const taskResult = await db.query(
        `WITH current_duration AS (
          SELECT
            AVG(EXTRACT(EPOCH FROM (cc.completed_at - cr.started_at)) / 3600)::decimal AS avg_hours,
            COUNT(*)::int AS completed_tasks
          FROM fin.period_close_checklist cc
          JOIN fin.close_run cr
            ON cr.tenant_id = cc.tenant_id
            AND cr.entity_code = cc.entity_code
            AND cr.fiscal_year = cc.fiscal_year
            AND cr.period_number = cc.period_number
          WHERE cc.tenant_id = $1::uuid
            AND cc.entity_code = $2
            AND cc.fiscal_year = $3
            AND cc.period_number = $4
            AND cc.task_status = 'COMPLETED'
            AND cc.completed_at IS NOT NULL
            AND cr.started_at IS NOT NULL
        )
        SELECT
          cd.avg_hours,
          cd.completed_tasks,
          b.baseline_mean,
          b.baseline_stddev,
          b.sample_count,
          b.id AS baseline_id,
          CASE WHEN b.baseline_stddev > 0
            THEN (cd.avg_hours - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END AS z_score
        FROM current_duration cd
        LEFT JOIN fin.atlas_anomaly_baseline b
          ON b.tenant_id = $1::uuid
          AND b.entity_code = $2
          AND b.account_id IS NULL
          AND b.metric_type = 'CLOSE_TASK_DURATION'
          AND b.book_code = $5
        WHERE b.id IS NOT NULL
          AND b.baseline_stddev > 0
          AND b.sample_count >= 3
          AND cd.avg_hours > 0
          AND (cd.avg_hours - b.baseline_mean) / b.baseline_stddev >= 2.5`,
        [tenantId, entityCode, fiscalYear, periodNumber, bookCode],
      );

      for (const row of taskResult.rows) {
        const zScore = Number(row.z_score);
        const severity = computeAnomalySeverity(zScore);
        const avgHours = Number(row.avg_hours).toFixed(1);
        const baselineHours = Number(row.baseline_mean).toFixed(1);
        const r = await this.upsertAnomaly(db, {
          tenantId, entityCode,
          anomalyType: "LATE_CLOSE_TASK" as AnomalyType,
          severity,
          accountId: null,
          fiscalYear, periodNumber, bookCode,
          observedValue: String(Number(row.avg_hours).toFixed(2)),
          expectedValue: String(Number(row.baseline_mean).toFixed(2)),
          zScore: String(Math.round(zScore * 100) / 100),
          baselineId: row.baseline_id,
          title: `Close tasks averaging ${avgHours}h (${Math.abs(zScore).toFixed(1)}σ above baseline ${baselineHours}h)`,
          description: `Average close task completion time is ${avgHours} hours across ${row.completed_tasks} tasks, ${Math.abs(zScore).toFixed(1)} standard deviations above the baseline of ${baselineHours} hours.`,
          evidence: {
            avgHours: Number(row.avg_hours),
            completedTasks: Number(row.completed_tasks),
            baselineMean: Number(row.baseline_mean),
            baselineStddev: Number(row.baseline_stddev),
            zScore: Math.round(zScore * 100) / 100,
          },
        });
        if (r.created) created++;
        anomalies.push({
          anomalyType: "LATE_CLOSE_TASK", severity,
          accountId: null, title: r.anomaly.title,
          zScore: String(Math.round(zScore * 100) / 100),
        });
      }

      // -----------------------------------------------------------------
      // Detection 7: OVERRIDE_SPIKE — waiver count exceeds baseline
      // -----------------------------------------------------------------
      const overrideResult = await db.query(
        `WITH current_waivers AS (
          SELECT
            COUNT(*) FILTER (WHERE task_status = 'WAIVED')::int AS waiver_count,
            COUNT(*)::int AS total_tasks
          FROM fin.period_close_checklist
          WHERE tenant_id = $1::uuid
            AND entity_code = $2
            AND fiscal_year = $3
            AND period_number = $4
        )
        SELECT
          cw.waiver_count,
          cw.total_tasks,
          b.baseline_mean,
          b.baseline_stddev,
          b.sample_count,
          b.id AS baseline_id,
          CASE WHEN b.baseline_stddev > 0
            THEN (cw.waiver_count - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END AS z_score
        FROM current_waivers cw
        LEFT JOIN fin.atlas_anomaly_baseline b
          ON b.tenant_id = $1::uuid
          AND b.entity_code = $2
          AND b.account_id IS NULL
          AND b.metric_type = 'WAIVER_COUNT'
          AND b.book_code = $5
        WHERE b.id IS NOT NULL
          AND b.baseline_stddev > 0
          AND b.sample_count >= 3
          AND cw.waiver_count > 0
          AND (cw.waiver_count - b.baseline_mean) / b.baseline_stddev >= 2.5`,
        [tenantId, entityCode, fiscalYear, periodNumber, bookCode],
      );

      for (const row of overrideResult.rows) {
        const zScore = Number(row.z_score);
        const severity = computeAnomalySeverity(zScore);
        const r = await this.upsertAnomaly(db, {
          tenantId, entityCode,
          anomalyType: "OVERRIDE_SPIKE" as AnomalyType,
          severity,
          accountId: null,
          fiscalYear, periodNumber, bookCode,
          observedValue: String(row.waiver_count),
          expectedValue: String(Math.round(Number(row.baseline_mean) * 10) / 10),
          zScore: String(Math.round(zScore * 100) / 100),
          baselineId: row.baseline_id,
          title: `${row.waiver_count} task waivers (${Math.abs(zScore).toFixed(1)}σ above baseline)`,
          description: `${row.waiver_count} of ${row.total_tasks} close tasks were waived this period, ${Math.abs(zScore).toFixed(1)} standard deviations above the baseline of ${Number(row.baseline_mean).toFixed(1)}.`,
          evidence: {
            waiverCount: Number(row.waiver_count),
            totalTasks: Number(row.total_tasks),
            baselineMean: Number(row.baseline_mean),
            baselineStddev: Number(row.baseline_stddev),
            zScore: Math.round(zScore * 100) / 100,
          },
        });
        if (r.created) created++;
        anomalies.push({
          anomalyType: "OVERRIDE_SPIKE", severity,
          accountId: null, title: r.anomaly.title,
          zScore: String(Math.round(zScore * 100) / 100),
        });
      }

      // -----------------------------------------------------------------
      // Detection 8: LARGE_ADJUSTMENT — single adjustment exceeds baseline
      // -----------------------------------------------------------------
      const largeAdjResult = await db.query(
        `WITH current_max AS (
          SELECT
            jl.account_id,
            c.account_code,
            c.account_name,
            MAX(GREATEST(jl.debit_amount, jl.credit_amount)) AS max_amount
          FROM fin.journal_entry je
          JOIN fin.journal_line jl ON jl.je_id = je.id
          JOIN fin.chart_of_accounts c ON c.id = jl.account_id
          WHERE je.tenant_id = $1::uuid
            AND je.entity_code = $2
            AND je.fiscal_year = $3
            AND je.period_number = $4
            AND je.status = 'POSTED'
            AND je.doc_type IN ('ADJUSTMENT', 'MANUAL', 'RECLASS')
          GROUP BY jl.account_id, c.account_code, c.account_name
        )
        SELECT
          cm.account_id,
          cm.account_code,
          cm.account_name,
          cm.max_amount,
          b.baseline_mean,
          b.baseline_stddev,
          b.sample_count,
          b.id AS baseline_id,
          CASE WHEN b.baseline_stddev > 0
            THEN (cm.max_amount - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END AS z_score
        FROM current_max cm
        LEFT JOIN fin.atlas_anomaly_baseline b
          ON b.tenant_id = $1::uuid
          AND b.entity_code = $2
          AND b.account_id = cm.account_id
          AND b.metric_type = 'MAX_ADJUSTMENT_AMOUNT'
          AND b.book_code = $5
        WHERE b.id IS NOT NULL
          AND b.baseline_stddev > 0
          AND b.sample_count >= 3
          AND (cm.max_amount - b.baseline_mean) / b.baseline_stddev >= 2.5`,
        [tenantId, entityCode, fiscalYear, periodNumber, bookCode],
      );

      for (const row of largeAdjResult.rows) {
        const zScore = Number(row.z_score);
        const severity = computeAnomalySeverity(zScore);
        const maxAmt = Number(row.max_amount);
        const r = await this.upsertAnomaly(db, {
          tenantId, entityCode,
          anomalyType: "LARGE_ADJUSTMENT" as AnomalyType,
          severity,
          accountId: row.account_id,
          fiscalYear, periodNumber, bookCode,
          observedValue: String(maxAmt),
          expectedValue: String(Number(row.baseline_mean).toFixed(2)),
          zScore: String(Math.round(zScore * 100) / 100),
          baselineId: row.baseline_id,
          title: `${row.account_code} — $${maxAmt.toLocaleString()} adjustment (${Math.abs(zScore).toFixed(1)}σ above baseline)`,
          description: `Account ${row.account_code} ${row.account_name} has a single adjustment of $${maxAmt.toLocaleString()}, ${Math.abs(zScore).toFixed(1)} standard deviations above the historical maximum adjustment baseline of $${Number(row.baseline_mean).toLocaleString()}.`,
          evidence: {
            accountCode: row.account_code, accountName: row.account_name,
            maxAdjustmentAmount: maxAmt,
            baselineMean: Number(row.baseline_mean),
            baselineStddev: Number(row.baseline_stddev),
            zScore: Math.round(zScore * 100) / 100,
          },
        });
        if (r.created) created++;
        anomalies.push({
          anomalyType: "LARGE_ADJUSTMENT", severity,
          accountId: row.account_id, title: r.anomaly.title,
          zScore: String(Math.round(zScore * 100) / 100),
        });
      }

      return ok({
        detected: anomalies.length,
        created,
        escalated,
        anomalies,
      });
    } catch (err) {
      return fail(
        "ANOMALY_DETECTION_FAILED",
        `Failed to detect anomalies: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private: upsert anomaly (deduplicate by type+account+period)
  // -----------------------------------------------------------------------

  private async upsertAnomaly(
    db: any,
    input: {
      tenantId: string;
      entityCode: string;
      anomalyType: AnomalyType;
      severity: AnomalySeverity;
      accountId: string | null;
      fiscalYear: number;
      periodNumber: number;
      bookCode: string;
      observedValue: string | null;
      expectedValue: string | null;
      zScore: string | null;
      baselineId: string | null;
      title: string;
      description: string;
      evidence: Record<string, unknown>;
    },
  ): Promise<{ anomaly: { id: string; title: string }; created: boolean }> {
    const result = await db.query(
      `INSERT INTO fin.atlas_anomaly (
        tenant_id, entity_code, anomaly_type, severity,
        account_id, fiscal_year, period_number, book_code,
        observed_value, expected_value, z_score, baseline_id,
        title, description, evidence, status, detected_at
      ) VALUES (
        $1::uuid, $2, $3, $4,
        $5::uuid, $6, $7, $8,
        $9::decimal, $10::decimal, $11::decimal, $12::uuid,
        $13, $14, $15::jsonb, 'OPEN', now()
      )
      ON CONFLICT (tenant_id, entity_code, anomaly_type, account_id, fiscal_year, period_number, book_code)
      DO UPDATE SET
        severity = EXCLUDED.severity,
        observed_value = EXCLUDED.observed_value,
        expected_value = EXCLUDED.expected_value,
        z_score = EXCLUDED.z_score,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        evidence = EXCLUDED.evidence,
        updated_at = now()
      RETURNING id, title, (xmax = 0) AS is_insert`,
      [
        input.tenantId, input.entityCode, input.anomalyType, input.severity,
        input.accountId, input.fiscalYear, input.periodNumber, input.bookCode,
        input.observedValue, input.expectedValue, input.zScore, input.baselineId,
        input.title, input.description, JSON.stringify(input.evidence),
      ],
    );

    return {
      anomaly: result.rows[0],
      created: result.rows[0]?.is_insert ?? false,
    };
  }
}
