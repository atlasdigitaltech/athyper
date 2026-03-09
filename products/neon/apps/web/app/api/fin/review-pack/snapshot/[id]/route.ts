/**
 * Review Snapshot Detail API — Phase 13
 *
 * GET /api/fin/review-pack/snapshot/[id]
 *   → Retrieve a specific snapshot (including full workspace_state)
 *
 * PATCH /api/fin/review-pack/snapshot/[id]
 *   → Advance snapshot status or sign off
 *   Body: { action: "review" | "signoff" | "distribute" | "supersede", notes? }
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
// GET — retrieve snapshot detail
// ---------------------------------------------------------------------------

export async function GET(
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

    const result = await sql`
      SELECT
        id, entity_code, fiscal_year, period_number,
        snapshot_code, review_type, title, description,
        status,
        pack_instance_id, certification_id, close_run_id,
        workspace_state, sections,
        snapshot_hash,
        readiness_score, phase,
        blocker_count, open_action_items,
        decision_count, carryforward_count,
        signed_off_by_name, signed_off_at, signoff_notes,
        supersedes_id,
        created_by_name, created_at, updated_at
      FROM fin.review_snapshot
      WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
    `.execute(db);

    if ((result.rows as any[]).length === 0) {
      return errorResponse("NOT_FOUND", "Snapshot not found", 404);
    }

    return successResponse({ data: (result.rows as any[])[0] });
  } catch (error) {
    console.error("[GET /api/fin/review-pack/snapshot/[id]] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch snapshot");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// PATCH — advance status
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
    const { action, notes } = body;

    if (!action) {
      return errorResponse("VALIDATION", "action is required", 400);
    }

    // Verify snapshot exists and get current status
    const existing = await sql`
      SELECT id, status FROM fin.review_snapshot
      WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
    `.execute(db);

    const snapshot = (existing.rows as any[])[0];
    if (!snapshot) {
      return errorResponse("NOT_FOUND", "Snapshot not found", 404);
    }

    // Validate state transitions
    const validTransitions: Record<string, string[]> = {
      DRAFT: ["review"],
      REVIEWED: ["signoff"],
      SIGNED_OFF: ["distribute", "supersede"],
      DISTRIBUTED: ["supersede"],
    };

    const allowed = validTransitions[snapshot.status] ?? [];
    if (!allowed.includes(action)) {
      return errorResponse(
        "VALIDATION",
        `Cannot ${action} a snapshot in ${snapshot.status} status. Allowed: ${allowed.join(", ") || "none"}`,
        400,
      );
    }

    let result;

    switch (action) {
      case "review":
        result = await sql`
          UPDATE fin.review_snapshot
          SET status = 'REVIEWED', updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, updated_at
        `.execute(db);
        break;

      case "signoff":
        result = await sql`
          UPDATE fin.review_snapshot
          SET status = 'SIGNED_OFF',
              signed_off_by = ${context.userId ?? null}::uuid,
              signed_off_by_name = ${context.username ?? null},
              signed_off_at = now(),
              signoff_notes = ${notes ?? null},
              updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, signed_off_by_name, signed_off_at
        `.execute(db);
        break;

      case "distribute":
        result = await sql`
          UPDATE fin.review_snapshot
          SET status = 'DISTRIBUTED', updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, updated_at
        `.execute(db);
        break;

      case "supersede":
        result = await sql`
          UPDATE fin.review_snapshot
          SET status = 'SUPERSEDED', updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
          RETURNING id, status, updated_at
        `.execute(db);
        break;

      default:
        return errorResponse("VALIDATION", `Unknown action: ${action}`, 400);
    }

    return successResponse({
      data: (result.rows as any[])[0],
      message: `Snapshot ${action === "signoff" ? "signed off" : action + "d"}`,
    });
  } catch (error) {
    console.error("[PATCH /api/fin/review-pack/snapshot/[id]] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update snapshot");
  } finally {
    await redis?.quit();
  }
}
