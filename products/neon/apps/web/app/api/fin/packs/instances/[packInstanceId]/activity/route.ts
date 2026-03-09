/**
 * Pack Activity API
 *
 * GET /api/fin/packs/instances/{packInstanceId}/activity?limit=50
 *   → activity timeline for a pack instance
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

    const { tenantId } = apiCtx.context;
    const { packInstanceId } = await params;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);

    const rows = await sql<Record<string, unknown>>`
      select
        a.id,
        a.pack_instance_id  as "packInstanceId",
        a.entity_code       as "entityCode",
        a.activity_type     as "activityType",
        a.actor_type        as "actorType",
        a.actor_id          as "actorId",
        a.message,
        a.payload,
        a.created_at        as "createdAt"
      from fin.pack_activity a
      join fin.pack_instance pi on pi.id = a.pack_instance_id
      where a.pack_instance_id = ${packInstanceId}::uuid
        and pi.tenant_id = ${tenantId}::uuid
      order by a.created_at desc
      limit ${limit}
    `.execute(db);

    return successResponse(rows.rows);
  } catch (err) {
    console.error("[pack-activity] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch activity",
    );
  } finally {
    await redis?.quit();
  }
}
