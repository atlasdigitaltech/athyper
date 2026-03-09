/**
 * Control Benchmarking & Policy Tuning API — Phase 17
 *
 * GET /api/fin/assurance/benchmarking?view=targets&entityCode=...
 *   → active control targets for the entity
 *
 * GET /api/fin/assurance/benchmarking?view=benchmark&entityCode=...&fiscalYear=...
 *   → benchmark: targets vs actuals with variance and traffic lights
 *
 * GET /api/fin/assurance/benchmarking?view=recommendations&entityCode=...&fiscalYear=...
 *   → adaptive policy recommendations from gaps and chronic issues
 *
 * POST /api/fin/assurance/benchmarking
 *   → upsert control targets
 *
 * POST /api/fin/assurance/benchmarking  { action: "seed_defaults" }
 *   → seed default targets for the entity
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
// Default target definitions
// ---------------------------------------------------------------------------

const DEFAULT_TARGETS = [
  { metricCode: "close_readiness_score", label: "Close Readiness Score", group: "control", target: 85, green: 80, amber: 60, direction: "higher_is_better" },
  { metricCode: "clean_close_rate", label: "Clean Close Rate", group: "control", target: 100, green: 100, amber: 80, direction: "higher_is_better" },
  { metricCode: "override_density_pct", label: "Override Density", group: "control", target: 5, green: 5, amber: 15, direction: "lower_is_better" },
  { metricCode: "evidence_turnaround_days", label: "Evidence Turnaround (days)", group: "evidence", target: 3, green: 3, amber: 7, direction: "lower_is_better" },
  { metricCode: "attestation_lag_days", label: "Attestation Lag (days)", group: "attestation", target: 1, green: 1, amber: 3, direction: "lower_is_better" },
  { metricCode: "bundle_distribution_pct", label: "Bundle Distribution", group: "distribution", target: 90, green: 80, amber: 50, direction: "higher_is_better" },
  { metricCode: "evidence_fulfillment_pct", label: "Evidence Fulfillment", group: "evidence", target: 95, green: 90, amber: 70, direction: "higher_is_better" },
  { metricCode: "overall_assurance_score", label: "Overall Assurance Score", group: "composite", target: 80, green: 80, amber: 60, direction: "higher_is_better" },
];

// ---------------------------------------------------------------------------
// GET — targets / benchmark / recommendations
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
    const view = url.searchParams.get("view");
    const entityCode = url.searchParams.get("entityCode");

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    switch (view) {
      case "targets":
        return await getTargets(db, tenantUuid, entityCode);
      case "benchmark":
        return await getBenchmark(db, tenantUuid, entityCode, url.searchParams);
      case "recommendations":
        return await getRecommendations(db, tenantUuid, entityCode, url.searchParams);
      default:
        return errorResponse("VALIDATION", "view must be one of: targets, benchmark, recommendations", 400);
    }
  } catch (error) {
    console.error("[GET /api/fin/assurance/benchmarking] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load benchmarking data");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — upsert targets / seed defaults
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

    if (body.action === "seed_defaults") {
      return await seedDefaults(db, tenantUuid, body.entityCode, context.userId);
    }

    // Upsert a single target
    return await upsertTarget(db, tenantUuid, body, context.userId);
  } catch (error) {
    console.error("[POST /api/fin/assurance/benchmarking] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to save benchmarking data");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function getTargets(db: any, tenantUuid: string, entityCode: string) {
  const result = await sql`
    SELECT id, metric_code, metric_label, metric_group,
           target_value, direction, green_threshold, amber_threshold,
           fiscal_year, effective_from, effective_to,
           set_by, rationale, is_active,
           created_at, updated_at
    FROM fin.control_target
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      AND is_active = true
      AND effective_from <= current_date
      AND (effective_to IS NULL OR effective_to >= current_date)
    ORDER BY metric_group, metric_code
  `.execute(db);

  return successResponse({
    data: (result.rows as any[]).map(mapTarget),
  });
}

async function getBenchmark(
  db: any,
  tenantUuid: string,
  entityCode: string,
  params: URLSearchParams,
) {
  const fiscalYear = params.get("fiscalYear");
  const periodNumber = params.get("periodNumber");

  const result = await sql`
    SELECT *
    FROM fin.vw_control_benchmark
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      ${fiscalYear ? sql`AND fiscal_year = ${Number(fiscalYear)}` : sql``}
      ${periodNumber ? sql`AND period_number = ${Number(periodNumber)}` : sql``}
    ORDER BY fiscal_year DESC, period_number DESC, metric_group, metric_code
  `.execute(db);

  return successResponse({
    data: (result.rows as any[]).map((r) => ({
      entityCode: r.entity_code,
      fiscalYear: r.fiscal_year,
      periodNumber: r.period_number,
      metricCode: r.metric_code,
      metricLabel: r.metric_label,
      metricGroup: r.metric_group,
      direction: r.direction,
      targetValue: String(r.target_value),
      greenThreshold: String(r.green_threshold),
      amberThreshold: String(r.amber_threshold),
      actualValue: r.actual_value != null ? String(r.actual_value) : null,
      variance: r.variance != null ? String(r.variance) : null,
      variancePct: r.variance_pct != null ? String(r.variance_pct) : null,
      trafficLight: r.traffic_light,
      priorValue: r.prior_value != null ? String(r.prior_value) : null,
      periodDelta: r.period_delta != null ? String(r.period_delta) : null,
      trend: r.trend,
      setBy: r.set_by,
      rationale: r.rationale,
    })),
  });
}

async function getRecommendations(
  db: any,
  tenantUuid: string,
  entityCode: string,
  params: URLSearchParams,
) {
  const fiscalYear = params.get("fiscalYear");

  const result = await sql`
    SELECT *
    FROM fin.vw_policy_recommendation
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      ${fiscalYear ? sql`AND (fiscal_year = ${Number(fiscalYear)} OR fiscal_year = 0)` : sql``}
    ORDER BY
      CASE priority
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2
        WHEN 'medium' THEN 3 ELSE 4
      END,
      recommendation_type
  `.execute(db);

  return successResponse({
    data: (result.rows as any[]).map((r) => ({
      recommendationType: r.recommendation_type,
      policyArea: r.policy_area,
      title: r.title,
      detail: r.detail,
      priority: r.priority,
      recommendationData: r.recommendation_data,
      fiscalYear: r.fiscal_year,
      periodNumber: r.period_number,
    })),
  });
}

async function seedDefaults(
  db: any,
  tenantUuid: string,
  entityCode: string,
  userId: string,
) {
  if (!entityCode) {
    return errorResponse("VALIDATION", "entityCode is required", 400);
  }

  let seeded = 0;
  for (const d of DEFAULT_TARGETS) {
    const result = await sql`
      INSERT INTO fin.control_target (
        tenant_id, entity_code,
        metric_code, metric_label, metric_group,
        target_value, direction, green_threshold, amber_threshold,
        set_by, rationale
      ) VALUES (
        ${tenantUuid}, ${entityCode},
        ${d.metricCode}, ${d.label}, ${d.group},
        ${d.target}, ${d.direction}, ${d.green}, ${d.amber},
        'system', 'Industry default target'
      )
      ON CONFLICT (tenant_id, entity_code, metric_code, fiscal_year)
      DO NOTHING
    `.execute(db);
    seeded += (result as any).numAffectedRows ?? 0;
  }

  return successResponse({
    data: { seeded, total: DEFAULT_TARGETS.length },
    message: `Seeded ${seeded} default targets`,
  });
}

async function upsertTarget(
  db: any,
  tenantUuid: string,
  body: any,
  userId: string,
) {
  const {
    entityCode,
    metricCode,
    metricLabel,
    metricGroup = "control",
    targetValue,
    direction = "higher_is_better",
    greenThreshold,
    amberThreshold,
    fiscalYear = null,
    rationale,
  } = body;

  if (!entityCode || !metricCode || targetValue == null || greenThreshold == null || amberThreshold == null) {
    return errorResponse(
      "VALIDATION",
      "entityCode, metricCode, targetValue, greenThreshold, amberThreshold are required",
      400,
    );
  }

  const result = await sql`
    INSERT INTO fin.control_target (
      tenant_id, entity_code,
      metric_code, metric_label, metric_group,
      target_value, direction, green_threshold, amber_threshold,
      fiscal_year, set_by, rationale
    ) VALUES (
      ${tenantUuid}, ${entityCode},
      ${metricCode}, ${metricLabel || metricCode}, ${metricGroup},
      ${Number(targetValue)}, ${direction},
      ${Number(greenThreshold)}, ${Number(amberThreshold)},
      ${fiscalYear}, ${userId}, ${rationale ?? null}
    )
    ON CONFLICT (tenant_id, entity_code, metric_code, fiscal_year)
    DO UPDATE SET
      metric_label = EXCLUDED.metric_label,
      metric_group = EXCLUDED.metric_group,
      target_value = EXCLUDED.target_value,
      direction = EXCLUDED.direction,
      green_threshold = EXCLUDED.green_threshold,
      amber_threshold = EXCLUDED.amber_threshold,
      set_by = EXCLUDED.set_by,
      rationale = EXCLUDED.rationale,
      updated_at = now()
    RETURNING id, metric_code
  `.execute(db);

  const row = (result.rows as any[])[0];
  return successResponse({
    data: { id: row.id, metricCode: row.metric_code },
    message: "Target saved",
  });
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapTarget(r: any) {
  return {
    id: r.id,
    metricCode: r.metric_code,
    metricLabel: r.metric_label,
    metricGroup: r.metric_group,
    targetValue: String(r.target_value),
    direction: r.direction,
    greenThreshold: String(r.green_threshold),
    amberThreshold: String(r.amber_threshold),
    fiscalYear: r.fiscal_year,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    setBy: r.set_by,
    rationale: r.rationale,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
