/**
 * Action Items API — Generic attention/action item tracker
 *
 * GET  /api/fin/action-items?entityCode=...&fiscalYear=...&periodNumber=...
 *   → list action items filtered by entity/period/status/severity
 *
 * POST /api/fin/action-items
 *   → create a new action item
 *   Body: { entityCode, targetKind, targetId?, title, detail?,
 *           severity?, category?, assignedTo?, assignedRole?, dueAt?,
 *           fiscalYear?, periodNumber?, source?, sourceRef?, structuredData? }
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
// GET — list action items
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

    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");
    const status = url.searchParams.get("status"); // comma-separated
    const severity = url.searchParams.get("severity");
    const targetKind = url.searchParams.get("targetKind");
    const includeResolved = url.searchParams.get("includeResolved") === "true";

    const statusFilter = status
      ? status.split(",").map((s) => s.trim())
      : includeResolved
        ? null
        : ["open", "acknowledged", "in_progress"];

    const result = await sql`
      SELECT
        id, entity_code, target_kind, target_id,
        title, detail, severity, priority, category,
        assigned_to, assigned_role, assigned_at, due_at,
        status, resolved_at, resolved_by, resolution_note,
        source, source_ref,
        fiscal_year, period_number,
        structured_data,
        created_by, created_by_name, created_at, updated_at
      FROM fin.action_item
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        ${fiscalYear ? sql`AND fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
        ${periodNumber ? sql`AND period_number = ${parseInt(periodNumber, 10)}` : sql``}
        ${statusFilter ? sql`AND status = ANY(${statusFilter}::text[])` : sql``}
        ${severity ? sql`AND severity = ${severity}` : sql``}
        ${targetKind ? sql`AND target_kind = ${targetKind}` : sql``}
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          WHEN 'info' THEN 5
        END,
        priority ASC NULLS LAST,
        created_at DESC
    `.execute(db);

    return successResponse({ data: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/action-items] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch action items");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — create action item
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
      targetKind,
      targetId,
      title,
      detail,
      severity = "medium",
      priority,
      category,
      assignedTo,
      assignedRole,
      dueAt,
      fiscalYear,
      periodNumber,
      source = "manual",
      sourceRef,
      structuredData,
    } = body;

    if (!entityCode || !targetKind || !title) {
      return errorResponse("VALIDATION", "entityCode, targetKind, and title are required", 400);
    }

    const result = await sql`
      INSERT INTO fin.action_item (
        tenant_id, entity_code,
        target_kind, target_id,
        title, detail, severity, priority, category,
        assigned_to, assigned_role,
        assigned_at, due_at,
        fiscal_year, period_number,
        source, source_ref,
        structured_data,
        created_by, created_by_name
      ) VALUES (
        ${tenantUuid}, ${entityCode},
        ${targetKind}, ${targetId ?? null}::uuid,
        ${title}, ${detail ?? null}, ${severity}, ${priority ?? null}, ${category ?? null},
        ${assignedTo ?? null}::uuid, ${assignedRole ?? null},
        ${assignedTo ? sql`now()` : sql`NULL`}, ${dueAt ?? null}::timestamptz,
        ${fiscalYear ?? null}, ${periodNumber ?? null},
        ${source}, ${sourceRef ?? null},
        ${structuredData ? sql`${JSON.stringify(structuredData)}::jsonb` : sql`NULL`},
        ${context.userId ?? null}::uuid, ${context.username ?? null}
      )
      RETURNING id, status, created_at
    `.execute(db);

    return successResponse({
      data: (result.rows as any[])[0],
      message: "Action item created",
    });
  } catch (error) {
    console.error("[POST /api/fin/action-items] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create action item");
  } finally {
    await redis?.quit();
  }
}
