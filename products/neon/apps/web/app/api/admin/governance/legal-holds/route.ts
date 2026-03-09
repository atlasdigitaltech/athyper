/**
 * Legal Holds Governance API
 *
 * GET  /api/admin/governance/legal-holds           → list all holds (active + released)
 * POST /api/admin/governance/legal-holds           → create a new hold
 * POST /api/admin/governance/legal-holds?action=release&holdId=... → release a hold
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getDb } from "@/lib/db";
import { getApiContext, resolveTenantUuid, unauthorizedResponse } from "@/lib/api-context";

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
      { status: 503 },
    );
  }

  const { context } = await getApiContext();
  if (!context) return unauthorizedResponse();
  const tid = await resolveTenantUuid(db, context.tenantId);

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") === "true";

  try {
    const holds = await sql<{
      id: string;
      hold_reference: string;
      hold_source: string;
      reason: string;
      scope_type: string;
      target_schema: string | null;
      target_table: string | null;
      entity_id: string | null;
      issued_by: string;
      issued_at: Date;
      released_by: string | null;
      released_at: Date | null;
      release_reason: string | null;
      compliance_framework: string | null;
      version: number;
    }>`
      SELECT id, hold_reference, hold_source, reason,
             scope_type, target_schema, target_table, entity_id,
             issued_by, issued_at, released_by, released_at, release_reason,
             compliance_framework, version
      FROM core.legal_hold
      WHERE tenant_id = ${tid}::uuid
        ${activeOnly ? sql`AND released_at IS NULL` : sql``}
      ORDER BY issued_at DESC
      LIMIT 100
    `.execute(db);

    // Get held manifest counts for active holds
    const holdIds = holds.rows.filter((h) => !h.released_at).map((h) => h.id);
    let manifestCounts = new Map<string, number>();

    if (holdIds.length > 0) {
      const counts = await sql<{ legal_hold_id: string; cnt: string }>`
        SELECT legal_hold_id, COUNT(*)::text as cnt
        FROM core.legal_hold_manifest
        WHERE released_at IS NULL
          AND legal_hold_id = ANY(${holdIds}::uuid[])
        GROUP BY legal_hold_id
      `.execute(db);
      for (const row of counts.rows) {
        manifestCounts.set(row.legal_hold_id, Number(row.cnt));
      }
    }

    return NextResponse.json({
      success: true,
      data: holds.rows.map((h) => ({
        id: h.id,
        holdReference: h.hold_reference,
        holdSource: h.hold_source,
        reason: h.reason,
        scopeType: h.scope_type,
        targetSchema: h.target_schema,
        targetTable: h.target_table,
        entityId: h.entity_id,
        issuedBy: h.issued_by,
        issuedAt: h.issued_at,
        releasedBy: h.released_by,
        releasedAt: h.released_at,
        releaseReason: h.release_reason,
        complianceFramework: h.compliance_framework,
        heldManifestCount: manifestCounts.get(h.id) ?? 0,
        isActive: h.released_at === null,
      })),
    });
  } catch (err) {
    console.error("[governance/legal-holds] Error:", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
      { status: 503 },
    );
  }

  const { context } = await getApiContext();
  if (!context) return unauthorizedResponse();
  const tid = await resolveTenantUuid(db, context.tenantId);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    const body = await req.json() as Record<string, unknown>;

    if (action === "release") {
      const holdId = body.holdId as string;
      const releasedBy = (body.releasedBy as string) ?? context.userId;
      const releaseReason = body.releaseReason as string;

      if (!holdId || !releaseReason) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_REQUEST", message: "holdId and releaseReason required" } },
          { status: 400 },
        );
      }

      const result = await sql`
        UPDATE core.legal_hold
        SET released_by = ${releasedBy},
            released_at = now(),
            release_reason = ${releaseReason}
        WHERE id = ${holdId}::uuid
          AND tenant_id = ${tid}::uuid
          AND released_at IS NULL
      `.execute(db);

      if (result.numAffectedRows === 0n) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Hold not found, already released, or wrong tenant" } },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, data: { holdId, released: true } });
    }

    // Create new hold
    const holdReference = body.holdReference as string;
    const holdSource = body.holdSource as string;
    const reason = body.reason as string;
    const scopeType = (body.scopeType as string) ?? "table";
    const issuedBy = (body.issuedBy as string) ?? context.userId;

    if (!holdReference || !holdSource || !reason) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "holdReference, holdSource, and reason required" } },
        { status: 400 },
      );
    }

    const inserted = await sql<{ id: string }>`
      INSERT INTO core.legal_hold
        (tenant_id, hold_reference, hold_source, reason,
         scope_type, target_schema, target_table, entity_id,
         issued_by, compliance_framework)
      VALUES
        (${tid}::uuid, ${holdReference}, ${holdSource}, ${reason},
         ${scopeType}, ${(body.targetSchema as string) ?? null}, ${(body.targetTable as string) ?? null},
         ${body.entityId ? sql`${body.entityId as string}::uuid` : null},
         ${issuedBy}, ${(body.complianceFramework as string) ?? null})
      RETURNING id
    `.execute(db);

    return NextResponse.json(
      { success: true, data: { holdId: inserted.rows[0]?.id } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[governance/legal-holds] Error:", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}
