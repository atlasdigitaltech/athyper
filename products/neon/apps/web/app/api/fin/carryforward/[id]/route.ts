/**
 * Carry-Forward Detail API
 *
 * PATCH /api/fin/carryforward/[id]
 *   → mark a carry-forward link as resolved
 *   Body: { resolvedRef? }
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
// PATCH — resolve carry-forward
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const { id } = await params;
    const body = await req.json();
    const { resolvedRef } = body;

    const result = await sql`
      UPDATE fin.followup_link
      SET resolved = TRUE,
          resolved_at = now(),
          resolved_ref = ${resolvedRef ?? null}::uuid
      WHERE id = ${id}::uuid
        AND tenant_id = ${tenantUuid}
        AND resolved = FALSE
      RETURNING id, resolved, resolved_at
    `.execute(db);

    if ((result.rows as any[]).length === 0) {
      return errorResponse("NOT_FOUND", "Carry-forward link not found or already resolved", 404);
    }

    return successResponse({
      data: (result.rows as any[])[0],
      message: "Carry-forward resolved",
    });
  } catch (error) {
    console.error("[PATCH /api/fin/carryforward/[id]] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to resolve carry-forward");
  } finally {
    await redis?.quit();
  }
}
