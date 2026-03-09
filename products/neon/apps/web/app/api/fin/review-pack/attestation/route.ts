/**
 * Review Attestation API — Phase 14
 *
 * GET /api/fin/review-pack/attestation?targetKind=...&targetId=...
 *   → List attestations for a target (review_snapshot, pack_instance, etc.)
 *
 * GET /api/fin/review-pack/attestation?entityCode=...&fiscalYear=...&periodNumber=...
 *   → List all attestations for a period
 *
 * POST /api/fin/review-pack/attestation
 *   → Record an attestation
 *   Body: { entityCode, targetKind, targetId, attestationType,
 *           attestedByRole?, notes?, fiscalYear?, periodNumber? }
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
// GET — list attestations
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

    const targetKind = url.searchParams.get("targetKind");
    const targetId = url.searchParams.get("targetId");
    const entityCode = url.searchParams.get("entityCode");
    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");

    if (!targetKind && !entityCode) {
      return errorResponse("VALIDATION", "targetKind+targetId or entityCode required", 400);
    }

    const result = await sql`
      SELECT
        id, entity_code, target_kind, target_id,
        attestation_type,
        attested_by, attested_by_name, attested_by_role,
        attested_at, notes, status,
        fiscal_year, period_number,
        created_at
      FROM fin.review_attestation
      WHERE tenant_id = ${tenantUuid}
        ${targetKind ? sql`AND target_kind = ${targetKind}` : sql``}
        ${targetId ? sql`AND target_id = ${targetId}::uuid` : sql``}
        ${entityCode ? sql`AND entity_code = ${entityCode}` : sql``}
        ${fiscalYear ? sql`AND fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
        ${periodNumber ? sql`AND period_number = ${parseInt(periodNumber, 10)}` : sql``}
        AND status = 'confirmed'
      ORDER BY attested_at DESC
    `.execute(db);

    return successResponse({ data: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/review-pack/attestation] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch attestations");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — record attestation
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
      attestationType,
      attestedByRole,
      notes,
      fiscalYear,
      periodNumber,
    } = body;

    if (!entityCode || !targetKind || !targetId || !attestationType) {
      return errorResponse("VALIDATION", "entityCode, targetKind, targetId, and attestationType are required", 400);
    }

    const result = await sql`
      INSERT INTO fin.review_attestation (
        tenant_id, entity_code,
        target_kind, target_id,
        attestation_type,
        attested_by, attested_by_name, attested_by_role,
        notes,
        fiscal_year, period_number
      ) VALUES (
        ${tenantUuid}, ${entityCode},
        ${targetKind}, ${targetId}::uuid,
        ${attestationType},
        ${context.userId}::uuid, ${context.username ?? null}, ${attestedByRole ?? null},
        ${notes ?? null},
        ${fiscalYear ?? null}, ${periodNumber ?? null}
      )
      ON CONFLICT ON CONSTRAINT uq_fin_attestation_unique DO UPDATE
        SET notes = EXCLUDED.notes,
            attested_at = now()
      RETURNING id, attestation_type, attested_at
    `.execute(db);

    return successResponse({
      data: (result.rows as any[])[0],
      message: "Attestation recorded",
    });
  } catch (error) {
    console.error("[POST /api/fin/review-pack/attestation] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to record attestation");
  } finally {
    await redis?.quit();
  }
}
