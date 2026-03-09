/**
 * GET /api/fin/reporting/month-end — Month-end comparative analysis
 *
 * Returns account balances across multiple periods for side-by-side
 * month-over-month comparison. Useful for period close review, trend
 * analysis, and variance spotting.
 *
 * Query params:
 *   entityCode          — required
 *   cubeCode            — optional, defaults to FS_MONTHLY
 *   bookCode            — optional, defaults to STAT
 *   fiscalYear          — required
 *   periodsToCompare    — optional, defaults to 6
 *   accountTypes        — optional, comma-separated: REVENUE,EXPENSE
 *   costCenterValueId   — optional dimension filter
 *   profitCenterValueId — optional dimension filter
 *   projectValueId      — optional dimension filter
 *   regionValueId       — optional dimension filter
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

    const periodsToCompare = Math.min(
      12,
      Math.max(2, parseInt(url.searchParams.get("periodsToCompare") ?? "6", 10)),
    );

    const accountTypesParam = url.searchParams.get("accountTypes");
    const accountTypes = accountTypesParam ? accountTypesParam.split(",") : null;

    // Build dimension filter clauses
    const dimFilters: ReturnType<typeof sql>[] = [];
    const dimParams: Record<string, string> = {
      costCenterValueId: "cost_center_value_id",
      profitCenterValueId: "profit_center_value_id",
      projectValueId: "project_value_id",
      regionValueId: "region_value_id",
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

    const accountTypeFilter = accountTypes
      ? sql`AND account_type = ANY(${accountTypes}::text[])`
      : sql``;

    // Query: account balances across multiple periods
    const result = await sql`
      SELECT
        account_code,
        account_type,
        fiscal_year,
        period_number,
        SUM(period_debit)  AS period_debit,
        SUM(period_credit) AS period_credit,
        SUM(amount_net)    AS amount_net,
        SUM(closing_debit) AS closing_debit,
        SUM(closing_credit) AS closing_credit
      FROM fin.rpt_balance_cube
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND cube_code = ${cubeCode}
        AND book_code = ${bookCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number <= ${periodsToCompare}
        ${accountTypeFilter}
        ${dimWhere}
      GROUP BY account_code, account_type, fiscal_year, period_number
      ORDER BY account_code, period_number
    `.execute(db);

    // Resolve account names
    const accountCodes = [...new Set((result.rows as any[]).map((r) => r.account_code))];
    let accountNameMap: Record<string, string> = {};
    if (accountCodes.length > 0) {
      const nameResult = await sql`
        SELECT account_code, account_name
        FROM fin.chart_of_accounts
        WHERE tenant_id = ${tenantUuid}
          AND entity_code = ${entityCode}
          AND account_code = ANY(${accountCodes}::text[])
      `.execute(db);
      for (const row of nameResult.rows as any[]) {
        accountNameMap[row.account_code] = row.account_name;
      }
    }

    // Build structured response: one row per account with period array
    const accountMap = new Map<string, {
      accountCode: string;
      accountName: string;
      accountType: string;
      periods: any[];
    }>();

    for (const row of result.rows as any[]) {
      const key = row.account_code;
      if (!accountMap.has(key)) {
        accountMap.set(key, {
          accountCode: key,
          accountName: accountNameMap[key] ?? key,
          accountType: row.account_type,
          periods: [],
        });
      }
      accountMap.get(key)!.periods.push({
        fiscalYear: row.fiscal_year,
        periodNumber: row.period_number,
        periodDebit: String(row.period_debit ?? "0"),
        periodCredit: String(row.period_credit ?? "0"),
        amountNet: String(row.amount_net ?? "0"),
        closingDebit: String(row.closing_debit ?? "0"),
        closingCredit: String(row.closing_credit ?? "0"),
      });
    }

    const accounts = [...accountMap.values()];

    // Period metadata (which periods are included)
    const periodNumbers = Array.from({ length: periodsToCompare }, (_, i) => i + 1);

    return successResponse({
      filters: {
        entityCode,
        cubeCode,
        bookCode,
        fiscalYear,
        periodsToCompare,
        accountTypes,
      },
      accounts,
      periodNumbers,
    });
  } catch (error) {
    console.error("[GET /api/fin/reporting/month-end] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load month-end analysis");
  } finally {
    await redis?.quit();
  }
}
