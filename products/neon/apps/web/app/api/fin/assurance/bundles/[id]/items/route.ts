/**
 * Evidence Bundle Items API — Phase 15
 *
 * POST /api/fin/assurance/bundles/[id]/items
 *   → Add item(s) to a DRAFT bundle
 *   Body: { items: [{ artifactKind, artifactId?, artifactLabel,
 *                      sectionKey?, artifactHash?, customPayload?,
 *                      sortOrder?, inclusionNote? }] }
 *
 * DELETE /api/fin/assurance/bundles/[id]/items
 *   → Remove an item from a DRAFT bundle
 *   Body: { itemId }
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
// POST — add items to bundle
// ---------------------------------------------------------------------------

export async function POST(
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
    const { id: bundleId } = await params;
    const body = await req.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return errorResponse("VALIDATION", "items array is required", 400);
    }

    // Verify bundle is DRAFT
    const bundleResult = await sql`
      SELECT id, status FROM fin.evidence_bundle
      WHERE id = ${bundleId}::uuid AND tenant_id = ${tenantUuid}
    `.execute(db);

    const bundle = (bundleResult.rows as any[])[0];
    if (!bundle) {
      return errorResponse("NOT_FOUND", "Evidence bundle not found", 404);
    }
    if (bundle.status !== "DRAFT") {
      return errorResponse("VALIDATION", `Cannot add items to ${bundle.status} bundle`, 400);
    }

    // Insert items
    const insertedRows: any[] = [];
    for (const item of items) {
      const {
        artifactKind,
        artifactId,
        artifactLabel,
        sectionKey,
        artifactHash,
        customPayload,
        sortOrder = 0,
        inclusionNote,
      } = item;

      if (!artifactKind || !artifactLabel) {
        continue; // skip invalid items
      }

      const result = await sql`
        INSERT INTO fin.evidence_bundle_item (
          bundle_id,
          artifact_kind, artifact_id, artifact_label,
          section_key, artifact_hash,
          custom_payload, sort_order,
          included_by, included_by_name,
          inclusion_note
        ) VALUES (
          ${bundleId}::uuid,
          ${artifactKind},
          ${artifactId ? sql`${artifactId}::uuid` : sql`NULL`},
          ${artifactLabel},
          ${sectionKey ?? null},
          ${artifactHash ?? null},
          ${customPayload ? sql`${JSON.stringify(customPayload)}::jsonb` : sql`NULL`},
          ${sortOrder},
          ${context.userId}::uuid, ${context.username ?? null},
          ${inclusionNote ?? null}
        )
        ON CONFLICT ON CONSTRAINT uq_fin_evidence_bundle_item DO NOTHING
        RETURNING id, artifact_kind, artifact_label
      `.execute(db);

      if ((result.rows as any[]).length > 0) {
        insertedRows.push((result.rows as any[])[0]);
      }
    }

    return successResponse({
      data: insertedRows,
      message: `${insertedRows.length} item(s) added to bundle`,
    });
  } catch (error) {
    console.error("[POST /api/fin/assurance/bundles/[id]/items] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to add bundle items");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove item from bundle
// ---------------------------------------------------------------------------

export async function DELETE(
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
    const { id: bundleId } = await params;
    const body = await req.json();
    const { itemId } = body;

    if (!itemId) {
      return errorResponse("VALIDATION", "itemId is required", 400);
    }

    // Verify bundle is DRAFT
    const bundleResult = await sql`
      SELECT id, status FROM fin.evidence_bundle
      WHERE id = ${bundleId}::uuid AND tenant_id = ${tenantUuid}
    `.execute(db);

    const bundle = (bundleResult.rows as any[])[0];
    if (!bundle) {
      return errorResponse("NOT_FOUND", "Evidence bundle not found", 404);
    }
    if (bundle.status !== "DRAFT") {
      return errorResponse("VALIDATION", `Cannot remove items from ${bundle.status} bundle`, 400);
    }

    await sql`
      DELETE FROM fin.evidence_bundle_item
      WHERE id = ${itemId}::uuid AND bundle_id = ${bundleId}::uuid
    `.execute(db);

    return successResponse({ message: "Item removed from bundle" });
  } catch (error) {
    console.error("[DELETE /api/fin/assurance/bundles/[id]/items] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to remove bundle item");
  } finally {
    await redis?.quit();
  }
}
