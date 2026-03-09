/**
 * GET /api/fin/reporting/dimensions — Available dimensions for a cube
 *
 * Returns the set of dimension codes configured on the entity's cube,
 * plus human-readable labels. Used to build dynamic Group By menus
 * and dimension picker UIs.
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

const DIMENSION_LABELS: Record<string, string> = {
  COST_CENTER: "Cost Center",
  PROFIT_CENTER: "Profit Center",
  PROJECT: "Project",
  REGION: "Region",
  SEGMENT: "Segment",
  LOCATION: "Location",
  FUNCTION: "Function",
  INTERCOMPANY: "Intercompany",
};

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

    const result = await sql`
      SELECT dimension_codes AS "dimensionCodes"
      FROM fin.rpt_cube_definition
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND cube_code = ${cubeCode}
        AND is_active = TRUE
      LIMIT 1
    `.execute(db);

    const row = result.rows[0] as { dimensionCodes: string[] } | undefined;
    const codes: string[] = row?.dimensionCodes ?? [];

    const dimensions = codes.map((code) => ({
      code,
      label: DIMENSION_LABELS[code] ?? code.replace(/_/g, " "),
      // Snake-case groupBy value used by the P&L endpoint
      groupByKey: code.toLowerCase(),
    }));

    return successResponse({ dimensions });
  } catch (error) {
    console.error("[GET /api/fin/reporting/dimensions] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load dimensions");
  } finally {
    await redis?.quit();
  }
}
