/**
 * Atlas Anomaly API
 *
 * GET  /api/fin/atlas/anomalies
 *   → List anomalies with optional filters (entityCode, fiscalYear, periodNumber, status, severity)
 *
 * POST /api/fin/atlas/anomalies
 *   → Trigger anomaly detection for a specific entity/period
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
// GET — list anomalies
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
    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");
    const status = url.searchParams.get("status");       // comma-separated
    const severity = url.searchParams.get("severity");   // comma-separated
    const anomalyType = url.searchParams.get("anomalyType");

    const result = await sql<Record<string, unknown>>`
      SELECT
        a.id,
        a.entity_code         AS "entityCode",
        a.anomaly_type        AS "anomalyType",
        a.severity,
        a.account_id          AS "accountId",
        c.account_code        AS "accountCode",
        c.account_name        AS "accountName",
        c.account_type        AS "accountType",
        a.fiscal_year         AS "fiscalYear",
        a.period_number       AS "periodNumber",
        a.book_code           AS "bookCode",
        a.observed_value::text AS "observedValue",
        a.expected_value::text AS "expectedValue",
        a.z_score::text       AS "zScore",
        a.title,
        a.description,
        a.evidence,
        a.risk_signal_id      AS "riskSignalId",
        a.status,
        a.acknowledged_by     AS "acknowledgedBy",
        a.acknowledged_at     AS "acknowledgedAt",
        a.resolved_by         AS "resolvedBy",
        a.resolved_at         AS "resolvedAt",
        a.resolution_notes    AS "resolutionNotes",
        a.detected_at         AS "detectedAt"
      FROM fin.atlas_anomaly a
      LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
      WHERE a.tenant_id = ${tenantUuid}::uuid
        AND (${entityCode}::text IS NULL OR a.entity_code = ${entityCode})
        AND (${fiscalYear ? Number(fiscalYear) : null}::int IS NULL OR a.fiscal_year = ${fiscalYear ? Number(fiscalYear) : null}::int)
        AND (${periodNumber ? Number(periodNumber) : null}::int IS NULL OR a.period_number = ${periodNumber ? Number(periodNumber) : null}::int)
        AND (${status}::text IS NULL OR a.status = ANY(string_to_array(${status}, ',')))
        AND (${severity}::text IS NULL OR a.severity = ANY(string_to_array(${severity}, ',')))
        AND (${anomalyType}::text IS NULL OR a.anomaly_type = ${anomalyType})
      ORDER BY
        CASE a.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'WARNING' THEN 2
          WHEN 'INFO' THEN 3
        END,
        a.detected_at DESC
    `.execute(db);

    // Summary counts
    const summary = await sql<Record<string, number>>`
      SELECT
        count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED'))::int AS "activeCount",
        count(*) FILTER (WHERE severity = 'CRITICAL' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "criticalCount",
        count(*) FILTER (WHERE severity = 'WARNING' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "warningCount",
        count(*) FILTER (WHERE status = 'RESOLVED')::int AS "resolvedCount",
        count(*)::int AS "totalCount"
      FROM fin.atlas_anomaly
      WHERE tenant_id = ${tenantUuid}::uuid
        AND (${entityCode}::text IS NULL OR entity_code = ${entityCode})
        AND (${fiscalYear ? Number(fiscalYear) : null}::int IS NULL OR fiscal_year = ${fiscalYear ? Number(fiscalYear) : null}::int)
        AND (${periodNumber ? Number(periodNumber) : null}::int IS NULL OR period_number = ${periodNumber ? Number(periodNumber) : null}::int)
    `.execute(db);

    return successResponse({
      anomalies: result.rows,
      summary: summary.rows[0] ?? {
        activeCount: 0, criticalCount: 0, warningCount: 0,
        resolvedCount: 0, totalCount: 0,
      },
    });
  } catch (err) {
    console.error("[atlas/anomalies] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to fetch anomalies");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — trigger anomaly detection
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
      bookCode?: string;
    };

    if (!body.entityCode || !body.fiscalYear || !body.periodNumber) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }

    const bookCode = body.bookCode ?? "STAT";

    // Step 1: Detect amount outliers against baselines
    const outlierResult = await sql<Record<string, unknown>>`
      WITH current_data AS (
        SELECT
          g.account_id,
          SUM(g.period_debit) - SUM(g.period_credit) AS net_movement
        FROM fin.gl_balance g
        WHERE g.tenant_id = ${tenantUuid}::uuid
          AND g.entity_code = ${body.entityCode}
          AND g.book_code = ${bookCode}
          AND g.fiscal_year = ${body.fiscalYear}
          AND g.period_number = ${body.periodNumber}
        GROUP BY g.account_id
      )
      SELECT
        cd.account_id,
        c.account_code,
        c.account_name,
        c.account_type,
        cd.net_movement,
        b.baseline_mean,
        b.baseline_stddev,
        b.sample_count,
        b.id AS baseline_id,
        CASE
          WHEN b.baseline_stddev > 0 THEN
            (cd.net_movement - b.baseline_mean) / b.baseline_stddev
          ELSE 0
        END AS z_score
      FROM current_data cd
      JOIN fin.chart_of_accounts c ON c.id = cd.account_id
      LEFT JOIN fin.atlas_anomaly_baseline b
        ON b.tenant_id = ${tenantUuid}::uuid
        AND b.entity_code = ${body.entityCode}
        AND b.account_id = cd.account_id
        AND b.metric_type = 'NET_MOVEMENT'
        AND b.book_code = ${bookCode}
      WHERE b.id IS NOT NULL
        AND b.baseline_stddev > 0
        AND b.sample_count >= 3
        AND ABS(
          CASE
            WHEN b.baseline_stddev > 0 THEN
              (cd.net_movement - b.baseline_mean) / b.baseline_stddev
            ELSE 0
          END
        ) >= 2.5
    `.execute(db);

    let created = 0;
    const detected: Array<Record<string, unknown>> = [];

    for (const row of outlierResult.rows) {
      const zScore = Number(row.z_score);
      const absZ = Math.abs(zScore);
      const severity = absZ >= 3.0 ? "CRITICAL" : "WARNING";
      const netMovement = Number(row.net_movement);
      const baselineMean = Number(row.baseline_mean);

      const insertResult = await sql`
        INSERT INTO fin.atlas_anomaly (
          tenant_id, entity_code, anomaly_type, severity,
          account_id, fiscal_year, period_number, book_code,
          observed_value, expected_value, z_score, baseline_id,
          title, description, evidence, status
        ) VALUES (
          ${tenantUuid}::uuid, ${body.entityCode}, 'AMOUNT_OUTLIER', ${severity},
          ${row.account_id as string}::uuid, ${body.fiscalYear}, ${body.periodNumber}, ${bookCode},
          ${String(netMovement)}::decimal, ${String(baselineMean)}::decimal,
          ${String(Math.round(zScore * 100) / 100)}::decimal, ${row.baseline_id as string}::uuid,
          ${`${row.account_code} ${row.account_name} — ${absZ.toFixed(1)}σ ${zScore > 0 ? "above" : "below"} baseline`},
          ${`Account ${row.account_code} net movement of ${netMovement.toLocaleString()} is ${absZ.toFixed(1)} standard deviations ${zScore > 0 ? "above" : "below"} the ${row.sample_count}-period baseline mean of ${baselineMean.toLocaleString()}.`},
          ${JSON.stringify({
            accountCode: row.account_code,
            accountName: row.account_name,
            accountType: row.account_type,
            currentNet: netMovement,
            baselineMean,
            baselineStddev: Number(row.baseline_stddev),
            sampleCount: Number(row.sample_count),
            zScore: Math.round(zScore * 100) / 100,
          })}::jsonb,
          'OPEN'
        )
        ON CONFLICT (tenant_id, entity_code, anomaly_type, account_id, fiscal_year, period_number, book_code)
        DO UPDATE SET
          severity = EXCLUDED.severity,
          observed_value = EXCLUDED.observed_value,
          z_score = EXCLUDED.z_score,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          evidence = EXCLUDED.evidence,
          updated_at = now()
        RETURNING id, (xmax = 0) AS "isNew"
      `.execute(db);

      if (insertResult.rows[0] && (insertResult.rows[0] as any).isNew) created++;
      detected.push({
        id: (insertResult.rows[0] as any)?.id,
        anomalyType: "AMOUNT_OUTLIER",
        severity,
        accountCode: row.account_code,
        accountName: row.account_name,
        zScore: Math.round(zScore * 100) / 100,
      });
    }

    // Step 2: Check reconciliation variances
    const reconResult = await sql<Record<string, unknown>>`
      SELECT
        rs.id AS "sessionId",
        bs.bank_name AS "bankName",
        bs.statement_number AS "statementNumber",
        rs.discrepancy::text,
        rs.unmatched
      FROM fin.reconciliation_session rs
      JOIN fin.bank_statement bs ON bs.id = rs.statement_id
      WHERE rs.tenant_id = ${tenantUuid}::uuid
        AND bs.entity_code = ${body.entityCode}
        AND rs.status = 'COMPLETED'
        AND (ABS(rs.discrepancy) > 100 OR rs.unmatched > 0)
        AND EXISTS (
          SELECT 1 FROM fin.fiscal_period fp
          WHERE fp.tenant_id = ${tenantUuid}::uuid
            AND fp.entity_code = ${body.entityCode}
            AND fp.fiscal_year = ${body.fiscalYear}
            AND fp.period_number = ${body.periodNumber}
            AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
        )
    `.execute(db);

    for (const row of reconResult.rows) {
      const discrepancy = Number(row.discrepancy);
      const absDisc = Math.abs(discrepancy);
      const severity = absDisc > 10000 ? "CRITICAL" : absDisc > 1000 ? "WARNING" : "INFO";

      if (severity === "INFO") continue; // only escalate WARNING+

      const insertResult = await sql`
        INSERT INTO fin.atlas_anomaly (
          tenant_id, entity_code, anomaly_type, severity,
          account_id, fiscal_year, period_number, book_code,
          observed_value, expected_value,
          title, description, evidence, status
        ) VALUES (
          ${tenantUuid}::uuid, ${body.entityCode}, 'RECON_VARIANCE', ${severity},
          NULL, ${body.fiscalYear}, ${body.periodNumber}, ${bookCode},
          ${String(discrepancy)}::decimal, '0'::decimal,
          ${`${row.bankName} #${row.statementNumber} — $${absDisc.toLocaleString()} reconciliation variance`},
          ${`Bank statement ${row.statementNumber} from ${row.bankName} has a reconciliation discrepancy of $${discrepancy.toLocaleString()}${Number(row.unmatched) > 0 ? ` with ${row.unmatched} unmatched lines` : ""}.`},
          ${JSON.stringify({
            sessionId: row.sessionId,
            bankName: row.bankName,
            statementNumber: row.statementNumber,
            discrepancy,
            unmatchedLines: Number(row.unmatched),
          })}::jsonb,
          'OPEN'
        )
        ON CONFLICT (tenant_id, entity_code, anomaly_type, account_id, fiscal_year, period_number, book_code)
        DO UPDATE SET
          severity = EXCLUDED.severity,
          observed_value = EXCLUDED.observed_value,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          evidence = EXCLUDED.evidence,
          updated_at = now()
        RETURNING id, (xmax = 0) AS "isNew"
      `.execute(db);

      if (insertResult.rows[0] && (insertResult.rows[0] as any).isNew) created++;
      detected.push({
        id: (insertResult.rows[0] as any)?.id,
        anomalyType: "RECON_VARIANCE",
        severity,
        bankName: row.bankName,
        statementNumber: row.statementNumber,
        discrepancy,
      });
    }

    return successResponse({
      detected: detected.length,
      created,
      anomalies: detected,
    });
  } catch (err) {
    console.error("[atlas/anomalies] POST error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to run detection");
  } finally {
    await redis?.quit();
  }
}
