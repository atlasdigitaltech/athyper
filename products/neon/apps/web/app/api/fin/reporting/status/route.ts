/**
 * GET /api/fin/reporting/status — Cube freshness + reconciliation status
 *
 * Returns the latest cube build time, time since last refresh (for freshness
 * indicators), and the most recent reconciliation run result.
 *
 * Query params:
 *   entityCode — required
 *   cubeCode   — optional, defaults to FS_MONTHLY
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

    const cubeCode = url.searchParams.get("cubeCode") ?? "FS_MONTHLY";

    // Cube definition freshness
    const cubeDef = await sql`
      SELECT
        last_built_at       AS "lastBuiltAt",
        last_full_rebuild_at AS "lastFullRebuildAt"
      FROM fin.rpt_cube_definition
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND cube_code = ${cubeCode}
        AND is_active = TRUE
      LIMIT 1
    `.execute(db);

    const cube = cubeDef.rows[0] as {
      lastBuiltAt: string | null;
      lastFullRebuildAt: string | null;
    } | undefined;

    // Latest reconciliation run
    const reconResult = await sql`
      SELECT
        status,
        is_reconciled    AS "isReconciled",
        variance,
        gl_balance_total AS "glBalanceTotal",
        cube_total       AS "cubeTotal",
        completed_at     AS "completedAt",
        error_message    AS "errorMessage"
      FROM fin.rpt_cube_refresh_run
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND cube_code = ${cubeCode}
        AND run_type = 'RECONCILIATION'
      ORDER BY started_at DESC
      LIMIT 1
    `.execute(db);

    const recon = reconResult.rows[0] as {
      status: string;
      isReconciled: boolean | null;
      variance: string | null;
      glBalanceTotal: string | null;
      cubeTotal: string | null;
      completedAt: string | null;
      errorMessage: string | null;
    } | undefined;

    // Compute reconciliation status label
    let reconciliationStatus: "OK" | "WARNING" | "FAILED" | "UNKNOWN" = "UNKNOWN";
    if (recon) {
      if (recon.status === "FAILED" || recon.errorMessage) {
        reconciliationStatus = "FAILED";
      } else if (recon.isReconciled === true) {
        reconciliationStatus = "OK";
      } else if (recon.isReconciled === false) {
        reconciliationStatus = "WARNING";
      }
    }

    return successResponse({
      cubeLastBuiltAt: cube?.lastBuiltAt ?? null,
      cubeLastFullRebuildAt: cube?.lastFullRebuildAt ?? null,
      reconciliation: recon
        ? {
            status: reconciliationStatus,
            isReconciled: recon.isReconciled,
            variance: recon.variance ? String(recon.variance) : null,
            glBalanceTotal: recon.glBalanceTotal ? String(recon.glBalanceTotal) : null,
            cubeTotal: recon.cubeTotal ? String(recon.cubeTotal) : null,
            completedAt: recon.completedAt,
            errorMessage: recon.errorMessage,
          }
        : null,
    });
  } catch (error) {
    console.error("[GET /api/fin/reporting/status] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load reporting status");
  } finally {
    await redis?.quit();
  }
}
