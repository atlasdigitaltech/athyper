/**
 * Commentary API — Executive notes & structured annotations
 *
 * GET  /api/fin/commentary?targetKind=...&targetId=...
 *   → list commentary for a target (current versions by default)
 *
 * GET  /api/fin/commentary?targetKind=...&targetId=...&history=true
 *   → include version history
 *
 * POST /api/fin/commentary
 *   → create or update commentary (auto-versions existing entries)
 *   Body: { targetKind, targetId, commentaryType, title?, body,
 *           packInstanceItemId?, statementLineCode? }
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
// GET
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

    const targetKind = url.searchParams.get("targetKind");
    const targetId = url.searchParams.get("targetId");
    const showHistory = url.searchParams.get("history") === "true";

    if (!targetKind || !targetId) {
      return errorResponse("VALIDATION", "targetKind and targetId are required", 400);
    }

    const result = await sql`
      SELECT
        id, target_kind, target_id,
        pack_instance_item_id, statement_line_code,
        commentary_type, title, body,
        version, is_current,
        author_id, author_name,
        created_at, updated_at
      FROM fin.report_commentary
      WHERE tenant_id = ${tenantUuid}
        AND target_kind = ${targetKind}
        AND target_id = ${targetId}::uuid
        ${showHistory ? sql`` : sql`AND is_current = TRUE`}
      ORDER BY commentary_type, version DESC
    `.execute(db);

    return successResponse({ data: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/commentary] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch commentary");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — create or version commentary
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
      targetKind,
      targetId,
      commentaryType = "NARRATIVE",
      title,
      body: commentaryBody,
      packInstanceItemId,
      statementLineCode,
    } = body;

    if (!targetKind || !targetId || !commentaryBody) {
      return errorResponse("VALIDATION", "targetKind, targetId, and body are required", 400);
    }

    // Find existing current version for this target + type
    const existingResult = await sql`
      SELECT id, version
      FROM fin.report_commentary
      WHERE tenant_id = ${tenantUuid}
        AND target_kind = ${targetKind}
        AND target_id = ${targetId}::uuid
        AND commentary_type = ${commentaryType}
        AND is_current = TRUE
      LIMIT 1
    `.execute(db);

    const existing = (existingResult.rows as any[])[0];
    const newVersion = existing ? existing.version + 1 : 1;

    // Mark existing as superseded
    if (existing) {
      await sql`
        UPDATE fin.report_commentary
        SET is_current = FALSE, updated_at = now()
        WHERE id = ${existing.id}
      `.execute(db);
    }

    // Insert new version
    const insertResult = await sql`
      INSERT INTO fin.report_commentary (
        tenant_id, target_kind, target_id,
        pack_instance_item_id, statement_line_code,
        commentary_type, title, body,
        version, is_current,
        author_id, author_name
      ) VALUES (
        ${tenantUuid}, ${targetKind}, ${targetId}::uuid,
        ${packInstanceItemId ?? null}::uuid, ${statementLineCode ?? null},
        ${commentaryType}, ${title ?? null}, ${commentaryBody},
        ${newVersion}, TRUE,
        ${context.userId ?? null}::uuid, ${context.username ?? null}
      )
      RETURNING id, version, created_at
    `.execute(db);

    return successResponse({
      data: (insertResult.rows as any[])[0],
      message: existing ? `Updated to version ${newVersion}` : "Commentary created",
    });
  } catch (error) {
    console.error("[POST /api/fin/commentary] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to save commentary");
  } finally {
    await redis?.quit();
  }
}
