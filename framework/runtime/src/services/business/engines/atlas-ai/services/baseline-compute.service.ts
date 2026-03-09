// framework/runtime/src/services/business/engines/atlas-ai/services/baseline-compute.service.ts
//
// Baseline Compute Service — computes rolling statistical baselines from
// GL balance and close operations history. Runs as a scheduled job after
// period close.
//
// Architecture:
//   - Reads from fin.gl_balance, fin.journal_entry, fin.period_close_checklist,
//     fin.close_run (all governed, certified data)
//   - Writes to fin.atlas_anomaly_baseline
//   - Uses trailing N-period window (default 12)
//   - Computes mean + stddev for each account × metric
//   - No LLM required — pure statistical computation

import { ok, fail } from "../../shared/engine-base.js";
import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type {
  BaselineComputeInput,
  BaselineComputeResult,
} from "../domain/anomaly-types.js";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface BaselineComputeService {
  /** Compute baselines for all accounts in an entity/period */
  compute(
    ctx: OperationContext,
    input: BaselineComputeInput,
  ): Promise<ServiceResult<BaselineComputeResult>>;
}

// ---------------------------------------------------------------------------
// Default implementation (container-resolved DB)
// ---------------------------------------------------------------------------

export class DefaultBaselineComputeService implements BaselineComputeService {
  constructor(
    private readonly container: { resolve: <T>(token: string) => T | Promise<T> },
  ) {}

  async compute(
    ctx: OperationContext,
    input: BaselineComputeInput,
  ): Promise<ServiceResult<BaselineComputeResult>> {
    const db = await this.container.resolve<any>("db");

    const {
      tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      bookCode = "STAT",
      windowPeriods = 12,
    } = input;

    try {
      const minYear = fiscalYear - Math.ceil(windowPeriods / 12) - 1;
      const maxYear = fiscalYear;

      let computed = 0;
      let updated = 0;
      let accounts = 0;

      // -----------------------------------------------------------------
      // 1. GL-based baselines: PERIOD_DEBIT, PERIOD_CREDIT, NET_MOVEMENT
      // -----------------------------------------------------------------
      const glResult = await db.query(
        `WITH period_data AS (
          SELECT
            account_id,
            fiscal_year,
            period_number,
            SUM(period_debit)  AS period_debit,
            SUM(period_credit) AS period_credit,
            SUM(period_debit) - SUM(period_credit) AS net_movement
          FROM fin.gl_balance
          WHERE tenant_id = $1::uuid
            AND entity_code = $2
            AND book_code = $3
            AND fiscal_year BETWEEN $4 AND $5
            AND NOT (fiscal_year = $6 AND period_number = $7)
          GROUP BY account_id, fiscal_year, period_number
        )
        SELECT
          account_id,
          AVG(period_debit)    AS debit_mean,
          COALESCE(STDDEV_SAMP(period_debit), 0)   AS debit_stddev,
          AVG(period_credit)   AS credit_mean,
          COALESCE(STDDEV_SAMP(period_credit), 0)  AS credit_stddev,
          AVG(net_movement)    AS net_mean,
          COALESCE(STDDEV_SAMP(net_movement), 0)   AS net_stddev,
          COUNT(*)::int        AS sample_count,
          MIN(fiscal_year)     AS fy_from,
          MAX(fiscal_year)     AS fy_to
        FROM period_data
        GROUP BY account_id
        HAVING COUNT(*) >= 3`,
        [tenantId, entityCode, bookCode, minYear, maxYear, fiscalYear, periodNumber],
      );

      accounts = glResult.rows.length;

      for (const row of glResult.rows) {
        const metrics = [
          { type: "PERIOD_DEBIT", mean: row.debit_mean, stddev: row.debit_stddev },
          { type: "PERIOD_CREDIT", mean: row.credit_mean, stddev: row.credit_stddev },
          { type: "NET_MOVEMENT", mean: row.net_mean, stddev: row.net_stddev },
        ];

        for (const m of metrics) {
          const r = await this.upsertBaseline(db, {
            tenantId, entityCode, accountId: row.account_id, metricType: m.type,
            mean: m.mean, stddev: m.stddev, sampleCount: row.sample_count,
            windowPeriods, fyFrom: row.fy_from, pFrom: 1, fyTo: row.fy_to, pTo: 12,
            bookCode,
          });
          if (r) computed++; else updated++;
        }
      }

      // -----------------------------------------------------------------
      // 2. Journal volume baselines: LAST_3_DAYS_VOLUME per account
      // -----------------------------------------------------------------
      const volumeResult = await db.query(
        `WITH period_volumes AS (
          SELECT
            jl.account_id,
            je.fiscal_year,
            je.period_number,
            COUNT(*) FILTER (
              WHERE je.posting_date >= (fp.end_date - interval '2 days')::date
            )::int AS last_3_days_count
          FROM fin.journal_entry je
          JOIN fin.journal_line jl ON jl.je_id = je.id
          JOIN fin.fiscal_period fp
            ON fp.tenant_id = je.tenant_id
            AND fp.entity_code = je.entity_code
            AND fp.fiscal_year = je.fiscal_year
            AND fp.period_number = je.period_number
          WHERE je.tenant_id = $1::uuid
            AND je.entity_code = $2
            AND je.status = 'POSTED'
            AND je.fiscal_year BETWEEN $3 AND $4
            AND NOT (je.fiscal_year = $5 AND je.period_number = $6)
          GROUP BY jl.account_id, je.fiscal_year, je.period_number, fp.end_date
        )
        SELECT
          account_id,
          AVG(last_3_days_count) AS vol_mean,
          COALESCE(STDDEV_SAMP(last_3_days_count), 0) AS vol_stddev,
          COUNT(*)::int AS sample_count
        FROM period_volumes
        GROUP BY account_id
        HAVING COUNT(*) >= 3`,
        [tenantId, entityCode, minYear, maxYear, fiscalYear, periodNumber],
      );

      for (const row of volumeResult.rows) {
        const r = await this.upsertBaseline(db, {
          tenantId, entityCode, accountId: row.account_id,
          metricType: "LAST_3_DAYS_VOLUME",
          mean: row.vol_mean, stddev: row.vol_stddev, sampleCount: row.sample_count,
          windowPeriods, fyFrom: minYear, pFrom: 1, fyTo: maxYear, pTo: 12, bookCode,
        });
        if (r) computed++; else updated++;
      }

      // -----------------------------------------------------------------
      // 3. Manual entry ratio baseline (entity-level, no account)
      // -----------------------------------------------------------------
      const manualResult = await db.query(
        `WITH period_ratios AS (
          SELECT
            je.fiscal_year,
            je.period_number,
            COUNT(*) FILTER (WHERE je.doc_type IN ('MANUAL','ADJUSTMENT'))::decimal
              / GREATEST(COUNT(*), 1)::decimal AS manual_ratio
          FROM fin.journal_entry je
          WHERE je.tenant_id = $1::uuid
            AND je.entity_code = $2
            AND je.status = 'POSTED'
            AND je.fiscal_year BETWEEN $3 AND $4
            AND NOT (je.fiscal_year = $5 AND je.period_number = $6)
          GROUP BY je.fiscal_year, je.period_number
        )
        SELECT
          AVG(manual_ratio) AS ratio_mean,
          COALESCE(STDDEV_SAMP(manual_ratio), 0) AS ratio_stddev,
          COUNT(*)::int AS sample_count
        FROM period_ratios
        HAVING COUNT(*) >= 3`,
        [tenantId, entityCode, minYear, maxYear, fiscalYear, periodNumber],
      );

      if (manualResult.rows.length > 0 && manualResult.rows[0].sample_count >= 3) {
        const row = manualResult.rows[0];
        const r = await this.upsertBaseline(db, {
          tenantId, entityCode, accountId: null,
          metricType: "MANUAL_ENTRY_RATIO",
          mean: row.ratio_mean, stddev: row.ratio_stddev, sampleCount: row.sample_count,
          windowPeriods, fyFrom: minYear, pFrom: 1, fyTo: maxYear, pTo: 12, bookCode,
        });
        if (r) computed++; else updated++;
      }

      // -----------------------------------------------------------------
      // 4. Close task duration baseline (entity-level)
      // -----------------------------------------------------------------
      const taskDurResult = await db.query(
        `WITH task_durations AS (
          SELECT
            cr.fiscal_year,
            cr.period_number,
            AVG(EXTRACT(EPOCH FROM (cc.completed_at - cr.started_at)) / 3600)::decimal AS avg_hours
          FROM fin.period_close_checklist cc
          JOIN fin.close_run cr
            ON cr.tenant_id = cc.tenant_id
            AND cr.entity_code = cc.entity_code
            AND cr.fiscal_year = cc.fiscal_year
            AND cr.period_number = cc.period_number
          WHERE cc.tenant_id = $1::uuid
            AND cc.entity_code = $2
            AND cc.task_status = 'COMPLETED'
            AND cc.completed_at IS NOT NULL
            AND cr.started_at IS NOT NULL
            AND cr.fiscal_year BETWEEN $3 AND $4
            AND NOT (cr.fiscal_year = $5 AND cr.period_number = $6)
          GROUP BY cr.fiscal_year, cr.period_number
        )
        SELECT
          AVG(avg_hours) AS dur_mean,
          COALESCE(STDDEV_SAMP(avg_hours), 0) AS dur_stddev,
          COUNT(*)::int AS sample_count
        FROM task_durations
        HAVING COUNT(*) >= 3`,
        [tenantId, entityCode, minYear, maxYear, fiscalYear, periodNumber],
      );

      if (taskDurResult.rows.length > 0 && taskDurResult.rows[0].sample_count >= 3) {
        const row = taskDurResult.rows[0];
        const r = await this.upsertBaseline(db, {
          tenantId, entityCode, accountId: null,
          metricType: "CLOSE_TASK_DURATION",
          mean: row.dur_mean, stddev: row.dur_stddev, sampleCount: row.sample_count,
          windowPeriods, fyFrom: minYear, pFrom: 1, fyTo: maxYear, pTo: 12, bookCode,
        });
        if (r) computed++; else updated++;
      }

      // -----------------------------------------------------------------
      // 5. Waiver count baseline (entity-level)
      // -----------------------------------------------------------------
      const waiverResult = await db.query(
        `WITH waiver_counts AS (
          SELECT
            cc.fiscal_year,
            cc.period_number,
            COUNT(*) FILTER (WHERE cc.task_status = 'WAIVED')::int AS waiver_count
          FROM fin.period_close_checklist cc
          WHERE cc.tenant_id = $1::uuid
            AND cc.entity_code = $2
            AND cc.fiscal_year BETWEEN $3 AND $4
            AND NOT (cc.fiscal_year = $5 AND cc.period_number = $6)
          GROUP BY cc.fiscal_year, cc.period_number
        )
        SELECT
          AVG(waiver_count) AS waiver_mean,
          COALESCE(STDDEV_SAMP(waiver_count), 0) AS waiver_stddev,
          COUNT(*)::int AS sample_count
        FROM waiver_counts
        HAVING COUNT(*) >= 3`,
        [tenantId, entityCode, minYear, maxYear, fiscalYear, periodNumber],
      );

      if (waiverResult.rows.length > 0 && waiverResult.rows[0].sample_count >= 3) {
        const row = waiverResult.rows[0];
        const r = await this.upsertBaseline(db, {
          tenantId, entityCode, accountId: null,
          metricType: "WAIVER_COUNT",
          mean: row.waiver_mean, stddev: row.waiver_stddev, sampleCount: row.sample_count,
          windowPeriods, fyFrom: minYear, pFrom: 1, fyTo: maxYear, pTo: 12, bookCode,
        });
        if (r) computed++; else updated++;
      }

      // -----------------------------------------------------------------
      // 6. Max adjustment amount baseline per account
      // -----------------------------------------------------------------
      const maxAdjResult = await db.query(
        `WITH period_max AS (
          SELECT
            jl.account_id,
            je.fiscal_year,
            je.period_number,
            MAX(GREATEST(jl.debit_amount, jl.credit_amount)) AS max_adj
          FROM fin.journal_entry je
          JOIN fin.journal_line jl ON jl.je_id = je.id
          WHERE je.tenant_id = $1::uuid
            AND je.entity_code = $2
            AND je.status = 'POSTED'
            AND je.doc_type IN ('ADJUSTMENT', 'MANUAL', 'RECLASS')
            AND je.fiscal_year BETWEEN $3 AND $4
            AND NOT (je.fiscal_year = $5 AND je.period_number = $6)
          GROUP BY jl.account_id, je.fiscal_year, je.period_number
        )
        SELECT
          account_id,
          AVG(max_adj) AS adj_mean,
          COALESCE(STDDEV_SAMP(max_adj), 0) AS adj_stddev,
          COUNT(*)::int AS sample_count
        FROM period_max
        GROUP BY account_id
        HAVING COUNT(*) >= 3`,
        [tenantId, entityCode, minYear, maxYear, fiscalYear, periodNumber],
      );

      for (const row of maxAdjResult.rows) {
        const r = await this.upsertBaseline(db, {
          tenantId, entityCode, accountId: row.account_id,
          metricType: "MAX_ADJUSTMENT_AMOUNT",
          mean: row.adj_mean, stddev: row.adj_stddev, sampleCount: row.sample_count,
          windowPeriods, fyFrom: minYear, pFrom: 1, fyTo: maxYear, pTo: 12, bookCode,
        });
        if (r) computed++; else updated++;
      }

      return ok({ computed, updated, accounts });
    } catch (err) {
      return fail(
        "BASELINE_COMPUTE_FAILED",
        `Failed to compute baselines: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private: upsert baseline
  // -----------------------------------------------------------------------

  private async upsertBaseline(
    db: any,
    input: {
      tenantId: string;
      entityCode: string;
      accountId: string | null;
      metricType: string;
      mean: number | string;
      stddev: number | string;
      sampleCount: number;
      windowPeriods: number;
      fyFrom: number;
      pFrom: number;
      fyTo: number;
      pTo: number;
      bookCode: string;
    },
  ): Promise<boolean> {
    const result = await db.query(
      `INSERT INTO fin.atlas_anomaly_baseline (
        tenant_id, entity_code, account_id, metric_type,
        baseline_mean, baseline_stddev, sample_count,
        window_periods, fiscal_year_from, period_from,
        fiscal_year_to, period_to, book_code, currency_code
      ) VALUES (
        $1::uuid, $2, $3::uuid, $4,
        $5::decimal, $6::decimal, $7,
        $8, $9, $10,
        $11, $12, $13, 'USD'
      )
      ON CONFLICT (
        tenant_id, entity_code,
        COALESCE(account_id, '${NIL_UUID}'::uuid),
        metric_type, book_code
      )
      DO UPDATE SET
        baseline_mean = EXCLUDED.baseline_mean,
        baseline_stddev = EXCLUDED.baseline_stddev,
        sample_count = EXCLUDED.sample_count,
        fiscal_year_from = EXCLUDED.fiscal_year_from,
        period_from = EXCLUDED.period_from,
        fiscal_year_to = EXCLUDED.fiscal_year_to,
        period_to = EXCLUDED.period_to,
        computed_at = now()
      RETURNING (xmax = 0) AS is_insert`,
      [
        input.tenantId, input.entityCode, input.accountId, input.metricType,
        input.mean, input.stddev, input.sampleCount,
        input.windowPeriods, input.fyFrom, input.pFrom,
        input.fyTo, input.pTo, input.bookCode,
      ],
    );

    return result.rows[0]?.is_insert ?? false;
  }
}
