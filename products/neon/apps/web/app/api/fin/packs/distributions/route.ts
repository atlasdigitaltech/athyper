/**
 * Pack Distribution API (top-level)
 *
 * POST /api/fin/packs/distributions
 *   → create a new distribution for a pack instance
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

export async function POST(req: NextRequest) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const { tenantId, userId } = apiCtx.context;
    const body = await req.json();
    const {
      packInstanceId,
      distributionCode,
      name,
      description,
      format,
      recipients,
      notes,
      linkExpiresAt,
    } = body as {
      packInstanceId: string;
      distributionCode: string;
      name: string;
      description?: string;
      format: string;
      recipients: Array<{
        recipientId?: string;
        recipientName: string;
        recipientEmail?: string;
        recipientRole?: string;
      }>;
      notes?: string;
      linkExpiresAt?: string;
    };

    if (!packInstanceId || !name || !format) {
      return errorResponse("BAD_REQUEST", "packInstanceId, name, and format are required", 400);
    }

    // Verify pack instance exists and is distributable
    const instance = await sql<{ id: string; status: string; entity_code: string }>`
      select id, status, entity_code
      from fin.pack_instance
      where id = ${packInstanceId}::uuid
        and tenant_id = ${tenantId}::uuid
    `.execute(db);

    if (!instance.rows.length) {
      return errorResponse("NOT_FOUND", "Pack instance not found", 404);
    }

    const pack = instance.rows[0];
    if (pack.status !== "PUBLISHED" && pack.status !== "FINALIZED") {
      return errorResponse(
        "NOT_DISTRIBUTABLE",
        `Pack must be FINALIZED or PUBLISHED to distribute (current: ${pack.status})`,
        422,
      );
    }

    // Get certification if exists
    const certRow = await sql<{ id: string }>`
      select id from fin.pack_certification
      where pack_instance_id = ${packInstanceId}::uuid
    `.execute(db);

    // Generate secure link token for LINK format
    const secureLinkToken = format === "LINK"
      ? Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("")
      : null;

    // Create distribution
    const distResult = await sql<{ id: string }>`
      insert into fin.pack_distribution (
        tenant_id, pack_instance_id, distribution_code, name, description,
        format, certification_id, distributed_by,
        secure_link_token, link_expires_at, notes,
        recipient_count
      ) values (
        ${tenantId}::uuid,
        ${packInstanceId}::uuid,
        ${distributionCode ?? name.toLowerCase().replace(/\s+/g, "-")},
        ${name},
        ${description ?? null},
        ${format},
        ${certRow.rows[0]?.id ?? null}::uuid,
        ${userId}::uuid,
        ${secureLinkToken},
        ${linkExpiresAt ? new Date(linkExpiresAt).toISOString() : null}::timestamptz,
        ${notes ?? null},
        ${recipients?.length ?? 0}
      )
      returning id
    `.execute(db);

    const distributionId = distResult.rows[0].id;

    // Add recipients
    if (recipients?.length) {
      for (const r of recipients) {
        await sql`
          insert into fin.pack_distribution_recipient (
            distribution_id, recipient_id, recipient_name,
            recipient_email, recipient_role
          ) values (
            ${distributionId}::uuid,
            ${r.recipientId ?? null}::uuid,
            ${r.recipientName},
            ${r.recipientEmail ?? null},
            ${r.recipientRole ?? null}
          )
        `.execute(db);
      }
    }

    // Log activity
    await sql`
      insert into fin.pack_activity (
        tenant_id, entity_code, pack_instance_id,
        activity_type, actor_type, actor_id,
        message, payload
      ) values (
        ${tenantId}::uuid,
        ${pack.entity_code},
        ${packInstanceId}::uuid,
        'DISTRIBUTION_CREATED',
        'user',
        ${userId}::uuid,
        ${"Distribution \"" + name + "\" created for " + (recipients?.length ?? 0) + " recipients"},
        ${JSON.stringify({
          distributionId,
          format,
          recipientCount: recipients?.length ?? 0,
        })}::jsonb
      )
    `.execute(db);

    // Return created distribution
    const created = await sql<Record<string, unknown>>`
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
        d.notes,
        d.created_at            as "createdAt"
      from fin.pack_distribution d
      where d.id = ${distributionId}::uuid
    `.execute(db);

    return successResponse(created.rows[0], 201);
  } catch (err) {
    console.error("[pack-distributions] POST error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to create distribution",
    );
  } finally {
    await redis?.quit();
  }
}
