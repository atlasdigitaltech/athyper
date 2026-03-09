/**
 * Decision Log API — Immutable, append-only decision capture
 *
 * GET  /api/fin/decisions?entityCode=...&fiscalYear=...&periodNumber=...
 *   → list decisions for a period
 *
 * GET  /api/fin/decisions?entityCode=...&targetKind=...&targetId=...
 *   → list decisions for a specific target
 *
 * POST /api/fin/decisions
 *   → record a new decision (append-only, no update/delete)
 *   Body: { entityCode, targetKind, targetId?, decisionType, title,
 *           rationale?, contextSnapshot?, relatedItemId?,
 *           fiscalYear?, periodNumber? }
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
// GET — list decisions
// ---------------------------------------------------------------------------

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

    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");
    const targetKind = url.searchParams.get("targetKind");
    const targetId = url.searchParams.get("targetId");
    const decisionType = url.searchParams.get("decisionType");

    const result = await sql`
      SELECT
        d.id, d.entity_code,
        d.target_kind, d.target_id,
        d.decision_type, d.title, d.rationale,
        d.context_snapshot,
        d.related_item_id,
        d.fiscal_year, d.period_number,
        d.decided_by, d.decided_by_name, d.decided_at,
        -- If related to an action item, include its title
        ai.title AS related_item_title,
        ai.status AS related_item_status
      FROM fin.decision_log d
      LEFT JOIN fin.action_item ai ON ai.id = d.related_item_id
      WHERE d.tenant_id = ${tenantUuid}
        AND d.entity_code = ${entityCode}
        ${fiscalYear ? sql`AND d.fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
        ${periodNumber ? sql`AND d.period_number = ${parseInt(periodNumber, 10)}` : sql``}
        ${targetKind ? sql`AND d.target_kind = ${targetKind}` : sql``}
        ${targetId ? sql`AND d.target_id = ${targetId}::uuid` : sql``}
        ${decisionType ? sql`AND d.decision_type = ${decisionType}` : sql``}
      ORDER BY d.decided_at DESC
    `.execute(db);

    return successResponse({ data: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/decisions] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch decisions");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — record a decision (append-only)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
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
    const body = await req.json();

    const {
      entityCode,
      targetKind,
      targetId,
      decisionType,
      title,
      rationale,
      contextSnapshot,
      relatedItemId,
      fiscalYear,
      periodNumber,
    } = body;

    if (!entityCode || !targetKind || !decisionType || !title) {
      return errorResponse("VALIDATION", "entityCode, targetKind, decisionType, and title are required", 400);
    }

    const result = await sql`
      INSERT INTO fin.decision_log (
        tenant_id, entity_code,
        target_kind, target_id,
        decision_type, title, rationale,
        context_snapshot,
        related_item_id,
        fiscal_year, period_number,
        decided_by, decided_by_name
      ) VALUES (
        ${tenantUuid}, ${entityCode},
        ${targetKind}, ${targetId ?? null}::uuid,
        ${decisionType}, ${title}, ${rationale ?? null},
        ${contextSnapshot ? sql`${JSON.stringify(contextSnapshot)}::jsonb` : sql`NULL`},
        ${relatedItemId ?? null}::uuid,
        ${fiscalYear ?? null}, ${periodNumber ?? null},
        ${context.userId}::uuid, ${context.username ?? null}
      )
      RETURNING id, decided_at
    `.execute(db);

    return successResponse({
      data: (result.rows as any[])[0],
      message: "Decision recorded",
    });
  } catch (error) {
    console.error("[POST /api/fin/decisions] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to record decision");
  } finally {
    await redis?.quit();
  }
}
