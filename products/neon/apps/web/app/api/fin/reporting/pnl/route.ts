/**
 * GET /api/fin/reporting/pnl — Multi-dimensional P&L report from cube
 *
 * Queries the pre-aggregated rpt_balance_cube for P&L accounts (REVENUE, EXPENSE)
 * with optional dimension filtering and grouping.
 *
 * Supports period-over-period comparison by including prior year data
 * when the cube has retention for the requested prior year.
 *
 * Query params:
 *   entityCode     — required
 *   cubeCode       — optional, defaults to FS_MONTHLY
 *   bookCode       — optional, defaults to STAT
 *   fiscalYear     — required
 *   periodFrom     — optional, defaults to 1
 *   periodTo       — optional, defaults to 12
 *   groupBy        — optional: account | cost_center | profit_center | project | region | segment | period
 *   costCenterValueId, profitCenterValueId, projectValueId, regionValueId, segmentValueId — optional dimension filters
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
import { sumAmounts, subtractAmounts, compareAmounts } from "@athyper/runtime/services/business/engines/shared/money";

// Map groupBy param to cube column
const GROUP_COLUMN_MAP: Record<string, string> = {
  account: "account_code",
  cost_center: "cost_center_value_id",
  profit_center: "profit_center_value_id",
  project: "project_value_id",
  region: "region_value_id",
  segment: "segment_value_id",
  location: "location_value_id",
  function: "function_value_id",
  intercompany: "intercompany_value_id",
  period: "period_number",
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
    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    const cubeCode = url.searchParams.get("cubeCode") ?? "FS_MONTHLY";
    const bookCode = url.searchParams.get("bookCode") ?? "STAT";
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    if (isNaN(fiscalYear)) {
      return errorResponse("VALIDATION", "fiscalYear is required", 400);
    }

    const periodFrom = parseInt(url.searchParams.get("periodFrom") ?? "1", 10);
    const periodTo = parseInt(url.searchParams.get("periodTo") ?? "12", 10);
    const groupBy = url.searchParams.get("groupBy") ?? "account";

    // Validate groupBy
    if (!GROUP_COLUMN_MAP[groupBy]) {
      return errorResponse(
        "VALIDATION",
        `Invalid groupBy: ${groupBy}. Valid: ${Object.keys(GROUP_COLUMN_MAP).join(", ")}`,
        400,
      );
    }

    const groupCol = GROUP_COLUMN_MAP[groupBy];

    // Row limit guardrail — prevents runaway queries on high-cardinality dimensions
    const MAX_GROUP_ROWS = 1000;

    // Build dimension filter clauses
    const dimFilters: ReturnType<typeof sql>[] = [];
    const dimParams: Record<string, string> = {
      costCenterValueId: "cost_center_value_id",
      profitCenterValueId: "profit_center_value_id",
      projectValueId: "project_value_id",
      regionValueId: "region_value_id",
      segmentValueId: "segment_value_id",
      locationValueId: "location_value_id",
      functionValueId: "function_value_id",
      intercompanyValueId: "intercompany_value_id",
    };

    for (const [param, col] of Object.entries(dimParams)) {
      const val = url.searchParams.get(param);
      if (val) {
        dimFilters.push(sql`${sql.ref(col)} = ${val}::uuid`);
      }
    }

    const dimWhere =
      dimFilters.length > 0
        ? sql`AND ${sql.join(dimFilters, sql` AND `)}`
        : sql``;

    // Current period P&L
    const currentResult = await sql`
      SELECT
        ${sql.ref(groupCol)} AS group_key,
        account_type,
        SUM(CASE WHEN account_type = 'REVENUE' THEN amount_net ELSE 0 END) AS revenue,
        SUM(CASE WHEN account_type = 'EXPENSE' THEN amount_net ELSE 0 END) AS expense,
        SUM(amount_net) AS net_income
      FROM fin.rpt_balance_cube
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND cube_code = ${cubeCode}
        AND book_code = ${bookCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number BETWEEN ${periodFrom} AND ${periodTo}
        AND account_type IN ('REVENUE', 'EXPENSE')
        ${dimWhere}
      GROUP BY ${sql.ref(groupCol)}, account_type
      ORDER BY ${sql.ref(groupCol)}
      LIMIT ${MAX_GROUP_ROWS}
    `.execute(db);

    // Prior year P&L (for variance)
    const priorResult = await sql`
      SELECT
        ${sql.ref(groupCol)} AS group_key,
        account_type,
        SUM(CASE WHEN account_type = 'REVENUE' THEN amount_net ELSE 0 END) AS revenue,
        SUM(CASE WHEN account_type = 'EXPENSE' THEN amount_net ELSE 0 END) AS expense,
        SUM(amount_net) AS net_income
      FROM fin.rpt_balance_cube
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND cube_code = ${cubeCode}
        AND book_code = ${bookCode}
        AND fiscal_year = ${fiscalYear - 1}
        AND period_number BETWEEN ${periodFrom} AND ${periodTo}
        AND account_type IN ('REVENUE', 'EXPENSE')
        ${dimWhere}
      GROUP BY ${sql.ref(groupCol)}, account_type
      ORDER BY ${sql.ref(groupCol)}
      LIMIT ${MAX_GROUP_ROWS}
    `.execute(db);

    // Build prior lookup
    const priorMap = new Map<string, { revenue: string; expense: string; netIncome: string }>();
    for (const row of priorResult.rows as any[]) {
      const key = String(row.group_key ?? "");
      const existing = priorMap.get(key) ?? { revenue: "0", expense: "0", netIncome: "0" };
      if (row.account_type === "REVENUE") existing.revenue = String(row.revenue ?? "0");
      if (row.account_type === "EXPENSE") existing.expense = String(row.expense ?? "0");
      existing.netIncome = subtractAmounts(existing.revenue, existing.expense);
      priorMap.set(key, existing);
    }

    // Resolve dimension value labels for the group keys
    const groupKeys = new Set<string>();
    for (const row of currentResult.rows as any[]) {
      if (row.group_key) groupKeys.add(String(row.group_key));
    }

    let dimLabels: Record<string, { id: string; code: string; name: string; typeCode: string }> = {};
    if (groupBy !== "account" && groupBy !== "period" && groupKeys.size > 0) {
      const labelResult = await sql`
        SELECT
          dv.id::text AS id,
          dv.code,
          dv.name,
          dt.code AS type_code
        FROM fin.dimension_value dv
        JOIN fin.dimension_type dt ON dt.id = dv.dimension_type_id
        WHERE dv.id = ANY(${[...groupKeys]}::uuid[])
      `.execute(db);

      for (const row of labelResult.rows as any[]) {
        dimLabels[row.id] = {
          id: row.id,
          code: row.code,
          name: row.name,
          typeCode: row.type_code,
        };
      }
    }

    // Aggregate rows by group key
    const rowMap = new Map<string, any>();
    for (const row of currentResult.rows as any[]) {
      const key = String(row.group_key ?? "TOTAL");
      const existing = rowMap.get(key) ?? {
        groupKey: key,
        groupLabel: key,
        accountType: row.account_type,
        revenue: "0",
        expense: "0",
        netIncome: "0",
      };
      if (row.account_type === "REVENUE") existing.revenue = String(row.revenue ?? "0");
      if (row.account_type === "EXPENSE") existing.expense = String(row.expense ?? "0");
      existing.netIncome = subtractAmounts(existing.revenue, existing.expense);

      // Add label
      if (groupBy === "account") {
        existing.groupLabel = key;
      } else if (groupBy === "period") {
        existing.groupLabel = `Period ${key}`;
      } else if (dimLabels[key]) {
        existing.groupLabel = `${dimLabels[key].code} — ${dimLabels[key].name}`;
      }

      // Add prior comparison
      const prior = priorMap.get(key);
      existing.priorRevenue = prior?.revenue ?? null;
      existing.priorExpense = prior?.expense ?? null;
      existing.priorNetIncome = prior?.netIncome ?? null;
      if (prior) {
        existing.revenueVariance = subtractAmounts(existing.revenue, prior.revenue);
        existing.expenseVariance = subtractAmounts(existing.expense, prior.expense);
        existing.netIncomeVariance = subtractAmounts(existing.netIncome, prior.netIncome);
        // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK (ratio, not monetary)
        const priorNet = parseFloat(prior.netIncome);
        existing.variancePercent =
          priorNet !== 0
            ? String(
                // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
                ((parseFloat(existing.netIncome) - priorNet) / Math.abs(priorNet) * 100).toFixed(2),
              )
            : null;
      } else {
        existing.revenueVariance = null;
        existing.expenseVariance = null;
        existing.netIncomeVariance = null;
        existing.variancePercent = null;
      }

      rowMap.set(key, existing);
    }

    const rows = [...rowMap.values()];
    const truncated = (currentResult.rows as any[]).length >= MAX_GROUP_ROWS;

    // Compute totals — MC-4: use BigInt-based string arithmetic
    const hasPrior = rows.some((r: any) => r.priorRevenue !== null);
    const totalRevenue = sumAmounts(rows.map((r: any) => r.revenue));
    const totalExpense = sumAmounts(rows.map((r: any) => r.expense));
    const priorTotalRevenue = hasPrior
      ? sumAmounts(rows.filter((r: any) => r.priorRevenue !== null).map((r: any) => r.priorRevenue))
      : "0";
    const priorTotalExpense = hasPrior
      ? sumAmounts(rows.filter((r: any) => r.priorExpense !== null).map((r: any) => r.priorExpense))
      : "0";

    // Cube definition for metadata
    const cubeDefResult = await sql`
      SELECT
        last_built_at AS "lastBuiltAt"
      FROM fin.rpt_cube_definition
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND cube_code = ${cubeCode}
      LIMIT 1
    `.execute(db);

    const lastRefreshAt = (cubeDefResult.rows[0] as any)?.lastBuiltAt ?? null;

    return successResponse({
      filters: {
        entityCode,
        cubeCode,
        bookCode,
        fiscalYear,
        periodFrom,
        periodTo,
        groupBy,
      },
      rows,
      totals: {
        revenue: totalRevenue,
        expense: totalExpense,
        netIncome: subtractAmounts(totalRevenue, totalExpense),
        priorRevenue: hasPrior ? priorTotalRevenue : null,
        priorExpense: hasPrior ? priorTotalExpense : null,
        priorNetIncome: hasPrior
          ? subtractAmounts(priorTotalRevenue, priorTotalExpense)
          : null,
      },
      dimensionLabels: dimLabels,
      lastRefreshAt,
      truncated,
    });
  } catch (error) {
    console.error("[GET /api/fin/reporting/pnl] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load P&L report");
  } finally {
    await redis?.quit();
  }
}
