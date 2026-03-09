/**
 * PUT    /api/fin/reporting/presets/:id — Update a report preset
 * DELETE /api/fin/reporting/presets/:id — Soft-delete a report preset
 *
 * PUT requires `version` in the body for optimistic concurrency control.
 * DELETE is a soft delete (sets deleted_at).
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

type RouteContext = { params: Promise<{ id: string }> };

function hashParameters(params: Record<string, unknown>): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// PUT — update preset
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  try {
    const apiCtx = await getApiContext();
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const { id } = await ctx.params;
    const body = await req.json();

    const { version } = body as { version?: number };
    if (version == null) {
      return errorResponse("VALIDATION", "version is required for optimistic concurrency", 400);
    }

    // Build SET clauses dynamically
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (body.presetName != null) {
      setClauses.push("preset_name = $name");
      values.push(body.presetName);
    }
    if (body.description !== undefined) {
      setClauses.push("description = $desc");
    }
    if (body.parameters != null) {
      setClauses.push("parameters = $params::jsonb");
      setClauses.push("state_hash = $hash");
    }
    if (body.isDefault != null) {
      setClauses.push("is_default = $isDefault");
    }
    if (body.isPinned != null) {
      setClauses.push("is_pinned = $isPinned");
    }

    // Compute new state_hash if parameters changed
    const newHash = body.parameters ? hashParameters(body.parameters) : null;

    const result = await sql`
      UPDATE fin.rpt_report_preset
      SET
        preset_name = COALESCE(${body.presetName ?? null}, preset_name),
        description = CASE
          WHEN ${body.description !== undefined} THEN ${body.description ?? null}
          ELSE description
        END,
        parameters = CASE
          WHEN ${body.parameters != null} THEN ${body.parameters ? JSON.stringify(body.parameters) : null}::jsonb
          ELSE parameters
        END,
        state_hash = CASE
          WHEN ${newHash != null} THEN ${newHash}
          ELSE state_hash
        END,
        is_default = COALESCE(${body.isDefault ?? null}, is_default),
        is_pinned = COALESCE(${body.isPinned ?? null}, is_pinned),
        version = version + 1,
        updated_at = now(),
        updated_by = ${context.username}
      WHERE id = ${id}::uuid
        AND tenant_id = ${tenantUuid}
        AND deleted_at IS NULL
        AND version = ${version}
        AND (
          (scope = 'USER' AND owner_principal_id = ${context.userId}::uuid)
          OR scope IN ('SHARED', 'SYSTEM')
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

    if ((result.rows as any[]).length === 0) {
      return errorResponse(
        "CONFLICT",
        "Preset not found, already deleted, or version mismatch (concurrent edit)",
        409,
      );
    }

    return successResponse((result.rows as any[])[0]);
  } catch (err) {
    console.error("[presets/PUT]", err);
    return errorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to update preset",
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — soft-delete preset
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  try {
    const apiCtx = await getApiContext();
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const { id } = await ctx.params;

    const result = await sql`
      UPDATE fin.rpt_report_preset
      SET deleted_at = now(), updated_by = ${context.username}
      WHERE id = ${id}::uuid
        AND tenant_id = ${tenantUuid}
        AND deleted_at IS NULL
        AND (
          (scope = 'USER' AND owner_principal_id = ${context.userId}::uuid)
          OR scope IN ('SHARED', 'SYSTEM')
        )
      RETURNING id
    `.execute(db);

    if ((result.rows as any[]).length === 0) {
      return errorResponse("NOT_FOUND", "Preset not found or already deleted", 404);
    }

    return successResponse({ deleted: true });
  } catch (err) {
    console.error("[presets/DELETE]", err);
    return errorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to delete preset",
      500,
    );
  }
}
