/**
 * Atlas Anomaly Detail API
 *
 * GET   /api/fin/atlas/anomalies/{anomalyId}
 *   → Get anomaly detail with baseline + risk signal context
 *
 * PATCH /api/fin/atlas/anomalies/{anomalyId}
 *   → Transition anomaly status (acknowledge, resolve, mark false positive)
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
// GET — anomaly detail
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anomalyId: string }> },
) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const { anomalyId } = await params;

    const result = await sql<Record<string, unknown>>`
      SELECT
        a.id,
        a.entity_code         AS "entityCode",
        a.anomaly_type        AS "anomalyType",
        a.severity,
        a.account_id          AS "accountId",
        c.account_code        AS "accountCode",
        c.account_name        AS "accountName",
        c.account_type        AS "accountType",
        a.fiscal_year         AS "fiscalYear",
        a.period_number       AS "periodNumber",
        a.book_code           AS "bookCode",
        a.observed_value::text AS "observedValue",
        a.expected_value::text AS "expectedValue",
        a.z_score::text       AS "zScore",
        a.baseline_id         AS "baselineId",
        a.title,
        a.description,
        a.evidence,
        a.risk_signal_id      AS "riskSignalId",
        a.status,
        a.acknowledged_by     AS "acknowledgedBy",
        a.acknowledged_at     AS "acknowledgedAt",
        a.resolved_by         AS "resolvedBy",
        a.resolved_at         AS "resolvedAt",
        a.resolution_notes    AS "resolutionNotes",
        a.detected_at         AS "detectedAt",
        a.created_at          AS "createdAt",
        a.updated_at          AS "updatedAt"
      FROM fin.atlas_anomaly a
      LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
      WHERE a.id = ${anomalyId}::uuid
        AND a.tenant_id = ${tenantUuid}::uuid
    `.execute(db);

    if (!result.rows.length) {
      return errorResponse("NOT_FOUND", "Anomaly not found", 404);
    }

    const anomaly = result.rows[0];

    // Fetch baseline if present
    let baseline: Record<string, unknown> | null = null;
    if (anomaly.baselineId) {
      const blResult = await sql<Record<string, unknown>>`
        SELECT
          b.id,
          b.metric_type         AS "metricType",
          b.baseline_mean::text AS "baselineMean",
          b.baseline_stddev::text AS "baselineStddev",
          b.sample_count        AS "sampleCount",
          b.window_periods      AS "windowPeriods",
          b.fiscal_year_from    AS "fiscalYearFrom",
          b.period_from         AS "periodFrom",
          b.fiscal_year_to      AS "fiscalYearTo",
          b.period_to           AS "periodTo",
          b.computed_at         AS "computedAt"
        FROM fin.atlas_anomaly_baseline b
        WHERE b.id = ${anomaly.baselineId as string}::uuid
      `.execute(db);
      baseline = blResult.rows[0] ?? null;
    }

    // Fetch linked risk signal if present
    let riskSignal: Record<string, unknown> | null = null;
    if (anomaly.riskSignalId) {
      const rsResult = await sql<Record<string, unknown>>`
        SELECT
          rs.id,
          rs.rule_code          AS "ruleCode",
          rs.severity,
          rs.signal_state       AS "signalState",
          rs.title,
          rs.message,
          rs.fired_at           AS "firedAt"
        FROM fin.close_risk_signal rs
        WHERE rs.id = ${anomaly.riskSignalId as string}::uuid
      `.execute(db);
      riskSignal = rsResult.rows[0] ?? null;
    }

    return successResponse({ anomaly, baseline, riskSignal });
  } catch (err) {
    console.error("[atlas/anomalies/:id] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to fetch anomaly");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// PATCH — transition anomaly status
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"],
  ACKNOWLEDGED: ["RESOLVED", "FALSE_POSITIVE"],
  RESOLVED: [],
  FALSE_POSITIVE: [],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ anomalyId: string }> },
) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const { userId } = apiCtx.context;
    const { anomalyId } = await params;
    const body = (await req.json()) as {
      status: string;
      resolutionNotes?: string;
    };

    if (!body.status) {
      return errorResponse("VALIDATION", "status is required", 400);
    }

    // Fetch current anomaly
    const current = await sql<{ status: string }>`
      SELECT status FROM fin.atlas_anomaly
      WHERE id = ${anomalyId}::uuid AND tenant_id = ${tenantUuid}::uuid
    `.execute(db);

    if (!current.rows.length) {
      return errorResponse("NOT_FOUND", "Anomaly not found", 404);
    }

    const currentStatus = current.rows[0].status;
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(body.status)) {
      return errorResponse(
        "INVALID_TRANSITION",
        `Cannot transition from ${currentStatus} to ${body.status}. Allowed: ${allowed.join(", ") || "none"}`,
        422,
      );
    }

    // Require resolution notes for RESOLVED
    if (body.status === "RESOLVED" && !body.resolutionNotes) {
      return errorResponse("VALIDATION", "resolutionNotes is required when resolving", 400);
    }

    // Build update
    let updateResult;
    if (body.status === "ACKNOWLEDGED") {
      updateResult = await sql<Record<string, unknown>>`
        UPDATE fin.atlas_anomaly
        SET status = 'ACKNOWLEDGED',
            acknowledged_by = ${userId}::uuid,
            acknowledged_at = now(),
            updated_at = now()
        WHERE id = ${anomalyId}::uuid AND tenant_id = ${tenantUuid}::uuid
        RETURNING id, status, acknowledged_by AS "acknowledgedBy", acknowledged_at AS "acknowledgedAt"
      `.execute(db);
    } else if (body.status === "RESOLVED") {
      updateResult = await sql<Record<string, unknown>>`
        UPDATE fin.atlas_anomaly
        SET status = 'RESOLVED',
            resolved_by = ${userId}::uuid,
            resolved_at = now(),
            resolution_notes = ${body.resolutionNotes ?? ""},
            updated_at = now()
        WHERE id = ${anomalyId}::uuid AND tenant_id = ${tenantUuid}::uuid
        RETURNING id, status, resolved_by AS "resolvedBy", resolved_at AS "resolvedAt", resolution_notes AS "resolutionNotes"
      `.execute(db);
    } else if (body.status === "FALSE_POSITIVE") {
      updateResult = await sql<Record<string, unknown>>`
        UPDATE fin.atlas_anomaly
        SET status = 'FALSE_POSITIVE',
            resolved_by = ${userId}::uuid,
            resolved_at = now(),
            resolution_notes = ${body.resolutionNotes ?? "Marked as false positive"},
            updated_at = now()
        WHERE id = ${anomalyId}::uuid AND tenant_id = ${tenantUuid}::uuid
        RETURNING id, status, resolved_by AS "resolvedBy", resolved_at AS "resolvedAt", resolution_notes AS "resolutionNotes"
      `.execute(db);
    } else {
      return errorResponse("UNKNOWN_STATUS", `Unknown target status: ${body.status}`, 400);
    }

    return successResponse(updateResult.rows[0]);
  } catch (err) {
    console.error("[atlas/anomalies/:id] PATCH error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to update anomaly");
  } finally {
    await redis?.quit();
  }
}
