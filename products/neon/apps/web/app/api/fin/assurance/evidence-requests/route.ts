/**
 * Evidence Request API — Phase 15
 *
 * GET /api/fin/assurance/evidence-requests?entityCode=...&fiscalYear=...&periodNumber=...
 *   → List evidence requests (action_items with target_kind='evidence_request')
 *   → Optional filters: status, severity, requestedByOrg
 *
 * POST /api/fin/assurance/evidence-requests
 *   → Create an evidence request (as an action_item)
 *   Body: { entityCode, title, detail?, severity?, category?,
 *           requestedByOrg?, requestedByName?, dueAt?,
 *           linkedArtifacts?, fiscalYear, periodNumber }
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
// GET — list evidence requests
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
    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");
    const status = url.searchParams.get("status");
    const severity = url.searchParams.get("severity");

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    const result = await sql`
      SELECT
        id, entity_code, target_kind, target_id,
        title, detail, severity, priority, category,
        assigned_to, assigned_role, assigned_at, due_at,
        status, resolved_at, resolved_by, resolution_note,
        source, source_ref,
        fiscal_year, period_number,
        structured_data,
        created_by, created_by_name,
        created_at, updated_at
      FROM fin.action_item
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND target_kind IN ('evidence_request', 'pbc_item')
        ${fiscalYear ? sql`AND fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
        ${periodNumber ? sql`AND period_number = ${parseInt(periodNumber, 10)}` : sql``}
        ${status ? sql`AND status = ${status}` : sql``}
        ${severity ? sql`AND severity = ${severity}` : sql``}
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          WHEN 'info' THEN 5
        END,
        due_at ASC NULLS LAST,
        created_at DESC
    `.execute(db);

    return successResponse({ data: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/assurance/evidence-requests] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch evidence requests");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — create evidence request
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
      title,
      detail,
      severity = "medium",
      category,
      requestedByOrg,
      requestedByName,
      dueAt,
      linkedArtifacts,
      fiscalYear,
      periodNumber,
      targetKind = "evidence_request",
    } = body;

    if (!entityCode || !title) {
      return errorResponse("VALIDATION", "entityCode and title are required", 400);
    }

    // Pack PBC-specific fields into structured_data
    const structuredData: Record<string, any> = {};
    if (requestedByOrg) structuredData.requested_by_org = requestedByOrg;
    if (requestedByName) structuredData.requested_by_name = requestedByName;
    if (linkedArtifacts) structuredData.linked_artifacts = linkedArtifacts;

    const result = await sql`
      INSERT INTO fin.action_item (
        tenant_id, entity_code,
        target_kind,
        title, detail, severity, category,
        due_at,
        source, source_ref,
        fiscal_year, period_number,
        structured_data,
        created_by, created_by_name
      ) VALUES (
        ${tenantUuid}, ${entityCode},
        ${targetKind},
        ${title}, ${detail ?? null}, ${severity}, ${category ?? null},
        ${dueAt ? sql`${dueAt}::timestamptz` : sql`NULL`},
        ${requestedByOrg ? "audit_request" : "manual"},
        ${requestedByOrg ?? null},
        ${fiscalYear ?? null}, ${periodNumber ?? null},
        ${Object.keys(structuredData).length > 0 ? sql`${JSON.stringify(structuredData)}::jsonb` : sql`NULL`},
        ${context.userId}::uuid, ${context.username ?? null}
      )
      RETURNING id, title, status, created_at
    `.execute(db);

    return successResponse({
      data: (result.rows as any[])[0],
      message: "Evidence request created",
    });
  } catch (error) {
    console.error("[POST /api/fin/assurance/evidence-requests] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create evidence request");
  } finally {
    await redis?.quit();
  }
}
