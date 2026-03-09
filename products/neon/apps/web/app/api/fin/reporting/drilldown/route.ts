/**
 * GET /api/fin/reporting/drilldown — Dashboard drilldown into cube dimensions
 *
 * Given a period and optional parent dimension filters, returns aggregated
 * balances grouped by the requested drill axis. Supports progressive
 * drilldown: P&L → by Cost Center → by Project within that cost center.
 *
 * Query params:
 *   entityCode     — required
 *   cubeCode       — required
 *   fiscalYear     — required
 *   periodNumber   — required
 *   drillAxis      — required: cost_center | profit_center | project | region | segment | etc.
 *   bookCode       — optional, defaults to STAT
 *   costCenterValueId, projectValueId, etc. — optional parent filters
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
import { sumAmounts } from "@athyper/runtime/services/business/engines/shared/money";

const AXIS_COLUMN_MAP: Record<string, string> = {
  cost_center: "cost_center_value_id",
  profit_center: "profit_center_value_id",
  project: "project_value_id",
  region: "region_value_id",
  segment: "segment_value_id",
  location: "location_value_id",
  function: "function_value_id",
  intercompany: "intercompany_value_id",
};

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const url = new URL(req.url);

    const entityCode = url.searchParams.get("entityCode");
    const cubeCode = url.searchParams.get("cubeCode");
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);
    const drillAxis = url.searchParams.get("drillAxis");
    const bookCode = url.searchParams.get("bookCode") ?? "STAT";

    if (!entityCode || !cubeCode || isNaN(fiscalYear) || isNaN(periodNumber) || !drillAxis) {
      return errorResponse(
        "VALIDATION",
        "entityCode, cubeCode, fiscalYear, periodNumber, and drillAxis are required",
        400,
      );
    }

    const axisCol = AXIS_COLUMN_MAP[drillAxis];
    if (!axisCol) {
      return errorResponse(
        "VALIDATION",
        `Invalid drillAxis: ${drillAxis}. Valid: ${Object.keys(AXIS_COLUMN_MAP).join(", ")}`,
        400,
      );
    }

    // Build parent filter clauses from query params
    const parentFilters: Record<string, string> = {};
    const filterClauses: ReturnType<typeof sql>[] = [];
    for (const [axis, col] of Object.entries(AXIS_COLUMN_MAP)) {
      if (axis === drillAxis) continue; // Don't filter on the drill axis itself
      const paramName = axis.replace(/_(\w)/g, (_, c) => c.toUpperCase()) + "ValueId";
      const val = url.searchParams.get(paramName);
      if (val) {
        filterClauses.push(sql`${sql.ref(col)} = ${val}::uuid`);
        parentFilters[axis] = val;
      }
    }

    const filterWhere =
      filterClauses.length > 0
        ? sql`AND ${sql.join(filterClauses, sql` AND `)}`
        : sql``;

    // Row limit guardrail — prevents runaway queries
    const MAX_ROWS = 500;

    // Aggregate by drill axis
    const result = await sql`
      SELECT
        ${sql.ref(axisCol)}::text AS dimension_value_id,
        SUM(period_debit) AS period_debit,
        SUM(period_credit) AS period_credit,
        SUM(amount_net) AS amount_net,
        COUNT(*) AS row_count
      FROM fin.rpt_balance_cube
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND cube_code = ${cubeCode}
        AND book_code = ${bookCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
        AND ${sql.ref(axisCol)} IS NOT NULL
        ${filterWhere}
      GROUP BY ${sql.ref(axisCol)}
      ORDER BY SUM(ABS(amount_net)) DESC
      LIMIT ${MAX_ROWS + 1}
    `.execute(db);

    const truncated = (result.rows as any[]).length > MAX_ROWS;
    if (truncated) {
      (result.rows as any[]).length = MAX_ROWS;
    }

    // Resolve dimension value labels
    const valueIds = (result.rows as any[])
      .map((r) => r.dimension_value_id)
      .filter(Boolean);

    let labelMap: Record<string, { code: string; name: string }> = {};
    if (valueIds.length > 0) {
      const labelResult = await sql`
        SELECT
          dv.id::text AS id,
          dv.code,
          dv.name
        FROM fin.dimension_value dv
        WHERE dv.id = ANY(${valueIds}::uuid[])
      `.execute(db);
      for (const row of labelResult.rows as any[]) {
        labelMap[row.id] = { code: row.code, name: row.name };
      }
    }

    // Build response rows
    const rows = (result.rows as any[]).map((row) => {
      const label = labelMap[row.dimension_value_id];
      return {
        dimensionValueId: row.dimension_value_id,
        dimensionCode: label?.code ?? row.dimension_value_id,
        dimensionName: label?.name ?? row.dimension_value_id,
        periodDebit: String(row.period_debit ?? "0"),
        periodCredit: String(row.period_credit ?? "0"),
        amountNet: String(row.amount_net ?? "0"),
        rowCount: Number(row.row_count),
        hasChildren: false, // Could be enhanced with hierarchy detection
      };
    });

    // Totals — MC-4: use BigInt-based string arithmetic
    const totalDebit = sumAmounts(rows.map((r: any) => r.periodDebit));
    const totalCredit = sumAmounts(rows.map((r: any) => r.periodCredit));
    const totalNet = sumAmounts(rows.map((r: any) => r.amountNet));

    return successResponse({
      axis: drillAxis,
      parentFilters,
      rows,
      totals: {
        periodDebit: totalDebit,
        periodCredit: totalCredit,
        amountNet: totalNet,
      },
      truncated,
      maxRows: MAX_ROWS,
    });
  } catch (error) {
    console.error("[GET /api/fin/reporting/drilldown] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load drilldown data");
  } finally {
    await redis?.quit();
  }
}
