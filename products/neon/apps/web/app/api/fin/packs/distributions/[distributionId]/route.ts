/**
 * Pack Distribution Detail API
 *
 * GET /api/fin/packs/distributions/{distributionId}
 *   → distribution detail with recipients
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
  { params }: { params: Promise<{ distributionId: string }> },
) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const { tenantId } = apiCtx.context;
    const { distributionId } = await params;

    // Fetch distribution with tenant check via pack_instance
    const distRows = await sql<Record<string, unknown>>`
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
      where d.id = ${distributionId}::uuid
        and pi.tenant_id = ${tenantId}::uuid
    `.execute(db);

    if (!distRows.rows.length) {
      return errorResponse("NOT_FOUND", "Distribution not found", 404);
    }

    // Fetch recipients
    const recipientRows = await sql<Record<string, unknown>>`
      select
        r.id,
        r.distribution_id       as "distributionId",
        r.recipient_id          as "recipientId",
        r.recipient_name        as "recipientName",
        r.recipient_email       as "recipientEmail",
        r.recipient_role        as "recipientRole",
        r.delivery_status       as "deliveryStatus",
        r.delivered_at          as "deliveredAt",
        r.viewed_at             as "viewedAt",
        r.view_count            as "viewCount",
        r.downloaded_at         as "downloadedAt",
        r.download_count        as "downloadCount"
      from fin.pack_distribution_recipient r
      where r.distribution_id = ${distributionId}::uuid
      order by r.recipient_name
    `.execute(db);

    return successResponse({
      distribution: distRows.rows[0],
      recipients: recipientRows.rows,
    });
  } catch (err) {
    console.error("[pack-distribution-detail] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch distribution",
    );
  } finally {
    await redis?.quit();
  }
}
