/**
 * GET /api/fin/gl/detail
 *
 * Returns GL detail rows (journal lines joined with journal entries).
 * Query params:
 *   entityCode    — required
 *   fiscalYear    — required
 *   accountId     — required
 *   periodNumber  — optional
 *   reversalMode  — optional: NETTED (default) | SEPARATE | EXCLUDED
 *   bookCode      — optional, defaults to STAT
 *   limit         — optional, default 500
 *   offset        — optional, default 0
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
    const accountId = url.searchParams.get("accountId");

    if (!entityCode || isNaN(fiscalYear) || !accountId) {
      return errorResponse(
        "VALIDATION",
        "entityCode, fiscalYear, and accountId are required",
        400,
      );
    }

    const periodNumber = url.searchParams.get("periodNumber");
    const reversalMode = (url.searchParams.get("reversalMode") ?? "NETTED") as ReversalMode;
    const bookCode = url.searchParams.get("bookCode") ?? "STAT";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "500", 10), 2000);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    // Build status/reversal filter fragments
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

    // Count for pagination
    const countResult = await sql<{ total: string }>`
      select count(*)::text as total
      from fin.journal_line jl
      join fin.journal_entry je on je.id = jl.je_id and je.tenant_id = jl.tenant_id
      where je.tenant_id    = ${tenantUuid}::uuid
        and je.entity_code  = ${entityCode}
        and je.book_code    = ${bookCode}
        and jl.account_id   = ${accountId}::uuid
        and je.fiscal_year  = ${fiscalYear}
        and (${periodNumber}::int is null or je.period_number = ${periodNumber ? parseInt(periodNumber, 10) : null}::int)
        and ${statusFilter}
    `.execute(db);
    const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

    // Data query
    const result = await sql<Record<string, unknown>>`
      select
        je.id              as "jeId",
        je.je_number       as "jeNumber",
        je.posting_date    as "postingDate",
        je.doc_id          as "docId",
        je.doc_type        as "docType",
        jl.line_no         as "lineNo",
        jl.debit_amount::text    as "debitAmount",
        jl.credit_amount::text   as "creditAmount",
        jl.description,
        jl.source_doc_line_id    as "sourceDocLineId",
        jl.cost_center_id        as "costCenterId",
        jl.dimension_set_id      as "dimensionSetId",
        ds.display_label         as "dimensionLabel"
      from fin.journal_line jl
      join fin.journal_entry je on je.id = jl.je_id and je.tenant_id = jl.tenant_id
      left join fin.dimension_set ds on ds.id = jl.dimension_set_id and ds.tenant_id = jl.tenant_id
      where je.tenant_id    = ${tenantUuid}::uuid
        and je.entity_code  = ${entityCode}
        and je.book_code    = ${bookCode}
        and jl.account_id   = ${accountId}::uuid
        and je.fiscal_year  = ${fiscalYear}
        and (${periodNumber}::int is null or je.period_number = ${periodNumber ? parseInt(periodNumber, 10) : null}::int)
        and ${statusFilter}
      order by je.posting_date, je.je_number, jl.line_no
      limit ${limit}
      offset ${offset}
    `.execute(db);

    return successResponse({
      items: result.rows,
      total,
      limit,
      offset,
      hasMore: offset + result.rows.length < total,
    });
  } catch (err) {
    console.error("[gl-detail] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch GL detail",
    );
  } finally {
    await redis?.quit();
  }
}
