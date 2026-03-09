/**
 * Atlas Calibration Governance API (Phase 6 — Adaptive Learning)
 *
 * PATCH /api/fin/atlas/feedback/calibrations
 *   → Approve or reject a suggested threshold calibration
 *
 * Body: { calibrationId, action: "APPROVE" | "REJECT", rejectionReason? }
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

export async function PATCH(req: NextRequest) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const body = (await req.json()) as {
      calibrationId: string;
      action: "APPROVE" | "REJECT";
      rejectionReason?: string;
    };

    if (!body.calibrationId) {
      return errorResponse("VALIDATION", "calibrationId is required", 400);
    }
    if (!body.action || !["APPROVE", "REJECT"].includes(body.action)) {
      return errorResponse("VALIDATION", "action must be APPROVE or REJECT", 400);
    }
    if (body.action === "REJECT" && !body.rejectionReason) {
      return errorResponse("VALIDATION", "rejectionReason is required when rejecting", 400);
    }

    const actorId = apiCtx.context.userId ?? tenantUuid;

    let result;
    if (body.action === "APPROVE") {
      result = await sql<Record<string, unknown>>`
        UPDATE fin.atlas_threshold_calibration
        SET status = 'APPROVED',
            approved_by = ${actorId}::uuid,
            approved_at = now(),
            updated_at = now()
        WHERE id = ${body.calibrationId}::uuid
          AND tenant_id = ${tenantUuid}::uuid
          AND status = 'SUGGESTED'
        RETURNING
          id,
          entity_code           AS "entityCode",
          anomaly_type          AS "anomalyType",
          account_code          AS "accountCode",
          warning_z_threshold::text  AS "warningZThreshold",
          critical_z_threshold::text AS "criticalZThreshold",
          status,
          approved_by           AS "approvedBy",
          approved_at           AS "approvedAt"
      `.execute(db);
    } else {
      result = await sql<Record<string, unknown>>`
        UPDATE fin.atlas_threshold_calibration
        SET status = 'REJECTED',
            rejection_reason = ${body.rejectionReason!},
            updated_at = now()
        WHERE id = ${body.calibrationId}::uuid
          AND tenant_id = ${tenantUuid}::uuid
          AND status = 'SUGGESTED'
        RETURNING
          id,
          entity_code           AS "entityCode",
          anomaly_type          AS "anomalyType",
          account_code          AS "accountCode",
          status,
          rejection_reason      AS "rejectionReason"
      `.execute(db);
    }

    if (!result.rows[0]) {
      return errorResponse("NOT_FOUND", "Calibration not found or already processed", 404);
    }

    return successResponse({ calibration: result.rows[0] });
  } catch (err) {
    console.error("[atlas/feedback/calibrations] PATCH error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to update calibration");
  } finally {
    await redis?.quit();
  }
}
