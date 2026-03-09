/**
 * GET  /api/fin/reporting/cubes — List active cube definitions for the tenant
 *
 * Returns cube metadata (not balance data). Used by the reporting UI to
 * know which cubes are available and their configuration.
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

    const result = await sql`
      SELECT
        id,
        entity_code       AS "entityCode",
        cube_code          AS "cubeCode",
        name,
        description,
        cube_type          AS "cubeType",
        grain,
        dimension_codes    AS "dimensionCodes",
        measure_codes      AS "measureCodes",
        account_types      AS "accountTypes",
        book_codes         AS "bookCodes",
        refresh_mode       AS "refreshMode",
        retention_years    AS "retentionYears",
        is_active          AS "isActive",
        last_built_at      AS "lastBuiltAt",
        last_full_rebuild_at AS "lastFullRebuildAt"
      FROM fin.rpt_cube_definition
      WHERE tenant_id = ${tenantUuid}
        AND is_active = TRUE
        ${entityCode ? sql`AND entity_code = ${entityCode}` : sql``}
      ORDER BY cube_type, cube_code
    `.execute(db);

    return successResponse({ cubes: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/reporting/cubes] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load cube definitions");
  } finally {
    await redis?.quit();
  }
}
