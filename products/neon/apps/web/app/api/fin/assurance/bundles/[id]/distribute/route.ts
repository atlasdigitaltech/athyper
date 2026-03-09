/**
 * Evidence Bundle Distribution API — Phase 15
 *
 * POST /api/fin/assurance/bundles/[id]/distribute
 *   → Create a governed distribution for a SEALED bundle
 *   Body: { name, description?, format?, recipientClass?,
 *           recipients: [{ name, email?, role? }],
 *           accessWindowStart?, accessWindowEnd? }
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
// POST — distribute bundle
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

    const {
      name,
      description,
      format = "LINK",
      recipientClass = "external_audit",
      recipients = [],
      accessWindowStart,
      accessWindowEnd,
    } = body;

    if (!name) {
      return errorResponse("VALIDATION", "name is required", 400);
    }

    // Verify bundle is SEALED
    const bundleResult = await sql`
      SELECT b.id, b.status, b.entity_code, b.bundle_code, b.title,
             b.fiscal_year, b.period_number
      FROM fin.evidence_bundle b
      WHERE b.id = ${bundleId}::uuid AND b.tenant_id = ${tenantUuid}
    `.execute(db);

    const bundle = (bundleResult.rows as any[])[0];
    if (!bundle) {
      return errorResponse("NOT_FOUND", "Evidence bundle not found", 404);
    }
    if (bundle.status !== "SEALED") {
      return errorResponse("VALIDATION", `Cannot distribute ${bundle.status} bundle. Must be SEALED first.`, 400);
    }

    // Find a pack_instance to link (optional — for distribution table FK)
    const packResult = await sql`
      SELECT id FROM fin.report_pack_instance
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${bundle.entity_code}
        AND fiscal_year = ${bundle.fiscal_year}
        AND period_to = ${bundle.period_number}
      ORDER BY created_at DESC
      LIMIT 1
    `.execute(db);
    const packInstanceId = (packResult.rows as any[])[0]?.id;

    if (!packInstanceId) {
      return errorResponse("VALIDATION", "No pack instance found for this period. Distribution requires a pack context.", 400);
    }

    // Generate distribution code
    const distCode = `EVDIST-${bundle.bundle_code}`;

    // Generate secure link token
    const tokenBytes = new Uint8Array(48);
    crypto.getRandomValues(tokenBytes);
    const secureLinkToken = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Create distribution
    const distResult = await sql`
      INSERT INTO fin.pack_distribution (
        tenant_id, pack_instance_id,
        distribution_code, name, description,
        format, status,
        distributed_by, distributed_at,
        recipient_count,
        secure_link_token, link_expires_at,
        evidence_bundle_id,
        access_window_start,
        recipient_class
      ) VALUES (
        ${tenantUuid}, ${packInstanceId},
        ${distCode}, ${name}, ${description ?? null},
        ${format}, 'SENT',
        ${context.userId}::uuid, now(),
        ${recipients.length},
        ${secureLinkToken},
        ${accessWindowEnd ? sql`${accessWindowEnd}::timestamptz` : sql`NULL`},
        ${bundleId}::uuid,
        ${accessWindowStart ? sql`${accessWindowStart}::timestamptz` : sql`NULL`},
        ${recipientClass}
      )
      RETURNING id, distribution_code, status
    `.execute(db);

    const distribution = (distResult.rows as any[])[0];

    // Create recipients
    for (const recipient of recipients) {
      await sql`
        INSERT INTO fin.pack_distribution_recipient (
          distribution_id,
          recipient_name, recipient_email, recipient_role,
          delivery_status, sent_at
        ) VALUES (
          ${distribution.id}::uuid,
          ${recipient.name}, ${recipient.email ?? null}, ${recipient.role ?? null},
          'SENT', now()
        )
      `.execute(db);
    }

    // Update bundle status and link distribution
    await sql`
      UPDATE fin.evidence_bundle
      SET status = 'DISTRIBUTED',
          distribution_id = ${distribution.id}::uuid,
          updated_at = now()
      WHERE id = ${bundleId}::uuid
    `.execute(db);

    return successResponse({
      data: {
        distributionId: distribution.id,
        distributionCode: distribution.distribution_code,
        secureLinkToken,
        recipientCount: recipients.length,
      },
      message: "Evidence bundle distributed",
    });
  } catch (error) {
    console.error("[POST /api/fin/assurance/bundles/[id]/distribute] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to distribute evidence bundle");
  } finally {
    await redis?.quit();
  }
}
