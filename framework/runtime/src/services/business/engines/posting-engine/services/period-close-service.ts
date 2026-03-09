// framework/runtime/src/services/business/engines/posting-engine/services/period-close-service.ts
//
// Orchestrates the financial period close process:
// - Checklist materialization (on period OPEN)
// - Task completion, waiver, failure, and blocking flows
// - Gate-checked period transitions with structured denial responses
// - System handler dispatch for SYSTEM/HYBRID tasks
// - Dashboard progress queries

import { ok, fail } from "../../shared/engine-base";
import {
  canCompleteTask,
  canWaiveTask,
  canFailTask,
  canBlockTask,
  canRequestWaiver,
  canAssignTask,
  requiresWaiverApproval,
  isValidChecklistTransition,
} from "../domain/period-close-governance";
import { canTransitionPeriod, getPeriodTimestamps } from "../domain/period-control";

import type { ServiceResult, OperationContext } from "../../shared/engine-base";
import type {
  PeriodCloseChecklist,
  PeriodCloseActivity,
  CloseGateTarget,
  CloseGateResult,
  CloseProgress,
  CloseTaskCategory,
  CloseTaskCompletionMode,
  CloseTaskAssignment,
  ChecklistTaskStatus,
  WaiverStatus,
  WaiverRequestResult,
  WaiverDecisionResult,
  PeriodStatus,
  FiscalPeriod,
} from "../domain/types";
import type { FiscalPeriodRepo } from "../persistence/fiscal-period-repo";
import type {
  PeriodCloseTaskRepo,
  PeriodCloseChecklistRepo,
  PeriodCloseActivityRepo,
  CloseRiskSignalRepo,
  CloseTaskDurationHistoryRepo,
} from "../persistence/period-close-repo";
import type {
  CloseHandlerRegistry,
  CloseHandlerResult,
} from "../domain/close-handler-registry";

// ── Structured gate denial ──────────────────────────────────────────────

export type GateDenialReasonCode =
  | "TASK_PENDING"
  | "TASK_IN_PROGRESS"
  | "TASK_FAILED"
  | "TASK_BLOCKED";

export interface GateDenialDetail {
  /** Machine-readable reason code */
  reasonCode: GateDenialReasonCode;
  /** Task identifier */
  taskCode: string;
  /** Human-readable task name */
  taskName: string;
  /** Current task status (narrow union, not loose string) */
  taskStatus: ChecklistTaskStatus;
  /** Task category */
  category: CloseTaskCategory;
  /** How the task is completed */
  completionMode: CloseTaskCompletionMode;
  /** Who is responsible */
  assignedTo: string | null;
  /** Optional hint for the UI on how to resolve */
  actionHint: string | null;
}

export interface GateDenialResponse {
  /** The transition that was denied */
  targetStatus: CloseGateTarget;
  /** Number of blocking tasks */
  pendingCount: number;
  /** Per-task denial details */
  pendingTasks: GateDenialDetail[];
  /** Human-readable summary */
  message: string;
}

export interface MaterializeResult {
  /** Number of new checklist rows inserted */
  tasksCreated: number;
  /** Whether the checklist already existed (idempotent re-call) */
  alreadyMaterialized: boolean;
}

// ── Approval integration (thin facade, same pattern as purchase invoice) ─

export interface CloseApprovalOps {
  createInstance(
    ctx: OperationContext,
    input: {
      entityType: string;
      entityId: string;
      triggerEvent: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<ServiceResult<{ id: string }>>;
  cancelInstance(
    ctx: OperationContext,
    instanceId: string,
  ): Promise<ServiceResult<void>>;
}

// ── Service interface ───────────────────────────────────────────────────

export interface PeriodCloseService {
  /** Materialize the close checklist for a period (idempotent) */
  materializeChecklist(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    blueprint?: string,
  ): Promise<ServiceResult<MaterializeResult>>;

  /** Get the checklist for a period */
  getChecklist(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<PeriodCloseChecklist[]>>;

  /** Get dashboard progress summary */
  getProgress(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<CloseProgress>>;

  /** Complete a checklist task with evidence */
  completeTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    input: {
      completionNotes?: string;
      evidencePayload?: Record<string, unknown>;
    },
  ): Promise<ServiceResult<PeriodCloseChecklist>>;

  /** Waive a checklist task with governance */
  waiveTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    input: {
      waiverReason: string;
      waiverApprovalRef?: string;
    },
  ): Promise<ServiceResult<PeriodCloseChecklist>>;

  /** Mark a checklist task as failed */
  failTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    failureReason: string,
  ): Promise<ServiceResult<PeriodCloseChecklist>>;

  /** Mark a checklist task as blocked */
  blockTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
  ): Promise<ServiceResult<PeriodCloseChecklist>>;

  /** Execute a SYSTEM/HYBRID task handler */
  executeSystemHandler(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
  ): Promise<ServiceResult<CloseHandlerResult>>;

  /** Check if a period transition is allowed (returns structured denial if not) */
  checkTransitionGate(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<CloseGateResult>>;

  /** Attempt a period transition with gate enforcement */
  transitionPeriod(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: PeriodStatus,
  ): Promise<ServiceResult<FiscalPeriod>>;

  // ── Phase 3: Waiver Approval ──

  /** Request a waiver (creates approval instance if required) */
  requestTaskWaiver(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    input: {
      reason: string;
      evidencePayload?: Record<string, unknown> | null;
    },
  ): Promise<ServiceResult<WaiverRequestResult>>;

  /** Approve a waiver (called from approval callback or admin) */
  approveTaskWaiver(
    ctx: OperationContext,
    checklistId: string,
  ): Promise<ServiceResult<WaiverDecisionResult>>;

  /** Reject a waiver (called from approval callback or admin) */
  rejectTaskWaiver(
    ctx: OperationContext,
    checklistId: string,
  ): Promise<ServiceResult<WaiverDecisionResult>>;

  /** Get waiver status for a checklist item */
  getWaiverStatus(
    ctx: OperationContext,
    checklistId: string,
  ): Promise<ServiceResult<{
    waiverStatus: WaiverStatus | null;
    approvalInstanceId: string | null;
  }>>;

  // ── Phase 3: Assignment ──

  /** Assign a checklist task to a role/user/group */
  assignTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    assignment: CloseTaskAssignment,
  ): Promise<ServiceResult<PeriodCloseChecklist>>;

  /** Bulk-assign multiple checklist tasks */
  bulkAssignTasks(
    ctx: OperationContext,
    assignments: Array<{
      checklistId: string;
      assignment: CloseTaskAssignment;
    }>,
  ): Promise<ServiceResult<PeriodCloseChecklist[]>>;

  // ── Phase 3: Timeline ──

  /** Get close timeline for a period */
  getTimeline(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    options?: { limit?: number; offset?: number },
  ): Promise<ServiceResult<PeriodCloseActivity[]>>;

  /** Get activity for a specific checklist item */
  getTaskTimeline(
    ctx: OperationContext,
    checklistId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ServiceResult<PeriodCloseActivity[]>>;

  // ── Phase 3: Gate Recheck ──

  /** Re-run all SYSTEM handlers for tasks gating a target transition */
  recheckTransitionTasks(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<CloseGateResult>>;
}

// ── Implementation ──────────────────────────────────────────────────────

export class DefaultPeriodCloseService implements PeriodCloseService {
  constructor(
    private readonly taskRepo: PeriodCloseTaskRepo,
    private readonly checklistRepo: PeriodCloseChecklistRepo,
    private readonly periodRepo: FiscalPeriodRepo,
    private readonly handlerRegistry: CloseHandlerRegistry,
    private readonly activityRepo?: PeriodCloseActivityRepo,
    private readonly approvalOps?: CloseApprovalOps,
    private readonly signalRepo?: CloseRiskSignalRepo,
    private readonly durationHistoryRepo?: CloseTaskDurationHistoryRepo,
  ) {}

  async materializeChecklist(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    blueprint?: string,
  ): Promise<ServiceResult<MaterializeResult>> {
    const count = await this.checklistRepo.materialize(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      blueprint,
    );

    if (count > 0) {
      await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "CHECKLIST_MATERIALIZED", `Checklist materialized: ${count} tasks created`, {
        actorType: "system",
        payload: { tasksCreated: count, blueprint: blueprint ?? null },
      });
    }

    return ok({
      tasksCreated: count,
      alreadyMaterialized: count === 0,
    });
  }

  async getChecklist(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<PeriodCloseChecklist[]>> {
    const items = await this.checklistRepo.listByPeriod(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
    );
    return ok(items);
  }

  async getProgress(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<CloseProgress>> {
    const progress = await this.checklistRepo.getProgress(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
    );
    return ok(progress);
  }

  async completeTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    input: {
      completionNotes?: string;
      evidencePayload?: Record<string, unknown>;
    },
  ): Promise<ServiceResult<PeriodCloseChecklist>> {
    const checklist = await this.checklistRepo.getByTaskCode(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      taskCode,
    );
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${taskCode} not found for this period`);
    }

    const check = canCompleteTask(checklist, ctx.actorId);
    if (!check.allowed) {
      return fail("INVALID_TRANSITION", check.reason!);
    }

    const updated = await this.checklistRepo.updateStatus(
      ctx.tenantId,
      checklist.id,
      "COMPLETED",
      {
        completedBy: ctx.actorId,
        completedAt: new Date(),
        completionNotes: input.completionNotes ?? null,
        evidencePayload: input.evidencePayload ?? {},
      },
    );

    await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TASK_COMPLETED", `Task ${taskCode} completed`, {
      checklistId: checklist.id, taskCode,
      payload: { completionNotes: input.completionNotes ?? null },
    });

    // Record duration history for predictive intelligence
    await this.recordTaskDuration(ctx, entityCode, fiscalYear, periodNumber, checklist, updated, false);

    // Phase 9: Auto-start ready successor tasks
    await this.autoStartReadySuccessors(ctx, entityCode, fiscalYear, periodNumber, taskCode);

    return ok(updated);
  }

  async waiveTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    input: {
      waiverReason: string;
      waiverApprovalRef?: string;
    },
  ): Promise<ServiceResult<PeriodCloseChecklist>> {
    const checklist = await this.checklistRepo.getByTaskCode(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      taskCode,
    );
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${taskCode} not found for this period`);
    }

    const task = await this.taskRepo.getByCode(ctx.tenantId, entityCode, taskCode);
    if (!task) {
      return fail("TASK_NOT_FOUND", `Task template ${taskCode} not found`);
    }

    const check = canWaiveTask(task, checklist, input.waiverReason, input.waiverApprovalRef ?? null);
    if (!check.allowed) {
      return fail("WAIVER_DENIED", check.reason!);
    }

    // Need to transition to IN_PROGRESS first if PENDING
    if (checklist.taskStatus === "PENDING") {
      await this.checklistRepo.updateStatus(ctx.tenantId, checklist.id, "IN_PROGRESS", {});
    }

    const updated = await this.checklistRepo.updateStatus(
      ctx.tenantId,
      checklist.id,
      "WAIVED",
      {
        waivedBy: ctx.actorId,
        waivedAt: new Date(),
        waiverReason: input.waiverReason,
        waiverApprovalRef: input.waiverApprovalRef ?? null,
      },
    );

    // Record duration history (waived path)
    await this.recordTaskDuration(ctx, entityCode, fiscalYear, periodNumber, checklist, updated, true);

    // Phase 9: Auto-start ready successor tasks
    await this.autoStartReadySuccessors(ctx, entityCode, fiscalYear, periodNumber, taskCode);

    return ok(updated);
  }

  async failTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    failureReason: string,
  ): Promise<ServiceResult<PeriodCloseChecklist>> {
    const checklist = await this.checklistRepo.getByTaskCode(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      taskCode,
    );
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${taskCode} not found for this period`);
    }

    const check = canFailTask(checklist, failureReason);
    if (!check.allowed) {
      return fail("INVALID_TRANSITION", check.reason!);
    }

    const updated = await this.checklistRepo.updateStatus(
      ctx.tenantId,
      checklist.id,
      "FAILED",
      {
        failureReason,
        failedAt: new Date(),
      },
    );

    await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TASK_FAILED", `Task ${taskCode} failed: ${failureReason}`, {
      checklistId: checklist.id, taskCode,
      payload: { failureReason },
    });

    return ok(updated);
  }

  async blockTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
  ): Promise<ServiceResult<PeriodCloseChecklist>> {
    const checklist = await this.checklistRepo.getByTaskCode(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      taskCode,
    );
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${taskCode} not found for this period`);
    }

    const check = canBlockTask(checklist);
    if (!check.allowed) {
      return fail("INVALID_TRANSITION", check.reason!);
    }

    const updated = await this.checklistRepo.updateStatus(
      ctx.tenantId,
      checklist.id,
      "BLOCKED",
      {},
    );

    await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TASK_BLOCKED", `Task ${taskCode} blocked`, {
      checklistId: checklist.id, taskCode,
    });

    return ok(updated);
  }

  async executeSystemHandler(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
  ): Promise<ServiceResult<CloseHandlerResult>> {
    const checklist = await this.checklistRepo.getByTaskCode(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      taskCode,
    );
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${taskCode} not found for this period`);
    }

    const task = await this.taskRepo.getByCode(ctx.tenantId, entityCode, taskCode);
    if (!task) {
      return fail("TASK_NOT_FOUND", `Task template ${taskCode} not found`);
    }

    if (task.completionMode === "MANUAL") {
      return fail("NOT_SYSTEM_TASK", `Task ${taskCode} is MANUAL — cannot execute system handler`);
    }

    if (!task.systemCheckHandler) {
      return fail("NO_HANDLER", `Task ${taskCode} has no system_check_handler configured`);
    }

    const handler = this.handlerRegistry.get(task.systemCheckHandler);
    if (!handler) {
      return fail(
        "HANDLER_NOT_REGISTERED",
        `System handler '${task.systemCheckHandler}' is not registered. Registered: [${this.handlerRegistry.listRegistered().join(", ")}]`,
      );
    }

    // Transition to IN_PROGRESS if PENDING
    if (checklist.taskStatus === "PENDING" || checklist.taskStatus === "FAILED") {
      const canStart = isValidChecklistTransition(checklist.taskStatus, "IN_PROGRESS");
      if (canStart) {
        await this.checklistRepo.updateStatus(ctx.tenantId, checklist.id, "IN_PROGRESS", {});
      }
    }

    // Execute the handler
    const result = await handler.execute(ctx, {
      entityCode,
      fiscalYear,
      periodNumber,
    });

    // Record handler telemetry (run time, result, run count)
    await this.checklistRepo.updateHandlerExecution(ctx.tenantId, checklist.id, {
      lastHandlerRunAt: new Date(),
      lastHandlerResult: {
        passed: result.passed,
        message: result.message,
        evidence: result.evidence,
        evidenceCode: result.evidenceCode,
        nextSuggestedAction: result.nextSuggestedAction ?? null,
      },
      handlerRunCount: checklist.handlerRunCount + 1,
    });

    if (result.passed) {
      await this.checklistRepo.updateStatus(ctx.tenantId, checklist.id, "COMPLETED", {
        completedBy: ctx.actorId,
        completedAt: new Date(),
        completionNotes: result.message,
        evidencePayload: result.evidence,
      });
    } else {
      await this.checklistRepo.updateStatus(ctx.tenantId, checklist.id, "FAILED", {
        failureReason: result.message,
        failedAt: new Date(),
      });
    }

    await this.logActivity(ctx, entityCode, fiscalYear, periodNumber,
      result.passed ? "HANDLER_EXECUTED" : "HANDLER_FAILED",
      `Handler ${task.systemCheckHandler} ${result.passed ? "passed" : "failed"}: ${result.message}`, {
        checklistId: checklist.id, taskCode,
        actorType: "system",
        payload: { handlerCode: task.systemCheckHandler, passed: result.passed, evidence: result.evidence },
      },
    );

    return ok(result);
  }

  async checkTransitionGate(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<CloseGateResult>> {
    const gateResult = await this.checklistRepo.checkGate(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
      targetStatus,
    );
    return ok(gateResult);
  }

  async transitionPeriod(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: PeriodStatus,
  ): Promise<ServiceResult<FiscalPeriod>> {
    const period = await this.periodRepo.getByYearPeriod(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
    );
    if (!period) {
      return fail("PERIOD_NOT_FOUND", `Period ${fiscalYear}-P${periodNumber} not found for ${entityCode}`);
    }

    // Check gate if transitioning to SOFT_CLOSE or HARD_CLOSE
    let gateResult: CloseGateResult | null = null;
    if (targetStatus === "SOFT_CLOSE" || targetStatus === "HARD_CLOSE") {
      gateResult = await this.checklistRepo.checkGate(
        ctx.tenantId,
        entityCode,
        fiscalYear,
        periodNumber,
        targetStatus,
      );
    }

    // Signal gate: block transition when critical/high risk signals are active
    if (
      (targetStatus === "SOFT_CLOSE" || targetStatus === "HARD_CLOSE") &&
      this.signalRepo
    ) {
      const signalSummary = await this.signalRepo.getSummary(
        ctx.tenantId,
        entityCode,
        fiscalYear,
        periodNumber,
      );
      const blockingSignals = signalSummary.criticalCount + signalSummary.highCount;
      if (blockingSignals > 0) {
        await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TRANSITION_DENIED",
          `Transition blocked by ${blockingSignals} active risk signal(s) (${signalSummary.criticalCount} critical, ${signalSummary.highCount} high)`, {
            payload: { targetStatus, criticalSignals: signalSummary.criticalCount, highSignals: signalSummary.highCount },
          });
        return fail("SIGNAL_GATE_BLOCKED",
          `Cannot transition to ${targetStatus}: ${blockingSignals} active risk signal(s) must be resolved first (${signalSummary.criticalCount} critical, ${signalSummary.highCount} high)`,
          { signalSummary },
        );
      }
    }

    await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TRANSITION_ATTEMPTED", `Transition attempted: ${period.status} → ${targetStatus}`, {
      payload: { fromStatus: period.status, targetStatus },
    });

    const transition = canTransitionPeriod(period.status, targetStatus, gateResult);
    if (!transition.allowed) {
      // Build structured denial if gate failed
      if (gateResult && !gateResult.gatePassed) {
        const denial = await this.buildGateDenial(
          ctx,
          entityCode,
          fiscalYear,
          periodNumber,
          targetStatus as CloseGateTarget,
          gateResult,
        );

        await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TRANSITION_DENIED", `Transition denied: ${transition.reason}`, {
          payload: { targetStatus, pendingCount: gateResult.pendingCount, pendingTasks: gateResult.pendingTasks },
        });

        return fail("GATE_DENIED", transition.reason!, { gateDenial: denial });
      }

      await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TRANSITION_DENIED", `Transition denied: ${transition.reason}`, {
        payload: { fromStatus: period.status, targetStatus },
      });

      return fail("INVALID_TRANSITION", transition.reason!);
    }

    // Execute transition
    const timestamps = getPeriodTimestamps(targetStatus);
    const updated = await this.periodRepo.updateStatus(
      ctx.tenantId,
      period.id,
      targetStatus,
      timestamps,
      ctx.actorId,
    );

    await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TRANSITION_SUCCEEDED", `Period transitioned to ${targetStatus}`, {
      payload: { fromStatus: period.status, targetStatus },
    });

    // Side effect: materialize checklist when opening a period
    if (targetStatus === "OPEN") {
      await this.checklistRepo.materialize(
        ctx.tenantId,
        entityCode,
        fiscalYear,
        periodNumber,
      );
    }

    return ok(updated);
  }

  private async buildGateDenial(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
    gateResult: CloseGateResult,
  ): Promise<GateDenialResponse> {
    const checklist = await this.checklistRepo.listByPeriod(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
    );
    const tasks = await this.taskRepo.listByEntity(ctx.tenantId, entityCode);
    const taskMap = new Map(tasks.map((t) => [t.taskCode, t]));

    const pendingDetails: GateDenialDetail[] = gateResult.pendingTasks
      .map((code) => {
        const cl = checklist.find((c) => c.taskCode === code);
        const t = taskMap.get(code);
        if (!cl || !t) return null;
        return {
          reasonCode: mapStatusToReasonCode(cl.taskStatus),
          taskCode: code,
          taskName: t.taskName,
          taskStatus: cl.taskStatus,
          category: t.category,
          completionMode: t.completionMode,
          assignedTo: cl.assignedTo,
          actionHint: deriveActionHint(cl.taskStatus, t.completionMode),
        };
      })
      .filter((d): d is GateDenialDetail => d !== null);

    return {
      targetStatus,
      pendingCount: gateResult.pendingCount,
      pendingTasks: pendingDetails,
      message: `Cannot transition to ${targetStatus}: ${gateResult.pendingCount} mandatory task(s) incomplete`,
    };
  }

  // ── Phase 3: Activity Logging (helper) ──────────────────────────────

  private async logActivity(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    activityType: import("../domain/types.js").CloseActivityType,
    message: string,
    opts?: {
      checklistId?: string | null;
      taskCode?: string | null;
      actorType?: import("../domain/types.js").CloseActivityActorType;
      payload?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    if (!this.activityRepo) return;
    await this.activityRepo.append(ctx.tenantId, {
      entityCode,
      fiscalYear,
      periodNumber,
      checklistId: opts?.checklistId ?? null,
      taskCode: opts?.taskCode ?? null,
      activityType,
      actorType: opts?.actorType ?? "user",
      actorId: ctx.actorId,
      message,
      payload: opts?.payload ?? null,
    });
  }

  // ── Phase 8: Duration Recording (predictive close intelligence) ────

  private async recordTaskDuration(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    originalChecklist: PeriodCloseChecklist,
    updatedChecklist: PeriodCloseChecklist,
    wasWaived: boolean,
  ): Promise<void> {
    if (!this.durationHistoryRepo) return;

    try {
      const completedAt = wasWaived
        ? updatedChecklist.waivedAt ?? new Date()
        : updatedChecklist.completedAt ?? new Date();

      // startedAt: use the checklist's updatedAt as a proxy for when it moved to IN_PROGRESS,
      // or fall back to createdAt if the task was never explicitly started
      const startedAt = originalChecklist.createdAt;

      const durationMs = completedAt.getTime() - startedAt.getTime();
      const actualDurationMinutes = Math.max(0, Math.round(durationMs / 60_000));

      // Determine completion mode from the task template
      const task = await this.taskRepo.getByCode(ctx.tenantId, entityCode, originalChecklist.taskCode);
      const completionMode = task?.completionMode ?? "MANUAL";

      // Check if the task was blocked at any point via its status history
      const wasBlocked = originalChecklist.taskStatus === "BLOCKED";

      await this.durationHistoryRepo.upsert(ctx.tenantId, {
        entityCode,
        fiscalYear,
        periodNumber,
        taskCode: originalChecklist.taskCode,
        taskId: originalChecklist.taskId,
        startedAt,
        completedAt,
        actualDurationMinutes,
        closeType: null, // determined at period level, not task level
        completionMode,
        wasWaived,
        wasBlocked,
        blockDurationMinutes: 0,
        completedBy: wasWaived
          ? updatedChecklist.waivedBy ?? ctx.actorId
          : updatedChecklist.completedBy ?? ctx.actorId,
      });
    } catch {
      // Duration recording is observability — never fail the primary operation
    }
  }

  // ── Phase 9: Auto-Start Ready Successors ───────────────────────────

  private async autoStartReadySuccessors(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    completedTaskCode: string,
  ): Promise<void> {
    try {
      // Load dependencies to find successors of the just-completed task
      const deps = await this.taskRepo.listDependencies(ctx.tenantId, entityCode);
      const tasks = await this.taskRepo.listByEntity(ctx.tenantId, entityCode);

      const taskById = new Map(tasks.map((t) => [t.id, t]));
      const completedTask = tasks.find((t) => t.taskCode === completedTaskCode);
      if (!completedTask) return;

      // Find successor task IDs
      const successorIds = deps
        .filter((d) => d.predecessorTaskId === completedTask.id)
        .map((d) => d.successorTaskId);

      if (successorIds.length === 0) return;

      // For each successor, check if auto_start_when_ready and all predecessors are satisfied
      const allChecklist = await this.checklistRepo.listByPeriod(
        ctx.tenantId, entityCode, fiscalYear, periodNumber,
      );
      const clByTaskId = new Map(allChecklist.map((cl) => [cl.taskId, cl]));

      for (const succId of successorIds) {
        const succTask = taskById.get(succId);
        if (!succTask || !succTask.autoStartWhenReady) continue;
        if (succTask.completionMode === "MANUAL") continue;
        if (!succTask.systemCheckHandler) continue;

        const succChecklist = clByTaskId.get(succId);
        if (!succChecklist || succChecklist.taskStatus !== "PENDING") continue;

        // Check all predecessors of this successor are satisfied
        const predIds = deps
          .filter((d) => d.successorTaskId === succId)
          .map((d) => d.predecessorTaskId);

        const allPredsSatisfied = predIds.every((predId) => {
          const predCl = clByTaskId.get(predId);
          return predCl && (predCl.taskStatus === "COMPLETED" || predCl.taskStatus === "WAIVED");
        });

        if (!allPredsSatisfied) continue;

        // Auto-start: execute the system handler
        await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "HANDLER_EXECUTED",
          `Auto-starting task ${succTask.taskCode} (predecessors satisfied, auto_start_when_ready=true)`, {
            taskCode: succTask.taskCode,
            checklistId: succChecklist.id,
            actorType: "system",
            payload: { trigger: "auto_start_when_ready", triggeredBy: completedTaskCode },
          },
        );

        // Delegate to executeSystemHandler (re-uses all handler logic + telemetry)
        await this.executeSystemHandler(ctx, entityCode, fiscalYear, periodNumber, succTask.taskCode);
      }
    } catch {
      // Auto-start is best-effort — never fail the primary operation
    }
  }

  // ── Phase 3: Waiver Request / Approve / Reject ─────────────────────

  async requestTaskWaiver(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    input: {
      reason: string;
      evidencePayload?: Record<string, unknown> | null;
    },
  ): Promise<ServiceResult<WaiverRequestResult>> {
    const checklist = await this.checklistRepo.getByTaskCode(
      ctx.tenantId, entityCode, fiscalYear, periodNumber, taskCode,
    );
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${taskCode} not found`);
    }

    const task = await this.taskRepo.getByCode(ctx.tenantId, entityCode, taskCode);
    if (!task) {
      return fail("TASK_NOT_FOUND", `Task template ${taskCode} not found`);
    }

    const check = canRequestWaiver(task, checklist, input.reason);
    if (!check.allowed) {
      return fail("WAIVER_DENIED", check.reason!);
    }

    let approvalInstanceId: string | null = null;
    let waiverStatus: WaiverStatus;

    if (requiresWaiverApproval(task)) {
      // Create approval instance via DI-injected approval facade
      if (!this.approvalOps) {
        return fail("APPROVAL_NOT_CONFIGURED", "Approval service not available for waiver approval");
      }

      // Cancel previous approval instance on re-request (e.g. after rejection)
      if (checklist.approvalInstanceId) {
        await this.approvalOps.cancelInstance(ctx, checklist.approvalInstanceId).catch(() => {});
      }

      const approvalResult = await this.approvalOps.createInstance(ctx, {
        entityType: "fin_period_close_waiver",
        entityId: checklist.id,
        triggerEvent: "waiver_requested",
        metadata: {
          taskCode,
          taskName: task.taskName,
          fiscalYear,
          periodNumber,
          entityCode,
          reason: input.reason,
          evidencePayload: input.evidencePayload ?? null,
          checklistStatus: checklist.taskStatus,
        },
      });

      if (!approvalResult.ok) {
        return fail("APPROVAL_CREATION_FAILED", `Failed to create approval instance: ${approvalResult.error.message}`);
      }

      approvalInstanceId = approvalResult.value.id;
      waiverStatus = "pending_approval";
    } else {
      // No approval needed — waive directly
      waiverStatus = "approved";
    }

    // Update checklist waiver state (clear stale decision metadata on re-request)
    await this.checklistRepo.updateWaiverStatus(ctx.tenantId, checklist.id, {
      waiverStatus,
      waiverRequestSubmittedAt: new Date(),
      waiverRequestSubmittedBy: ctx.actorId,
      waiverReason: input.reason,
      waiverDecisionAt: null,
      waiverDecisionBy: null,
      approvalInstanceId,
    });

    // If no approval needed, complete the waiver immediately
    if (waiverStatus === "approved") {
      // Transition to IN_PROGRESS if PENDING
      if (checklist.taskStatus === "PENDING") {
        await this.checklistRepo.updateStatus(ctx.tenantId, checklist.id, "IN_PROGRESS", {});
      }
      await this.checklistRepo.updateStatus(ctx.tenantId, checklist.id, "WAIVED", {
        waivedBy: ctx.actorId,
        waivedAt: new Date(),
        waiverReason: input.reason,
      });

      await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "WAIVER_APPROVED", `Task ${taskCode} waived (no approval required)`, {
        checklistId: checklist.id, taskCode,
        payload: { reason: input.reason, approvalRequired: false },
      });
    } else {
      await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "WAIVER_REQUESTED", `Waiver requested for task ${taskCode} — pending approval`, {
        checklistId: checklist.id, taskCode,
        payload: { reason: input.reason, approvalInstanceId },
      });
    }

    return ok({
      checklistId: checklist.id,
      waiverStatus,
      approvalInstanceId,
      message: waiverStatus === "approved"
        ? `Task ${taskCode} waived successfully`
        : `Waiver request submitted for approval`,
    });
  }

  async approveTaskWaiver(
    ctx: OperationContext,
    checklistId: string,
  ): Promise<ServiceResult<WaiverDecisionResult>> {
    const checklist = await this.checklistRepo.getById(ctx.tenantId, checklistId);
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${checklistId} not found`);
    }

    if (checklist.waiverStatus !== "pending_approval") {
      return fail("INVALID_WAIVER_STATE", `Waiver is not pending approval (current: ${checklist.waiverStatus})`);
    }

    // Update waiver status to approved
    await this.checklistRepo.updateWaiverStatus(ctx.tenantId, checklistId, {
      waiverStatus: "approved",
      waiverDecisionAt: new Date(),
      waiverDecisionBy: ctx.actorId,
    });

    // Transition task to WAIVED
    if (checklist.taskStatus === "PENDING") {
      await this.checklistRepo.updateStatus(ctx.tenantId, checklistId, "IN_PROGRESS", {});
    }
    const updated = await this.checklistRepo.updateStatus(ctx.tenantId, checklistId, "WAIVED", {
      waivedBy: ctx.actorId,
      waivedAt: new Date(),
      waiverApprovalRef: checklist.approvalInstanceId ?? null,
    });

    await this.logActivity(ctx, checklist.entityCode, checklist.fiscalYear, checklist.periodNumber, "WAIVER_APPROVED", `Waiver approved for task ${checklist.taskCode}`, {
      checklistId, taskCode: checklist.taskCode,
      actorType: "approval_engine",
      payload: { approvalInstanceId: checklist.approvalInstanceId },
    });

    return ok({
      checklistId,
      waiverStatus: "approved" as WaiverStatus,
      taskStatus: "WAIVED" as ChecklistTaskStatus,
      message: `Waiver approved — task ${checklist.taskCode} marked as WAIVED`,
    });
  }

  async rejectTaskWaiver(
    ctx: OperationContext,
    checklistId: string,
  ): Promise<ServiceResult<WaiverDecisionResult>> {
    const checklist = await this.checklistRepo.getById(ctx.tenantId, checklistId);
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${checklistId} not found`);
    }

    if (checklist.waiverStatus !== "pending_approval") {
      return fail("INVALID_WAIVER_STATE", `Waiver is not pending approval (current: ${checklist.waiverStatus})`);
    }

    // Update waiver status to rejected — task stays in its current actionable state
    await this.checklistRepo.updateWaiverStatus(ctx.tenantId, checklistId, {
      waiverStatus: "rejected",
      waiverDecisionAt: new Date(),
      waiverDecisionBy: ctx.actorId,
    });

    await this.logActivity(ctx, checklist.entityCode, checklist.fiscalYear, checklist.periodNumber, "WAIVER_REJECTED", `Waiver rejected for task ${checklist.taskCode}`, {
      checklistId, taskCode: checklist.taskCode,
      actorType: "approval_engine",
    });

    return ok({
      checklistId,
      waiverStatus: "rejected" as WaiverStatus,
      taskStatus: checklist.taskStatus,
      message: `Waiver rejected — task ${checklist.taskCode} remains actionable`,
    });
  }

  async getWaiverStatus(
    ctx: OperationContext,
    checklistId: string,
  ): Promise<ServiceResult<{
    waiverStatus: WaiverStatus | null;
    approvalInstanceId: string | null;
  }>> {
    const checklist = await this.checklistRepo.getById(ctx.tenantId, checklistId);
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${checklistId} not found`);
    }
    return ok({
      waiverStatus: checklist.waiverStatus,
      approvalInstanceId: checklist.approvalInstanceId,
    });
  }

  // ── Phase 3: Assignment ────────────────────────────────────────────

  async assignTask(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
    assignment: CloseTaskAssignment,
  ): Promise<ServiceResult<PeriodCloseChecklist>> {
    const checklist = await this.checklistRepo.getByTaskCode(
      ctx.tenantId, entityCode, fiscalYear, periodNumber, taskCode,
    );
    if (!checklist) {
      return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${taskCode} not found`);
    }

    const check = canAssignTask(checklist, assignment);
    if (!check.allowed) {
      return fail("ASSIGNMENT_DENIED", check.reason!);
    }

    const updated = await this.checklistRepo.assignTask(ctx.tenantId, checklist.id, assignment);

    await this.logActivity(ctx, entityCode, fiscalYear, periodNumber, "TASK_ASSIGNED", `Task ${taskCode} assigned`, {
      checklistId: checklist.id, taskCode,
      payload: {
        assignedRole: assignment.assignedRole,
        assignedUserId: assignment.assignedUserId,
        assignedGroupId: assignment.assignedGroupId,
        dueAt: assignment.dueAt,
      },
    });

    return ok(updated);
  }

  async bulkAssignTasks(
    ctx: OperationContext,
    assignments: Array<{
      checklistId: string;
      assignment: CloseTaskAssignment;
    }>,
  ): Promise<ServiceResult<PeriodCloseChecklist[]>> {
    // Validate each assignment before executing bulk
    for (const a of assignments) {
      const checklist = await this.checklistRepo.getById(ctx.tenantId, a.checklistId);
      if (!checklist) {
        return fail("CHECKLIST_ITEM_NOT_FOUND", `Checklist item ${a.checklistId} not found`);
      }
      const check = canAssignTask(checklist, a.assignment);
      if (!check.allowed) {
        return fail("ASSIGNMENT_DENIED", `${checklist.taskCode}: ${check.reason}`);
      }
    }

    const bulkInput = assignments.map((a) => ({
      id: a.checklistId,
      ...a.assignment,
    }));
    const results = await this.checklistRepo.bulkAssignTasks(ctx.tenantId, bulkInput);

    // Log activity for each assignment
    for (const updated of results) {
      await this.logActivity(ctx, updated.entityCode, updated.fiscalYear, updated.periodNumber, "TASK_ASSIGNED", `Task ${updated.taskCode} assigned (bulk)`, {
        checklistId: updated.id, taskCode: updated.taskCode,
        payload: {
          assignedRole: updated.assignedRole,
          assignedUserId: updated.assignedUserId,
          assignedGroupId: updated.assignedGroupId,
          dueAt: updated.dueAt,
        },
      });
    }

    return ok(results);
  }

  // ── Phase 3: Timeline ──────────────────────────────────────────────

  async getTimeline(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    options?: { limit?: number; offset?: number },
  ): Promise<ServiceResult<PeriodCloseActivity[]>> {
    if (!this.activityRepo) {
      return ok([]);
    }
    const activities = await this.activityRepo.listByPeriod(
      ctx.tenantId, entityCode, fiscalYear, periodNumber, options,
    );
    return ok(activities);
  }

  async getTaskTimeline(
    ctx: OperationContext,
    checklistId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ServiceResult<PeriodCloseActivity[]>> {
    if (!this.activityRepo) {
      return ok([]);
    }
    const activities = await this.activityRepo.listByChecklist(
      ctx.tenantId, checklistId, options,
    );
    return ok(activities);
  }

  // ── Phase 3: Gate Recheck ──────────────────────────────────────────

  async recheckTransitionTasks(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<CloseGateResult>> {
    // Get all checklist items for this period
    const allItems = await this.checklistRepo.listByPeriod(
      ctx.tenantId, entityCode, fiscalYear, periodNumber,
    );
    const tasks = await this.taskRepo.listByEntity(ctx.tenantId, entityCode);
    const taskMap = new Map(tasks.map((t) => [t.taskCode, t]));

    // Find SYSTEM/HYBRID tasks gating the target transition that aren't resolved
    const recheckTargets = allItems.filter((cl) => {
      const t = taskMap.get(cl.taskCode);
      if (!t) return false;
      if (t.requiredBefore !== targetStatus) return false;
      if (cl.taskStatus === "COMPLETED" || cl.taskStatus === "WAIVED") return false;
      return t.completionMode === "SYSTEM" || t.completionMode === "HYBRID";
    });

    // Execute handlers for each target
    for (const cl of recheckTargets) {
      const t = taskMap.get(cl.taskCode)!;
      if (!t.systemCheckHandler) continue;

      const handler = this.handlerRegistry.get(t.systemCheckHandler);
      if (!handler) continue;

      // Execute the handler
      const result = await handler.execute(ctx, {
        entityCode,
        fiscalYear,
        periodNumber,
      });

      // Update handler telemetry
      await this.checklistRepo.updateHandlerExecution(ctx.tenantId, cl.id, {
        lastHandlerRunAt: new Date(),
        lastHandlerResult: {
          passed: result.passed,
          message: result.message,
          evidence: result.evidence,
          evidenceCode: result.evidenceCode,
          nextSuggestedAction: result.nextSuggestedAction ?? null,
        },
        handlerRunCount: cl.handlerRunCount + 1,
      });

      // Update checklist status based on result
      if (result.passed) {
        if (cl.taskStatus !== "COMPLETED") {
          if (cl.taskStatus === "PENDING" || cl.taskStatus === "FAILED") {
            await this.checklistRepo.updateStatus(ctx.tenantId, cl.id, "IN_PROGRESS", {});
          }
          await this.checklistRepo.updateStatus(ctx.tenantId, cl.id, "COMPLETED", {
            completedBy: ctx.actorId,
            completedAt: new Date(),
            completionNotes: result.message,
            evidencePayload: result.evidence,
          });
        }
      } else if (cl.taskStatus !== "FAILED") {
        if (cl.taskStatus === "PENDING") {
          await this.checklistRepo.updateStatus(ctx.tenantId, cl.id, "IN_PROGRESS", {});
        }
        await this.checklistRepo.updateStatus(ctx.tenantId, cl.id, "FAILED", {
          failureReason: result.message,
          failedAt: new Date(),
        });
      }

      await this.logActivity(ctx, entityCode, fiscalYear, periodNumber,
        result.passed ? "HANDLER_EXECUTED" : "HANDLER_FAILED",
        `Handler ${t.systemCheckHandler} ${result.passed ? "passed" : "failed"}: ${result.message}`, {
          checklistId: cl.id, taskCode: cl.taskCode,
          actorType: "system",
          payload: { handlerCode: t.systemCheckHandler, ...result },
        },
      );
    }

    // Return fresh gate check
    const gateResult = await this.checklistRepo.checkGate(
      ctx.tenantId, entityCode, fiscalYear, periodNumber, targetStatus,
    );
    return ok(gateResult);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function mapStatusToReasonCode(status: ChecklistTaskStatus): GateDenialReasonCode {
  switch (status) {
    case "PENDING": return "TASK_PENDING";
    case "IN_PROGRESS": return "TASK_IN_PROGRESS";
    case "FAILED": return "TASK_FAILED";
    case "BLOCKED": return "TASK_BLOCKED";
    default: return "TASK_PENDING";
  }
}

function deriveActionHint(
  status: ChecklistTaskStatus,
  completionMode: CloseTaskCompletionMode,
): string | null {
  switch (status) {
    case "PENDING":
    case "IN_PROGRESS":
      return completionMode === "SYSTEM"
        ? "Execute the system handler to complete this task"
        : completionMode === "HYBRID"
          ? "Execute the system handler or manually complete this task"
          : "Manually complete or waive this task";
    case "FAILED":
      return "Investigate the failure and retry the task";
    case "BLOCKED":
      return "Resolve the upstream dependency before proceeding";
    default:
      return null;
  }
}
