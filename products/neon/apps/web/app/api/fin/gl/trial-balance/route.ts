/**
 * GET /api/fin/gl/trial-balance
 *
 * Returns trial balance rows — aggregated debit/credit per account
 * up to and including the given period.
 *
 * Query params:
 *   entityCode    — required
 *   fiscalYear    — required
 *   periodNumber  — required
 *   reversalMode  — optional: NETTED (default) | SEPARATE | EXCLUDED
 *   bookCode      — optional, defaults to STAT
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

type ReversalMode = "NETTED" | "SEPARATE" | "EXCLUDED";

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
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    if (!entityCode || isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse(
        "VALIDATION",
        "entityCode, fiscalYear, and periodNumber are required",
        400,
      );
    }

    const reversalMode = (url.searchParams.get("reversalMode") ?? "NETTED") as ReversalMode;
    const bookCode = url.searchParams.get("bookCode") ?? "STAT";

    let statusFilter: ReturnType<typeof sql>;
    switch (reversalMode) {
      case "SEPARATE":
        statusFilter = sql`je.status in ('POSTED', 'REVERSED')`;
        break;
      case "EXCLUDED":
        statusFilter = sql`je.status = 'POSTED' and je.reversed_by_id is null`;
        break;
      case "NETTED":
      default:
        statusFilter = sql`je.status = 'POSTED'`;
        break;
    }

    const result = await sql<Record<string, unknown>>`
      select
        a.id             as "accountId",
        a.account_code   as "accountCode",
        a.account_name   as "accountName",
        a.account_type   as "accountType",
        coalesce(sum(jl.debit_amount), 0)::text   as "debitBalance",
        coalesce(sum(jl.credit_amount), 0)::text   as "creditBalance"
      from fin.journal_line jl
      join fin.journal_entry je
        on je.id = jl.je_id and je.tenant_id = jl.tenant_id
      join fin.chart_of_accounts a
        on a.id = jl.account_id and a.tenant_id = jl.tenant_id
      where je.tenant_id    = ${tenantUuid}::uuid
        and je.entity_code  = ${entityCode}
        and je.book_code    = ${bookCode}
        and je.fiscal_year  = ${fiscalYear}
        and je.period_number <= ${periodNumber}
        and ${statusFilter}
      group by a.id, a.account_code, a.account_name, a.account_type
      having coalesce(sum(jl.debit_amount), 0) != 0
          or coalesce(sum(jl.credit_amount), 0) != 0
      order by a.account_code
    `.execute(db);

    return successResponse(result.rows);
  } catch (err) {
    console.error("[gl-trial-balance] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch trial balance",
    );
  } finally {
    await redis?.quit();
  }
}
