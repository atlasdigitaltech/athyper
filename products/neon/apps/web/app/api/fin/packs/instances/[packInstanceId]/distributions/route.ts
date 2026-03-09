/**
 * Pack Distribution API (per pack instance)
 *
 * GET  /api/fin/packs/instances/{packInstanceId}/distributions
 *   → list distributions for a pack instance
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

    const rows = await sql<Record<string, unknown>>`
      select
        d.id,
        d.pack_instance_id      as "packInstanceId",
        d.distribution_code     as "distributionCode",
        d.name,
        d.description,
        d.format,
        d.status,
        d.certification_id      as "certificationId",
        d.distributed_by        as "distributedBy",
        d.distributed_at        as "distributedAt",
        d.recipient_count       as "recipientCount",
        d.delivered_count       as "deliveredCount",
        d.viewed_count          as "viewedCount",
        d.downloaded_count      as "downloadedCount",
        d.recalled_at           as "recalledAt",
        d.recalled_by           as "recalledBy",
        d.recall_reason         as "recallReason",
        d.notes,
        d.created_at            as "createdAt"
      from fin.pack_distribution d
      join fin.pack_instance pi on pi.id = d.pack_instance_id
      where d.pack_instance_id = ${packInstanceId}::uuid
        and pi.tenant_id = ${tenantId}::uuid
      order by d.created_at desc
    `.execute(db);

    return successResponse(rows.rows);
  } catch (err) {
    console.error("[pack-distributions] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch distributions",
    );
  } finally {
    await redis?.quit();
  }
}
