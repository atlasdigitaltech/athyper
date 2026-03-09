/**
 * GET /api/fin/gl/summary
 *
 * Returns GL balance summary rows from fin.gl_balance (pre-aggregated).
 * Query params:
 *   entityCode   — required
 *   fiscalYear   — required
 *   periodNumber — optional (omit = all periods)
 *   accountId    — optional
 *   costCenterId — optional
 *   accountType  — optional (ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE)
 *   bookCode     — optional, defaults to STAT
 *   dimensionSetId     — optional
 *   dimensionTypeCode  — optional (filter by dimension type within set)
 *   dimensionValueCode — optional (filter by dimension value within set)
 *   groupByDimension   — optional (group results by dimension type)
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

    if (!entityCode || isNaN(fiscalYear)) {
      return errorResponse("VALIDATION", "entityCode and fiscalYear are required", 400);
    }

    const periodNumber = url.searchParams.get("periodNumber");
    const accountId = url.searchParams.get("accountId");
    const costCenterId = url.searchParams.get("costCenterId");
    const accountType = url.searchParams.get("accountType");
    const bookCode = url.searchParams.get("bookCode") ?? "STAT";
    const dimensionSetId = url.searchParams.get("dimensionSetId");

    const result = await sql<Record<string, unknown>>`
      select
        a.id                           as "accountId",
        a.account_code                 as "accountCode",
        a.account_name                 as "accountName",
        a.account_type                 as "accountType",
        coalesce(b.opening_debit, 0)::text   as "openingDebit",
        coalesce(b.opening_credit, 0)::text  as "openingCredit",
        coalesce(b.period_debit, 0)::text    as "periodDebit",
        coalesce(b.period_credit, 0)::text   as "periodCredit",
        coalesce(b.closing_debit, 0)::text   as "closingDebit",
        coalesce(b.closing_credit, 0)::text  as "closingCredit",
        b.dimension_set_id             as "dimensionSetId",
        ds.display_label               as "dimensionLabel"
      from fin.gl_balance b
      join fin.chart_of_accounts a
        on a.id = b.account_id and a.tenant_id = b.tenant_id
      left join fin.dimension_set ds
        on ds.id = b.dimension_set_id and ds.tenant_id = b.tenant_id
      where b.tenant_id    = ${tenantUuid}::uuid
        and b.entity_code  = ${entityCode}
        and b.fiscal_year  = ${fiscalYear}
        and b.book_code    = ${bookCode}
        and (${periodNumber}::int is null or b.period_number = ${periodNumber ? parseInt(periodNumber, 10) : null}::int)
        and (${accountId}::uuid is null or b.account_id = ${accountId}::uuid)
        and (${costCenterId}::uuid is null or b.cost_center_id = ${costCenterId}::uuid)
        and (${accountType}::text is null or a.account_type = ${accountType})
        and (${dimensionSetId}::uuid is null or b.dimension_set_id = ${dimensionSetId}::uuid)
      order by a.account_code
    `.execute(db);

    return successResponse(result.rows);
  } catch (err) {
    console.error("[gl-summary] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch GL summary",
    );
  } finally {
    await redis?.quit();
  }
}
