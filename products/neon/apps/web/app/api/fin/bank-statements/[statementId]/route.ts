/**
 * GET /api/fin/bank-statements/{statementId}
 *   → Statement detail with lines
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ statementId: string }> },
) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const { statementId } = await params;

    // Fetch statement
    const stmtResult = await sql<Record<string, unknown>>`
      select
        s.id,
        s.tenant_id            as "tenantId",
        s.entity_code          as "entityCode",
        s.statement_number     as "statementNumber",
        s.bank_account_id      as "bankAccountId",
        s.bank_name            as "bankName",
        s.statement_date       as "statementDate",
        s.period_start         as "periodStart",
        s.period_end           as "periodEnd",
        s.opening_balance::text as "openingBalance",
        s.closing_balance::text as "closingBalance",
        s.currency_code        as "currencyCode",
        s.source,
        s.status,
        s.created_at           as "createdAt"
      from fin.bank_statement s
      where s.id = ${statementId}::uuid
        and s.tenant_id = ${tenantUuid}::uuid
    `.execute(db);

    if (!stmtResult.rows.length) {
      return errorResponse("NOT_FOUND", "Statement not found", 404);
    }

    // Fetch lines
    const linesResult = await sql<Record<string, unknown>>`
      select
        l.id,
        l.statement_id        as "statementId",
        l.line_no             as "lineNo",
        l.transaction_date    as "transactionDate",
        l.value_date          as "valueDate",
        l.amount::text,
        l.direction,
        l.reference,
        l.description,
        l.counterparty,
        l.bank_reference      as "bankReference",
        l.match_status        as "matchStatus",
        l.match_confidence    as "matchConfidence",
        l.matched_payment_id  as "matchedPaymentId",
        l.matched_at          as "matchedAt",
        l.matched_by          as "matchedBy"
      from fin.bank_statement_line l
      where l.statement_id = ${statementId}::uuid
        and l.tenant_id = ${tenantUuid}::uuid
      order by l.line_no
    `.execute(db);

    // Fetch active session if any
    const sessionResult = await sql<Record<string, unknown>>`
      select
        r.id,
        r.statement_id         as "statementId",
        r.status,
        r.total_lines          as "totalLines",
        r.auto_matched         as "autoMatched",
        r.manual_matched       as "manualMatched",
        r.unmatched,
        r.excluded,
        r.discrepancy::text,
        r.started_by           as "startedBy",
        r.started_at           as "startedAt",
        r.completed_by         as "completedBy",
        r.completed_at         as "completedAt"
      from fin.reconciliation_session r
      where r.statement_id = ${statementId}::uuid
        and r.tenant_id = ${tenantUuid}::uuid
      order by r.created_at desc
      limit 1
    `.execute(db);

    return successResponse({
      statement: stmtResult.rows[0],
      lines: linesResult.rows,
      session: sessionResult.rows[0] ?? null,
    });
  } catch (err) {
    console.error("[bank-statements/:id] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to fetch statement");
  } finally {
    await redis?.quit();
  }
}
