/**
 * Reconciliation Session API
 *
 * POST /api/fin/reconciliation/{sessionId}
 *   → Execute commands: auto-match, match, unmatch, complete
 *
 * GET /api/fin/reconciliation/{sessionId}
 *   → Reconciliation report (session + statistics)
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
// GET — reconciliation report
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const { sessionId } = await params;

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
        r.completed_at         as "completedAt",
        s.statement_number     as "statementNumber",
        s.bank_name            as "bankName",
        s.statement_date       as "statementDate",
        s.opening_balance::text as "openingBalance",
        s.closing_balance::text as "closingBalance",
        s.currency_code        as "currencyCode"
      from fin.reconciliation_session r
      join fin.bank_statement s on s.id = r.statement_id
      where r.id = ${sessionId}::uuid
        and r.tenant_id = ${tenantUuid}::uuid
    `.execute(db);

    if (!sessionResult.rows.length) {
      return errorResponse("NOT_FOUND", "Reconciliation session not found", 404);
    }

    // Get matched lines for report
    const linesResult = await sql<Record<string, unknown>>`
      select
        l.id,
        l.line_no              as "lineNo",
        l.transaction_date     as "transactionDate",
        l.amount::text,
        l.direction,
        l.reference,
        l.description,
        l.counterparty,
        l.match_status         as "matchStatus",
        l.match_confidence     as "matchConfidence",
        l.matched_payment_id   as "matchedPaymentId",
        l.matched_at           as "matchedAt"
      from fin.bank_statement_line l
      where l.statement_id = ${sessionResult.rows[0].statementId as string}::uuid
        and l.tenant_id = ${tenantUuid}::uuid
      order by l.line_no
    `.execute(db);

    return successResponse({
      session: sessionResult.rows[0],
      lines: linesResult.rows,
    });
  } catch (err) {
    console.error("[reconciliation/:id] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to fetch report");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — execute reconciliation commands
// ---------------------------------------------------------------------------

type Command =
  | { action: "auto-match" }
  | { action: "match"; lineId: string; paymentId: string }
  | { action: "unmatch"; lineId: string }
  | { action: "complete" };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const { userId } = apiCtx.context;
    const { sessionId } = await params;
    const body = (await req.json()) as Command;

    // Verify session exists and is OPEN
    const sessionResult = await sql<{ id: string; status: string; statement_id: string }>`
      select id, status, statement_id
      from fin.reconciliation_session
      where id = ${sessionId}::uuid and tenant_id = ${tenantUuid}::uuid
    `.execute(db);

    if (!sessionResult.rows.length) {
      return errorResponse("NOT_FOUND", "Session not found", 404);
    }
    const session = sessionResult.rows[0];

    if (body.action === "complete") {
      return handleComplete(db, tenantUuid, userId, session);
    }

    if (session.status !== "OPEN") {
      return errorResponse("SESSION_CLOSED", "Session is not open", 422);
    }

    switch (body.action) {
      case "auto-match":
        return handleAutoMatch(db, tenantUuid, userId, session);
      case "match":
        return handleManualMatch(db, tenantUuid, userId, body.lineId, body.paymentId, session);
      case "unmatch":
        return handleUnmatch(db, tenantUuid, userId, body.lineId, session);
      default:
        return errorResponse("UNKNOWN_ACTION", `Unknown action: ${(body as Record<string, unknown>).action}`, 400);
    }
  } catch (err) {
    console.error("[reconciliation/:id] POST error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to execute command");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleAutoMatch(
  db: any,
  tenantUuid: string,
  userId: string,
  session: { id: string; statement_id: string },
) {
  // Get unmatched lines
  const linesResult = await sql<{
    id: string; amount: string; direction: string;
    reference: string | null; transaction_date: Date;
  }>`
    select id, amount::text, direction, reference, transaction_date
    from fin.bank_statement_line
    where statement_id = ${session.statement_id}::uuid
      and tenant_id = ${tenantUuid}::uuid
      and match_status = 'UNMATCHED'
  `.execute(db);

  // Get statement period for payment lookup
  const stmtResult = await sql<{ period_start: Date; period_end: Date; entity_code: string }>`
    select period_start, period_end, entity_code
    from fin.bank_statement
    where id = ${session.statement_id}::uuid
  `.execute(db);

  if (!stmtResult.rows.length) {
    return errorResponse("NOT_FOUND", "Statement not found", 404);
  }

  const stmt = stmtResult.rows[0];

  // Get posted payments in the period
  const paymentsResult = await sql<{
    id: string; total_amount: string; payment_date: Date; bank_reference: string | null;
  }>`
    select id, total_amount::text, payment_date, bank_reference
    from fin.payment_entry
    where tenant_id = ${tenantUuid}::uuid
      and entity_code = ${stmt.entity_code}
      and status = 'POSTED'
      and payment_date between ${stmt.period_start}::date and ${stmt.period_end}::date
  `.execute(db);

  // Simple 2-pass auto-match
  const usedPayments = new Set<string>();
  const matches: Array<{ lineId: string; paymentId: string; confidence: number }> = [];

  // Pass 1: exact amount + reference match
  for (const line of linesResult.rows) {
    if (line.direction !== "DEBIT") continue;
    for (const payment of paymentsResult.rows) {
      if (usedPayments.has(payment.id)) continue;
      if (line.amount === payment.total_amount && line.reference && payment.bank_reference &&
          line.reference === payment.bank_reference) {
        matches.push({ lineId: line.id, paymentId: payment.id, confidence: 97 });
        usedPayments.add(payment.id);
        break;
      }
    }
  }

  // Pass 2: exact amount match (no ref required)
  for (const line of linesResult.rows) {
    if (line.direction !== "DEBIT") continue;
    if (matches.some((m) => m.lineId === line.id)) continue;
    for (const payment of paymentsResult.rows) {
      if (usedPayments.has(payment.id)) continue;
      if (line.amount === payment.total_amount) {
        const daysDiff = Math.abs(
          (new Date(line.transaction_date).getTime() - new Date(payment.payment_date).getTime()) / 86400000,
        );
        if (daysDiff <= 5) {
          const confidence = daysDiff <= 1 ? 79 : daysDiff <= 3 ? 70 : 60;
          matches.push({ lineId: line.id, paymentId: payment.id, confidence });
          usedPayments.add(payment.id);
          break;
        }
      }
    }
  }

  // Apply high-confidence matches (>= 90)
  let applied = 0;
  for (const match of matches) {
    if (match.confidence >= 90) {
      await sql`
        update fin.bank_statement_line
        set match_status = 'AUTO_MATCHED',
            match_confidence = ${match.confidence},
            matched_payment_id = ${match.paymentId}::uuid,
            matched_by = ${userId}::uuid,
            matched_at = now()
        where id = ${match.lineId}::uuid
      `.execute(db);
      applied++;
    }
  }

  // Refresh session counts
  await refreshCounts(db, tenantUuid, session.id, session.statement_id);

  return successResponse({
    totalMatches: matches.length,
    applied,
    flaggedForReview: matches.length - applied,
    matches: matches.map((m) => ({
      lineId: m.lineId,
      paymentId: m.paymentId,
      confidence: m.confidence,
      autoApplied: m.confidence >= 90,
    })),
  });
}

async function handleManualMatch(
  db: any,
  tenantUuid: string,
  userId: string,
  lineId: string,
  paymentId: string,
  session: { id: string; statement_id: string },
) {
  if (!lineId || !paymentId) {
    return errorResponse("VALIDATION", "lineId and paymentId are required", 400);
  }

  // Verify line is UNMATCHED
  const lineResult = await sql<{ match_status: string }>`
    select match_status from fin.bank_statement_line
    where id = ${lineId}::uuid and tenant_id = ${tenantUuid}::uuid
  `.execute(db);

  if (!lineResult.rows.length) {
    return errorResponse("NOT_FOUND", "Line not found", 404);
  }
  if (lineResult.rows[0].match_status !== "UNMATCHED") {
    return errorResponse("ALREADY_MATCHED", `Line is already ${lineResult.rows[0].match_status}`, 422);
  }

  await sql`
    update fin.bank_statement_line
    set match_status = 'MANUAL_MATCHED',
        match_confidence = 100,
        matched_payment_id = ${paymentId}::uuid,
        matched_by = ${userId}::uuid,
        matched_at = now()
    where id = ${lineId}::uuid
  `.execute(db);

  await refreshCounts(db, tenantUuid, session.id, session.statement_id);

  return successResponse({ lineId, paymentId, matchStatus: "MANUAL_MATCHED" });
}

async function handleUnmatch(
  db: any,
  tenantUuid: string,
  _userId: string,
  lineId: string,
  session: { id: string; statement_id: string },
) {
  if (!lineId) {
    return errorResponse("VALIDATION", "lineId is required", 400);
  }

  const lineResult = await sql<{ match_status: string }>`
    select match_status from fin.bank_statement_line
    where id = ${lineId}::uuid and tenant_id = ${tenantUuid}::uuid
  `.execute(db);

  if (!lineResult.rows.length) {
    return errorResponse("NOT_FOUND", "Line not found", 404);
  }
  if (lineResult.rows[0].match_status === "UNMATCHED") {
    return errorResponse("NOT_MATCHED", "Line is not currently matched", 422);
  }
  if (lineResult.rows[0].match_status === "CONFIRMED") {
    return errorResponse("CONFIRMED", "Cannot unmatch a confirmed line", 422);
  }

  await sql`
    update fin.bank_statement_line
    set match_status = 'UNMATCHED',
        match_confidence = null,
        matched_payment_id = null,
        matched_by = null,
        matched_at = null
    where id = ${lineId}::uuid
  `.execute(db);

  await refreshCounts(db, tenantUuid, session.id, session.statement_id);

  return successResponse({ lineId, matchStatus: "UNMATCHED" });
}

async function handleComplete(
  db: any,
  tenantUuid: string,
  userId: string,
  session: { id: string; status: string; statement_id: string },
) {
  if (session.status !== "OPEN") {
    return errorResponse("SESSION_CLOSED", "Session is not open", 422);
  }

  // Confirm all matched lines
  await sql`
    update fin.bank_statement_line
    set match_status = 'CONFIRMED'
    where statement_id = ${session.statement_id}::uuid
      and tenant_id = ${tenantUuid}::uuid
      and match_status in ('AUTO_MATCHED', 'MANUAL_MATCHED')
  `.execute(db);

  // Complete session
  await sql`
    update fin.reconciliation_session
    set status = 'COMPLETED',
        completed_by = ${userId}::uuid,
        completed_at = now()
    where id = ${session.id}::uuid
  `.execute(db);

  // Mark statement COMPLETED
  await sql`
    update fin.bank_statement
    set status = 'COMPLETED', updated_at = now()
    where id = ${session.statement_id}::uuid
  `.execute(db);

  await refreshCounts(db, tenantUuid, session.id, session.statement_id);

  return successResponse({ sessionId: session.id, status: "COMPLETED" });
}

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

async function refreshCounts(
  db: any,
  tenantUuid: string,
  sessionId: string,
  statementId: string,
) {
  const stats = await sql<Record<string, number>>`
    select
      count(*) filter (where match_status = 'AUTO_MATCHED' or match_status = 'CONFIRMED')::int as auto_matched,
      count(*) filter (where match_status = 'MANUAL_MATCHED')::int as manual_matched,
      count(*) filter (where match_status = 'UNMATCHED')::int as unmatched,
      count(*) filter (where match_status = 'EXCLUDED')::int as excluded
    from fin.bank_statement_line
    where statement_id = ${statementId}::uuid
      and tenant_id = ${tenantUuid}::uuid
  `.execute(db);

  const s = stats.rows[0] ?? { auto_matched: 0, manual_matched: 0, unmatched: 0, excluded: 0 };

  // Calculate discrepancy
  const discResult = await sql<{ net_matched: string; expected_net: string }>`
    select
      coalesce(sum(case when l.direction = 'CREDIT' then l.amount else -l.amount end), 0)::text as net_matched,
      (s.closing_balance - s.opening_balance)::text as expected_net
    from fin.bank_statement_line l
    join fin.bank_statement s on s.id = l.statement_id
    where l.statement_id = ${statementId}::uuid
      and l.tenant_id = ${tenantUuid}::uuid
      and l.match_status not in ('UNMATCHED', 'EXCLUDED')
    group by s.closing_balance, s.opening_balance
  `.execute(db);

  const discrepancy = discResult.rows.length
    ? String(Number(discResult.rows[0].expected_net) - Number(discResult.rows[0].net_matched))
    : "0";

  await sql`
    update fin.reconciliation_session
    set auto_matched = ${s.auto_matched},
        manual_matched = ${s.manual_matched},
        unmatched = ${s.unmatched},
        excluded = ${s.excluded},
        discrepancy = ${discrepancy}::decimal
    where id = ${sessionId}::uuid
  `.execute(db);
}
