/**
 * Review Snapshot API — Phase 13
 *
 * GET /api/fin/review-pack/snapshot?entityCode=...&fiscalYear=...&periodNumber=...
 *   → List snapshots for a period
 *
 * POST /api/fin/review-pack/snapshot
 *   → Capture a new review snapshot from current workspace state
 *   Body: { entityCode, fiscalYear, periodNumber, reviewType?, title?,
 *           description?, workspaceState, sections, readinessScore, phase,
 *           blockerCount, openActionItems, decisionCount, carryForwardCount,
 *           packInstanceId?, certificationId?, closeRunId? }
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
// GET — list snapshots
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

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    const result = await sql`
      SELECT
        id, entity_code, fiscal_year, period_number,
        snapshot_code, review_type, title, description,
        status,
        pack_instance_id, certification_id, close_run_id,
        snapshot_hash,
        readiness_score, phase,
        blocker_count, open_action_items,
        decision_count, carryforward_count,
        signed_off_by_name, signed_off_at, signoff_notes,
        supersedes_id,
        created_by_name, created_at, updated_at
      FROM fin.review_snapshot
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        ${fiscalYear ? sql`AND fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
        ${periodNumber ? sql`AND period_number = ${parseInt(periodNumber, 10)}` : sql``}
        AND status != 'SUPERSEDED'
      ORDER BY created_at DESC
    `.execute(db);

    return successResponse({ data: result.rows });
  } catch (error) {
    console.error("[GET /api/fin/review-pack/snapshot] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch snapshots");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — capture snapshot
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
      fiscalYear,
      periodNumber,
      reviewType = "cfo_review",
      title,
      description,
      workspaceState,
      sections,
      readinessScore,
      phase,
      blockerCount,
      openActionItems,
      decisionCount,
      carryForwardCount,
      packInstanceId,
      certificationId,
      closeRunId,
    } = body;

    if (!entityCode || !fiscalYear || !periodNumber || !workspaceState) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, periodNumber, and workspaceState are required", 400);
    }

    // Generate snapshot code
    const countResult = await sql`
      SELECT count(*) AS cnt FROM fin.review_snapshot
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
    `.execute(db);
    const count = Number((countResult.rows as any[])[0]?.cnt ?? 0) + 1;
    const snapshotCode = `REVIEW-${fiscalYear}-P${periodNumber}-${String(count).padStart(3, "0")}`;

    // Compute hash of workspace state
    const stateJson = JSON.stringify(workspaceState);
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stateJson));
    const snapshotHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const result = await sql`
      INSERT INTO fin.review_snapshot (
        tenant_id, entity_code, fiscal_year, period_number,
        snapshot_code, review_type, title, description,
        status,
        pack_instance_id, certification_id, close_run_id,
        workspace_state, sections, snapshot_hash,
        readiness_score, phase,
        blocker_count, open_action_items,
        decision_count, carryforward_count,
        created_by, created_by_name
      ) VALUES (
        ${tenantUuid}, ${entityCode}, ${fiscalYear}, ${periodNumber},
        ${snapshotCode}, ${reviewType}, ${title ?? null}, ${description ?? null},
        'DRAFT',
        ${packInstanceId ?? null}::uuid, ${certificationId ?? null}::uuid, ${closeRunId ?? null}::uuid,
        ${stateJson}::jsonb,
        ${JSON.stringify(sections ?? [])}::jsonb,
        ${snapshotHash},
        ${readinessScore ?? null}, ${phase ?? null},
        ${blockerCount ?? 0}, ${openActionItems ?? 0},
        ${decisionCount ?? 0}, ${carryForwardCount ?? 0},
        ${context.userId ?? null}::uuid, ${context.username ?? null}
      )
      RETURNING id, snapshot_code, status, snapshot_hash, created_at
    `.execute(db);

    return successResponse({
      data: (result.rows as any[])[0],
      message: `Review snapshot ${snapshotCode} captured`,
    });
  } catch (error) {
    console.error("[POST /api/fin/review-pack/snapshot] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to capture snapshot");
  } finally {
    await redis?.quit();
  }
}
