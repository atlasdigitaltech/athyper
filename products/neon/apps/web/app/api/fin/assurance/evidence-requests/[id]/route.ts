/**
 * Evidence Request Detail API — Phase 15
 *
 * PATCH /api/fin/assurance/evidence-requests/[id]
 *   → Update evidence request status or assignment
 *   Body: { action: "assign" | "acknowledge" | "start" | "fulfill" | "reject" | "resubmit",
 *           assignedTo?, assignedRole?, resolutionNote?, fulfillmentRef? }
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
// PATCH — update evidence request
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
    const { action, assignedTo, assignedRole, resolutionNote, fulfillmentRef } = body;

    // Verify item exists and belongs to tenant
    const existing = await sql`
      SELECT id, status, target_kind FROM fin.action_item
      WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
        AND target_kind IN ('evidence_request', 'pbc_item')
    `.execute(db);

    if ((existing.rows as any[]).length === 0) {
      return errorResponse("NOT_FOUND", "Evidence request not found", 404);
    }

    switch (action) {
      case "assign":
        await sql`
          UPDATE fin.action_item
          SET assigned_to = ${assignedTo ? sql`${assignedTo}::uuid` : sql`NULL`},
              assigned_role = ${assignedRole ?? null},
              assigned_at = now(),
              updated_at = now()
          WHERE id = ${id}::uuid
        `.execute(db);
        break;

      case "acknowledge":
        await sql`
          UPDATE fin.action_item
          SET status = 'acknowledged', updated_at = now()
          WHERE id = ${id}::uuid AND status = 'open'
        `.execute(db);
        break;

      case "start":
        await sql`
          UPDATE fin.action_item
          SET status = 'in_progress', updated_at = now()
          WHERE id = ${id}::uuid AND status IN ('open', 'acknowledged')
        `.execute(db);
        break;

      case "fulfill":
        await sql`
          UPDATE fin.action_item
          SET status = 'resolved',
              resolved_at = now(),
              resolved_by = ${context.userId}::uuid,
              resolution_note = ${resolutionNote ?? null},
              source_ref = coalesce(${fulfillmentRef ?? null}, source_ref),
              updated_at = now()
          WHERE id = ${id}::uuid AND status IN ('open', 'acknowledged', 'in_progress')
        `.execute(db);
        break;

      case "reject":
        await sql`
          UPDATE fin.action_item
          SET status = 'dismissed',
              resolved_at = now(),
              resolved_by = ${context.userId}::uuid,
              resolution_note = ${resolutionNote ?? null},
              updated_at = now()
          WHERE id = ${id}::uuid AND status IN ('open', 'acknowledged', 'in_progress')
        `.execute(db);
        break;

      case "resubmit":
        // Reopen a resolved/dismissed request
        await sql`
          UPDATE fin.action_item
          SET status = 'open',
              resolved_at = NULL,
              resolved_by = NULL,
              resolution_note = ${resolutionNote ?? null},
              updated_at = now()
          WHERE id = ${id}::uuid AND status IN ('resolved', 'dismissed')
        `.execute(db);
        break;

      default:
        return errorResponse("VALIDATION", `Unknown action: ${action}`, 400);
    }

    return successResponse({ message: `Evidence request ${action} successful` });
  } catch (error) {
    console.error("[PATCH /api/fin/assurance/evidence-requests/[id]] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update evidence request");
  } finally {
    await redis?.quit();
  }
}
