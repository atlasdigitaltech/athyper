/**
 * GET  /api/fin/reporting/presets — List report presets for the current user
 * POST /api/fin/reporting/presets — Create a new report preset
 *
 * Returns presets visible to the authenticated user:
 *   - scope = 'USER' + owner_principal_id = current user
 *   - scope = 'SHARED'
 *   - scope = 'SYSTEM'
 *
 * Query params (GET):
 *   reportType — optional filter: pnl | drilldown | month_end
 */

export const runtime = "nodejs";

import crypto from "node:crypto";
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
// Helpers
// ---------------------------------------------------------------------------

function hashParameters(params: Record<string, unknown>): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 16);
}

const VALID_REPORT_TYPES = new Set(["pnl", "drilldown", "month_end"]);
const VALID_SCOPES = new Set(["SYSTEM", "USER", "SHARED"]);

// ---------------------------------------------------------------------------
// GET — list presets
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  try {
    const apiCtx = await getApiContext();
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const url = new URL(req.url);
    const reportType = url.searchParams.get("reportType");

    let query = sql`
      SELECT
        id,
        preset_code   AS "presetCode",
        preset_name   AS "presetName",
        description,
        report_type   AS "reportType",
        scope,
        owner_principal_id AS "ownerPrincipalId",
        parameters,
        state_hash    AS "stateHash",
        is_default    AS "isDefault",
        is_pinned     AS "isPinned",
        version,
        created_at    AS "createdAt",
        created_by    AS "createdBy",
        updated_at    AS "updatedAt"
      FROM fin.rpt_report_preset
      WHERE tenant_id = ${tenantUuid}
        AND deleted_at IS NULL
        AND (
          (scope = 'USER' AND owner_principal_id = ${context.userId}::uuid)
          OR scope IN ('SHARED', 'SYSTEM')
        )
    `;

    if (reportType && VALID_REPORT_TYPES.has(reportType)) {
      query = sql`${query} AND report_type = ${reportType}`;
    }

    query = sql`${query} ORDER BY is_pinned DESC, is_default DESC, preset_name ASC`;

    const result = await sql`${query}`.execute(db);

    return successResponse(result.rows);
  } catch (err) {
    console.error("[presets/GET]", err);
    return errorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to list presets",
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// POST — create preset
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  try {
    const apiCtx = await getApiContext();
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const body = await req.json();

    // Validate required fields
    const { presetCode, presetName, reportType, scope, parameters } = body as {
      presetCode?: string;
      presetName?: string;
      reportType?: string;
      scope?: string;
      parameters?: Record<string, unknown>;
    };

    if (!presetCode || !presetName || !reportType || !parameters) {
      return errorResponse(
        "VALIDATION",
        "presetCode, presetName, reportType, and parameters are required",
        400,
      );
    }

    if (!VALID_REPORT_TYPES.has(reportType)) {
      return errorResponse(
        "VALIDATION",
        `reportType must be one of: ${[...VALID_REPORT_TYPES].join(", ")}`,
        400,
      );
    }

    const effectiveScope = scope && VALID_SCOPES.has(scope) ? scope : "USER";
    const stateHash = hashParameters(parameters);

    // For USER scope, set owner to current user
    const ownerPrincipalId =
      effectiveScope === "USER" ? context.userId : null;

    const result = await sql`
      INSERT INTO fin.rpt_report_preset (
        tenant_id,
        preset_code,
        preset_name,
        description,
        report_type,
        scope,
        owner_principal_id,
        parameters,
        state_hash,
        is_default,
        is_pinned,
        created_by
      ) VALUES (
        ${tenantUuid},
        ${presetCode},
        ${presetName},
        ${body.description ?? null},
        ${reportType},
        ${effectiveScope},
        ${ownerPrincipalId}::uuid,
        ${JSON.stringify(parameters)}::jsonb,
        ${stateHash},
        ${body.isDefault ?? false},
        ${body.isPinned ?? false},
        ${context.username}
      )
      RETURNING
        id,
        preset_code   AS "presetCode",
        preset_name   AS "presetName",
        description,
        report_type   AS "reportType",
        scope,
        owner_principal_id AS "ownerPrincipalId",
        parameters,
        state_hash    AS "stateHash",
        is_default    AS "isDefault",
        is_pinned     AS "isPinned",
        version,
        created_at    AS "createdAt",
        created_by    AS "createdBy",
        updated_at    AS "updatedAt"
    `.execute(db);

    return successResponse((result.rows as any[])[0], 201);
  } catch (err: any) {
    // Handle unique constraint violation
    if (err?.code === "23505") {
      return errorResponse(
        "CONFLICT",
        "A preset with this code already exists in the same scope",
        409,
      );
    }
    console.error("[presets/POST]", err);
    return errorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to create preset",
      500,
    );
  }
}
