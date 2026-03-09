/**
 * Carry-Forward API — Cross-period linking for unresolved items
 *
 * GET  /api/fin/carryforward?entityCode=...&targetFy=...&targetPeriod=...
 *   → items carried forward INTO the specified period
 *
 * GET  /api/fin/carryforward?entityCode=...&sourceFy=...&sourcePeriod=...&view=outgoing
 *   → items carried forward FROM the specified period
 *
 * POST /api/fin/carryforward
 *   → create a carry-forward link
 *   Body: { entityCode, sourceKind, sourceId, sourcePeriod, sourceFy,
 *           targetPeriod, targetFy, reason, carryNote? }
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
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
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
    const url = new URL(req.url);

    const entityCode = url.searchParams.get("entityCode");
    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    const view = url.searchParams.get("view");

    if (view === "outgoing") {
      // Items carried FROM this period
      const sourceFy = url.searchParams.get("sourceFy");
      const sourcePeriod = url.searchParams.get("sourcePeriod");
      if (!sourceFy || !sourcePeriod) {
        return errorResponse("VALIDATION", "sourceFy and sourcePeriod required for outgoing view", 400);
      }

      const result = await sql`
        SELECT
          fl.id, fl.source_kind, fl.source_id,
          fl.source_period, fl.source_fy,
          fl.target_period, fl.target_fy,
          fl.reason, fl.carry_note,
          fl.resolved, fl.resolved_at, fl.resolved_ref,
          fl.created_by_name, fl.created_at,
          -- Source detail (if action_item)
          ai.title AS source_title,
          ai.severity AS source_severity,
          ai.status AS source_status
        FROM fin.followup_link fl
        LEFT JOIN fin.action_item ai ON ai.id = fl.source_id AND fl.source_kind = 'action_item'
        WHERE fl.tenant_id = ${tenantUuid}
          AND fl.entity_code = ${entityCode}
          AND fl.source_fy = ${parseInt(sourceFy, 10)}
          AND fl.source_period = ${parseInt(sourcePeriod, 10)}
        ORDER BY fl.created_at DESC
      `.execute(db);

      return successResponse({ data: result.rows });
    }

    // Default: items carried INTO this period
    const targetFy = url.searchParams.get("targetFy");
    const targetPeriod = url.searchParams.get("targetPeriod");
    if (!targetFy || !targetPeriod) {
      return errorResponse("VALIDATION", "targetFy and targetPeriod are required", 400);
    }

    const result = await sql`
      SELECT
        fl.id, fl.source_kind, fl.source_id,
        fl.source_period, fl.source_fy,
        fl.target_period, fl.target_fy,
        fl.reason, fl.carry_note,
        fl.resolved, fl.resolved_at, fl.resolved_ref,
        fl.created_by_name, fl.created_at,
        -- Source detail
        ai.title AS source_title,
        ai.severity AS source_severity,
        ai.status AS source_status,
        ai.detail AS source_detail
      FROM fin.followup_link fl
      LEFT JOIN fin.action_item ai ON ai.id = fl.source_id AND fl.source_kind = 'action_item'
      WHERE fl.tenant_id = ${tenantUuid}
        AND fl.entity_code = ${entityCode}
        AND fl.target_fy = ${parseInt(targetFy, 10)}
        AND fl.target_period = ${parseInt(targetPeriod, 10)}
      ORDER BY
        fl.resolved ASC,
        CASE WHEN ai.severity = 'critical' THEN 1
             WHEN ai.severity = 'high' THEN 2
             WHEN ai.severity = 'medium' THEN 3
             ELSE 4
        END,
        fl.created_at DESC
    `.execute(db);

    return successResponse({ data: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/carryforward] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch carry-forward items");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — create carry-forward link
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
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
    const body = await req.json();

    const {
      entityCode,
      sourceKind,
      sourceId,
      sourcePeriod,
      sourceFy,
      targetPeriod,
      targetFy,
      reason,
      carryNote,
    } = body;

    if (!entityCode || !sourceKind || !sourceId || !sourcePeriod || !sourceFy || !targetPeriod || !targetFy || !reason) {
      return errorResponse("VALIDATION", "All source/target fields and reason are required", 400);
    }

    const result = await sql`
      INSERT INTO fin.followup_link (
        tenant_id, entity_code,
        source_kind, source_id,
        source_period, source_fy,
        target_period, target_fy,
        reason, carry_note,
        created_by, created_by_name
      ) VALUES (
        ${tenantUuid}, ${entityCode},
        ${sourceKind}, ${sourceId}::uuid,
        ${sourcePeriod}, ${sourceFy},
        ${targetPeriod}, ${targetFy},
        ${reason}, ${carryNote ?? null},
        ${context.userId ?? null}::uuid, ${context.username ?? null}
      )
      RETURNING id, created_at
    `.execute(db);

    return successResponse({
      data: (result.rows as any[])[0],
      message: "Carry-forward link created",
    });
  } catch (error) {
    console.error("[POST /api/fin/carryforward] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create carry-forward link");
  } finally {
    await redis?.quit();
  }
}
