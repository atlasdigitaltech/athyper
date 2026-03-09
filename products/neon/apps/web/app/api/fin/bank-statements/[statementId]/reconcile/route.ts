/**
 * POST /api/fin/bank-statements/{statementId}/reconcile
 *   → Start a reconciliation session for this statement
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

export async function POST(
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
    const { userId } = apiCtx.context;
    const { statementId } = await params;

    // Verify statement exists and is not COMPLETED
    const stmtResult = await sql<{ id: string; status: string }>`
      select id, status from fin.bank_statement
      where id = ${statementId}::uuid and tenant_id = ${tenantUuid}::uuid
    `.execute(db);

    if (!stmtResult.rows.length) {
      return errorResponse("NOT_FOUND", "Statement not found", 404);
    }
    if (stmtResult.rows[0].status === "COMPLETED") {
      return errorResponse("ALREADY_COMPLETED", "Statement is already reconciled", 422);
    }

    // Check for existing OPEN session (idempotent)
    const existing = await sql<Record<string, unknown>>`
      select * from fin.reconciliation_session
      where statement_id = ${statementId}::uuid
        and tenant_id = ${tenantUuid}::uuid
        and status = 'OPEN'
      order by created_at desc limit 1
    `.execute(db);

    if (existing.rows.length) {
      return successResponse(mapSession(existing.rows[0]));
    }

    // Count lines
    const countResult = await sql<{ cnt: number }>`
      select count(*)::int as cnt from fin.bank_statement_line
      where statement_id = ${statementId}::uuid and tenant_id = ${tenantUuid}::uuid
    `.execute(db);
    const totalLines = countResult.rows[0]?.cnt ?? 0;

    // Create session
    const sessionResult = await sql<Record<string, unknown>>`
      insert into fin.reconciliation_session (
        tenant_id, statement_id, status, total_lines,
        auto_matched, manual_matched, unmatched, excluded,
        discrepancy, started_by, started_at
      ) values (
        ${tenantUuid}::uuid, ${statementId}::uuid, 'OPEN', ${totalLines},
        0, 0, ${totalLines}, 0,
        '0', ${userId}::uuid, now()
      )
      returning *
    `.execute(db);

    // Mark statement IN_PROGRESS
    await sql`
      update fin.bank_statement
      set status = 'IN_PROGRESS', updated_at = now()
      where id = ${statementId}::uuid and tenant_id = ${tenantUuid}::uuid
    `.execute(db);

    return successResponse(mapSession(sessionResult.rows[0]));
  } catch (err) {
    console.error("[bank-statements/:id/reconcile] POST error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to start reconciliation");
  } finally {
    await redis?.quit();
  }
}

function mapSession(row: Record<string, unknown>) {
  return {
    id: row.id,
    statementId: row.statement_id,
    status: row.status,
    totalLines: row.total_lines,
    autoMatched: row.auto_matched,
    manualMatched: row.manual_matched,
    unmatched: row.unmatched,
    excluded: row.excluded,
    discrepancy: String(row.discrepancy),
    startedBy: row.started_by,
    startedAt: row.started_at,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
  };
}
