/**
 * Pack Certification API
 *
 * GET   /api/fin/packs/instances/{packInstanceId}/certification
 *   → certification status for a pack instance
 *
 * PATCH /api/fin/packs/instances/{packInstanceId}/certification
 *   → advance certification lifecycle (targetStatus + notes)
 */

export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { sql } from "kysely";

import {
  getApiContext,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET — fetch certification for a pack instance
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ packInstanceId: string }> },
) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const { tenantId } = apiCtx.context;
    const { packInstanceId } = await params;

    const cert = await sql<Record<string, unknown>>`
      select
        c.id,
        c.tenant_id             as "tenantId",
        c.pack_instance_id      as "packInstanceId",
        c.certification_status  as "certificationStatus",
        c.prepared_by           as "preparedBy",
        c.prepared_by_name      as "preparedByName",
        c.prepared_at           as "preparedAt",
        c.reviewed_by           as "reviewedBy",
        c.reviewed_by_name      as "reviewedByName",
        c.reviewed_at           as "reviewedAt",
        c.approved_by           as "approvedBy",
        c.approved_by_name      as "approvedByName",
        c.approved_at           as "approvedAt",
        c.certified_by          as "certifiedBy",
        c.certified_by_name     as "certifiedByName",
        c.certified_at          as "certifiedAt",
        c.disclosure_notes      as "disclosureNotes",
        c.disclaimer_notes      as "disclaimerNotes",
        c.approval_instance_id  as "approvalInstanceId",
        c.created_at            as "createdAt",
        c.updated_at            as "updatedAt"
      from fin.pack_certification c
      join fin.pack_instance pi on pi.id = c.pack_instance_id
      where c.pack_instance_id = ${packInstanceId}::uuid
        and pi.tenant_id = ${tenantId}::uuid
    `.execute(db);

    if (!cert.rows.length) {
      return errorResponse("NOT_FOUND", "Certification not found for this pack instance", 404);
    }

    return successResponse(cert.rows[0]);
  } catch (err) {
    console.error("[pack-certification] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch certification",
    );
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// PATCH — advance certification lifecycle
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_REVIEW"],
  IN_REVIEW: ["REVIEWED", "REJECTED"],
  REVIEWED: ["APPROVED", "REJECTED"],
  APPROVED: ["CERTIFIED", "REJECTED"],
};

const STATUS_COLUMN_MAP: Record<string, { by: string; byName: string; at: string }> = {
  IN_REVIEW: { by: "reviewed_by", byName: "reviewed_by_name", at: "reviewed_at" },
  REVIEWED: { by: "reviewed_by", byName: "reviewed_by_name", at: "reviewed_at" },
  APPROVED: { by: "approved_by", byName: "approved_by_name", at: "approved_at" },
  CERTIFIED: { by: "certified_by", byName: "certified_by_name", at: "certified_at" },
};

const ACTIVITY_MAP: Record<string, string> = {
  IN_REVIEW: "REVIEW_STARTED",
  REVIEWED: "REVIEW_COMPLETED",
  APPROVED: "APPROVAL_GRANTED",
  CERTIFIED: "CERTIFICATION_GRANTED",
  REJECTED: "APPROVAL_REJECTED",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ packInstanceId: string }> },
) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const { tenantId, userId, displayName } = apiCtx.context;
    const { packInstanceId } = await params;
    const body = await req.json();
    const { targetStatus, notes } = body as {
      targetStatus: string;
      notes?: string;
    };

    if (!targetStatus) {
      return errorResponse("BAD_REQUEST", "targetStatus is required", 400);
    }

    // Fetch current certification
    const current = await sql<{ id: string; certification_status: string; entity_code: string }>`
      select c.id, c.certification_status, pi.entity_code
      from fin.pack_certification c
      join fin.pack_instance pi on pi.id = c.pack_instance_id
      where c.pack_instance_id = ${packInstanceId}::uuid
        and pi.tenant_id = ${tenantId}::uuid
    `.execute(db);

    if (!current.rows.length) {
      return errorResponse("NOT_FOUND", "Certification not found for this pack instance", 404);
    }

    const cert = current.rows[0];
    const allowed = VALID_TRANSITIONS[cert.certification_status] ?? [];
    if (!allowed.includes(targetStatus)) {
      return errorResponse(
        "INVALID_TRANSITION",
        `Cannot transition from ${cert.certification_status} to ${targetStatus}`,
        422,
      );
    }

    // Update certification status + actor columns
    const cols = STATUS_COLUMN_MAP[targetStatus];
    if (cols) {
      await sql`
        update fin.pack_certification
        set certification_status = ${targetStatus},
            ${sql.raw(cols.by)} = ${userId}::uuid,
            ${sql.raw(cols.byName)} = ${displayName ?? ""},
            ${sql.raw(cols.at)} = now(),
            updated_at = now()
        where id = ${cert.id}::uuid
      `.execute(db);
    } else {
      // REJECTED — just update status
      await sql`
        update fin.pack_certification
        set certification_status = ${targetStatus},
            updated_at = now()
        where id = ${cert.id}::uuid
      `.execute(db);
    }

    // Capture close context at APPROVED or CERTIFIED (readiness, overrides, period status)
    if (targetStatus === "APPROVED" || targetStatus === "CERTIFIED") {
      await sql`select fin.capture_certification_context(${cert.id}::uuid)`.execute(db);
    }

    // Log activity
    const activityType = ACTIVITY_MAP[targetStatus] ?? "STATUS_CHANGED";
    await sql`
      insert into fin.pack_activity (
        tenant_id, entity_code, pack_instance_id,
        activity_type, actor_type, actor_id,
        message, payload
      ) values (
        ${tenantId}::uuid,
        ${cert.entity_code},
        ${packInstanceId}::uuid,
        ${activityType},
        'user',
        ${userId}::uuid,
        ${"Certification " + targetStatus.toLowerCase() + (notes ? ": " + notes : "")},
        ${JSON.stringify({
          fromStatus: cert.certification_status,
          toStatus: targetStatus,
          notes: notes ?? null,
        })}::jsonb
      )
    `.execute(db);

    // Return updated certification
    const updated = await sql<Record<string, unknown>>`
      select
        c.id,
        c.tenant_id             as "tenantId",
        c.pack_instance_id      as "packInstanceId",
        c.certification_status  as "certificationStatus",
        c.prepared_by           as "preparedBy",
        c.prepared_by_name      as "preparedByName",
        c.prepared_at           as "preparedAt",
        c.reviewed_by           as "reviewedBy",
        c.reviewed_by_name      as "reviewedByName",
        c.reviewed_at           as "reviewedAt",
        c.approved_by           as "approvedBy",
        c.approved_by_name      as "approvedByName",
        c.approved_at           as "approvedAt",
        c.certified_by          as "certifiedBy",
        c.certified_by_name     as "certifiedByName",
        c.certified_at          as "certifiedAt",
        c.disclosure_notes      as "disclosureNotes",
        c.disclaimer_notes      as "disclaimerNotes",
        c.approval_instance_id  as "approvalInstanceId",
        c.created_at            as "createdAt",
        c.updated_at            as "updatedAt"
      from fin.pack_certification c
      where c.id = ${cert.id}::uuid
    `.execute(db);

    return successResponse(updated.rows[0]);
  } catch (err) {
    console.error("[pack-certification] PATCH error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to advance certification",
    );
  } finally {
    await redis?.quit();
  }
}
