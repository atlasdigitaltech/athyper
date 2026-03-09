/**
 * Period Close Governance API
 *
 * GET  /api/fin/period-close?entityCode=...&fiscalYear=...&periodNumber=...
 *   → returns checklist items (joined with task template) + progress summary
 *
 * POST /api/fin/period-close  { action: "run-checks", entityCode, fiscalYear, periodNumber, targetStatus }
 *   → re-runs all SYSTEM/HYBRID handlers gating the target transition
 *
 * POST /api/fin/period-close  { action: "execute-handler", entityCode, fiscalYear, periodNumber, taskCode }
 *   → executes a single SYSTEM handler for a specific task
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import type { NextRequest } from "next/server";

import { Container } from "@athyper/runtime/kernel/container";
import {
  CloseHandlerRegistry,
  TrialBalanceCloseHandler,
  DepreciationCheckHandler,
  FxRevaluationCheckHandler,
  BankReconCheckHandler,
} from "@athyper/runtime/services/business/engines/posting-engine";
import type {
  CloseHandlerResult,
} from "@athyper/runtime/services/business/engines/posting-engine";

import {
  getApiContext,
  resolveTenantUuid,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET — checklist + progress
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
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    if (!entityCode || isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, periodNumber are required", 400);
    }

    // Checklist items joined with task template
    const checklistRows = await sql`
      SELECT
        cl.id,
        cl.task_id,
        cl.task_code,
        cl.task_status,
        cl.is_mandatory,
        cl.assigned_to,
        cl.assigned_role,
        cl.assigned_user_id,
        cl.due_at,
        cl.completed_by,
        cl.completed_at,
        cl.completion_notes,
        cl.evidence_payload,
        cl.failure_reason,
        cl.failed_at,
        cl.waiver_status,
        cl.waiver_reason,
        cl.waived_by,
        cl.waived_at,
        cl.last_handler_run_at,
        cl.last_handler_result,
        cl.handler_run_count,
        -- Task template fields
        t.task_name,
        t.description AS task_description,
        t.category,
        t.required_before,
        t.sort_order,
        t.is_waivable,
        t.completion_mode,
        t.system_check_handler,
        t.default_owner_role,
        t.sla_hours,
        t.severity,
        t.waiver_requires_approval
      FROM fin.period_close_checklist cl
      JOIN fin.period_close_task t ON t.id = cl.task_id
      WHERE cl.tenant_id = ${tenantUuid}
        AND cl.entity_code = ${entityCode}
        AND cl.fiscal_year = ${fiscalYear}
        AND cl.period_number = ${periodNumber}
      ORDER BY t.sort_order, t.task_code
    `.execute(db);

    const items = (checklistRows.rows as any[]).map(mapChecklistRow);

    // Progress summary
    const progressRows = await sql`
      SELECT
        COUNT(*)::int AS total_tasks,
        COUNT(*) FILTER (WHERE task_status = 'COMPLETED')::int AS completed_count,
        COUNT(*) FILTER (WHERE task_status = 'WAIVED')::int AS waived_count,
        COUNT(*) FILTER (WHERE task_status = 'FAILED')::int AS failed_count,
        COUNT(*) FILTER (WHERE task_status = 'BLOCKED')::int AS blocked_count,
        COUNT(*) FILTER (WHERE task_status = 'IN_PROGRESS')::int AS in_progress_count,
        COUNT(*) FILTER (WHERE task_status = 'PENDING')::int AS pending_count
      FROM fin.period_close_checklist
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
    `.execute(db);

    const p = (progressRows.rows as any[])[0] ?? {
      total_tasks: 0, completed_count: 0, waived_count: 0,
      failed_count: 0, blocked_count: 0, in_progress_count: 0, pending_count: 0,
    };
    const total = p.total_tasks || 1;
    const progress = {
      totalTasks: p.total_tasks,
      completedCount: p.completed_count,
      waivedCount: p.waived_count,
      failedCount: p.failed_count,
      blockedCount: p.blocked_count,
      inProgressCount: p.in_progress_count,
      pendingCount: p.pending_count,
      completionPct: Math.round(((p.completed_count + p.waived_count) / total) * 100),
    };

    return successResponse({ items, progress });
  } catch (error) {
    console.error("[GET /api/fin/period-close] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load period close checklist");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — run-checks / execute-handler
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
    const body = (await req.json()) as {
      action: "run-checks";
      entityCode: string;
      fiscalYear: number;
      periodNumber: number;
      targetStatus?: "SOFT_CLOSE" | "HARD_CLOSE";
    };

    if (!body.action || !body.entityCode || !body.fiscalYear || !body.periodNumber) {
      return errorResponse("VALIDATION", "action, entityCode, fiscalYear, periodNumber are required", 400);
    }

    if (body.action === "run-checks") {
      return await runChecks(db, tenantUuid, context, body);
    }

    return errorResponse("VALIDATION", `Unknown action: ${body.action}`, 400);
  } catch (error) {
    console.error("[POST /api/fin/period-close] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to process period close action");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// run-checks — execute SYSTEM/HYBRID handlers and update checklist
// ---------------------------------------------------------------------------

interface RunChecksTaskResult {
  taskCode: string;
  taskName: string;
  passed: boolean;
  evidenceCode: string | null;
  message: string;
}

async function runChecks(
  db: any,
  tenantUuid: string,
  context: { userId: string; tenantId: string },
  body: {
    entityCode: string;
    fiscalYear: number;
    periodNumber: number;
    targetStatus?: "SOFT_CLOSE" | "HARD_CLOSE";
  },
) {
  // 1. Find SYSTEM/HYBRID tasks that need re-checking
  const taskRows = await sql`
    SELECT
      cl.id AS checklist_id,
      cl.task_code,
      cl.task_status,
      cl.handler_run_count,
      t.task_name,
      t.system_check_handler,
      t.completion_mode,
      t.required_before
    FROM fin.period_close_checklist cl
    JOIN fin.period_close_task t ON t.id = cl.task_id
    WHERE cl.tenant_id = ${tenantUuid}
      AND cl.entity_code = ${body.entityCode}
      AND cl.fiscal_year = ${body.fiscalYear}
      AND cl.period_number = ${body.periodNumber}
      AND t.completion_mode IN ('SYSTEM', 'HYBRID')
      AND cl.task_status NOT IN ('COMPLETED', 'WAIVED')
      AND t.system_check_handler IS NOT NULL
      ${body.targetStatus ? sql`AND t.required_before = ${body.targetStatus}` : sql``}
    ORDER BY t.sort_order
  `.execute(db);

  const tasks = taskRows.rows as any[];
  if (tasks.length === 0) {
    return successResponse({
      executed: 0,
      passed: 0,
      failed: 0,
      results: [],
      message: "No system checks to run",
    });
  }

  // 2. Build handler registry with a minimal container shim for DB access
  const registry = buildHandlerRegistry(db);

  const opCtx = {
    tenantId: tenantUuid,
    actorId: context.userId,
    actorType: "SYSTEM" as const,
    correlationId: crypto.randomUUID(),
    entityCode: body.entityCode,
  };

  // 3. Execute each handler and update checklist status
  const results: RunChecksTaskResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const task of tasks) {
    const handler = registry.get(task.system_check_handler);
    if (!handler) {
      // Config issue — record it but don't change task status
      const missingMsg = `Handler '${task.system_check_handler}' not registered`;
      const missingJson = JSON.stringify({
        passed: false,
        message: missingMsg,
        evidence: { handlerCode: task.system_check_handler },
        evidenceCode: null,
        nextSuggestedAction: "Verify handler registration during module startup",
      });
      await sql`
        UPDATE fin.period_close_checklist
        SET
          last_handler_run_at = NOW(),
          last_handler_result = ${missingJson}::jsonb,
          handler_run_count = handler_run_count + 1,
          updated_at = NOW(),
          updated_by = ${context.userId}
        WHERE id = ${task.checklist_id}
          AND tenant_id = ${tenantUuid}
      `.execute(db);
      results.push({
        taskCode: task.task_code,
        taskName: task.task_name,
        passed: false,
        evidenceCode: null,
        message: missingMsg,
      });
      failedCount++;
      continue;
    }

    let handlerResult: CloseHandlerResult;
    try {
      handlerResult = await handler.execute(opCtx, {
        entityCode: body.entityCode,
        fiscalYear: body.fiscalYear,
        periodNumber: body.periodNumber,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      handlerResult = {
        passed: false,
        evidenceCode: "RUN_FAILED",
        message: `Handler threw: ${errMsg}`,
        evidence: {},
      };
    }

    // Update handler telemetry + status in a single UPDATE
    const runCount = (task.handler_run_count ?? 0) + 1;
    const resultJson = JSON.stringify({
      passed: handlerResult.passed,
      message: handlerResult.message,
      evidence: handlerResult.evidence,
      evidenceCode: handlerResult.evidenceCode,
      nextSuggestedAction: handlerResult.nextSuggestedAction ?? null,
    });

    if (handlerResult.passed) {
      await sql`
        UPDATE fin.period_close_checklist
        SET
          last_handler_run_at = NOW(),
          last_handler_result = ${resultJson}::jsonb,
          handler_run_count = ${runCount},
          task_status = 'COMPLETED',
          completed_by = ${context.userId},
          completed_at = NOW(),
          completion_notes = ${handlerResult.message},
          failure_reason = NULL,
          failed_at = NULL,
          updated_at = NOW(),
          updated_by = ${context.userId}
        WHERE id = ${task.checklist_id}
          AND tenant_id = ${tenantUuid}
      `.execute(db);
    } else {
      await sql`
        UPDATE fin.period_close_checklist
        SET
          last_handler_run_at = NOW(),
          last_handler_result = ${resultJson}::jsonb,
          handler_run_count = ${runCount},
          task_status = 'FAILED',
          failure_reason = ${handlerResult.message},
          failed_at = NOW(),
          completed_by = NULL,
          completed_at = NULL,
          completion_notes = NULL,
          updated_at = NOW(),
          updated_by = ${context.userId}
        WHERE id = ${task.checklist_id}
          AND tenant_id = ${tenantUuid}
      `.execute(db);
    }

    // Write activity log entry for this handler execution
    const activityType = handlerResult.passed ? "HANDLER_EXECUTED" : "HANDLER_FAILED";
    await sql`
      INSERT INTO fin.period_close_activity (
        tenant_id, entity_code, fiscal_year, period_number,
        checklist_id, task_code, activity_type, actor_type, actor_id,
        message, payload
      ) VALUES (
        ${tenantUuid}, ${body.entityCode}, ${body.fiscalYear}, ${body.periodNumber},
        ${task.checklist_id}, ${task.task_code}, ${activityType}, 'system', ${context.userId},
        ${handlerResult.message},
        ${JSON.stringify({
          handlerCode: task.system_check_handler,
          evidenceCode: handlerResult.evidenceCode,
          passed: handlerResult.passed,
        })}::jsonb
      )
    `.execute(db);

    results.push({
      taskCode: task.task_code,
      taskName: task.task_name,
      passed: handlerResult.passed,
      evidenceCode: handlerResult.evidenceCode ?? null,
      message: handlerResult.message,
    });

    if (handlerResult.passed) passedCount++;
    else failedCount++;
  }

  const summaryMessage = `${results.length} check(s) executed: ${passedCount} passed, ${failedCount} failed`;

  // Write batch summary activity
  if (results.length > 0) {
    await sql`
      INSERT INTO fin.period_close_activity (
        tenant_id, entity_code, fiscal_year, period_number,
        activity_type, actor_type, actor_id,
        message, payload
      ) VALUES (
        ${tenantUuid}, ${body.entityCode}, ${body.fiscalYear}, ${body.periodNumber},
        'HANDLER_EXECUTED', 'user', ${context.userId},
        ${`Run All Checks: ${summaryMessage}`},
        ${JSON.stringify({
          batchRun: true,
          targetStatus: body.targetStatus ?? "all",
          executed: results.length,
          passed: passedCount,
          failed: failedCount,
          taskCodes: results.map((r) => r.taskCode),
        })}::jsonb
      )
    `.execute(db);
  }

  return successResponse({
    executed: results.length,
    passed: passedCount,
    failed: failedCount,
    results,
    message: summaryMessage,
  });
}

// ---------------------------------------------------------------------------
// Handler registry builder
//
// Bridge pattern: the BFF route instantiates handlers directly with a minimal
// Container shim (resolving only "db") rather than wiring up the full
// PeriodCloseService + repos. This avoids duplicating handler logic while
// keeping the BFF self-contained. When a dedicated runtime API surface exists
// for close governance, this can delegate to it instead.
// ---------------------------------------------------------------------------

function buildHandlerRegistry(db: any): CloseHandlerRegistry {
  const container = new Container();
  container.register("db", () => db, "singleton");

  const registry = new CloseHandlerRegistry();
  registry.register(new TrialBalanceCloseHandler(container));
  registry.register(new DepreciationCheckHandler(container));
  registry.register(new FxRevaluationCheckHandler(container));
  registry.register(new BankReconCheckHandler(container));

  return registry;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

/**
 * Map a DB row to a stable DTO shape.
 * Every optional field is explicitly set to null (never omitted)
 * so the UI can rely on key presence without optional chaining.
 */
function mapChecklistRow(row: any) {
  // Normalize lastHandlerResult — ensure all keys present with null defaults
  let lastHandlerResult = row.last_handler_result ?? null;
  if (lastHandlerResult && typeof lastHandlerResult === "object") {
    lastHandlerResult = {
      passed: lastHandlerResult.passed ?? false,
      message: lastHandlerResult.message ?? "",
      evidence: lastHandlerResult.evidence ?? {},
      evidenceCode: lastHandlerResult.evidenceCode ?? null,
      nextSuggestedAction: lastHandlerResult.nextSuggestedAction ?? null,
    };
  }

  return {
    id: row.id,
    taskId: row.task_id,
    taskCode: row.task_code,
    taskStatus: row.task_status,
    isMandatory: row.is_mandatory ?? false,
    assignedTo: row.assigned_to ?? null,
    assignedRole: row.assigned_role ?? null,
    assignedUserId: row.assigned_user_id ?? null,
    dueAt: row.due_at?.toISOString() ?? null,
    completedBy: row.completed_by ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    completionNotes: row.completion_notes ?? null,
    evidencePayload: row.evidence_payload ?? {},
    failureReason: row.failure_reason ?? null,
    failedAt: row.failed_at?.toISOString() ?? null,
    waiverStatus: row.waiver_status ?? null,
    waiverReason: row.waiver_reason ?? null,
    waivedBy: row.waived_by ?? null,
    waivedAt: row.waived_at?.toISOString() ?? null,
    lastHandlerRunAt: row.last_handler_run_at?.toISOString() ?? null,
    lastHandlerResult,
    handlerRunCount: row.handler_run_count ?? 0,
    task: {
      id: row.task_id,
      taskCode: row.task_code,
      taskName: row.task_name ?? "",
      description: row.task_description ?? null,
      category: row.category,
      requiredBefore: row.required_before,
      sortOrder: row.sort_order ?? 0,
      isMandatory: row.is_mandatory ?? false,
      isWaivable: row.is_waivable ?? false,
      completionMode: row.completion_mode,
      systemCheckHandler: row.system_check_handler ?? null,
      defaultOwnerRole: row.default_owner_role ?? null,
      slaHours: row.sla_hours ?? null,
      severity: row.severity ?? null,
      waiverRequiresApproval: row.waiver_requires_approval ?? false,
    },
  };
}
