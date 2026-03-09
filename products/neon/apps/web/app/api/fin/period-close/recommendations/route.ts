/**
 * Period Close Recommendations API
 *
 * GET  /api/fin/period-close/recommendations?entityCode=...&fiscalYear=...&periodNumber=...
 *   → list recommendations for a period (proposed + accepted)
 *
 * GET  /api/fin/period-close/recommendations?entityCode=...&fiscalYear=...&periodNumber=...&view=evaluate
 *   → evaluate policies and generate fresh recommendations
 *
 * GET  /api/fin/period-close/recommendations?entityCode=...&view=bottlenecks
 *   → cross-period bottleneck pattern analysis
 *
 * POST /api/fin/period-close/recommendations
 *   → accept, dismiss, or record outcome on a recommendation
 *   Body: { actionId, action: "accept" | "dismiss" | "outcome", reason?, wasEffective? }
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
// GET — list / evaluate / bottlenecks
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
    const view = url.searchParams.get("view") ?? "list";

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    // Bottleneck patterns (no period needed)
    if (view === "bottlenecks") {
      return await handleBottlenecks(db, tenantUuid, entityCode);
    }

    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    if (isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "fiscalYear and periodNumber are required", 400);
    }

    if (view === "evaluate") {
      return await handleEvaluate(db, tenantUuid, entityCode, fiscalYear, periodNumber);
    }

    // Default: list existing recommendations
    return await handleList(db, tenantUuid, entityCode, fiscalYear, periodNumber, url);
  } catch (error) {
    console.error("[GET /api/fin/period-close/recommendations] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load recommendations");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — accept / dismiss / outcome
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

    const { actionId, action, reason, wasEffective } = body as {
      actionId: string;
      action: "accept" | "dismiss" | "outcome";
      reason?: string;
      wasEffective?: boolean;
    };

    if (!actionId || !action) {
      return errorResponse("VALIDATION", "actionId and action are required", 400);
    }

    const userId = context.userId ?? "api_call";

    switch (action) {
      case "accept": {
        const result = await sql`
          UPDATE fin.close_action_log
          SET status = 'accepted',
              decided_at = now(),
              decided_by = ${userId}
          WHERE id = ${actionId}
            AND tenant_id = ${tenantUuid}
            AND status = 'proposed'
          RETURNING *
        `.execute(db);

        if ((result.rows as any[]).length === 0) {
          return errorResponse("NOT_FOUND", "Recommendation not found or not in proposed state", 404);
        }
        return successResponse({ data: (result.rows as any[])[0] });
      }

      case "dismiss": {
        const result = await sql`
          UPDATE fin.close_action_log
          SET status = 'dismissed',
              decided_at = now(),
              decided_by = ${userId},
              outcome_notes = ${reason ?? null}
          WHERE id = ${actionId}
            AND tenant_id = ${tenantUuid}
            AND status = 'proposed'
          RETURNING *
        `.execute(db);

        if ((result.rows as any[]).length === 0) {
          return errorResponse("NOT_FOUND", "Recommendation not found or not in proposed state", 404);
        }
        return successResponse({ data: (result.rows as any[])[0] });
      }

      case "outcome": {
        const result = await sql`
          UPDATE fin.close_action_log
          SET was_effective = ${wasEffective ?? null},
              outcome_notes = ${reason ?? null}
          WHERE id = ${actionId}
            AND tenant_id = ${tenantUuid}
            AND status IN ('executed', 'accepted')
          RETURNING *
        `.execute(db);

        if ((result.rows as any[]).length === 0) {
          return errorResponse("NOT_FOUND", "Action not found or not in executable state", 404);
        }
        return successResponse({ data: (result.rows as any[])[0] });
      }

      default:
        return errorResponse("VALIDATION", `Invalid action: ${action}`, 400);
    }
  } catch (error) {
    console.error("[POST /api/fin/period-close/recommendations] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update recommendation");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleList(
  db: any,
  tenantUuid: string,
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
  url: URL,
) {
  const status = url.searchParams.get("status") ?? null;
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  let result;
  if (status) {
    result = await sql`
      SELECT cal.*, cap.policy_name, cap.trigger_type, cap.severity AS policy_severity,
             cap.execution_mode
      FROM fin.close_action_log cal
      LEFT JOIN fin.close_action_policy cap ON cap.id = cal.policy_id
      WHERE cal.tenant_id = ${tenantUuid}
        AND cal.entity_code = ${entityCode}
        AND cal.fiscal_year = ${fiscalYear}
        AND cal.period_number = ${periodNumber}
        AND cal.status = ${status}
      ORDER BY cal.proposed_at DESC
      LIMIT ${limit}
    `.execute(db);
  } else {
    result = await sql`
      SELECT cal.*, cap.policy_name, cap.trigger_type, cap.severity AS policy_severity,
             cap.execution_mode
      FROM fin.close_action_log cal
      LEFT JOIN fin.close_action_policy cap ON cap.id = cal.policy_id
      WHERE cal.tenant_id = ${tenantUuid}
        AND cal.entity_code = ${entityCode}
        AND cal.fiscal_year = ${fiscalYear}
        AND cal.period_number = ${periodNumber}
      ORDER BY cal.proposed_at DESC
      LIMIT ${limit}
    `.execute(db);
  }

  return successResponse({ data: result.rows });
}

async function handleEvaluate(
  db: any,
  tenantUuid: string,
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
) {
  // Load active policies
  const policiesResult = await sql`
    SELECT * FROM fin.close_action_policy
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      AND is_active = true
      AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    ORDER BY priority ASC
  `.execute(db);

  const policies = policiesResult.rows as any[];

  // Load current close state for evaluation
  const [checklistResult, riskSummaryResult, bottleneckResult] = await Promise.all([
    sql`
      SELECT task_code, task_status, is_mandatory, due_at, completed_at, waived_at
      FROM fin.period_close_checklist
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
    `.execute(db),

    sql`
      SELECT
        COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged')) AS active_count,
        COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'critical') AS critical_count,
        COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'high') AS high_count
      FROM fin.close_risk_signal
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
    `.execute(db),

    sql`
      SELECT * FROM fin.vw_close_bottleneck_pattern
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
    `.execute(db),
  ]);

  const checklist = checklistResult.rows as any[];
  const riskRow = (riskSummaryResult.rows as any[])[0] ?? { active_count: 0, critical_count: 0, high_count: 0 };
  const bottlenecks = bottleneckResult.rows as any[];

  // Simple in-BFF evaluation (lightweight — doesn't need full graph computation)
  const readyCount = 0; // Would need graph for accurate count
  const blockedCount = checklist.filter((c) => c.task_status === "BLOCKED").length;
  const failedCount = checklist.filter((c) => c.task_status === "FAILED").length;
  const pendingCount = checklist.filter((c) => c.task_status === "PENDING").length;

  const recommendations: any[] = [];

  for (const policy of policies) {
    const triggerResult = evaluatePolicyTrigger(policy, {
      checklist,
      riskRow,
      bottlenecks,
      readyCount,
      blockedCount,
      failedCount,
      pendingCount,
    });

    if (!triggerResult.triggered) continue;

    // Fingerprint for deduplication
    const fingerprint = `v1:${policy.policy_code}:${policy.trigger_type}:${JSON.stringify(triggerResult.keyIdentifiers).slice(0, 100)}`;

    // Check if already proposed for this period
    const existing = await sql`
      SELECT 1 FROM fin.close_action_log
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
        AND fingerprint = ${fingerprint}
        AND status NOT IN ('dismissed', 'expired', 'failed')
      LIMIT 1
    `.execute(db);

    if ((existing.rows as any[]).length > 0) continue;

    // Insert recommendation
    const insertResult = await sql`
      INSERT INTO fin.close_action_log (
        tenant_id, entity_code, fiscal_year, period_number,
        policy_id, policy_code, action_type, action_params,
        trigger_context, status, fingerprint
      ) VALUES (
        ${tenantUuid}, ${entityCode}, ${fiscalYear}, ${periodNumber},
        ${policy.id}, ${policy.policy_code}, ${policy.action_type},
        ${JSON.stringify(policy.action_params)}::jsonb,
        ${JSON.stringify(triggerResult.context)}::jsonb,
        ${policy.execution_mode === "auto" ? "accepted" : "proposed"},
        ${fingerprint}
      ) RETURNING *
    `.execute(db);

    const entry = (insertResult.rows as any[])[0];
    recommendations.push({
      ...entry,
      policy_name: policy.policy_name,
      trigger_type: policy.trigger_type,
      severity: policy.severity,
      execution_mode: policy.execution_mode,
      rationale: triggerResult.rationale,
    });
  }

  return successResponse({
    data: {
      policiesEvaluated: policies.length,
      recommendationsGenerated: recommendations.length,
      recommendations,
    },
  });
}

async function handleBottlenecks(
  db: any,
  tenantUuid: string,
  entityCode: string,
) {
  const result = await sql`
    SELECT * FROM fin.vw_close_bottleneck_pattern
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
    ORDER BY bottleneck_frequency_pct DESC, times_longest_task DESC
  `.execute(db);

  return successResponse({ data: result.rows });
}

// ---------------------------------------------------------------------------
// Lightweight policy trigger evaluation (BFF-level)
// ---------------------------------------------------------------------------

interface BFFEvalContext {
  checklist: any[];
  riskRow: { active_count: number; critical_count: number; high_count: number };
  bottlenecks: any[];
  readyCount: number;
  blockedCount: number;
  failedCount: number;
  pendingCount: number;
}

function evaluatePolicyTrigger(
  policy: any,
  ctx: BFFEvalContext,
): { triggered: boolean; context: Record<string, unknown>; rationale: string; keyIdentifiers: string[] } {
  const cond = policy.trigger_condition ?? {};

  switch (policy.trigger_type) {
    case "critical_signal_active": {
      const minSeverity = cond.minSeverity ?? "high";
      const count = minSeverity === "critical"
        ? ctx.riskRow.critical_count
        : ctx.riskRow.critical_count + ctx.riskRow.high_count;

      if (count === 0) return { triggered: false, context: {}, rationale: "", keyIdentifiers: [] };
      return {
        triggered: true,
        context: { criticalCount: ctx.riskRow.critical_count, highCount: ctx.riskRow.high_count },
        rationale: `${count} active ${minSeverity}+ risk signal(s)`,
        keyIdentifiers: ["signal", String(count)],
      };
    }

    case "handler_failed": {
      if (ctx.failedCount === 0) return { triggered: false, context: {}, rationale: "", keyIdentifiers: [] };
      const failedCodes = ctx.checklist.filter((c) => c.task_status === "FAILED").map((c) => c.task_code);
      return {
        triggered: true,
        context: { failedTaskCodes: failedCodes, failedCount: ctx.failedCount },
        rationale: `${ctx.failedCount} task(s) in FAILED state: ${failedCodes.join(", ")}`,
        keyIdentifiers: failedCodes.sort(),
      };
    }

    case "blocker_stale": {
      if (ctx.blockedCount === 0) return { triggered: false, context: {}, rationale: "", keyIdentifiers: [] };
      const blockedCodes = ctx.checklist.filter((c) => c.task_status === "BLOCKED").map((c) => c.task_code);
      return {
        triggered: true,
        context: { blockedTaskCodes: blockedCodes, blockedCount: ctx.blockedCount },
        rationale: `${ctx.blockedCount} blocked task(s): ${blockedCodes.join(", ")}`,
        keyIdentifiers: blockedCodes.sort(),
      };
    }

    case "bottleneck_recurring": {
      const minOccurrences = cond.minOccurrences ?? 3;
      const recurring = ctx.bottlenecks.filter((b: any) => b.times_longest_task >= minOccurrences);
      if (recurring.length === 0) return { triggered: false, context: {}, rationale: "", keyIdentifiers: [] };
      return {
        triggered: true,
        context: { patterns: recurring },
        rationale: `${recurring.length} recurring bottleneck(s): ${recurring.map((b: any) => b.task_code).join(", ")}`,
        keyIdentifiers: recurring.map((b: any) => b.task_code).sort(),
      };
    }

    case "sla_at_risk": {
      const leadHours = cond.leadHours ?? 4;
      const now = new Date();
      const leadMs = leadHours * 60 * 60 * 1000;
      const atRisk = ctx.checklist.filter((c) => {
        if (c.task_status === "COMPLETED" || c.task_status === "WAIVED") return false;
        if (!c.due_at) return false;
        const due = new Date(c.due_at);
        return due.getTime() - now.getTime() <= leadMs && due.getTime() > now.getTime();
      });
      if (atRisk.length === 0) return { triggered: false, context: {}, rationale: "", keyIdentifiers: [] };
      const codes = atRisk.map((c: any) => c.task_code);
      return {
        triggered: true,
        context: { atRiskTaskCodes: codes, leadHours },
        rationale: `${atRisk.length} task(s) approaching SLA within ${leadHours}h`,
        keyIdentifiers: codes.sort(),
      };
    }

    default:
      return { triggered: false, context: {}, rationale: "", keyIdentifiers: [] };
  }
}
