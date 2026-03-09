// framework/runtime/src/services/business/engines/posting-engine/services/period-close-graph-service.ts
//
// Close Orchestration Graph — derived intelligence over the governed checklist.
//
// NOT a workflow engine.  Computes readiness, blockers, downstream impact,
// critical path, and forecast from authoritative checklist state + dependency
// edges + task template metadata.
//
// Separation of concerns:
//   checklist engine     = authoritative task execution/governance state
//   orchestration graph  = computed dependency/readiness intelligence (this)
//   transition gates     = legal control over period status progression
//   prediction layer     = planning/forecasting on top of the graph (this)
//
// Phase 5.1 Hardening:
//   - Centralized satisfaction via computeDependencySatisfaction()
//   - FAILED readiness state (self-failed vs blocked-by-predecessor)
//   - WAIVED readiness only SATISFIED when waiver is approved/not_required
//   - HARD_CLOSE target includes SOFT_CLOSE prerequisites
//   - Missing-estimate tasks exposed in prediction

import { ok, fail } from "../../shared/engine-base";
import {
  computeDependencySatisfaction,
  isTaskRequiredForTarget,
} from "../domain/period-close-governance";

import type { ServiceResult, OperationContext } from "../../shared/engine-base";
import type {
  PeriodCloseTask,
  PeriodCloseChecklist,
  PeriodCloseTaskDependency,
  PeriodCloseTaskNode,
  PeriodCloseGraphResult,
  ReadyTaskResult,
  BlockingTaskResult,
  CriticalPathResult,
  ClosePredictionResult,
  GraphValidationResult,
  ChecklistTaskStatus,
  CloseGateTarget,
  TaskReadinessState,
  DependencySatisfactionResult,
  DependencySatisfactionMode,
  WaiverStatus,
} from "../domain/types";
import type {
  PeriodCloseReadinessSnapshot,
  SnapshotSource,
} from "../domain/types";
import type {
  PeriodCloseTaskRepo,
  PeriodCloseChecklistRepo,
  CloseOrchestrationSnapshotRepo,
} from "../persistence/period-close-repo";

// ── Service Interface ───────────────────────────────────────────────────

export interface PeriodCloseGraphService {
  /** Validate the template-level dependency graph (cycle detection, integrity) */
  validateGraph(
    ctx: OperationContext,
    entityCode: string,
  ): Promise<ServiceResult<GraphValidationResult>>;

  /** Compute the full graph for a period close run */
  getGraph(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<PeriodCloseGraphResult>>;

  /** Get tasks whose predecessors are all satisfied — the operator queue */
  getReadyTasks(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<ReadyTaskResult[]>>;

  /** Get tasks that are blocking progress toward a target close state */
  getBlockers(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus?: CloseGateTarget,
  ): Promise<ServiceResult<BlockingTaskResult[]>>;

  /** Compute the critical path — longest chain to target close */
  getCriticalPath(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus?: CloseGateTarget,
  ): Promise<ServiceResult<CriticalPathResult>>;

  /** Predict earliest close readiness for a target status */
  predict(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<ClosePredictionResult>>;

  /** Capture an orchestration snapshot for trend analytics */
  captureSnapshot(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
    triggeredBy: string,
    snapshotSource?: SnapshotSource,
  ): Promise<ServiceResult<PeriodCloseReadinessSnapshot>>;

  /** Get the latest snapshot for a period + target */
  getLatestSnapshot(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<PeriodCloseReadinessSnapshot | null>>;

  /** List snapshot history (time series) */
  listSnapshots(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
    options?: { limit?: number; since?: Date },
  ): Promise<ServiceResult<PeriodCloseReadinessSnapshot[]>>;
}

// ── Implementation ──────────────────────────────────────────────────────

export class DefaultPeriodCloseGraphService implements PeriodCloseGraphService {
  constructor(
    private readonly taskRepo: PeriodCloseTaskRepo,
    private readonly checklistRepo: PeriodCloseChecklistRepo,
    private readonly snapshotRepo?: CloseOrchestrationSnapshotRepo,
  ) {}

  async validateGraph(
    ctx: OperationContext,
    entityCode: string,
  ): Promise<ServiceResult<GraphValidationResult>> {
    const tasks = await this.taskRepo.listByEntity(ctx.tenantId, entityCode);
    const deps = await this.taskRepo.listDependencies(ctx.tenantId, entityCode);

    const errors: GraphValidationResult["errors"] = [];
    const taskIds = new Set(tasks.map((t) => t.id));
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // Check for references to non-existent tasks
    for (const dep of deps) {
      if (!taskIds.has(dep.predecessorTaskId)) {
        errors.push({
          code: "INVALID_PREDECESSOR",
          message: `Dependency references non-existent predecessor task ${dep.predecessorTaskId}`,
        });
      }
      if (!taskIds.has(dep.successorTaskId)) {
        errors.push({
          code: "INVALID_SUCCESSOR",
          message: `Dependency references non-existent successor task ${dep.successorTaskId}`,
        });
      }
    }

    // Check for inactive task references
    for (const dep of deps) {
      const pred = taskMap.get(dep.predecessorTaskId);
      const succ = taskMap.get(dep.successorTaskId);
      if (pred && !pred.isActive) {
        errors.push({
          code: "INACTIVE_PREDECESSOR",
          message: `Dependency references inactive predecessor ${pred.taskCode}`,
          taskCodes: [pred.taskCode],
        });
      }
      if (succ && !succ.isActive) {
        errors.push({
          code: "INACTIVE_SUCCESSOR",
          message: `Dependency references inactive successor ${succ.taskCode}`,
          taskCodes: [succ.taskCode],
        });
      }
    }

    // Cycle detection via topological sort
    const cycleResult = detectCycles(tasks, deps);
    if (cycleResult.hasCycle) {
      errors.push({
        code: "CYCLE_DETECTED",
        message: `Dependency cycle detected involving tasks: ${cycleResult.cycleTasks.join(", ")}`,
        taskCodes: cycleResult.cycleTasks,
      });
    }

    return ok({ valid: errors.length === 0, errors });
  }

  async getGraph(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<PeriodCloseGraphResult>> {
    const [tasks, deps, checklist] = await Promise.all([
      this.taskRepo.listByEntity(ctx.tenantId, entityCode),
      this.taskRepo.listDependencies(ctx.tenantId, entityCode),
      this.checklistRepo.listByPeriod(ctx.tenantId, entityCode, fiscalYear, periodNumber),
    ]);

    if (checklist.length === 0) {
      return fail("CHECKLIST_NOT_MATERIALIZED", "No checklist found for this period. Materialize the checklist first.");
    }

    const result = computeGraph(tasks, deps, checklist);
    return ok(result);
  }

  async getReadyTasks(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<ReadyTaskResult[]>> {
    const graphResult = await this.getGraph(ctx, entityCode, fiscalYear, periodNumber);
    if (!graphResult.ok) return graphResult as ServiceResult<ReadyTaskResult[]>;

    const taskMap = new Map<string, PeriodCloseTask>();
    const tasks = await this.taskRepo.listByEntity(ctx.tenantId, entityCode);
    for (const t of tasks) taskMap.set(t.taskCode, t);

    const ready: ReadyTaskResult[] = graphResult.value.nodes
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
        autoStartWhenReady: taskMap.get(n.taskCode)?.autoStartWhenReady ?? false,
      }));

    return ok(ready);
  }

  async getBlockers(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus?: CloseGateTarget,
  ): Promise<ServiceResult<BlockingTaskResult[]>> {
    const graphResult = await this.getGraph(ctx, entityCode, fiscalYear, periodNumber);
    if (!graphResult.ok) return graphResult as ServiceResult<BlockingTaskResult[]>;

    const nodeMap = new Map(graphResult.value.nodes.map((n) => [n.taskCode, n]));
    const blockers: BlockingTaskResult[] = [];

    for (const node of graphResult.value.nodes) {
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

    return ok(blockers);
  }

  async getCriticalPath(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus?: CloseGateTarget,
  ): Promise<ServiceResult<CriticalPathResult>> {
    const graphResult = await this.getGraph(ctx, entityCode, fiscalYear, periodNumber);
    if (!graphResult.ok) return graphResult as ServiceResult<CriticalPathResult>;

    const result = computeCriticalPath(graphResult.value, targetStatus ?? null);
    return ok(result);
  }

  async predict(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<ClosePredictionResult>> {
    const graphResult = await this.getGraph(ctx, entityCode, fiscalYear, periodNumber);
    if (!graphResult.ok) return graphResult as ServiceResult<ClosePredictionResult>;

    const result = computePrediction(graphResult.value, targetStatus);
    return ok(result);
  }

  async captureSnapshot(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
    triggeredBy: string,
    snapshotSource: SnapshotSource = "api_call",
  ): Promise<ServiceResult<PeriodCloseReadinessSnapshot>> {
    if (!this.snapshotRepo) {
      return fail("NOT_CONFIGURED", "Snapshot repository not configured");
    }

    const graphResult = await this.getGraph(ctx, entityCode, fiscalYear, periodNumber);
    if (!graphResult.ok) return graphResult as ServiceResult<PeriodCloseReadinessSnapshot>;

    const prediction = computePrediction(graphResult.value, targetStatus);
    const graph = graphResult.value;

    // Filter counts to tasks relevant for target
    const relevantNodes = graph.nodes.filter(
      (n) => isTaskRequiredForTarget(n.requiredBefore, targetStatus),
    );

    const snapshot = await this.snapshotRepo.insert(ctx.tenantId, {
      entityCode,
      fiscalYear,
      periodNumber,
      snapshotAt: new Date(),
      targetStatus,
      totalTasks: relevantNodes.length,
      satisfiedCount: relevantNodes.filter((n) => n.readinessState === "SATISFIED").length,
      readyCount: relevantNodes.filter((n) => n.readinessState === "READY").length,
      blockedCount: relevantNodes.filter((n) => n.readinessState === "BLOCKED").length,
      failedCount: relevantNodes.filter((n) => n.readinessState === "FAILED").length,
      notReadyCount: relevantNodes.filter((n) => n.readinessState === "NOT_READY").length,
      inProgressCount: relevantNodes.filter((n) => n.readinessState === "IN_PROGRESS").length,
      criticalPathMinutes: prediction.criticalPathMinutes ?? 0,
      predictedReadyAt: prediction.predictedReadyAt ? new Date(prediction.predictedReadyAt) : null,
      blockerTaskCodes: prediction.blockerTaskCodes,
      confidence: prediction.confidence,
      snapshotSource,
      computationVersion: "v5.1",
      triggeredBy,
    });

    return ok(snapshot);
  }

  async getLatestSnapshot(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<PeriodCloseReadinessSnapshot | null>> {
    if (!this.snapshotRepo) {
      return fail("NOT_CONFIGURED", "Snapshot repository not configured");
    }

    const snapshot = await this.snapshotRepo.getLatest(
      ctx.tenantId, entityCode, fiscalYear, periodNumber, targetStatus,
    );
    return ok(snapshot);
  }

  async listSnapshots(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
    options?: { limit?: number; since?: Date },
  ): Promise<ServiceResult<PeriodCloseReadinessSnapshot[]>> {
    if (!this.snapshotRepo) {
      return fail("NOT_CONFIGURED", "Snapshot repository not configured");
    }

    const snapshots = await this.snapshotRepo.listByPeriod(
      ctx.tenantId, entityCode, fiscalYear, periodNumber, targetStatus, options,
    );
    return ok(snapshots);
  }
}

// ── Pure Graph Computation Functions ────────────────────────────────────

/**
 * Detect cycles using Kahn's algorithm (topological sort).
 */
function detectCycles(
  tasks: PeriodCloseTask[],
  deps: PeriodCloseTaskDependency[],
): { hasCycle: boolean; cycleTasks: string[] } {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    adj.set(t.id, []);
  }

  for (const d of deps) {
    if (!inDegree.has(d.predecessorTaskId) || !inDegree.has(d.successorTaskId)) continue;
    adj.get(d.predecessorTaskId)!.push(d.successorTaskId);
    inDegree.set(d.successorTaskId, (inDegree.get(d.successorTaskId) ?? 0) + 1);
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

  if (sorted === tasks.length) {
    return { hasCycle: false, cycleTasks: [] };
  }

  // Tasks remaining with inDegree > 0 are in cycles
  const cycleTasks: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg > 0) {
      const t = taskMap.get(id);
      if (t) cycleTasks.push(t.taskCode);
    }
  }

  return { hasCycle: true, cycleTasks };
}

/**
 * Compute the full orchestration graph.
 *
 * Hardened in Phase 5.1:
 *   - Uses centralized computeDependencySatisfaction()
 *   - WAIVED tasks only SATISFIED when waiverStatus is approved/not_required
 *   - FAILED tasks get readiness=FAILED (not BLOCKED)
 *   - BLOCKED checklist items get readiness=BLOCKED (self-blocked, not predecessor-blocked)
 */
function computeGraph(
  tasks: PeriodCloseTask[],
  deps: PeriodCloseTaskDependency[],
  checklist: PeriodCloseChecklist[],
): PeriodCloseGraphResult {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const taskByCode = new Map(tasks.map((t) => [t.taskCode, t]));
  const checklistByTaskId = new Map(checklist.map((c) => [c.taskId, c]));
  const checklistByCode = new Map(checklist.map((c) => [c.taskCode, c]));

  // Build adjacency lists using task codes
  const predecessorMap = new Map<string, Array<{ taskCode: string; satisfactionMode: DependencySatisfactionMode; isHardBlock: boolean }>>();
  const successorMap = new Map<string, string[]>();

  for (const dep of deps) {
    const pred = taskMap.get(dep.predecessorTaskId);
    const succ = taskMap.get(dep.successorTaskId);
    if (!pred || !succ) continue;
    // Only include edges where both tasks have checklist items
    if (!checklistByCode.has(pred.taskCode) || !checklistByCode.has(succ.taskCode)) continue;

    if (!predecessorMap.has(succ.taskCode)) predecessorMap.set(succ.taskCode, []);
    predecessorMap.get(succ.taskCode)!.push({
      taskCode: pred.taskCode,
      satisfactionMode: dep.satisfactionMode,
      isHardBlock: dep.isHardBlock,
    });

    if (!successorMap.has(pred.taskCode)) successorMap.set(pred.taskCode, []);
    successorMap.get(pred.taskCode)!.push(succ.taskCode);
  }

  // Cycle detection
  const cycleResult = detectCycles(
    tasks.filter((t) => checklistByCode.has(t.taskCode)),
    deps,
  );

  // Step B: Normalize status into satisfaction per node
  // Uses centralized helper — single source of truth for satisfaction semantics
  const satisfactionByCode = new Map<string, DependencySatisfactionResult>();
  for (const cl of checklist) {
    satisfactionByCode.set(
      cl.taskCode,
      computeDependencySatisfaction(cl.taskStatus, cl.waiverStatus, "satisfied"),
    );
  }

  // Step D: Compute readiness
  const readinessMap = new Map<string, TaskReadinessState>();
  const blockedByMap = new Map<string, string[]>();

  for (const cl of checklist) {
    const task = taskByCode.get(cl.taskCode);
    if (!task) continue;

    // Terminal: COMPLETED
    if (cl.taskStatus === "COMPLETED") {
      readinessMap.set(cl.taskCode, "SATISFIED");
      blockedByMap.set(cl.taskCode, []);
      continue;
    }

    // WAIVED: only SATISFIED if waiver is approved/governance-exempt
    if (cl.taskStatus === "WAIVED") {
      if (cl.waiverStatus === "approved" || cl.waiverStatus === "not_required") {
        readinessMap.set(cl.taskCode, "SATISFIED");
      } else {
        // pending_approval, rejected, not_requested, null — NOT satisfied
        readinessMap.set(cl.taskCode, "BLOCKED");
      }
      blockedByMap.set(cl.taskCode, []);
      continue;
    }

    // FAILED: task itself failed — distinct from blocked-by-predecessor
    if (cl.taskStatus === "FAILED") {
      readinessMap.set(cl.taskCode, "FAILED");
      blockedByMap.set(cl.taskCode, []);
      continue;
    }

    // BLOCKED (checklist status): set by the close service explicitly
    if (cl.taskStatus === "BLOCKED") {
      readinessMap.set(cl.taskCode, "BLOCKED");
      blockedByMap.set(cl.taskCode, []);
      continue;
    }

    if (cl.taskStatus === "IN_PROGRESS") {
      readinessMap.set(cl.taskCode, "IN_PROGRESS");
      blockedByMap.set(cl.taskCode, []);
      continue;
    }

    // PENDING: evaluate predecessors
    const preds = predecessorMap.get(cl.taskCode) ?? [];
    if (preds.length === 0) {
      // No predecessors — ready
      readinessMap.set(cl.taskCode, "READY");
      blockedByMap.set(cl.taskCode, []);
      continue;
    }

    // Evaluate predecessors
    const blockers: string[] = [];
    let allSatisfied = true;

    for (const pred of preds) {
      const predCl = checklistByCode.get(pred.taskCode);
      if (!predCl) {
        // Predecessor not in checklist (maybe filtered by blueprint)
        continue;
      }

      const predSat = computeDependencySatisfaction(
        predCl.taskStatus,
        predCl.waiverStatus,
        pred.satisfactionMode,
      );

      if (predSat !== "SATISFIED") {
        allSatisfied = false;
        if (pred.isHardBlock || predSat === "FAILED_BLOCKING") {
          blockers.push(pred.taskCode);
        }
      }
    }

    blockedByMap.set(cl.taskCode, blockers);

    if (blockers.length > 0) {
      readinessMap.set(cl.taskCode, "BLOCKED");
    } else if (!allSatisfied) {
      readinessMap.set(cl.taskCode, "NOT_READY");
    } else {
      readinessMap.set(cl.taskCode, "READY");
    }
  }

  // Step E: Compute downstream impact for each node
  const impactMap = new Map<string, number>();
  for (const cl of checklist) {
    impactMap.set(cl.taskCode, countDownstreamImpact(cl.taskCode, successorMap, new Set()));
  }

  // Step F+G: Forward-pass earliest finish (for prediction)
  const now = new Date();
  const earliestStart = new Map<string, Date>();
  const predictedFinish = new Map<string, Date>();

  // Topological order for forward pass
  const topoOrder = topologicalSort(checklist.map((c) => c.taskCode), predecessorMap);

  for (const code of topoOrder) {
    const task = taskByCode.get(code);
    const cl = checklistByCode.get(code);
    if (!task || !cl) continue;

    const readiness = readinessMap.get(code);
    const duration = task.estimatedDurationMinutes ?? 0;

    if (readiness === "SATISFIED") {
      // Already done
      earliestStart.set(code, cl.completedAt ?? cl.waivedAt ?? now);
      predictedFinish.set(code, cl.completedAt ?? cl.waivedAt ?? now);
      continue;
    }

    // Earliest start = max(predecessor predicted finish)
    const preds = predecessorMap.get(code) ?? [];
    let maxPredFinish = now;
    for (const pred of preds) {
      const predFinish = predictedFinish.get(pred.taskCode);
      if (predFinish && predFinish > maxPredFinish) {
        maxPredFinish = predFinish;
      }
    }

    if (readiness === "READY" || readiness === "IN_PROGRESS") {
      earliestStart.set(code, now);
    } else {
      earliestStart.set(code, maxPredFinish);
    }

    predictedFinish.set(
      code,
      new Date((earliestStart.get(code)?.getTime() ?? now.getTime()) + duration * 60_000),
    );
  }

  // Build nodes
  const nodes: PeriodCloseTaskNode[] = checklist.map((cl) => {
    const task = taskByCode.get(cl.taskCode);
    return {
      checklistId: cl.id,
      taskId: cl.taskId,
      taskCode: cl.taskCode,
      taskName: task?.taskName ?? cl.taskCode,
      category: task?.category ?? "SUBLEDGER",
      requiredBefore: task?.requiredBefore ?? "SOFT_CLOSE",
      completionMode: task?.completionMode ?? "MANUAL",
      status: cl.taskStatus,
      readinessState: readinessMap.get(cl.taskCode) ?? "NOT_READY",
      satisfactionState: satisfactionByCode.get(cl.taskCode) ?? "UNSATISFIED",
      predecessorTaskCodes: (predecessorMap.get(cl.taskCode) ?? []).map((p) => p.taskCode),
      successorTaskCodes: successorMap.get(cl.taskCode) ?? [],
      blockedByTaskCodes: blockedByMap.get(cl.taskCode) ?? [],
      downstreamImpactCount: impactMap.get(cl.taskCode) ?? 0,
      estimatedDurationMinutes: task?.estimatedDurationMinutes ?? null,
      severity: task?.severity ?? null,
      orchestrationGroup: task?.orchestrationGroup ?? null,
      assignedRole: cl.assignedRole,
      assignedUserId: cl.assignedUserId,
      dueAt: cl.dueAt?.toISOString() ?? null,
      earliestStartAt: earliestStart.get(cl.taskCode)?.toISOString() ?? null,
      predictedFinishAt: predictedFinish.get(cl.taskCode)?.toISOString() ?? null,
      activeSignalCount: 0,
    };
  });

  return {
    nodes,
    edgeCount: deps.filter((d) => {
      const p = taskMap.get(d.predecessorTaskId);
      const s = taskMap.get(d.successorTaskId);
      return p && s && checklistByCode.has(p.taskCode) && checklistByCode.has(s.taskCode);
    }).length,
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

/**
 * Count downstream nodes reachable from a given node (DFS).
 */
function countDownstreamImpact(
  taskCode: string,
  successorMap: Map<string, string[]>,
  visited: Set<string>,
): number {
  const successors = successorMap.get(taskCode) ?? [];
  let count = 0;
  for (const succ of successors) {
    if (visited.has(succ)) continue;
    visited.add(succ);
    count += 1 + countDownstreamImpact(succ, successorMap, visited);
  }
  return count;
}

/**
 * Topological sort via Kahn's algorithm using task codes.
 */
function topologicalSort(
  taskCodes: string[],
  predecessorMap: Map<string, Array<{ taskCode: string }>>,
): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const code of taskCodes) {
    inDegree.set(code, 0);
    adj.set(code, []);
  }

  for (const [succCode, preds] of predecessorMap) {
    if (!inDegree.has(succCode)) continue;
    inDegree.set(succCode, preds.filter((p) => inDegree.has(p.taskCode)).length);
    for (const pred of preds) {
      if (!adj.has(pred.taskCode)) continue;
      adj.get(pred.taskCode)!.push(succCode);
    }
  }

  const queue: string[] = [];
  for (const [code, deg] of inDegree) {
    if (deg === 0) queue.push(code);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const succ of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  // Append any remaining (cycle members) at the end
  for (const code of taskCodes) {
    if (!result.includes(code)) result.push(code);
  }

  return result;
}

/**
 * Compute critical path — longest remaining path through unsatisfied tasks.
 *
 * Hardened: HARD_CLOSE target includes SOFT_CLOSE tasks (isTaskRequiredForTarget).
 */
function computeCriticalPath(
  graph: PeriodCloseGraphResult,
  targetStatus: CloseGateTarget | null,
): CriticalPathResult {
  const nodeMap = new Map(graph.nodes.map((n) => [n.taskCode, n]));

  // Filter to unsatisfied tasks relevant to the target status
  const relevantNodes = graph.nodes.filter((n) => {
    if (n.readinessState === "SATISFIED") return false;
    if (targetStatus && !isTaskRequiredForTarget(n.requiredBefore, targetStatus)) return false;
    return true;
  });

  if (relevantNodes.length === 0) {
    return {
      targetStatus,
      totalEstimatedMinutes: 0,
      blockingMinutesRemaining: 0,
      path: [],
      dominantBlockerTaskCode: null,
    };
  }

  // Build adjacency for relevant nodes only
  const relevantCodes = new Set(relevantNodes.map((n) => n.taskCode));
  const successorMap = new Map<string, string[]>();
  for (const node of relevantNodes) {
    successorMap.set(
      node.taskCode,
      node.successorTaskCodes.filter((s) => relevantCodes.has(s)),
    );
  }

  // Longest path via dynamic programming on topological order
  const predecessorMap = new Map<string, Array<{ taskCode: string }>>();
  for (const node of relevantNodes) {
    predecessorMap.set(
      node.taskCode,
      node.predecessorTaskCodes
        .filter((p) => relevantCodes.has(p))
        .map((p) => ({ taskCode: p })),
    );
  }

  const topoOrder = topologicalSort([...relevantCodes], predecessorMap);

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();

  for (const code of topoOrder) {
    dist.set(code, nodeMap.get(code)?.estimatedDurationMinutes ?? 0);
    prev.set(code, null);
  }

  for (const code of topoOrder) {
    const nodeDist = dist.get(code) ?? 0;
    for (const succ of successorMap.get(code) ?? []) {
      const succDuration = nodeMap.get(succ)?.estimatedDurationMinutes ?? 0;
      const candidate = nodeDist + succDuration;
      if (candidate > (dist.get(succ) ?? 0)) {
        dist.set(succ, candidate);
        prev.set(succ, code);
      }
    }
  }

  // Find the endpoint with longest distance
  let maxDist = 0;
  let endCode: string | null = null;
  for (const [code, d] of dist) {
    if (d >= maxDist) {
      maxDist = d;
      endCode = code;
    }
  }

  // Reconstruct path
  const pathCodes: string[] = [];
  let current = endCode;
  while (current) {
    pathCodes.unshift(current);
    current = prev.get(current) ?? null;
  }

  const path = pathCodes.map((code) => {
    const node = nodeMap.get(code)!;
    return {
      taskCode: node.taskCode,
      taskName: node.taskName,
      status: node.status,
      readinessState: node.readinessState,
      estimatedDurationMinutes: node.estimatedDurationMinutes,
    };
  });

  // Dominant blocker = first BLOCKED or FAILED node on the path
  const dominantBlocker = path.find(
    (p) => p.readinessState === "BLOCKED" || p.readinessState === "FAILED",
  );

  return {
    targetStatus,
    totalEstimatedMinutes: maxDist,
    blockingMinutesRemaining: maxDist,
    path,
    dominantBlockerTaskCode: dominantBlocker?.taskCode ?? null,
  };
}

/**
 * Compute a deterministic forecast for close readiness.
 *
 * Hardened:
 *   - HARD_CLOSE target includes SOFT_CLOSE tasks
 *   - Exposes tasksWithoutEstimate and failedTaskCodes
 *   - Never fabricates precision silently
 */
function computePrediction(
  graph: PeriodCloseGraphResult,
  targetStatus: CloseGateTarget,
): ClosePredictionResult {
  // Include all tasks relevant for this target
  const relevant = graph.nodes.filter(
    (n) => isTaskRequiredForTarget(n.requiredBefore, targetStatus),
  );

  const unsatisfied = relevant.filter(
    (n) => n.readinessState !== "SATISFIED",
  );

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

  // Find the latest predicted finish among relevant unsatisfied tasks
  let latestFinish: Date | null = null;
  let totalRemaining = 0;
  const assumptions: string[] = [];
  const blockerCodes: string[] = [];
  const failedCodes: string[] = [];
  const noEstimateCodes: string[] = [];

  for (const node of unsatisfied) {
    const duration = node.estimatedDurationMinutes ?? 0;
    totalRemaining += duration;

    if (node.estimatedDurationMinutes == null) {
      noEstimateCodes.push(node.taskCode);
    }

    if (node.readinessState === "BLOCKED") {
      blockerCodes.push(node.taskCode);
    }

    if (node.readinessState === "FAILED" || node.status === "FAILED") {
      failedCodes.push(node.taskCode);
    }

    if (node.predictedFinishAt) {
      const finish = new Date(node.predictedFinishAt);
      if (!latestFinish || finish > latestFinish) {
        latestFinish = finish;
      }
    }
  }

  // Critical path
  const critPath = computeCriticalPath(graph, targetStatus);

  // Confidence heuristic
  let confidence: "low" | "medium" | "high";
  const actionableBlockers = blockerCodes.length + failedCodes.length;
  if (actionableBlockers > 1 || noEstimateCodes.length > unsatisfied.length / 2) {
    confidence = "low";
  } else if (actionableBlockers === 1 || noEstimateCodes.length > 0) {
    confidence = "medium";
  } else {
    confidence = "high";
  }

  if (noEstimateCodes.length > 0) {
    assumptions.push(`${noEstimateCodes.length} task(s) have no duration estimate — assumed 0 minutes: ${noEstimateCodes.join(", ")}`);
  }
  if (blockerCodes.length > 0) {
    assumptions.push(`${blockerCodes.length} task(s) currently blocked`);
  }
  if (failedCodes.length > 0) {
    assumptions.push(`${failedCodes.length} task(s) currently failed — requires retry/intervention`);
  }
  assumptions.push("Assumes sequential execution on critical path, parallel execution elsewhere");

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
