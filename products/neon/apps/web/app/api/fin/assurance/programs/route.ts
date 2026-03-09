/**
 * Control Program Management API — Phase 18
 *
 * GET /api/fin/assurance/programs?entityCode=...
 *   → program portfolio from vw_program_portfolio
 *
 * GET /api/fin/assurance/programs?programId=...
 *   → single program detail with milestones
 *
 * GET /api/fin/assurance/programs?programId=...&view=impact
 *   → benefit realization: baseline vs current benchmark values
 *
 * POST /api/fin/assurance/programs
 *   → create program
 *
 * PATCH /api/fin/assurance/programs
 *   → update program status, add milestones, capture baseline
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
// GET — portfolio / detail / impact
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
    const programId = url.searchParams.get("programId");
    const view = url.searchParams.get("view");
    const entityCode = url.searchParams.get("entityCode");

    if (programId && view === "impact") {
      return await getImpact(db, tenantUuid, programId);
    }

    if (programId) {
      return await getDetail(db, tenantUuid, programId);
    }

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    return await getPortfolio(db, tenantUuid, entityCode, url.searchParams);
  } catch (error) {
    console.error("[GET /api/fin/assurance/programs] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load programs");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — create program
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
      programType = "improvement",
      priority = "medium",
      sponsorName,
      sponsorRole,
      ownerName,
      ownerRole,
      plannedStart,
      plannedEnd,
      fiscalYear,
      linkedGaps = [],
      targetOutcomes = {},
    } = body;

    if (!entityCode || !title) {
      return errorResponse("VALIDATION", "entityCode and title are required", 400);
    }

    // Generate program code
    const countResult = await sql`
      SELECT count(*) AS cnt FROM fin.control_program
      WHERE tenant_id = ${tenantUuid} AND entity_code = ${entityCode}
    `.execute(db);
    const seq = Number((countResult.rows as any[])[0]?.cnt ?? 0) + 1;
    const programCode = `CP-${entityCode}-${String(seq).padStart(3, "0")}`;

    const result = await sql`
      INSERT INTO fin.control_program (
        tenant_id, entity_code, program_code, title, description,
        program_type, priority,
        sponsor_name, sponsor_role, owner_name, owner_role, owner_user_id,
        planned_start, planned_end, fiscal_year,
        linked_gaps, target_outcomes,
        created_by
      ) VALUES (
        ${tenantUuid}, ${entityCode}, ${programCode}, ${title}, ${description ?? null},
        ${programType}, ${priority},
        ${sponsorName ?? null}, ${sponsorRole ?? null},
        ${ownerName ?? null}, ${ownerRole ?? null},
        ${context.userId}::uuid,
        ${plannedStart ? sql`${plannedStart}::date` : sql`NULL`},
        ${plannedEnd ? sql`${plannedEnd}::date` : sql`NULL`},
        ${fiscalYear ?? null},
        ${JSON.stringify(linkedGaps)}::jsonb,
        ${JSON.stringify(targetOutcomes)}::jsonb,
        ${context.userId}
      )
      RETURNING id, program_code
    `.execute(db);

    const row = (result.rows as any[])[0];
    return successResponse({
      data: { id: row.id, programCode: row.program_code },
      message: "Program created",
    });
  } catch (error) {
    console.error("[POST /api/fin/assurance/programs] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create program");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// PATCH — update status, add milestones, capture baseline
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
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
    const { programId, action } = body;

    if (!programId) {
      return errorResponse("VALIDATION", "programId is required", 400);
    }

    // Verify program exists
    const progResult = await sql`
      SELECT id, entity_code, status, fiscal_year
      FROM fin.control_program
      WHERE id = ${programId}::uuid AND tenant_id = ${tenantUuid}
    `.execute(db);
    const program = (progResult.rows as any[])[0];
    if (!program) {
      return errorResponse("NOT_FOUND", "Program not found", 404);
    }

    switch (action) {
      case "approve":
        return await approveProgram(db, tenantUuid, programId, context.userId);

      case "activate": {
        // Capture baseline metrics from current benchmark data
        const benchResult = await sql`
          SELECT metric_code, actual_value, traffic_light
          FROM fin.vw_control_benchmark
          WHERE tenant_id = ${tenantUuid}
            AND entity_code = ${program.entity_code}
          ORDER BY fiscal_year DESC, period_number DESC
        `.execute(db);

        const baseline: Record<string, any> = {};
        for (const r of benchResult.rows as any[]) {
          if (!baseline[r.metric_code]) {
            baseline[r.metric_code] = {
              value: r.actual_value != null ? String(r.actual_value) : null,
              trafficLight: r.traffic_light,
              capturedAt: new Date().toISOString(),
            };
          }
        }

        await sql`
          UPDATE fin.control_program
          SET status = 'active',
              actual_start = current_date,
              baseline_metrics = ${JSON.stringify(baseline)}::jsonb,
              updated_at = now()
          WHERE id = ${programId}::uuid
        `.execute(db);

        return successResponse({ data: { status: "active", baselineMetrics: baseline } });
      }

      case "hold":
        await sql`
          UPDATE fin.control_program
          SET status = 'on_hold', updated_at = now()
          WHERE id = ${programId}::uuid
        `.execute(db);
        return successResponse({ data: { status: "on_hold" } });

      case "resume":
        await sql`
          UPDATE fin.control_program
          SET status = 'active', updated_at = now()
          WHERE id = ${programId}::uuid
        `.execute(db);
        return successResponse({ data: { status: "active" } });

      case "complete":
        await sql`
          UPDATE fin.control_program
          SET status = 'completed', actual_end = current_date, updated_at = now()
          WHERE id = ${programId}::uuid
        `.execute(db);
        return successResponse({ data: { status: "completed" } });

      case "close":
        await sql`
          UPDATE fin.control_program
          SET status = 'closed',
              closed_by = ${context.userId},
              closed_at = now(),
              close_note = ${body.closeNote ?? null},
              updated_at = now()
          WHERE id = ${programId}::uuid
        `.execute(db);
        return successResponse({ data: { status: "closed" } });

      case "cancel":
        await sql`
          UPDATE fin.control_program
          SET status = 'cancelled', updated_at = now()
          WHERE id = ${programId}::uuid
        `.execute(db);
        return successResponse({ data: { status: "cancelled" } });

      case "add_milestone": {
        const { title, detail, severity, dueAt, assignedRole } = body;
        if (!title) {
          return errorResponse("VALIDATION", "milestone title is required", 400);
        }

        const milestoneResult = await sql`
          INSERT INTO fin.action_item (
            tenant_id, entity_code,
            target_kind, target_id,
            title, detail,
            severity, priority,
            assigned_role, due_at,
            source, source_ref,
            fiscal_year,
            status,
            created_by
          ) VALUES (
            ${tenantUuid}, ${program.entity_code},
            'program_milestone', ${programId}::uuid,
            ${title}, ${detail ?? null},
            ${severity ?? "medium"}, ${body.priority ?? 50},
            ${assignedRole ?? null},
            ${dueAt ? sql`${dueAt}::timestamptz` : sql`NULL`},
            'system', ${program.entity_code},
            ${program.fiscal_year},
            'open',
            ${context.userId}
          )
          RETURNING id
        `.execute(db);

        // Update denormalized counts
        await sql`
          UPDATE fin.control_program
          SET total_milestones = total_milestones + 1,
              updated_at = now()
          WHERE id = ${programId}::uuid
        `.execute(db);

        const ms = (milestoneResult.rows as any[])[0];
        return successResponse({
          data: { milestoneId: ms.id },
          message: "Milestone added",
        });
      }

      case "update_gaps":
        await sql`
          UPDATE fin.control_program
          SET linked_gaps = ${JSON.stringify(body.linkedGaps ?? [])}::jsonb,
              updated_at = now()
          WHERE id = ${programId}::uuid
        `.execute(db);
        return successResponse({ message: "Gaps updated" });

      default:
        return errorResponse("VALIDATION", `Unknown action: ${action}`, 400);
    }
  } catch (error) {
    console.error("[PATCH /api/fin/assurance/programs] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update program");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function getPortfolio(
  db: any,
  tenantUuid: string,
  entityCode: string,
  params: URLSearchParams,
) {
  const status = params.get("status");
  const fiscalYear = params.get("fiscalYear");

  const result = await sql`
    SELECT *
    FROM fin.vw_program_portfolio
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      ${status ? sql`AND status = ${status}` : sql``}
      ${fiscalYear ? sql`AND fiscal_year = ${Number(fiscalYear)}` : sql``}
    ORDER BY
      CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT 50
  `.execute(db);

  return successResponse({
    data: (result.rows as any[]).map(mapProgram),
  });
}

async function getDetail(db: any, tenantUuid: string, programId: string) {
  // Get program
  const progResult = await sql`
    SELECT * FROM fin.vw_program_portfolio
    WHERE id = ${programId}::uuid AND tenant_id = ${tenantUuid}
  `.execute(db);

  const program = (progResult.rows as any[])[0];
  if (!program) {
    return errorResponse("NOT_FOUND", "Program not found", 404);
  }

  // Get milestones
  const msResult = await sql`
    SELECT id, title, detail, severity, priority,
           assigned_role, assigned_to, due_at, status,
           resolved_at, resolution_note,
           created_at
    FROM fin.action_item
    WHERE tenant_id = ${tenantUuid}
      AND target_kind = 'program_milestone'
      AND target_id = ${programId}::uuid
    ORDER BY
      CASE status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2
                  WHEN 'acknowledged' THEN 3 WHEN 'resolved' THEN 4 ELSE 5 END,
      due_at ASC NULLS LAST
  `.execute(db);

  return successResponse({
    data: {
      ...mapProgram(program),
      milestones: (msResult.rows as any[]).map((m) => ({
        id: m.id,
        title: m.title,
        detail: m.detail,
        severity: m.severity,
        priority: m.priority,
        assignedRole: m.assigned_role,
        assignedTo: m.assigned_to,
        dueAt: m.due_at,
        status: m.status,
        resolvedAt: m.resolved_at,
        resolutionNote: m.resolution_note,
        createdAt: m.created_at,
      })),
    },
  });
}

async function getImpact(db: any, tenantUuid: string, programId: string) {
  // Get program with baseline
  const progResult = await sql`
    SELECT id, entity_code, baseline_metrics, target_outcomes, status
    FROM fin.control_program
    WHERE id = ${programId}::uuid AND tenant_id = ${tenantUuid}
  `.execute(db);

  const program = (progResult.rows as any[])[0];
  if (!program) {
    return errorResponse("NOT_FOUND", "Program not found", 404);
  }

  // Get current benchmark values
  const benchResult = await sql`
    SELECT metric_code, metric_label, actual_value, traffic_light, trend,
           target_value, variance
    FROM fin.vw_control_benchmark
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${program.entity_code}
    ORDER BY fiscal_year DESC, period_number DESC
  `.execute(db);

  // Deduplicate — take latest period per metric
  const currentByMetric: Record<string, any> = {};
  for (const r of benchResult.rows as any[]) {
    if (!currentByMetric[r.metric_code]) {
      currentByMetric[r.metric_code] = r;
    }
  }

  const baseline = program.baseline_metrics ?? {};
  const targets = program.target_outcomes ?? {};
  const impact: any[] = [];

  for (const [metricCode, baselineData] of Object.entries(baseline as Record<string, any>)) {
    const current = currentByMetric[metricCode];
    const target = targets[metricCode];
    const baseValue = baselineData?.value != null ? Number(baselineData.value) : null;
    const currentValue = current?.actual_value != null ? Number(current.actual_value) : null;

    impact.push({
      metricCode,
      metricLabel: current?.metric_label ?? metricCode,
      baselineValue: baselineData?.value ?? null,
      baselineTrafficLight: baselineData?.trafficLight ?? null,
      baselineCapturedAt: baselineData?.capturedAt ?? null,
      currentValue: current?.actual_value != null ? String(current.actual_value) : null,
      currentTrafficLight: current?.traffic_light ?? null,
      currentTrend: current?.trend ?? null,
      targetValue: target?.targetValue != null ? String(target.targetValue) : null,
      improvement: baseValue != null && currentValue != null
        ? String(Math.round((currentValue - baseValue) * 100) / 100)
        : null,
      trafficLightChanged: baselineData?.trafficLight !== current?.traffic_light,
    });
  }

  return successResponse({
    data: {
      programId: program.id,
      status: program.status,
      impact,
    },
  });
}

async function approveProgram(
  db: any,
  tenantUuid: string,
  programId: string,
  userId: string,
) {
  await sql`
    UPDATE fin.control_program
    SET status = 'approved',
        approved_by = ${userId},
        approved_at = now(),
        updated_at = now()
    WHERE id = ${programId}::uuid
  `.execute(db);

  return successResponse({ data: { status: "approved" } });
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapProgram(r: any) {
  return {
    id: r.id,
    entityCode: r.entity_code,
    programCode: r.program_code,
    title: r.title,
    description: r.description,
    programType: r.program_type,
    priority: r.priority,
    sponsorName: r.sponsor_name,
    sponsorRole: r.sponsor_role,
    ownerName: r.owner_name,
    ownerRole: r.owner_role,
    status: r.status,
    plannedStart: r.planned_start,
    plannedEnd: r.planned_end,
    actualStart: r.actual_start,
    actualEnd: r.actual_end,
    fiscalYear: r.fiscal_year,
    totalMilestones: r.total_milestones,
    completedMilestones: r.completed_milestones,
    overdueMilestones: r.overdue_milestones,
    activeMilestones: r.active_milestones,
    milestoneCompletionPct: r.milestone_completion_pct != null ? String(r.milestone_completion_pct) : "0",
    nextMilestoneDue: r.next_milestone_due,
    linkedGapCount: r.linked_gap_count,
    benchmarkGapCount: r.benchmark_gap_count,
    chronicGapCount: r.chronic_gap_count,
    recommendationGapCount: r.recommendation_gap_count,
    totalDecisions: r.total_decisions,
    lastDecisionAt: r.last_decision_at,
    elapsedDays: r.elapsed_days,
    plannedDays: r.planned_days,
    isOverdue: r.is_overdue,
    health: r.health,
    linkedGaps: r.linked_gaps,
    baselineMetrics: r.baseline_metrics,
    targetOutcomes: r.target_outcomes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
