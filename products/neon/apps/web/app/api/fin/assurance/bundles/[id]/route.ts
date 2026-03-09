/**
 * Evidence Bundle Detail API — Phase 15
 *
 * GET /api/fin/assurance/bundles/[id]
 *   → Get bundle with all items
 *
 * PATCH /api/fin/assurance/bundles/[id]
 *   → Advance bundle lifecycle
 *   Body: { action: "seal" | "expire" }
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
// GET — bundle detail with items
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
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

    const [bundleResult, itemsResult] = await Promise.all([
      sql`
        SELECT
          b.id, b.entity_code, b.bundle_code, b.title, b.description,
          b.fiscal_year, b.period_number,
          b.bundle_type, b.status,
          b.requested_by_org, b.requested_by_name, b.requested_at, b.due_at,
          b.bundle_hash, b.item_count,
          b.sealed_by_name, b.sealed_at,
          b.access_window_start, b.access_window_end,
          b.review_snapshot_id, b.distribution_id,
          b.created_by_name, b.created_at, b.updated_at
        FROM fin.evidence_bundle b
        WHERE b.id = ${id}::uuid AND b.tenant_id = ${tenantUuid}
      `.execute(db),
      sql`
        SELECT
          i.id, i.artifact_kind, i.artifact_id, i.artifact_label,
          i.section_key, i.artifact_hash,
          i.custom_payload, i.sort_order,
          i.included_by_name, i.included_at, i.inclusion_note
        FROM fin.evidence_bundle_item i
        WHERE i.bundle_id = ${id}::uuid
        ORDER BY i.sort_order, i.included_at
      `.execute(db),
    ]);

    const bundle = (bundleResult.rows as any[])[0];
    if (!bundle) {
      return errorResponse("NOT_FOUND", "Evidence bundle not found", 404);
    }

    return successResponse({
      data: {
        ...bundle,
        items: itemsResult.rows,
      },
    });
  } catch (error) {
    console.error("[GET /api/fin/assurance/bundles/[id]] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch evidence bundle");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// PATCH — advance bundle lifecycle
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
    const { action } = body;

    // Verify bundle
    const existing = await sql`
      SELECT id, status, item_count FROM fin.evidence_bundle
      WHERE id = ${id}::uuid AND tenant_id = ${tenantUuid}
    `.execute(db);

    const bundle = (existing.rows as any[])[0];
    if (!bundle) {
      return errorResponse("NOT_FOUND", "Evidence bundle not found", 404);
    }

    switch (action) {
      case "seal": {
        if (bundle.status !== "DRAFT") {
          return errorResponse("VALIDATION", `Cannot seal bundle in ${bundle.status} status`, 400);
        }

        // Count items
        const countResult = await sql`
          SELECT count(*)::int AS cnt FROM fin.evidence_bundle_item
          WHERE bundle_id = ${id}::uuid
        `.execute(db);
        const itemCount = (countResult.rows as any[])[0]?.cnt ?? 0;

        if (itemCount === 0) {
          return errorResponse("VALIDATION", "Cannot seal an empty bundle", 400);
        }

        // Compute bundle hash from item hashes
        const hashResult = await sql`
          SELECT string_agg(
            coalesce(artifact_hash, artifact_kind || ':' || coalesce(artifact_id::text, 'custom')),
            '|' ORDER BY sort_order, included_at
          ) AS hash_input
          FROM fin.evidence_bundle_item
          WHERE bundle_id = ${id}::uuid
        `.execute(db);
        const hashInput = (hashResult.rows as any[])[0]?.hash_input ?? "";
        const bundleHash = await computeHash(hashInput);

        await sql`
          UPDATE fin.evidence_bundle
          SET status = 'SEALED',
              bundle_hash = ${bundleHash},
              item_count = ${itemCount},
              sealed_by = ${context.userId}::uuid,
              sealed_by_name = ${context.username ?? null},
              sealed_at = now(),
              updated_at = now()
          WHERE id = ${id}::uuid
        `.execute(db);

        return successResponse({
          data: { bundleHash, itemCount },
          message: "Evidence bundle sealed",
        });
      }

      case "expire": {
        if (bundle.status === "EXPIRED") {
          return errorResponse("VALIDATION", "Bundle is already expired", 400);
        }

        await sql`
          UPDATE fin.evidence_bundle
          SET status = 'EXPIRED', updated_at = now()
          WHERE id = ${id}::uuid
        `.execute(db);

        return successResponse({ message: "Evidence bundle expired" });
      }

      default:
        return errorResponse("VALIDATION", `Unknown action: ${action}`, 400);
    }
  } catch (error) {
    console.error("[PATCH /api/fin/assurance/bundles/[id]] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update evidence bundle");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// SHA-256 helper
// ---------------------------------------------------------------------------

async function computeHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
