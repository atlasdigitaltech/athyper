/**
 * Assurance Analytics API — Phase 16
 *
 * GET /api/fin/assurance/analytics?view=effectiveness&entityCode=...&fiscalYear=...
 *   → control effectiveness metrics from vw_control_effectiveness
 *
 * GET /api/fin/assurance/analytics?view=workload&entityCode=...&fiscalYear=...&periodNumber=...
 *   → evidence request workload from vw_assurance_workload
 *
 * GET /api/fin/assurance/analytics?view=chronic&entityCode=...
 *   → chronic control issues from vw_chronic_control_issues
 *
 * GET /api/fin/assurance/analytics?view=scorecard&entityCode=...&fiscalYear=...
 *   → assurance scorecard from vw_assurance_scorecard
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
// GET — analytics views
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
      case "effectiveness":
        return await getControlEffectiveness(db, tenantUuid, entityCode, url.searchParams);
      case "workload":
        return await getAssuranceWorkload(db, tenantUuid, entityCode, url.searchParams);
      case "chronic":
        return await getChronicIssues(db, tenantUuid, entityCode);
      case "scorecard":
        return await getAssuranceScorecard(db, tenantUuid, entityCode, url.searchParams);
      default:
        return errorResponse("VALIDATION", "view must be one of: effectiveness, workload, chronic, scorecard", 400);
    }
  } catch (error) {
    console.error("[GET /api/fin/assurance/analytics] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load assurance analytics");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Control Effectiveness — per-period metrics
// ---------------------------------------------------------------------------

async function getControlEffectiveness(
  db: any,
  tenantUuid: string,
  entityCode: string,
  params: URLSearchParams,
) {
  const fiscalYear = params.get("fiscalYear");
  const periodNumber = params.get("periodNumber");

  const result = await sql`
    SELECT *
    FROM fin.vw_control_effectiveness
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      ${fiscalYear ? sql`AND fiscal_year = ${Number(fiscalYear)}` : sql``}
      ${periodNumber ? sql`AND period_number = ${Number(periodNumber)}` : sql``}
    ORDER BY fiscal_year DESC, period_number DESC
    LIMIT 24
  `.execute(db);

  return successResponse({
    data: (result.rows as any[]).map((r) => ({
      entityCode: r.entity_code,
      fiscalYear: r.fiscal_year,
      periodNumber: r.period_number,
      totalTasks: r.total_tasks,
      completedTasks: r.completed_tasks,
      waivedTasks: r.waived_tasks,
      blockedTasks: r.blocked_tasks,
      completionPct: String(r.completion_pct),
      isCleanClose: r.is_clean_close,
      totalOverrides: r.total_overrides,
      approvedOverrides: r.approved_overrides,
      approvedImpact: String(r.approved_impact),
      overrideDensityPct: String(r.override_density_pct),
      evidenceTotalRequests: r.evidence_total_requests,
      evidenceFulfilled: r.evidence_fulfilled,
      evidenceOpen: r.evidence_open,
      evidenceOverdue: r.evidence_overdue,
      evidenceAvgTurnaroundDays: String(r.evidence_avg_turnaround_days),
      totalAttestations: r.total_attestations,
      uniqueAttestors: r.unique_attestors,
      attestationTypesCovered: r.attestation_types_covered,
      avgAttestationLagDays: String(r.avg_attestation_lag_days),
      totalBundles: r.total_bundles,
      distributedBundles: r.distributed_bundles,
      bundleDistributionPct: String(r.bundle_distribution_pct),
      readinessScore: r.readiness_score != null ? String(r.readiness_score) : null,
      readinessCompletionPct: r.readiness_completion_pct != null ? String(r.readiness_completion_pct) : null,
    })),
  });
}

// ---------------------------------------------------------------------------
// Assurance Workload — open requests, aging, SLA
// ---------------------------------------------------------------------------

async function getAssuranceWorkload(
  db: any,
  tenantUuid: string,
  entityCode: string,
  params: URLSearchParams,
) {
  const fiscalYear = params.get("fiscalYear");
  const periodNumber = params.get("periodNumber");
  const status = params.get("status");
  const severity = params.get("severity");

  const result = await sql`
    SELECT *
    FROM fin.vw_assurance_workload
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      ${fiscalYear ? sql`AND fiscal_year = ${Number(fiscalYear)}` : sql``}
      ${periodNumber ? sql`AND period_number = ${Number(periodNumber)}` : sql``}
      ${status === "open" ? sql`AND is_open = true` : sql``}
      ${status === "overdue" ? sql`AND is_overdue = true` : sql``}
      ${severity ? sql`AND severity = ${severity}` : sql``}
    ORDER BY
      is_overdue DESC,
      CASE severity
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
        WHEN 'low' THEN 4 ELSE 5
      END,
      created_at DESC
    LIMIT 200
  `.execute(db);

  const rows = result.rows as any[];

  // Compute summary stats
  const openItems = rows.filter((r) => r.is_open);
  const overdueItems = rows.filter((r) => r.is_overdue);
  const bySeverity: Record<string, number> = {};
  const byOrg: Record<string, number> = {};

  for (const r of openItems) {
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    if (r.requested_by_org) {
      byOrg[r.requested_by_org] = (byOrg[r.requested_by_org] ?? 0) + 1;
    }
  }

  return successResponse({
    data: {
      items: rows.map((r) => ({
        requestId: r.request_id,
        title: r.title,
        severity: r.severity,
        status: r.status,
        source: r.source,
        category: r.category,
        assignedRole: r.assigned_role,
        assignedTo: r.assigned_to,
        requestedByOrg: r.requested_by_org,
        createdAt: r.created_at,
        dueAt: r.due_at,
        resolvedAt: r.resolved_at,
        ageDays: r.age_days,
        overdueDays: r.overdue_days,
        fulfillmentDays: r.fulfillment_days,
        isOverdue: r.is_overdue,
        isOpen: r.is_open,
      })),
      summary: {
        totalItems: rows.length,
        openCount: openItems.length,
        overdueCount: overdueItems.length,
        bySeverity,
        byOrg,
        avgAgeDays: openItems.length > 0
          ? Math.round(openItems.reduce((s, r) => s + r.age_days, 0) / openItems.length)
          : 0,
        avgOverdueDays: overdueItems.length > 0
          ? Math.round(overdueItems.reduce((s, r) => s + r.overdue_days, 0) / overdueItems.length)
          : 0,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Chronic Control Issues — cross-period patterns
// ---------------------------------------------------------------------------

async function getChronicIssues(
  db: any,
  tenantUuid: string,
  entityCode: string,
) {
  const result = await sql`
    SELECT *
    FROM fin.vw_chronic_control_issues
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
    ORDER BY occurrence_count DESC, latest_period DESC
    LIMIT 100
  `.execute(db);

  return successResponse({
    data: (result.rows as any[]).map((r) => ({
      issueType: r.issue_type,
      issueKey: r.issue_key,
      description: r.description,
      occurrenceCount: r.occurrence_count,
      affectedPeriods: r.affected_periods,
      latestPeriod: r.latest_period,
      impactAmount: r.impact_amount != null ? String(r.impact_amount) : null,
    })),
  });
}

// ---------------------------------------------------------------------------
// Assurance Scorecard — composite scores
// ---------------------------------------------------------------------------

async function getAssuranceScorecard(
  db: any,
  tenantUuid: string,
  entityCode: string,
  params: URLSearchParams,
) {
  const fiscalYear = params.get("fiscalYear");
  const periodNumber = params.get("periodNumber");

  const result = await sql`
    SELECT *
    FROM fin.vw_assurance_scorecard
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      ${fiscalYear ? sql`AND fiscal_year = ${Number(fiscalYear)}` : sql``}
      ${periodNumber ? sql`AND period_number = ${Number(periodNumber)}` : sql``}
    ORDER BY fiscal_year DESC, period_number DESC
    LIMIT 24
  `.execute(db);

  return successResponse({
    data: (result.rows as any[]).map((r) => ({
      entityCode: r.entity_code,
      fiscalYear: r.fiscal_year,
      periodNumber: r.period_number,
      closeControlScore: r.close_control_score,
      evidenceFulfillmentScore: r.evidence_fulfillment_score,
      attestationComplianceScore: r.attestation_compliance_score,
      distributionGovernanceScore: r.distribution_governance_score,
      overallAssuranceScore: r.overall_assurance_score,
      assuranceRating: r.assurance_rating,
      chronicLateTasks: r.chronic_late_tasks,
      chronicOverridePeriods: r.chronic_override_periods,
      chronicEvidenceDomains: r.chronic_evidence_domains,
      nonCleanPeriodCount: r.non_clean_period_count,
      readinessScore: r.readiness_score != null ? String(r.readiness_score) : null,
      totalOverrides: r.total_overrides,
      approvedImpact: String(r.approved_impact),
      evidenceTotalRequests: r.evidence_total_requests,
      evidenceOverdue: r.evidence_overdue,
      totalAttestations: r.total_attestations,
      totalBundles: r.total_bundles,
      isCleanClose: r.is_clean_close,
    })),
  });
}
