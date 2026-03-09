/**
 * Action Item Detail API
 *
 * PATCH /api/fin/action-items/[id]
 *   → update status, assign, resolve, dismiss
 *   Body: { action: "assign" | "acknowledge" | "start" | "resolve" | "dismiss",
 *           assignedTo?, assignedRole?, resolutionNote? }
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
// PATCH — update action item
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
    const { action, assignedTo, assignedRole, resolutionNote } = body;

    if (!action) {
      return errorResponse("VALIDATION", "action is required", 400);
    }

    // Verify item exists and belongs to tenant
    const existing = await sql`
      SELECT id, status FROM fin.action_item
      WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
    `.execute(db);

    if ((existing.rows as any[]).length === 0) {
      return errorResponse("NOT_FOUND", "Action item not found", 404);
    }

    let result;

    switch (action) {
      case "assign":
        result = await sql`
          UPDATE fin.action_item
          SET assigned_to = ${assignedTo ?? null}::uuid,
              assigned_role = ${assignedRole ?? null},
              assigned_at = now(),
              updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, assigned_to, assigned_role, assigned_at
        `.execute(db);
        break;

      case "acknowledge":
        result = await sql`
          UPDATE fin.action_item
          SET status = 'acknowledged', updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, updated_at
        `.execute(db);
        break;

      case "start":
        result = await sql`
          UPDATE fin.action_item
          SET status = 'in_progress', updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, updated_at
        `.execute(db);
        break;

      case "resolve":
        result = await sql`
          UPDATE fin.action_item
          SET status = 'resolved',
              resolved_at = now(),
              resolved_by = ${context.userId ?? null}::uuid,
              resolution_note = ${resolutionNote ?? null},
              updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, resolved_at, resolution_note
        `.execute(db);
        break;

      case "dismiss":
        result = await sql`
          UPDATE fin.action_item
          SET status = 'dismissed',
              resolved_at = now(),
              resolved_by = ${context.userId ?? null}::uuid,
              resolution_note = ${resolutionNote ?? null},
              updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, resolved_at, resolution_note
        `.execute(db);
        break;

      default:
        return errorResponse("VALIDATION", `Unknown action: ${action}`, 400);
    }

    return successResponse({
      data: (result.rows as any[])[0],
      message: `Action item ${action}${action.endsWith("e") ? "d" : "ed"}`,
    });
  } catch (error) {
    console.error("[PATCH /api/fin/action-items/[id]] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update action item");
  } finally {
    await redis?.quit();
  }
}
