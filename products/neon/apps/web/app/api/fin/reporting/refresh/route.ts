/**
 * POST /api/fin/reporting/refresh — Trigger cube refresh or reconciliation
 * GET  /api/fin/reporting/refresh — List recent refresh runs
 *
 * POST triggers a full rebuild or reconciliation via the database function.
 * GET returns recent refresh history for monitoring.
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
// GET — Recent refresh runs
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
    const cubeCode = url.searchParams.get("cubeCode");
    const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20", 10));

    const result = await sql`
      SELECT
        id,
        cube_code        AS "cubeCode",
        run_type         AS "runType",
        fiscal_year      AS "fiscalYear",
        period_number    AS "periodNumber",
        book_code        AS "bookCode",
        rows_inserted    AS "rowsInserted",
        rows_updated     AS "rowsUpdated",
        rows_deleted     AS "rowsDeleted",
        total_cube_rows  AS "totalCubeRows",
        gl_balance_total AS "glBalanceTotal",
        cube_total       AS "cubeTotal",
        variance,
        is_reconciled    AS "isReconciled",
        status,
        started_at       AS "startedAt",
        completed_at     AS "completedAt",
        duration_ms      AS "durationMs",
        error_message    AS "errorMessage",
        trigger_source   AS "triggerSource"
      FROM fin.rpt_cube_refresh_run
      WHERE tenant_id = ${tenantUuid}
        ${entityCode ? sql`AND entity_code = ${entityCode}` : sql``}
        ${cubeCode ? sql`AND cube_code = ${cubeCode}` : sql``}
      ORDER BY started_at DESC
      LIMIT ${limit}
    `.execute(db);

    return successResponse({ runs: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/reporting/refresh] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load refresh runs");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — Trigger refresh
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
    const body = (await req.json()) as {
      cubeCode: string;
      entityCode: string;
      runType: "FULL_REBUILD" | "RECONCILIATION";
      fiscalYear?: number;
      periodNumber?: number;
    };

    if (!body.cubeCode || !body.entityCode || !body.runType) {
      return errorResponse(
        "VALIDATION",
        "cubeCode, entityCode, and runType are required",
        400,
      );
    }

    // First refresh the materialized view to pick up new dimension sets
    await sql`
      REFRESH MATERIALIZED VIEW CONCURRENTLY fin.dimension_set_flat
    `.execute(db);

    if (body.runType === "FULL_REBUILD") {
      const result = await sql`
        SELECT fin.refresh_balance_cube(
          ${tenantUuid}::uuid,
          ${body.entityCode}::varchar,
          ${body.cubeCode}::varchar,
          ${body.fiscalYear ?? null}::smallint,
          ${body.periodNumber ?? null}::smallint,
          ${context.userId}::uuid
        ) AS run_id
      `.execute(db);

      const runId = (result.rows[0] as any)?.run_id;

      return successResponse({ runId, runType: "FULL_REBUILD" }, 201);
    }

    if (body.runType === "RECONCILIATION") {
      if (!body.fiscalYear || !body.periodNumber) {
        return errorResponse(
          "VALIDATION",
          "fiscalYear and periodNumber required for reconciliation",
          400,
        );
      }

      const result = await sql`
        SELECT fin.reconcile_cube(
          ${tenantUuid}::uuid,
          ${body.entityCode}::varchar,
          ${body.cubeCode}::varchar,
          ${body.fiscalYear}::smallint,
          ${body.periodNumber}::smallint,
          ${context.userId}::uuid
        ) AS run_id
      `.execute(db);

      const runId = (result.rows[0] as any)?.run_id;

      // Fetch the reconciliation result
      const reconResult = await sql`
        SELECT
          variance,
          is_reconciled AS "isReconciled",
          gl_balance_total AS "glBalanceTotal",
          cube_total AS "cubeTotal"
        FROM fin.rpt_cube_refresh_run
        WHERE id = ${runId}::uuid
      `.execute(db);

      const recon = reconResult.rows[0] as any;

      return successResponse({
        runId,
        runType: "RECONCILIATION",
        isReconciled: recon?.isReconciled ?? null,
        variance: recon?.variance ? String(recon.variance) : null,
        glBalanceTotal: recon?.glBalanceTotal ? String(recon.glBalanceTotal) : null,
        cubeTotal: recon?.cubeTotal ? String(recon.cubeTotal) : null,
      }, 201);
    }

    return errorResponse("VALIDATION", `Unknown runType: ${body.runType}`, 400);
  } catch (error) {
    console.error("[POST /api/fin/reporting/refresh] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to trigger refresh");
  } finally {
    await redis?.quit();
  }
}
