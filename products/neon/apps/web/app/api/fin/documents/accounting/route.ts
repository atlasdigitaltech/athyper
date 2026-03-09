/**
 * GET /api/fin/documents/accounting
 *
 * Returns accounting details for a source document:
 *   - The journal entry header (je_number, posting_date, status, totals)
 *   - All journal lines with resolved account names and dimension labels
 *   - GL balance impact summary per account
 *
 * Query params:
 *   docId       — UUID of the source document (required)
 *   entityCode  — Entity code for tenant scoping (required)
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

    const docId = url.searchParams.get("docId");
    const entityCode = url.searchParams.get("entityCode");

    if (!docId || !entityCode) {
      return errorResponse("VALIDATION", "docId and entityCode are required", 400);
    }

    // Pre-validate docId: the JE lookup below uses doc_id which is already
    // scoped to tenant_id + entity_code. The combination of tenant_id filter
    // + entity_code filter ensures no cross-tenant data can leak.
    // No separate ownership check needed since je.doc_id is a value match
    // within the tenant-scoped WHERE clause, not an FK traversal.

    // Find journal entry via the source document's je_id FK
    // Works for purchase_invoice, payment_entry, credit_note, debit_note
    const jeResult = await sql<{
      jeId: string;
      jeNumber: string;
      postingDate: string;
      fiscalYear: number;
      periodNumber: number;
      description: string | null;
      totalDebit: string;
      totalCredit: string;
      currencyCode: string;
      status: string;
      bookCode: string;
      docType: string;
      isReversal: boolean;
      reversalOfId: string | null;
      reversedById: string | null;
      postedBy: string | null;
      postedAt: string | null;
    }>`
      select
        je.id                    as "jeId",
        je.je_number             as "jeNumber",
        je.posting_date::text    as "postingDate",
        je.fiscal_year           as "fiscalYear",
        je.period_number         as "periodNumber",
        je.description,
        je.total_debit::text     as "totalDebit",
        je.total_credit::text    as "totalCredit",
        je.currency_code         as "currencyCode",
        je.status,
        coalesce(je.book_code, 'STAT') as "bookCode",
        je.doc_type              as "docType",
        je.is_reversal           as "isReversal",
        je.reversal_of_id        as "reversalOfId",
        je.reversed_by_id        as "reversedById",
        je.posted_by             as "postedBy",
        je.posted_at::text       as "postedAt"
      from fin.journal_entry je
      where je.tenant_id = ${tenantUuid}::uuid
        and je.entity_code = ${entityCode}
        and je.doc_id = ${docId}::uuid
      order by je.posting_date desc
      limit 10
    `.execute(db);

    if (jeResult.rows.length === 0) {
      return successResponse({ entries: [], glImpact: [] });
    }

    // Fetch journal lines for all found JEs
    const jeIds = jeResult.rows.map((r) => r.jeId);
    const linesResult = await sql<{
      jeId: string;
      lineNo: number;
      accountId: string;
      accountCode: string | null;
      accountName: string | null;
      debitAmount: string;
      creditAmount: string;
      currencyCode: string | null;
      description: string | null;
      costCenterId: string | null;
      costCenterName: string | null;
      profitCenterId: string | null;
      profitCenterName: string | null;
      dimensionSetId: string | null;
      dimensionLabel: string | null;
      sourceDocLineId: string | null;
      subledgerType: string | null;
      subledgerRefId: string | null;
    }>`
      select
        jl.je_id                   as "jeId",
        jl.line_no                 as "lineNo",
        jl.account_id::text        as "accountId",
        coa.account_code           as "accountCode",
        coa.account_name           as "accountName",
        jl.debit_amount::text      as "debitAmount",
        jl.credit_amount::text     as "creditAmount",
        jl.currency_code           as "currencyCode",
        jl.description,
        jl.cost_center_id::text    as "costCenterId",
        cc.name                    as "costCenterName",
        jl.profit_center_id::text  as "profitCenterId",
        pc.name                    as "profitCenterName",
        jl.dimension_set_id::text  as "dimensionSetId",
        ds.display_label           as "dimensionLabel",
        jl.source_doc_line_id::text as "sourceDocLineId",
        jl.subledger_type          as "subledgerType",
        jl.subledger_ref_id::text  as "subledgerRefId"
      from fin.journal_line jl
      join fin.journal_entry je on je.id = jl.je_id and je.tenant_id = jl.tenant_id
      left join fin.chart_of_accounts coa on coa.id = jl.account_id and coa.tenant_id = jl.tenant_id
      left join ent.cost_center cc on cc.id = jl.cost_center_id and cc.tenant_id = jl.tenant_id
      left join ent.profit_center pc on pc.id = jl.profit_center_id and pc.tenant_id = jl.tenant_id
      left join fin.dimension_set ds on ds.id = jl.dimension_set_id and ds.tenant_id = jl.tenant_id
      where jl.tenant_id = ${tenantUuid}::uuid
        and jl.je_id = any(${jeIds}::uuid[])
      order by jl.je_id, jl.line_no
    `.execute(db);

    // Group lines by JE
    const linesByJe = new Map<string, typeof linesResult.rows>();
    for (const line of linesResult.rows) {
      const arr = linesByJe.get(line.jeId) ?? [];
      arr.push(line);
      linesByJe.set(line.jeId, arr);
    }

    const entries = jeResult.rows.map((je) => ({
      ...je,
      lines: linesByJe.get(je.jeId) ?? [],
    }));

    // GL impact summary: aggregate debits/credits per account
    const glImpact = await sql<{
      accountId: string;
      accountCode: string | null;
      accountName: string | null;
      totalDebit: string;
      totalCredit: string;
      netAmount: string;
    }>`
      select
        jl.account_id::text        as "accountId",
        coa.account_code           as "accountCode",
        coa.account_name           as "accountName",
        sum(jl.debit_amount)::text as "totalDebit",
        sum(jl.credit_amount)::text as "totalCredit",
        (sum(jl.debit_amount) - sum(jl.credit_amount))::text as "netAmount"
      from fin.journal_line jl
      join fin.journal_entry je on je.id = jl.je_id and je.tenant_id = jl.tenant_id
      left join fin.chart_of_accounts coa on coa.id = jl.account_id and coa.tenant_id = jl.tenant_id
      where jl.tenant_id = ${tenantUuid}::uuid
        and je.entity_code = ${entityCode}
        and je.doc_id = ${docId}::uuid
      group by jl.account_id, coa.account_code, coa.account_name
      order by coa.account_code
    `.execute(db);

    return successResponse({ entries, glImpact });
  } catch (err) {
    console.error("[documents-accounting] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch accounting details",
    );
  } finally {
    await redis?.quit();
  }
}
