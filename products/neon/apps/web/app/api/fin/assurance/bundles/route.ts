/**
 * Evidence Bundle API — Phase 15
 *
 * GET /api/fin/assurance/bundles?entityCode=...&fiscalYear=...&periodNumber=...
 *   → List evidence bundles for a period
 *   → Optional filters: status, bundleType
 *
 * POST /api/fin/assurance/bundles
 *   → Create a new evidence bundle
 *   Body: { entityCode, title, description?, bundleType?, fiscalYear, periodNumber,
 *           requestedByOrg?, requestedByName?, dueAt?,
 *           accessWindowStart?, accessWindowEnd?, reviewSnapshotId? }
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
// GET — list bundles
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
    const bundleType = url.searchParams.get("bundleType");

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    const result = await sql`
      SELECT
        b.id, b.entity_code, b.bundle_code, b.title, b.description,
        b.fiscal_year, b.period_number,
        b.bundle_type, b.status,
        b.requested_by_org, b.requested_by_name, b.requested_at, b.due_at,
        b.bundle_hash, b.item_count,
        b.sealed_by_name, b.sealed_at,
        b.access_window_start, b.access_window_end,
        b.review_snapshot_id, b.distribution_id,
        b.created_by_name, b.created_at, b.updated_at
      FROM fin.evidence_bundle b
      WHERE b.tenant_id = ${tenantUuid}
        AND b.entity_code = ${entityCode}
        ${fiscalYear ? sql`AND b.fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
        ${periodNumber ? sql`AND b.period_number = ${parseInt(periodNumber, 10)}` : sql``}
        ${status ? sql`AND b.status = ${status}` : sql``}
        ${bundleType ? sql`AND b.bundle_type = ${bundleType}` : sql``}
      ORDER BY b.created_at DESC
    `.execute(db);

    return successResponse({ data: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/assurance/bundles] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch evidence bundles");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — create bundle
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
      description,
      bundleType = "general",
      fiscalYear,
      periodNumber,
      requestedByOrg,
      requestedByName,
      dueAt,
      accessWindowStart,
      accessWindowEnd,
      reviewSnapshotId,
    } = body;

    if (!entityCode || !title || !fiscalYear || !periodNumber) {
      return errorResponse("VALIDATION", "entityCode, title, fiscalYear, and periodNumber are required", 400);
    }

    // Generate bundle code: EB-{FY}-P{period}-{seq}
    const seqResult = await sql`
      SELECT count(*)::int + 1 AS seq
      FROM fin.evidence_bundle
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
    `.execute(db);
    const seq = (seqResult.rows as any[])[0]?.seq ?? 1;
    const bundleCode = `EB-${fiscalYear}-P${periodNumber}-${String(seq).padStart(3, "0")}`;

    const result = await sql`
      INSERT INTO fin.evidence_bundle (
        tenant_id, entity_code, bundle_code,
        title, description,
        fiscal_year, period_number,
        bundle_type,
        requested_by_org, requested_by_name,
        requested_at, due_at,
        access_window_start, access_window_end,
        review_snapshot_id,
        created_by, created_by_name
      ) VALUES (
        ${tenantUuid}, ${entityCode}, ${bundleCode},
        ${title}, ${description ?? null},
        ${fiscalYear}, ${periodNumber},
        ${bundleType},
        ${requestedByOrg ?? null}, ${requestedByName ?? null},
        ${requestedByOrg ? sql`now()` : sql`NULL`},
        ${dueAt ? sql`${dueAt}::timestamptz` : sql`NULL`},
        ${accessWindowStart ? sql`${accessWindowStart}::timestamptz` : sql`NULL`},
        ${accessWindowEnd ? sql`${accessWindowEnd}::timestamptz` : sql`NULL`},
        ${reviewSnapshotId ? sql`${reviewSnapshotId}::uuid` : sql`NULL`},
        ${context.userId}::uuid, ${context.username ?? null}
      )
      RETURNING id, bundle_code, title, status, created_at
    `.execute(db);

    return successResponse({
      data: (result.rows as any[])[0],
      message: "Evidence bundle created",
    });
  } catch (error) {
    console.error("[POST /api/fin/assurance/bundles] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create evidence bundle");
  } finally {
    await redis?.quit();
  }
}
