/**
 * Bank Statement API
 *
 * GET  /api/fin/bank-statements — list statements (entityCode, bankAccountId, status filters)
 * POST /api/fin/bank-statements — import a bank statement with lines
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
// GET — list bank statements
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
    const bankAccountId = url.searchParams.get("bankAccountId");
    const status = url.searchParams.get("status");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const result = await sql<Record<string, unknown>>`
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
        s.created_at           as "createdAt",
        (select count(*) from fin.bank_statement_line bsl where bsl.statement_id = s.id)::int as "lineCount"
      from fin.bank_statement s
      where s.tenant_id = ${tenantUuid}::uuid
        and (${entityCode}::text is null or s.entity_code = ${entityCode})
        and (${bankAccountId}::uuid is null or s.bank_account_id = ${bankAccountId}::uuid)
        and (${status}::text is null or s.status = ${status})
      order by s.statement_date desc, s.created_at desc
      limit ${limit}
      offset ${offset}
    `.execute(db);

    return successResponse(result.rows);
  } catch (err) {
    console.error("[bank-statements] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to list statements");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — import a bank statement with lines
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
    const body = await req.json();

    const {
      entityCode, statementNumber, bankAccountId, bankName,
      statementDate, periodStart, periodEnd,
      openingBalance, closingBalance, currencyCode,
      source, lines,
    } = body as {
      entityCode: string;
      statementNumber: string;
      bankAccountId: string;
      bankName?: string;
      statementDate: string;
      periodStart: string;
      periodEnd: string;
      openingBalance: string;
      closingBalance: string;
      currencyCode: string;
      source?: string;
      lines?: Array<{
        transactionDate: string;
        valueDate?: string;
        amount: string;
        direction: string;
        reference?: string;
        description?: string;
        counterparty?: string;
        bankReference?: string;
      }>;
    };

    if (!entityCode || !statementNumber || !bankAccountId || !statementDate || !periodStart || !periodEnd) {
      return errorResponse("VALIDATION", "entityCode, statementNumber, bankAccountId, statementDate, periodStart, and periodEnd are required", 400);
    }

    // Create statement
    const stmtResult = await sql<Record<string, unknown>>`
      insert into fin.bank_statement (
        tenant_id, entity_code, statement_number, bank_account_id,
        bank_name, statement_date, period_start, period_end,
        opening_balance, closing_balance, currency_code, source, status
      ) values (
        ${tenantUuid}::uuid, ${entityCode}, ${statementNumber}, ${bankAccountId}::uuid,
        ${bankName ?? null}, ${statementDate}::date, ${periodStart}::date, ${periodEnd}::date,
        ${openingBalance}::decimal, ${closingBalance}::decimal,
        ${currencyCode}, ${source ?? "MANUAL"}, 'IMPORTED'
      )
      returning *
    `.execute(db);

    const statement = stmtResult.rows[0];
    const statementId = statement.id as string;

    // Create lines if provided
    if (lines && lines.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await sql`
          insert into fin.bank_statement_line (
            tenant_id, statement_id, line_no,
            transaction_date, value_date, amount,
            direction, reference, description,
            counterparty, bank_reference, match_status
          ) values (
            ${tenantUuid}::uuid, ${statementId}::uuid, ${i + 1},
            ${line.transactionDate}::date, ${line.valueDate ?? null}::date,
            ${line.amount}::decimal, ${line.direction},
            ${line.reference ?? null}, ${line.description ?? null},
            ${line.counterparty ?? null}, ${line.bankReference ?? null},
            'UNMATCHED'
          )
        `.execute(db);
      }
    }

    return successResponse({ ...statement, lineCount: lines?.length ?? 0 });
  } catch (err) {
    console.error("[bank-statements] POST error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to import statement");
  } finally {
    await redis?.quit();
  }
}
