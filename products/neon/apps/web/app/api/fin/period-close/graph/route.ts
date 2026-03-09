/**
 * Period Close Orchestration Graph API
 *
 * GET  /api/fin/period-close/graph?entityCode=...&fiscalYear=...&periodNumber=...
 *   → full graph with nodes, readiness, blockers, predictions
 *
 * GET  /api/fin/period-close/graph?entityCode=...&fiscalYear=...&periodNumber=...&view=ready
 *   → ready-now task queue
 *
 * GET  /api/fin/period-close/graph?entityCode=...&fiscalYear=...&periodNumber=...&view=blockers&targetStatus=SOFT_CLOSE
 *   → blocking task details
 *
 * GET  /api/fin/period-close/graph?entityCode=...&fiscalYear=...&periodNumber=...&view=critical-path&targetStatus=SOFT_CLOSE
 *   → critical path chain
 *
 * GET  /api/fin/period-close/graph?entityCode=...&fiscalYear=...&periodNumber=...&view=predict&targetStatus=SOFT_CLOSE
 *   → close readiness forecast
 *
 * GET  /api/fin/period-close/graph?entityCode=...&fiscalYear=...&periodNumber=...&view=delay-impact&taskCode=RECON_BANK&delayMinutes=120
 *   → delay impact analysis ("If task X delays by 2h, close shifts by 1.7h")
 *
 * GET  /api/fin/period-close/graph?entityCode=...&fiscalYear=...&periodNumber=...&view=parallel-opportunities&targetStatus=SOFT_CLOSE
 *   → parallelization recommendations with per-layer task grouping
 *
 * GET  /api/fin/period-close/graph?entityCode=...&view=validate
 *   → template graph validation (no period required)
 *
 * POST /api/fin/period-close/graph/snapshot?entityCode=...&fiscalYear=...&periodNumber=...&targetStatus=SOFT_CLOSE&snapshotSource=manual
 *   → capture orchestration snapshot (snapshotSource: manual|scheduled|period_transition|auto_handler|api_call)
 *
 * GET  /api/fin/period-close/graph?entityCode=...&fiscalYear=...&periodNumber=...&view=snapshots&targetStatus=SOFT_CLOSE
 *   → snapshot history (time series)
 *
 * Phase 5.1 Hardening:
 *   - Centralized satisfaction semantics (computeDependencySatisfaction)
 *   - FAILED readiness state (self-failed vs blocked-by-predecessor)
 *   - WAIVED readiness only SATISFIED when waiver is approved/not_required
 *   - HARD_CLOSE target includes SOFT_CLOSE prerequisites (isTaskRequiredForTarget)
 *   - Missing-estimate tasks exposed in prediction
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

import type {
  PeriodCloseTaskNode,
  PeriodCloseGraphResult,
  ReadyTaskResult,
  BlockingTaskResult,
  CriticalPathResult,
  ClosePredictionResult,
  GraphValidationResult,
  ChecklistTaskStatus,
  CloseGateTarget,
  CloseTaskCategory,
  CloseTaskCompletionMode,
  CloseTaskSeverity,
  TaskReadinessState,
  DependencySatisfactionResult,
  DependencySatisfactionMode,
  SnapshotSource,
} from "@athyper/runtime/services/business/engines/posting-engine";

// Import centralized domain helpers — single source of truth
import {
  computeDependencySatisfaction,
  isTaskRequiredForTarget,
} from "@athyper/runtime/services/business/engines/posting-engine";

// ---------------------------------------------------------------------------
// GET — graph views
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
    const view = url.searchParams.get("view") ?? "full";
    const targetStatus = url.searchParams.get("targetStatus") as CloseGateTarget | null;

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    // Validate-only mode (no period needed)
    if (view === "validate") {
      return await handleValidate(db, tenantUuid, entityCode);
    }

    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    if (isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "fiscalYear and periodNumber are required for graph computation", 400);
    }

    // Snapshot history view
    if (view === "snapshots") {
      if (!targetStatus) {
        return errorResponse("VALIDATION", "targetStatus is required for snapshots view", 400);
      }
      return await handleListSnapshots(db, tenantUuid, entityCode, fiscalYear, periodNumber, targetStatus, url);
    }

    // Load all inputs
    const [tasks, deps, checklist] = await Promise.all([
      loadTasks(db, tenantUuid, entityCode),
      loadDependencies(db, tenantUuid, entityCode),
      loadChecklist(db, tenantUuid, entityCode, fiscalYear, periodNumber),
    ]);

    if (checklist.length === 0) {
      return errorResponse("NOT_FOUND", "No checklist found for this period. Materialize the checklist first.", 404);
    }

    const graph = computeGraph(tasks, deps, checklist);

    // Enrich graph nodes with active risk signal counts
    const signalCountMap = await loadActiveSignalCounts(
      db, tenantUuid, entityCode, fiscalYear, periodNumber,
    );
    enrichGraphWithSignals(graph, signalCountMap);

    switch (view) {
      case "ready":
        return successResponse({
          data: extractReadyTasks(graph, tasks),
        });

      case "blockers":
        return successResponse({
          data: extractBlockers(graph, targetStatus),
        });

      case "critical-path":
        return successResponse({
          data: computeCriticalPath(graph, targetStatus),
        });

      case "predict": {
        if (!targetStatus) {
          return errorResponse("VALIDATION", "targetStatus is required for predict view", 400);
        }
        return successResponse({
          data: computePrediction(graph, targetStatus),
        });
      }

      case "delay-impact": {
        const delayTaskCode = url.searchParams.get("taskCode");
        const delayMinutes = parseInt(url.searchParams.get("delayMinutes") ?? "60", 10);
        if (!delayTaskCode) {
          return errorResponse("VALIDATION", "taskCode is required for delay-impact view", 400);
        }
        return successResponse({
          data: computeDelayImpact(graph, delayTaskCode, delayMinutes, targetStatus ?? "SOFT_CLOSE"),
        });
      }

      case "parallel-opportunities": {
        return successResponse({
          data: computeParallelOpportunities(graph, targetStatus ?? "SOFT_CLOSE"),
        });
      }

      case "full":
      default: {
        const activeSignalCount = [...signalCountMap.values()].reduce((a, b) => a + b, 0);
        const effectiveTarget = targetStatus ?? "SOFT_CLOSE";
        return successResponse({
          data: {
            graph,
            ready: extractReadyTasks(graph, tasks),
            criticalPath: computeCriticalPath(graph, effectiveTarget),
            prediction: computePrediction(graph, effectiveTarget),
            parallelOpportunities: computeParallelOpportunities(graph, effectiveTarget),
            activeSignalCount,
          },
        });
      }
    }
  } catch (error) {
    console.error("[GET /api/fin/period-close/graph] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to compute close orchestration graph");
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
    const url = new URL(req.url);

    const entityCode = url.searchParams.get("entityCode");
    const targetStatus = url.searchParams.get("targetStatus") as CloseGateTarget | null;
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    const snapshotSource = (url.searchParams.get("snapshotSource") ?? "api_call") as SnapshotSource;
    const validSources: SnapshotSource[] = ["manual", "scheduled", "period_transition", "auto_handler", "api_call"];

    if (!entityCode || !targetStatus || isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, periodNumber, and targetStatus are required", 400);
    }
    if (!validSources.includes(snapshotSource)) {
      return errorResponse("VALIDATION", `Invalid snapshotSource. Must be one of: ${validSources.join(", ")}`, 400);
    }

    // Load and compute graph
    const [tasks, deps, checklist] = await Promise.all([
      loadTasks(db, tenantUuid, entityCode),
      loadDependencies(db, tenantUuid, entityCode),
      loadChecklist(db, tenantUuid, entityCode, fiscalYear, periodNumber),
    ]);

    if (checklist.length === 0) {
      return errorResponse("NOT_FOUND", "No checklist found for this period", 404);
    }

    const graph = computeGraph(tasks, deps, checklist);
    const prediction = computePrediction(graph, targetStatus);

    // Filter counts to tasks relevant for target
    const relevantNodes = graph.nodes.filter(
      (n) => isTaskRequiredForTarget(n.requiredBefore, targetStatus),
    );

    // Insert snapshot
    const triggeredBy = context.userId ?? "api_call";
    const result = await sql`
      INSERT INTO fin.close_orchestration_snapshot (
        tenant_id, entity_code, fiscal_year, period_number,
        target_status, total_tasks, satisfied_count, ready_count,
        blocked_count, failed_count, not_ready_count, in_progress_count,
        critical_path_minutes, predicted_ready_at,
        blocker_task_codes, failed_task_codes,
        confidence, snapshot_source, computation_version, triggered_by
      ) VALUES (
        ${tenantUuid}, ${entityCode}, ${fiscalYear}, ${periodNumber},
        ${targetStatus},
        ${relevantNodes.length},
        ${relevantNodes.filter((n) => n.readinessState === "SATISFIED").length},
        ${relevantNodes.filter((n) => n.readinessState === "READY").length},
        ${relevantNodes.filter((n) => n.readinessState === "BLOCKED").length},
        ${relevantNodes.filter((n) => n.readinessState === "FAILED").length},
        ${relevantNodes.filter((n) => n.readinessState === "NOT_READY").length},
        ${relevantNodes.filter((n) => n.readinessState === "IN_PROGRESS").length},
        ${prediction.criticalPathMinutes ?? 0},
        ${prediction.predictedReadyAt ? new Date(prediction.predictedReadyAt) : null},
        ${JSON.stringify(prediction.blockerTaskCodes)}::jsonb,
        ${JSON.stringify(prediction.failedTaskCodes)}::jsonb,
        ${prediction.confidence},
        ${snapshotSource},
        ${"v5.1"},
        ${triggeredBy}
      ) RETURNING id, snapshot_at, snapshot_source
    `.execute(db);

    const row = (result.rows as any[])[0];

    return successResponse({
      data: {
        snapshotId: row.id,
        snapshotAt: row.snapshot_at,
        snapshotSource: row.snapshot_source,
        targetStatus,
        totalTasks: relevantNodes.length,
        satisfiedCount: relevantNodes.filter((n) => n.readinessState === "SATISFIED").length,
        criticalPathMinutes: prediction.criticalPathMinutes,
        predictedReadyAt: prediction.predictedReadyAt,
        confidence: prediction.confidence,
        blockerTaskCodes: prediction.blockerTaskCodes,
        failedTaskCodes: prediction.failedTaskCodes,
      },
    });
  } catch (error) {
    console.error("[POST /api/fin/period-close/graph] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to capture orchestration snapshot");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Signal enrichment — cross-references active risk signals with graph nodes
// ---------------------------------------------------------------------------

/**
 * Load active risk signals and extract per-task signal counts from the
 * `evidence->>'affectedTaskCodes'` JSONB field. Returns a Map<taskCode, count>.
 */
async function loadActiveSignalCounts(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
): Promise<Map<string, number>> {
  const result = await sql`
    SELECT evidence
    FROM fin.close_risk_signal
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear}
      AND period_number = ${periodNumber}
      AND signal_state IN ('fired', 'acknowledged')
  `.execute(db);

  const counts = new Map<string, number>();
  for (const row of result.rows as Array<{ evidence: Record<string, unknown> | null }>) {
    const evidence = row.evidence;
    if (!evidence) continue;
    const codes = evidence.affectedTaskCodes;
    if (!Array.isArray(codes)) continue;
    for (const code of codes) {
      if (typeof code === "string") {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * Enrich graph nodes with active signal counts in-place.
 */
function enrichGraphWithSignals(
  graph: PeriodCloseGraphResult,
  signalCountMap: Map<string, number>,
): void {
  for (const node of graph.nodes) {
    node.activeSignalCount = signalCountMap.get(node.taskCode) ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  tenant_id: string;
  entity_code: string;
  task_code: string;
  task_name: string;
  category: string;
  required_before: string;
  sort_order: number;
  is_mandatory: boolean;
  is_waivable: boolean;
  completion_mode: string;
  system_check_handler: string | null;
  is_active: boolean;
  severity: string | null;
  estimated_duration_minutes: number | null;
  orchestration_group: string | null;
  auto_start_when_ready: boolean;
}

interface DepRow {
  id: string;
  tenant_id: string;
  predecessor_task_id: string;
  successor_task_id: string;
  dependency_type: string;
  satisfaction_mode: string;
  is_hard_block: boolean;
}

interface ChecklistRow {
  id: string;
  task_id: string;
  task_code: string;
  task_status: string;
  is_mandatory: boolean;
  assigned_role: string | null;
  assigned_user_id: string | null;
  due_at: Date | null;
  completed_at: Date | null;
  waived_at: Date | null;
  waiver_status: string | null;
}

async function loadTasks(db: any, tenantUuid: string, entityCode: string): Promise<TaskRow[]> {
  const result = await sql`
    SELECT id, tenant_id, entity_code, task_code, task_name, category,
           required_before, sort_order, is_mandatory, is_waivable,
           completion_mode, system_check_handler, is_active,
           severity, estimated_duration_minutes, orchestration_group,
           COALESCE(auto_start_when_ready, false) AS auto_start_when_ready
    FROM fin.period_close_task
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      AND is_active = true
    ORDER BY sort_order
  `.execute(db);
  return result.rows as TaskRow[];
}

async function loadDependencies(db: any, tenantUuid: string, entityCode: string): Promise<DepRow[]> {
  const result = await sql`
    SELECT d.id, d.tenant_id, d.predecessor_task_id, d.successor_task_id,
           d.dependency_type, d.satisfaction_mode, d.is_hard_block
    FROM fin.period_close_task_dependency d
    JOIN fin.period_close_task p ON p.id = d.predecessor_task_id
    WHERE d.tenant_id = ${tenantUuid}
      AND p.entity_code = ${entityCode}
  `.execute(db);
  return result.rows as DepRow[];
}

async function loadChecklist(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
): Promise<ChecklistRow[]> {
  const result = await sql`
    SELECT id, task_id, task_code, task_status, is_mandatory,
           assigned_role, assigned_user_id, due_at,
           completed_at, waived_at, waiver_status
    FROM fin.period_close_checklist
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear}
      AND period_number = ${periodNumber}
    ORDER BY task_code
  `.execute(db);
  return result.rows as ChecklistRow[];
}

// ---------------------------------------------------------------------------
// Snapshot history
// ---------------------------------------------------------------------------

async function handleListSnapshots(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
  targetStatus: CloseGateTarget, url: URL,
) {
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const since = url.searchParams.get("since");

  let result;
  if (since) {
    result = await sql`
      SELECT * FROM fin.close_orchestration_snapshot
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
        AND target_status = ${targetStatus}
        AND snapshot_at >= ${new Date(since)}
      ORDER BY snapshot_at DESC
      LIMIT ${limit}
    `.execute(db);
  } else {
    result = await sql`
      SELECT * FROM fin.close_orchestration_snapshot
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND fiscal_year = ${fiscalYear}
        AND period_number = ${periodNumber}
        AND target_status = ${targetStatus}
      ORDER BY snapshot_at DESC
      LIMIT ${limit}
    `.execute(db);
  }

  return successResponse({ data: result.rows });
}

// ---------------------------------------------------------------------------
// Validate — template graph integrity
// ---------------------------------------------------------------------------

async function handleValidate(db: any, tenantUuid: string, entityCode: string) {
  const tasks = await loadTasks(db, tenantUuid, entityCode);
  const deps = await loadDependencies(db, tenantUuid, entityCode);

  const errors: GraphValidationResult["errors"] = [];
  const taskIds = new Set(tasks.map((t) => t.id));

  for (const dep of deps) {
    if (!taskIds.has(dep.predecessor_task_id)) {
      errors.push({ code: "INVALID_PREDECESSOR", message: `Non-existent predecessor ${dep.predecessor_task_id}` });
    }
    if (!taskIds.has(dep.successor_task_id)) {
      errors.push({ code: "INVALID_SUCCESSOR", message: `Non-existent successor ${dep.successor_task_id}` });
    }
  }

  const cycleResult = detectCycles(tasks, deps);
  if (cycleResult.hasCycle) {
    errors.push({
      code: "CYCLE_DETECTED",
      message: `Cycle: ${cycleResult.cycleTasks.join(", ")}`,
      taskCodes: cycleResult.cycleTasks,
    });
  }

  return successResponse({ data: { valid: errors.length === 0, errors } });
}

// ---------------------------------------------------------------------------
// Graph computation — uses centralized domain helpers
// ---------------------------------------------------------------------------

function detectCycles(
  tasks: TaskRow[], deps: DepRow[],
): { hasCycle: boolean; cycleTasks: string[] } {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const codeById = new Map<string, string>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    adj.set(t.id, []);
    codeById.set(t.id, t.task_code);
  }

  for (const d of deps) {
    if (!inDegree.has(d.predecessor_task_id) || !inDegree.has(d.successor_task_id)) continue;
    adj.get(d.predecessor_task_id)!.push(d.successor_task_id);
    inDegree.set(d.successor_task_id, (inDegree.get(d.successor_task_id) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let sorted = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted++;
    for (const succ of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  if (sorted === tasks.length) return { hasCycle: false, cycleTasks: [] };

  const cycleTasks: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg > 0) {
      const code = codeById.get(id);
      if (code) cycleTasks.push(code);
    }
  }
  return { hasCycle: true, cycleTasks };
}

function computeGraph(
  tasks: TaskRow[], deps: DepRow[], checklist: ChecklistRow[],
): PeriodCloseGraphResult {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const taskByCode = new Map(tasks.map((t) => [t.task_code, t]));
  const clByCode = new Map(checklist.map((c) => [c.task_code, c]));
  const clCodes = new Set(checklist.map((c) => c.task_code));

  // Build adjacency
  const predMap = new Map<string, Array<{ taskCode: string; satisfactionMode: string; isHardBlock: boolean }>>();
  const succMap = new Map<string, string[]>();

  for (const dep of deps) {
    const pred = taskById.get(dep.predecessor_task_id);
    const succ = taskById.get(dep.successor_task_id);
    if (!pred || !succ || !clCodes.has(pred.task_code) || !clCodes.has(succ.task_code)) continue;

    if (!predMap.has(succ.task_code)) predMap.set(succ.task_code, []);
    predMap.get(succ.task_code)!.push({
      taskCode: pred.task_code,
      satisfactionMode: dep.satisfaction_mode,
      isHardBlock: dep.is_hard_block,
    });

    if (!succMap.has(pred.task_code)) succMap.set(pred.task_code, []);
    succMap.get(pred.task_code)!.push(succ.task_code);
  }

  const cycleResult = detectCycles(
    tasks.filter((t) => clCodes.has(t.task_code)),
    deps,
  );

  // Satisfaction — uses centralized helper
  const satisfactionByCode = new Map<string, DependencySatisfactionResult>();
  for (const cl of checklist) {
    satisfactionByCode.set(cl.task_code, computeDependencySatisfaction(cl.task_status, cl.waiver_status, "satisfied"));
  }

  // Readiness — hardened: FAILED, WAIVED-pending, BLOCKED-self
  const readinessMap = new Map<string, TaskReadinessState>();
  const blockedByMap = new Map<string, string[]>();

  for (const cl of checklist) {
    // Terminal: COMPLETED
    if (cl.task_status === "COMPLETED") {
      readinessMap.set(cl.task_code, "SATISFIED");
      blockedByMap.set(cl.task_code, []);
      continue;
    }

    // WAIVED: only SATISFIED if waiver approved/not_required
    if (cl.task_status === "WAIVED") {
      if (cl.waiver_status === "approved" || cl.waiver_status === "not_required") {
        readinessMap.set(cl.task_code, "SATISFIED");
      } else {
        readinessMap.set(cl.task_code, "BLOCKED");
      }
      blockedByMap.set(cl.task_code, []);
      continue;
    }

    // FAILED: task itself failed — needs retry/intervention
    if (cl.task_status === "FAILED") {
      readinessMap.set(cl.task_code, "FAILED");
      blockedByMap.set(cl.task_code, []);
      continue;
    }

    // BLOCKED (checklist status): set explicitly by close service
    if (cl.task_status === "BLOCKED") {
      readinessMap.set(cl.task_code, "BLOCKED");
      blockedByMap.set(cl.task_code, []);
      continue;
    }

    if (cl.task_status === "IN_PROGRESS") {
      readinessMap.set(cl.task_code, "IN_PROGRESS");
      blockedByMap.set(cl.task_code, []);
      continue;
    }

    // PENDING: evaluate predecessors
    const preds = predMap.get(cl.task_code) ?? [];
    if (preds.length === 0) {
      readinessMap.set(cl.task_code, "READY");
      blockedByMap.set(cl.task_code, []);
      continue;
    }

    const blockers: string[] = [];
    let allSatisfied = true;

    for (const pred of preds) {
      const predCl = clByCode.get(pred.taskCode);
      if (!predCl) continue;
      const sat = computeDependencySatisfaction(predCl.task_status, predCl.waiver_status, pred.satisfactionMode);
      if (sat !== "SATISFIED") {
        allSatisfied = false;
        if (pred.isHardBlock || sat === "FAILED_BLOCKING") blockers.push(pred.taskCode);
      }
    }

    blockedByMap.set(cl.task_code, blockers);
    if (blockers.length > 0) readinessMap.set(cl.task_code, "BLOCKED");
    else if (!allSatisfied) readinessMap.set(cl.task_code, "NOT_READY");
    else readinessMap.set(cl.task_code, "READY");
  }

  // Downstream impact
  const impactMap = new Map<string, number>();
  for (const cl of checklist) {
    impactMap.set(cl.task_code, countDownstream(cl.task_code, succMap, new Set()));
  }

  // Forward-pass prediction
  const now = new Date();
  const earliestStart = new Map<string, Date>();
  const predictedFinish = new Map<string, Date>();
  const topoOrder = topoSort([...clCodes], predMap);

  for (const code of topoOrder) {
    const task = taskByCode.get(code);
    const cl = clByCode.get(code);
    if (!task || !cl) continue;

    const readiness = readinessMap.get(code);
    const duration = task.estimated_duration_minutes ?? 0;

    if (readiness === "SATISFIED") {
      const doneAt = cl.completed_at ?? cl.waived_at ?? now;
      earliestStart.set(code, doneAt);
      predictedFinish.set(code, doneAt);
      continue;
    }

    const preds = predMap.get(code) ?? [];
    let maxPredFinish = now;
    for (const pred of preds) {
      const pf = predictedFinish.get(pred.taskCode);
      if (pf && pf > maxPredFinish) maxPredFinish = pf;
    }

    const start = (readiness === "READY" || readiness === "IN_PROGRESS") ? now : maxPredFinish;
    earliestStart.set(code, start);
    predictedFinish.set(code, new Date(start.getTime() + duration * 60_000));
  }

  // Build nodes
  const nodes: PeriodCloseTaskNode[] = checklist.map((cl) => {
    const task = taskByCode.get(cl.task_code);
    return {
      checklistId: cl.id,
      taskId: cl.task_id,
      taskCode: cl.task_code,
      taskName: task?.task_name ?? cl.task_code,
      category: (task?.category ?? "SUBLEDGER") as CloseTaskCategory,
      requiredBefore: (task?.required_before ?? "SOFT_CLOSE") as CloseGateTarget,
      completionMode: (task?.completion_mode ?? "MANUAL") as CloseTaskCompletionMode,
      status: cl.task_status as ChecklistTaskStatus,
      readinessState: readinessMap.get(cl.task_code) ?? ("NOT_READY" as TaskReadinessState),
      satisfactionState: satisfactionByCode.get(cl.task_code) ?? ("UNSATISFIED" as DependencySatisfactionResult),
      predecessorTaskCodes: (predMap.get(cl.task_code) ?? []).map((p) => p.taskCode),
      successorTaskCodes: succMap.get(cl.task_code) ?? [],
      blockedByTaskCodes: blockedByMap.get(cl.task_code) ?? [],
      downstreamImpactCount: impactMap.get(cl.task_code) ?? 0,
      estimatedDurationMinutes: task?.estimated_duration_minutes ?? null,
      severity: (task?.severity ?? null) as CloseTaskSeverity | null,
      orchestrationGroup: task?.orchestration_group ?? null,
      assignedRole: cl.assigned_role,
      assignedUserId: cl.assigned_user_id,
      dueAt: cl.due_at?.toISOString() ?? null,
      earliestStartAt: earliestStart.get(cl.task_code)?.toISOString() ?? null,
      predictedFinishAt: predictedFinish.get(cl.task_code)?.toISOString() ?? null,
      activeSignalCount: 0,
    };
  });

  let edgeCount = 0;
  for (const dep of deps) {
    const p = taskById.get(dep.predecessor_task_id);
    const s = taskById.get(dep.successor_task_id);
    if (p && s && clCodes.has(p.task_code) && clCodes.has(s.task_code)) edgeCount++;
  }

  return {
    nodes,
    edgeCount,
    hasCycle: cycleResult.hasCycle,
    cycleTaskCodes: cycleResult.cycleTasks,
    totalTasks: checklist.length,
    satisfiedCount: nodes.filter((n) => n.readinessState === "SATISFIED").length,
    readyCount: nodes.filter((n) => n.readinessState === "READY").length,
    blockedCount: nodes.filter((n) => n.readinessState === "BLOCKED").length,
    failedCount: nodes.filter((n) => n.readinessState === "FAILED").length,
    notReadyCount: nodes.filter((n) => n.readinessState === "NOT_READY").length,
    inProgressCount: nodes.filter((n) => n.readinessState === "IN_PROGRESS").length,
  };
}

function countDownstream(code: string, succMap: Map<string, string[]>, visited: Set<string>): number {
  let count = 0;
  for (const succ of succMap.get(code) ?? []) {
    if (visited.has(succ)) continue;
    visited.add(succ);
    count += 1 + countDownstream(succ, succMap, visited);
  }
  return count;
}

function topoSort(
  codes: string[],
  predMap: Map<string, Array<{ taskCode: string }>>,
): string[] {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const codeSet = new Set(codes);

  for (const c of codes) { inDeg.set(c, 0); adj.set(c, []); }

  for (const [succ, preds] of predMap) {
    if (!codeSet.has(succ)) continue;
    const validPreds = preds.filter((p) => codeSet.has(p.taskCode));
    inDeg.set(succ, validPreds.length);
    for (const p of validPreds) {
      adj.get(p.taskCode)!.push(succ);
    }
  }

  const queue: string[] = [];
  for (const [c, d] of inDeg) { if (d === 0) queue.push(c); }

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const succ of adj.get(node) ?? []) {
      const nd = (inDeg.get(succ) ?? 1) - 1;
      inDeg.set(succ, nd);
      if (nd === 0) queue.push(succ);
    }
  }

  for (const c of codes) { if (!result.includes(c)) result.push(c); }
  return result;
}

function extractReadyTasks(graph: PeriodCloseGraphResult, tasks: TaskRow[]): ReadyTaskResult[] {
  const taskByCode = new Map(tasks.map((t) => [t.task_code, t]));
  return graph.nodes
    .filter((n) => n.readinessState === "READY")
    .map((n) => ({
      taskCode: n.taskCode,
      taskName: n.taskName,
      category: n.category,
      completionMode: n.completionMode,
      severity: n.severity,
      estimatedDurationMinutes: n.estimatedDurationMinutes,
      downstreamImpactCount: n.downstreamImpactCount,
      assignedRole: n.assignedRole,
      orchestrationGroup: n.orchestrationGroup,
      autoStartWhenReady: taskByCode.get(n.taskCode)?.auto_start_when_ready ?? false,
    }));
}

function extractBlockers(graph: PeriodCloseGraphResult, targetStatus: CloseGateTarget | null): BlockingTaskResult[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.taskCode, n]));
  const blockers: BlockingTaskResult[] = [];

  for (const node of graph.nodes) {
    // Include BLOCKED and FAILED nodes as actionable blockers
    if (node.readinessState !== "BLOCKED" && node.readinessState !== "FAILED") continue;
    if (targetStatus && !isTaskRequiredForTarget(node.requiredBefore, targetStatus)) continue;

    if (node.readinessState === "FAILED") {
      // Self-failed: this task IS the blocker
      blockers.push({
        blockedTaskCode: node.taskCode,
        blockedTaskName: node.taskName,
        blockerTaskCode: node.taskCode,
        blockerTaskName: node.taskName,
        blockerStatus: node.status,
        blockerSatisfactionState: node.satisfactionState,
        downstreamImpactCount: node.downstreamImpactCount,
        targetCloseImpact: node.requiredBefore,
      });
      continue;
    }

    for (const blockerCode of node.blockedByTaskCodes) {
      const blocker = nodeMap.get(blockerCode);
      if (!blocker) continue;
      blockers.push({
        blockedTaskCode: node.taskCode,
        blockedTaskName: node.taskName,
        blockerTaskCode: blocker.taskCode,
        blockerTaskName: blocker.taskName,
        blockerStatus: blocker.status,
        blockerSatisfactionState: blocker.satisfactionState,
        downstreamImpactCount: blocker.downstreamImpactCount,
        targetCloseImpact: node.requiredBefore,
      });
    }
  }
  return blockers;
}

/**
 * Critical path — hardened: HARD_CLOSE includes SOFT_CLOSE tasks
 */
function computeCriticalPath(graph: PeriodCloseGraphResult, targetStatus: CloseGateTarget | null): CriticalPathResult {
  const nodeMap = new Map(graph.nodes.map((n) => [n.taskCode, n]));
  const relevant = graph.nodes.filter((n) => {
    if (n.readinessState === "SATISFIED") return false;
    if (targetStatus && !isTaskRequiredForTarget(n.requiredBefore, targetStatus)) return false;
    return true;
  });

  if (relevant.length === 0) {
    return { targetStatus, totalEstimatedMinutes: 0, blockingMinutesRemaining: 0, path: [], dominantBlockerTaskCode: null };
  }

  const relevantCodes = new Set(relevant.map((n) => n.taskCode));
  const succMap = new Map<string, string[]>();
  const predMap = new Map<string, Array<{ taskCode: string }>>();

  for (const node of relevant) {
    succMap.set(node.taskCode, node.successorTaskCodes.filter((s) => relevantCodes.has(s)));
    predMap.set(node.taskCode, node.predecessorTaskCodes.filter((p) => relevantCodes.has(p)).map((p) => ({ taskCode: p })));
  }

  const order = topoSort([...relevantCodes], predMap);
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();

  for (const code of order) {
    dist.set(code, nodeMap.get(code)?.estimatedDurationMinutes ?? 0);
    prev.set(code, null);
  }

  for (const code of order) {
    const nd = dist.get(code) ?? 0;
    for (const succ of succMap.get(code) ?? []) {
      const sd = nodeMap.get(succ)?.estimatedDurationMinutes ?? 0;
      const candidate = nd + sd;
      if (candidate > (dist.get(succ) ?? 0)) {
        dist.set(succ, candidate);
        prev.set(succ, code);
      }
    }
  }

  let maxDist = 0;
  let endCode: string | null = null;
  for (const [code, d] of dist) {
    if (d >= maxDist) { maxDist = d; endCode = code; }
  }

  const pathCodes: string[] = [];
  let cur = endCode;
  while (cur) { pathCodes.unshift(cur); cur = prev.get(cur) ?? null; }

  const path = pathCodes.map((code) => {
    const n = nodeMap.get(code)!;
    return {
      taskCode: n.taskCode,
      taskName: n.taskName,
      status: n.status,
      readinessState: n.readinessState,
      estimatedDurationMinutes: n.estimatedDurationMinutes,
    };
  });

  const blocker = path.find((p) => p.readinessState === "BLOCKED" || p.readinessState === "FAILED");

  return {
    targetStatus,
    totalEstimatedMinutes: maxDist,
    blockingMinutesRemaining: maxDist,
    path,
    dominantBlockerTaskCode: blocker?.taskCode ?? null,
  };
}

/**
 * Prediction — hardened: target filtering, missing-estimate exposure, failed task codes
 */
function computePrediction(graph: PeriodCloseGraphResult, targetStatus: CloseGateTarget): ClosePredictionResult {
  const relevant = graph.nodes.filter(
    (n) => isTaskRequiredForTarget(n.requiredBefore, targetStatus),
  );
  const unsatisfied = relevant.filter((n) => n.readinessState !== "SATISFIED");

  if (unsatisfied.length === 0) {
    return {
      targetStatus,
      predictedReadyAt: new Date().toISOString(),
      totalRemainingMinutes: 0,
      criticalPathMinutes: 0,
      confidence: "high",
      blockerTaskCodes: [],
      tasksWithoutEstimate: [],
      failedTaskCodes: [],
      assumptions: ["All required tasks already satisfied"],
    };
  }

  let latestFinish: Date | null = null;
  let totalRemaining = 0;
  const blockerCodes: string[] = [];
  const failedCodes: string[] = [];
  const noEstimateCodes: string[] = [];
  const assumptions: string[] = [];

  for (const node of unsatisfied) {
    totalRemaining += node.estimatedDurationMinutes ?? 0;
    if (node.estimatedDurationMinutes == null) noEstimateCodes.push(node.taskCode);
    if (node.readinessState === "BLOCKED") blockerCodes.push(node.taskCode);
    if (node.readinessState === "FAILED" || node.status === "FAILED") failedCodes.push(node.taskCode);
    if (node.predictedFinishAt) {
      const finish = new Date(node.predictedFinishAt);
      if (!latestFinish || finish > latestFinish) latestFinish = finish;
    }
  }

  const critPath = computeCriticalPath(graph, targetStatus);

  let confidence: "low" | "medium" | "high";
  const actionableBlockers = blockerCodes.length + failedCodes.length;
  if (actionableBlockers > 1 || noEstimateCodes.length > unsatisfied.length / 2) confidence = "low";
  else if (actionableBlockers === 1 || noEstimateCodes.length > 0) confidence = "medium";
  else confidence = "high";

  if (noEstimateCodes.length > 0) assumptions.push(`${noEstimateCodes.length} task(s) have no duration estimate: ${noEstimateCodes.join(", ")}`);
  if (blockerCodes.length > 0) assumptions.push(`${blockerCodes.length} task(s) currently blocked`);
  if (failedCodes.length > 0) assumptions.push(`${failedCodes.length} task(s) currently failed`);
  assumptions.push("Sequential on critical path, parallel elsewhere");

  return {
    targetStatus,
    predictedReadyAt: latestFinish?.toISOString() ?? null,
    totalRemainingMinutes: totalRemaining,
    criticalPathMinutes: critPath.totalEstimatedMinutes,
    confidence,
    blockerTaskCodes: blockerCodes,
    tasksWithoutEstimate: noEstimateCodes,
    failedTaskCodes: failedCodes,
    assumptions,
  };
}

// ---------------------------------------------------------------------------
// Phase 8: Delay Impact Analysis
// ---------------------------------------------------------------------------

interface DelayImpactResult {
  taskCode: string;
  taskName: string;
  delayMinutes: number;
  isOnCriticalPath: boolean;
  closeShiftMinutes: number;
  affectedDownstreamTasks: Array<{
    taskCode: string;
    taskName: string;
    shiftMinutes: number;
  }>;
  mitigationHint: string | null;
}

function computeDelayImpact(
  graph: PeriodCloseGraphResult,
  taskCode: string,
  delayMinutes: number,
  targetStatus: CloseGateTarget,
): DelayImpactResult {
  const nodeMap = new Map(graph.nodes.map((n) => [n.taskCode, n]));
  const node = nodeMap.get(taskCode);

  if (!node) {
    return {
      taskCode,
      taskName: taskCode,
      delayMinutes,
      isOnCriticalPath: false,
      closeShiftMinutes: 0,
      affectedDownstreamTasks: [],
      mitigationHint: `Task ${taskCode} not found in graph`,
    };
  }

  // Compute original critical path
  const originalCritPath = computeCriticalPath(graph, targetStatus);
  const criticalTaskCodes = new Set(originalCritPath.path.map((p) => p.taskCode));
  const isOnCriticalPath = criticalTaskCodes.has(taskCode);

  // Propagate delay through the DAG (forward-pass from the delayed task)
  const delayShift = new Map<string, number>();
  delayShift.set(taskCode, delayMinutes);

  // BFS forward from the delayed task
  const queue = [taskCode];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentShift = delayShift.get(current) ?? 0;
    const currentNode = nodeMap.get(current);
    if (!currentNode) continue;

    for (const succCode of currentNode.successorTaskCodes) {
      const succNode = nodeMap.get(succCode);
      if (!succNode || succNode.readinessState === "SATISFIED") continue;

      // The successor absorbs the delay only if it would be pushed later
      // than its current earliest start (i.e., this predecessor is its bottleneck)
      const predFinishes = succNode.predecessorTaskCodes.map((pc) => {
        const pn = nodeMap.get(pc);
        if (!pn?.predictedFinishAt) return 0;
        const base = new Date(pn.predictedFinishAt).getTime();
        const shift = delayShift.get(pc) ?? 0;
        return base + shift * 60_000;
      });

      const currentNodeFinish = currentNode.predictedFinishAt
        ? new Date(currentNode.predictedFinishAt).getTime() + currentShift * 60_000
        : 0;

      const maxPredFinish = Math.max(...predFinishes, 0);

      // If the delayed predecessor is the bottleneck, propagate
      if (currentNodeFinish >= maxPredFinish) {
        const existingShift = delayShift.get(succCode) ?? 0;
        const newShift = Math.max(existingShift, currentShift);
        if (newShift > existingShift) {
          delayShift.set(succCode, newShift);
        }
      }

      queue.push(succCode);
    }
  }

  // Compute close shift = max shift on any relevant task
  const relevant = graph.nodes.filter(
    (n) => isTaskRequiredForTarget(n.requiredBefore, targetStatus) && n.readinessState !== "SATISFIED",
  );

  let closeShiftMinutes = 0;
  for (const n of relevant) {
    const shift = delayShift.get(n.taskCode) ?? 0;
    if (shift > closeShiftMinutes) closeShiftMinutes = shift;
  }

  // Affected downstream (excluding the source task itself)
  const affectedDownstreamTasks = Array.from(delayShift.entries())
    .filter(([code, shift]) => code !== taskCode && shift > 0)
    .map(([code, shift]) => ({
      taskCode: code,
      taskName: nodeMap.get(code)?.taskName ?? code,
      shiftMinutes: shift,
    }))
    .sort((a, b) => b.shiftMinutes - a.shiftMinutes);

  // Mitigation hint
  let mitigationHint: string | null = null;
  if (isOnCriticalPath && closeShiftMinutes > 0) {
    const parallelTasks = affectedDownstreamTasks.filter((t) => {
      const n = nodeMap.get(t.taskCode);
      return n && n.predecessorTaskCodes.length > 1;
    });
    if (parallelTasks.length > 0) {
      mitigationHint = `Task is on the critical path. Consider fast-tracking ${parallelTasks[0].taskCode} or adding resources to reduce the ${closeShiftMinutes}min close delay.`;
    } else {
      mitigationHint = `Task is on the critical path. A ${delayMinutes}min delay shifts the close by ${closeShiftMinutes}min. Consider starting this task earlier or assigning additional resources.`;
    }
  } else if (!isOnCriticalPath) {
    if (closeShiftMinutes === 0) {
      mitigationHint = `Task is off the critical path. A ${delayMinutes}min delay has no impact on the close date (absorbed by parallel slack).`;
    } else {
      mitigationHint = `Task was off the critical path but delay of ${delayMinutes}min exceeds available slack, shifting close by ${closeShiftMinutes}min.`;
    }
  }

  return {
    taskCode,
    taskName: node.taskName,
    delayMinutes,
    isOnCriticalPath,
    closeShiftMinutes,
    affectedDownstreamTasks,
    mitigationHint,
  };
}

// ---------------------------------------------------------------------------
// Phase 8: Parallelization Recommendations
// ---------------------------------------------------------------------------

interface ParallelGroup {
  layer: number;
  tasks: Array<{
    taskCode: string;
    taskName: string;
    estimatedDurationMinutes: number | null;
    readinessState: string;
  }>;
  maxDurationMinutes: number;
  sumDurationMinutes: number;
}

interface ParallelOpportunitiesResult {
  targetStatus: CloseGateTarget;
  layers: ParallelGroup[];
  currentCriticalPathMinutes: number;
  fullyParallelMinutes: number;
  improvementMinutes: number;
  improvementPercent: number;
  recommendations: string[];
}

function computeParallelOpportunities(
  graph: PeriodCloseGraphResult,
  targetStatus: CloseGateTarget,
): ParallelOpportunitiesResult {
  const relevant = graph.nodes.filter(
    (n) => isTaskRequiredForTarget(n.requiredBefore, targetStatus) && n.readinessState !== "SATISFIED",
  );

  if (relevant.length === 0) {
    return {
      targetStatus,
      layers: [],
      currentCriticalPathMinutes: 0,
      fullyParallelMinutes: 0,
      improvementMinutes: 0,
      improvementPercent: 0,
      recommendations: ["All tasks already satisfied — nothing to parallelize."],
    };
  }

  const relevantCodes = new Set(relevant.map((n) => n.taskCode));
  const nodeMap = new Map(graph.nodes.map((n) => [n.taskCode, n]));

  // Topological layering via Kahn's algorithm (longest-path layer assignment)
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of relevant) {
    inDeg.set(n.taskCode, 0);
    adj.set(n.taskCode, []);
  }

  for (const n of relevant) {
    for (const succ of n.successorTaskCodes) {
      if (!relevantCodes.has(succ)) continue;
      adj.get(n.taskCode)!.push(succ);
      inDeg.set(succ, (inDeg.get(succ) ?? 0) + 1);
    }
  }

  // Longest-path layer assignment
  const layerOf = new Map<string, number>();
  const queue: string[] = [];
  for (const [code, deg] of inDeg) {
    if (deg === 0) { queue.push(code); layerOf.set(code, 0); }
  }

  while (queue.length > 0) {
    const code = queue.shift()!;
    const myLayer = layerOf.get(code) ?? 0;
    for (const succ of adj.get(code) ?? []) {
      const existingLayer = layerOf.get(succ) ?? 0;
      layerOf.set(succ, Math.max(existingLayer, myLayer + 1));
      const nd = (inDeg.get(succ) ?? 1) - 1;
      inDeg.set(succ, nd);
      if (nd === 0) queue.push(succ);
    }
  }

  // Group by layer
  const layerMap = new Map<number, typeof relevant>();
  for (const n of relevant) {
    const layer = layerOf.get(n.taskCode) ?? 0;
    if (!layerMap.has(layer)) layerMap.set(layer, []);
    layerMap.get(layer)!.push(n);
  }

  const layers: ParallelGroup[] = [...layerMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([layer, tasks]) => {
      const durations = tasks.map((t) => t.estimatedDurationMinutes ?? 0);
      return {
        layer,
        tasks: tasks.map((t) => ({
          taskCode: t.taskCode,
          taskName: t.taskName,
          estimatedDurationMinutes: t.estimatedDurationMinutes,
          readinessState: t.readinessState,
        })),
        maxDurationMinutes: Math.max(...durations),
        sumDurationMinutes: durations.reduce((a, b) => a + b, 0),
      };
    });

  // Fully-parallel = sum of per-layer max durations (the theoretical minimum)
  const fullyParallelMinutes = layers.reduce((sum, l) => sum + l.maxDurationMinutes, 0);

  // Current sequential sum (what you'd get if nothing ran in parallel)
  const totalSequential = relevant.reduce((sum, n) => sum + (n.estimatedDurationMinutes ?? 0), 0);

  // Actual critical path from the graph
  const critPath = computeCriticalPath(graph, targetStatus);
  const currentCriticalPathMinutes = critPath.totalEstimatedMinutes;

  const improvementMinutes = currentCriticalPathMinutes - fullyParallelMinutes;
  const improvementPercent = currentCriticalPathMinutes > 0
    ? Math.round((improvementMinutes / currentCriticalPathMinutes) * 100)
    : 0;

  // Build recommendations
  const recommendations: string[] = [];

  // Layers with multiple tasks = parallelization opportunity
  const parallelLayers = layers.filter((l) => l.tasks.length > 1);
  if (parallelLayers.length > 0) {
    for (const l of parallelLayers) {
      const savings = l.sumDurationMinutes - l.maxDurationMinutes;
      if (savings > 0) {
        const taskList = l.tasks.map((t) => t.taskCode).join(", ");
        recommendations.push(
          `Layer ${l.layer}: ${l.tasks.length} tasks can run in parallel (${taskList}). ` +
          `Max duration: ${l.maxDurationMinutes}min vs sequential: ${l.sumDurationMinutes}min. ` +
          `Savings: ${savings}min.`,
        );
      }
    }
  }

  if (improvementMinutes > 0) {
    recommendations.push(
      `Full parallelization reduces critical path from ${currentCriticalPathMinutes}min to ${fullyParallelMinutes}min ` +
      `(${improvementPercent}% improvement, ${improvementMinutes}min savings).`,
    );
  } else {
    recommendations.push("Current schedule is already optimally parallel — no further improvement available.");
  }

  return {
    targetStatus,
    layers,
    currentCriticalPathMinutes,
    fullyParallelMinutes,
    improvementMinutes: Math.max(0, improvementMinutes),
    improvementPercent: Math.max(0, improvementPercent),
    recommendations,
  };
}
