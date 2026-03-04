/**
 * Approval Service Implementation
 *
 * Manages approval workflow instances using existing DB tables.
 * Supports SLA timer scheduling via BullMQ (reminder + escalation jobs).
 *
 * Status mapping (DB constraint vs Spec):
 *   Spec "rejected" → DB "canceled" + context.reason = "rejected"
 *   DB "canceled" + context.reason == "rejected" → Spec "rejected"
 *   DB "canceled" + context.reason != "rejected" → Spec "canceled"
 */

import { sql } from "kysely";

import { uuid } from "../data/db-helpers.js";

import {
  SLA_JOB_TYPES,
  type SlaReminderPayload,
  type SlaEscalationPayload,
} from "./workers/sla-timer.worker.js";

import type { ApproverResolverService } from "./approver-resolver.service.js";
import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type { JobQueue } from "@athyper/core";
import type {
  ApprovalService,
  ApprovalInstance,
  ApprovalInstanceStatus,
  ApprovalStage,
  ApprovalTask,
  ApprovalAssignmentSnapshot,
  ApprovalEscalation,
  ApprovalEvent,
  ApprovalDecisionRequest,
  ApprovalDecisionResult,
  ApprovalCreationRequest,
  ApprovalCreationResult,
  ListOptions,
  PaginatedResponse,
  HealthCheckResult,
  LifecycleManager,
  RequestContext,
} from "@athyper/core/meta";

// ============================================================================
// Row Mappers (DB → Spec types with status mapping)
// ============================================================================

function mapInstanceFromDb(row: Record<string, unknown>): ApprovalInstance {
  const dbStatus = row.status as string;
  const context = row.context as Record<string, unknown> | null;

  // Map DB status to spec status
  // DB "canceled" + context.reason == "rejected" → Spec "rejected"
  // DB "canceled" + context.reason != "rejected" → Spec "canceled"
  let specStatus: ApprovalInstance["status"];
  if (dbStatus === "canceled" && context?.reason === "rejected") {
    specStatus = "rejected";
  } else {
    specStatus = dbStatus as ApprovalInstance["status"];
  }

  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    entityName: row.entity_name as string,
    entityId: row.entity_id as string,
    transitionId: (row.transition_id as string) ?? undefined,
    approvalTemplateId: (row.approval_template_id as string) ?? undefined,
    status: specStatus,
    createdAt: row.created_at as Date,
    createdBy: row.created_by as string,
  };
}

function mapStageFromDb(row: Record<string, unknown>): ApprovalStage {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    approvalInstanceId: row.approval_instance_id as string,
    stageNo: row.stage_no as number,
    mode: row.mode as ApprovalStage["mode"],
    status: row.status as ApprovalStage["status"],
    createdAt: row.created_at as Date,
  };
}

function mapTaskFromDb(row: Record<string, unknown>): ApprovalTask {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    approvalInstanceId: row.approval_instance_id as string,
    approvalStageId: row.approval_stage_id as string,
    assigneePrincipalId: (row.assignee_principal_id as string) ?? undefined,
    assigneeGroupId: (row.assignee_group_id as string) ?? undefined,
    taskType: row.task_type as ApprovalTask["taskType"],
    status: row.status as ApprovalTask["status"],
    dueAt: (row.due_at as Date) ?? undefined,
    decidedAt: (row.decided_at as Date) ?? undefined,
    decidedBy: (row.decided_by as string) ?? undefined,
    decisionNote: (row.decision_note as string) ?? undefined,
    createdAt: row.created_at as Date,
  };
}

function mapSnapshotFromDb(
  row: Record<string, unknown>
): ApprovalAssignmentSnapshot {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    approvalTaskId: row.approval_task_id as string,
    resolvedAssignment: (row.resolved_assignment as Record<string, unknown>) ?? {},
    resolvedFromRuleId: (row.resolved_from_rule_id as string) ?? undefined,
    resolvedFromVersionId:
      (row.resolved_from_version_id as string) ?? undefined,
    createdAt: row.created_at as Date,
    createdBy: row.created_by as string,
  };
}

function mapEventFromDb(row: Record<string, unknown>): ApprovalEvent {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    approvalInstanceId: (row.approval_instance_id as string) ?? undefined,
    approvalTaskId: (row.approval_task_id as string) ?? undefined,
    eventType: row.event_type as string,
    payload: (row.payload as Record<string, unknown>) ?? undefined,
    occurredAt: row.occurred_at as Date,
    actorId: (row.actor_id as string) ?? undefined,
    correlationId: (row.correlation_id as string) ?? undefined,
  };
}

function mapEscalationFromDb(
  row: Record<string, unknown>
): ApprovalEscalation {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    approvalInstanceId: row.approval_instance_id as string,
    kind: row.kind as ApprovalEscalation["kind"],
    payload: (row.payload as Record<string, unknown>) ?? undefined,
    occurredAt: row.occurred_at as Date,
  };
}

// ============================================================================
// Approval Service Implementation
// ============================================================================

export class ApprovalServiceImpl implements ApprovalService {
  private lifecycleManager?: LifecycleManager;
  private jobQueue?: JobQueue;
  private approverResolver?: ApproverResolverService;

  constructor(private readonly db: LifecycleDB_Type) {}

  /**
   * Set lifecycle manager for circular dependency resolution.
   * Called by factory after both services are constructed.
   */
  setLifecycleManager(svc: LifecycleManager): void {
    this.lifecycleManager = svc;
  }

  /**
   * Set job queue for SLA timer scheduling.
   * Called by factory after the job queue is resolved from the DI container.
   */
  setJobQueue(queue: JobQueue): void {
    this.jobQueue = queue;
  }

  /**
   * Set approver resolver for advanced assignee resolution strategies.
   * When set, resolveAssignees delegates to the resolver for condition evaluation,
   * role/group/hierarchy expansion, and caching.
   */
  setApproverResolver(resolver: ApproverResolverService): void {
    this.approverResolver = resolver;
  }

  // =========================================================================
  // Instance Creation
  // =========================================================================

  async createApprovalInstance(
    request: ApprovalCreationRequest
  ): Promise<ApprovalCreationResult> {
    try {
      const {
        entityName,
        entityId,
        transitionId,
        approvalTemplateId,
        ctx,
        assignmentContext,
      } = request;

      // 1. Load approval template
      const template = await this.db
        .selectFrom("meta.approval_template")
        .selectAll()
        .where("id", "=", approvalTemplateId)
        .where("tenant_id", "=", ctx.tenantId)
        .executeTakeFirst();

      if (!template) {
        return {
          success: false,
          error: `Approval template "${approvalTemplateId}" not found`,
        };
      }

      // 2. Load template stages
      const templateStages = await this.db
        .selectFrom("meta.approval_template_stage")
        .selectAll()
        .where("approval_template_id", "=", approvalTemplateId)
        .where("tenant_id", "=", ctx.tenantId)
        .orderBy("stage_no", "asc")
        .execute();

      if (templateStages.length === 0) {
        return {
          success: false,
          error: `Approval template "${template.code}" has no stages`,
        };
      }

      // 3. Load routing rules
      const rules = await this.db
        .selectFrom("meta.approval_template_rule")
        .selectAll()
        .where("approval_template_id", "=", approvalTemplateId)
        .where("tenant_id", "=", ctx.tenantId)
        .orderBy("priority", "asc")
        .execute();

      // 4. Create approval instance (stores transition_id for deterministic resume)
      const instanceId = uuid();
      await this.db
        .insertInto("wf.approval_instance")
        .values({
          id: instanceId,
          tenant_id: ctx.tenantId,
          approval_definition_id: approvalTemplateId,
          entity_type: entityName,
          entity_id: entityId,
          status: "open",
          requested_by: ctx.userId,
          metadata: JSON.stringify({ transitionId, assignmentContext: assignmentContext ?? {} }),
        } as any)
        .execute();

      // 5. Create stages
      let totalTasks = 0;
      for (const templateStage of templateStages) {
        const stageId = uuid();
        await (this.db as any)
          .insertInto("wf.approval_stage")
          .values({
            id: stageId,
            tenant_id: ctx.tenantId,
            approval_instance_id: instanceId,
            stage_no: templateStage.stage_no,
            mode: templateStage.mode,
            status: "open",
            created_at: new Date(),
          })
          .execute();

        // 6. Resolve assignees from rules and create tasks
        const assignees = await this.resolveAssignees(
          rules,
          assignmentContext ?? {},
          ctx.tenantId,
        );

        for (const assignee of assignees) {
          const taskId = uuid();
          await this.db
            .insertInto("wf.approval_task")
            .values({
              id: taskId,
              tenant_id: ctx.tenantId,
              approval_instance_id: instanceId,
              approver_id: assignee.principalId ?? assignee.groupId ?? "",
              order_index: totalTasks,
              status: "pending",
              created_by: ctx.userId,
              metadata: JSON.stringify({ stageId, taskType: "approver" }),
            } as any)
            .execute();

          // 7. Create assignment snapshot
          await this.db
            .insertInto("wf.approval_assignment_snapshot")
            .values({
              id: uuid(),
              tenant_id: ctx.tenantId,
              approval_instance_id: instanceId,
              approval_task_id: taskId,
              resolved_assignment: JSON.stringify(assignee),
              resolved_from_rule_id: assignee.ruleId ?? null,
              resolved_from_version_id: null,
              created_at: new Date(),
              created_by: ctx.userId,
            })
            .execute();

          totalTasks++;
        }
      }

      // 8. Log creation event
      await this.logEvent(instanceId, ctx.tenantId, "instance_created", {
        entityName,
        entityId,
        transitionId,
        templateCode: template.code,
        stageCount: templateStages.length,
        taskCount: totalTasks,
      }, ctx.userId);

      return {
        success: true,
        instanceId,
        stageCount: templateStages.length,
        taskCount: totalTasks,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // =========================================================================
  // Instance Queries
  // =========================================================================

  async getInstance(
    instanceId: string,
    tenantId: string
  ): Promise<ApprovalInstance | undefined> {
    const row = await this.db
      .selectFrom("wf.approval_instance")
      .selectAll()
      .where("id", "=", instanceId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return row ? mapInstanceFromDb(row as unknown as Record<string, unknown>) : undefined;
  }

  async getInstanceForEntity(
    entityName: string,
    entityId: string,
    tenantId: string
  ): Promise<ApprovalInstance | undefined> {
    const row = await this.db
      .selectFrom("wf.approval_instance")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_name", "=", entityName)
      .where("entity_id", "=", entityId)
      .where("status", "=", "open")
      .executeTakeFirst();

    return row ? mapInstanceFromDb(row as unknown as Record<string, unknown>) : undefined;
  }

  // =========================================================================
  // Task Management
  // =========================================================================

  async getTask(
    taskId: string,
    tenantId: string
  ): Promise<ApprovalTask | undefined> {
    const row = await this.db
      .selectFrom("wf.approval_task")
      .selectAll()
      .where("id", "=", taskId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return row ? mapTaskFromDb(row as unknown as Record<string, unknown>) : undefined;
  }

  async getTasksForInstance(
    instanceId: string,
    tenantId: string
  ): Promise<ApprovalTask[]> {
    const rows = await this.db
      .selectFrom("wf.approval_task")
      .selectAll()
      .where("approval_instance_id", "=", instanceId)
      .where("tenant_id", "=", tenantId)
      .execute();

    return rows.map((r) => mapTaskFromDb(r as unknown as Record<string, unknown>));
  }

  async getTasksForUser(
    userId: string,
    tenantId: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<ApprovalTask>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const rows = await this.db
      .selectFrom("wf.approval_task")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("assignee_principal_id", "=", userId)
      .where("status", "=", "pending")
      .limit(limit + 1)
      .offset(offset)
      .execute();

    const hasMore = rows.length > limit;
    const data = rows
      .slice(0, limit)
      .map((r) => mapTaskFromDb(r as unknown as Record<string, unknown>));

    return {
      data,
      meta: {
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        total: -1,
        totalPages: -1,
        hasNext: hasMore,
        hasPrev: offset > 0,
      },
    };
  }

  async getAssignmentSnapshot(
    taskId: string,
    tenantId: string
  ): Promise<ApprovalAssignmentSnapshot | undefined> {
    const row = await this.db
      .selectFrom("wf.approval_assignment_snapshot")
      .selectAll()
      .where("approval_task_id", "=", taskId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return row
      ? mapSnapshotFromDb(row as unknown as Record<string, unknown>)
      : undefined;
  }

  // =========================================================================
  // Approval Decisions
  // =========================================================================

  async makeDecision(
    request: ApprovalDecisionRequest
  ): Promise<ApprovalDecisionResult> {
    try {
      const { taskId, decision, note, ctx } = request;

      // 1. Load task
      const task = await this.getTask(taskId, ctx.tenantId);
      if (!task) {
        return { success: false, taskId, error: "Task not found" };
      }
      if (task.status !== "pending") {
        return {
          success: false,
          taskId,
          error: `Task is not pending (current: ${task.status})`,
        };
      }

      // 2. Update task status
      const taskStatus = decision === "approve" ? "approved" : "rejected";
      await this.db
        .updateTable("wf.approval_task")
        .set({
          status: taskStatus,
          decided_at: new Date(),
          decided_by: ctx.userId,
          decision_note: note ?? null,
        })
        .where("id", "=", taskId)
        .where("tenant_id", "=", ctx.tenantId)
        .execute();

      // Cancel any outstanding SLA timers for this task
      await this.cancelTimers(taskId, ctx.tenantId);

      // Log decision event
      await this.logEvent(
        task.approvalInstanceId,
        ctx.tenantId,
        `task_${decision}d`,
        { taskId, decision, note },
        ctx.userId
      );

      // 3. Check if stage is complete
      const stageComplete = await this.isStageComplete(
        task.approvalStageId,
        ctx.tenantId
      );

      let stageStatus: string | undefined;
      let instanceStatus: ApprovalInstanceStatus | undefined;
      let transitionTriggered = false;

      if (stageComplete) {
        // Determine stage outcome
        const stageOutcome = await this.resolveStageOutcome(
          task.approvalStageId,
          ctx.tenantId
        );
        stageStatus = stageOutcome;

        // Update stage status
        await this.db
          .updateTable("wf.approval_stage")
          .set({ status: stageOutcome === "rejected" ? "canceled" : "completed" })
          .where("id", "=", task.approvalStageId)
          .where("tenant_id", "=", ctx.tenantId)
          .execute();

        // 4. Check if instance is complete
        if (stageOutcome === "rejected") {
          // Rejection at any stage → cancel instance with rejected reason
          await this.db
            .updateTable("wf.approval_instance")
            .set({
              status: "canceled",
              context: JSON.stringify({ reason: "rejected" }),
            })
            .where("id", "=", task.approvalInstanceId)
            .where("tenant_id", "=", ctx.tenantId)
            .execute();

          instanceStatus = "rejected";

          await this.logEvent(
            task.approvalInstanceId,
            ctx.tenantId,
            "instance_rejected",
            { rejectedTaskId: taskId },
            ctx.userId
          );
        } else {
          // Stage completed with approval — check if all stages done
          const allComplete = await this.isInstanceComplete(
            task.approvalInstanceId,
            ctx.tenantId
          );

          if (allComplete) {
            await this.db
              .updateTable("wf.approval_instance")
              .set({ status: "completed" })
              .where("id", "=", task.approvalInstanceId)
              .where("tenant_id", "=", ctx.tenantId)
              .execute();

            instanceStatus = "completed";

            await this.logEvent(
              task.approvalInstanceId,
              ctx.tenantId,
              "instance_completed",
              {},
              ctx.userId
            );

            // 5. Trigger lifecycle resume on completion
            transitionTriggered = await this.resumeLifecycleTransition(
              task.approvalInstanceId,
              ctx.tenantId
            );
          }
        }
      }

      return {
        success: true,
        taskId,
        taskStatus,
        stageStatus,
        instanceStatus,
        transitionTriggered,
      };
    } catch (error) {
      return {
        success: false,
        taskId: request.taskId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async isInstanceComplete(
    instanceId: string,
    tenantId: string
  ): Promise<boolean> {
    const stages = await this.db
      .selectFrom("wf.approval_stage")
      .select(["id", "status"])
      .where("approval_instance_id", "=", instanceId)
      .where("tenant_id", "=", tenantId)
      .execute();

    // All stages must be completed (not open/canceled)
    return stages.length > 0 && stages.every((s) => s.status === "completed");
  }

  async isStageComplete(stageId: string, tenantId: string): Promise<boolean> {
    const stage = await this.db
      .selectFrom("wf.approval_stage")
      .selectAll()
      .where("id", "=", stageId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!stage) return false;

    const tasks = await this.db
      .selectFrom("wf.approval_task")
      .select(["status"])
      .where("approval_stage_id", "=", stageId)
      .where("tenant_id", "=", tenantId)
      .execute();

    if (tasks.length === 0) return true;

    const mode = (stage as any).mode as string;
    const quorum = (stage as any).quorum as { type?: string; value?: number } | null;

    if (mode === "serial") {
      // Serial: all tasks must be completed in order (no pending tasks)
      return tasks.every((t) => t.status !== "pending");
    }

    // Parallel mode: check quorum
    if (quorum && quorum.type === "count" && typeof quorum.value === "number") {
      // Count-based quorum: N approvals needed
      const approvedCount = tasks.filter((t) => t.status === "approved").length;
      return approvedCount >= quorum.value;
    }

    if (quorum && quorum.type === "percentage" && typeof quorum.value === "number") {
      // Percentage-based quorum: X% of tasks must be approved
      const approvedCount = tasks.filter((t) => t.status === "approved").length;
      const requiredCount = Math.ceil((quorum.value / 100) * tasks.length);
      return approvedCount >= requiredCount;
    }

    // Default parallel: all tasks must be non-pending (unanimous)
    return tasks.every((t) => t.status !== "pending");
  }

  // =========================================================================
  // SLA Timers
  // =========================================================================

  /**
   * Schedule a reminder job that fires at the given time.
   * Uses BullMQ delayed job. If no job queue is configured, silently no-ops.
   */
  async scheduleReminder(
    taskId: string,
    fireAt: Date,
    tenantId: string
  ): Promise<void> {
    if (!this.jobQueue) return;

    const delayMs = fireAt.getTime() - Date.now();
    if (delayMs <= 0) return; // Already past due — skip scheduling

    // Load task to get instance/stage IDs for the job payload
    const task = await this.getTask(taskId, tenantId);
    if (!task || task.status !== "pending") return;

    const payload: SlaReminderPayload = {
      taskId,
      tenantId,
      instanceId: task.approvalInstanceId,
      stageId: task.approvalStageId,
    };

    await this.jobQueue.add(
      {
        type: SLA_JOB_TYPES.REMINDER,
        payload,
        metadata: {
          scheduledFor: fireAt.toISOString(),
          taskId,
        },
      },
      {
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
      },
    );

    await this.logEvent(
      task.approvalInstanceId,
      tenantId,
      "sla_reminder_scheduled",
      { taskId, fireAt: fireAt.toISOString() },
      "system",
    );
  }

  /**
   * Schedule an escalation job that fires at the given time.
   * Carries the escalation payload (reassignment target, notification config, etc.).
   */
  async scheduleEscalation(
    taskId: string,
    fireAt: Date,
    escalationPayload: Record<string, unknown>,
    tenantId: string
  ): Promise<void> {
    if (!this.jobQueue) return;

    const delayMs = fireAt.getTime() - Date.now();
    if (delayMs <= 0) return;

    const task = await this.getTask(taskId, tenantId);
    if (!task || task.status !== "pending") return;

    const payload: SlaEscalationPayload = {
      taskId,
      tenantId,
      instanceId: task.approvalInstanceId,
      stageId: task.approvalStageId,
      escalation: escalationPayload,
    };

    await this.jobQueue.add(
      {
        type: SLA_JOB_TYPES.ESCALATION,
        payload,
        metadata: {
          scheduledFor: fireAt.toISOString(),
          taskId,
          escalationKind: escalationPayload.kind ?? "sla_breach",
        },
      },
      {
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: true,
      },
    );

    await this.logEvent(
      task.approvalInstanceId,
      tenantId,
      "sla_escalation_scheduled",
      { taskId, fireAt: fireAt.toISOString(), escalationKind: escalationPayload.kind },
      "system",
    );
  }

  /**
   * Process a reminder when the job fires.
   * Verifies the task is still pending, then logs the reminder event.
   * Notification delivery is delegated to the notification service (future integration).
   */
  async processReminder(
    taskId: string,
    tenantId: string
  ): Promise<void> {
    const task = await this.getTask(taskId, tenantId);
    if (!task || task.status !== "pending") return;

    await this.logEvent(
      task.approvalInstanceId,
      tenantId,
      "sla_reminder_sent",
      {
        taskId,
        assigneePrincipalId: task.assigneePrincipalId,
        assigneeGroupId: task.assigneeGroupId,
      },
      "system",
    );
  }

  /**
   * Process an escalation when the job fires.
   * Records an escalation row in `wf.approval_escalation` and logs the event.
   */
  async processEscalation(
    taskId: string,
    escalationPayload: Record<string, unknown>,
    tenantId: string
  ): Promise<void> {
    const task = await this.getTask(taskId, tenantId);
    if (!task || task.status !== "pending") return;

    // Record escalation
    await this.db
      .insertInto("wf.approval_escalation")
      .values({
        id: uuid(),
        tenant_id: tenantId,
        approval_instance_id: task.approvalInstanceId,
        kind: (escalationPayload.kind as string) ?? "sla_breach",
        payload: JSON.stringify(escalationPayload),
        occurred_at: new Date(),
      })
      .execute();

    await this.logEvent(
      task.approvalInstanceId,
      tenantId,
      "sla_escalation_executed",
      {
        taskId,
        escalationKind: escalationPayload.kind ?? "sla_breach",
        escalationPayload,
      },
      "system",
    );
  }

  /**
   * Cancel outstanding SLA timers for a task.
   *
   * Since BullMQ jobs don't support metadata-based cancellation directly,
   * the worker handlers perform a guard check (task.status !== "pending" → skip).
   * This method logs the cancellation intent for audit trail; the actual
   * jobs are silently skipped when they fire.
   */
  async cancelTimers(
    taskId: string,
    tenantId: string
  ): Promise<void> {
    // Guard check ensures workers skip stale jobs at execution time.
    // Log the intent for audit purposes.
    const task = await this.getTask(taskId, tenantId);
    if (task) {
      await this.logEvent(
        task.approvalInstanceId,
        tenantId,
        "sla_timers_cancelled",
        { taskId, reason: "task_resolved" },
        "system",
      );
    }
  }

  /**
   * Rehydrate SLA timers after a restart.
   * Scans for pending tasks with a due_at in the future and reschedules
   * reminder + escalation jobs if missing.
   */
  async rehydratePendingTimers(tenantId: string): Promise<number> {
    const pendingTasks = await this.db
      .selectFrom("wf.approval_task")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "pending")
      .where("due_at", "is not", null)
      .execute();

    let scheduled = 0;

    for (const row of pendingTasks) {
      const task = mapTaskFromDb(row as unknown as Record<string, unknown>);
      if (!task.dueAt) continue;

      const dueAt = new Date(task.dueAt);
      if (dueAt.getTime() <= Date.now()) continue; // Already past

      // Schedule a reminder at 75% of time-to-deadline
      const timeUntilDue = dueAt.getTime() - Date.now();
      const reminderAt = new Date(Date.now() + timeUntilDue * 0.75);

      await this.scheduleReminder(task.id, reminderAt, tenantId);
      await this.scheduleEscalation(
        task.id,
        dueAt,
        { kind: "sla_breach", rehydrated: true },
        tenantId,
      );
      scheduled++;
    }

    return scheduled;
  }

  // =========================================================================
  // Approval History
  // =========================================================================

  async getEvents(
    instanceId: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<ApprovalEvent>> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const rows = await this.db
      .selectFrom("wf.approval_event")
      .selectAll()
      .where("approval_instance_id", "=", instanceId)
      .orderBy("occurred_at", "asc")
      .limit(limit + 1)
      .offset(offset)
      .execute();

    const hasMore = rows.length > limit;
    const data = rows
      .slice(0, limit)
      .map((r) => mapEventFromDb(r as unknown as Record<string, unknown>));

    return {
      data,
      meta: {
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        total: -1,
        totalPages: -1,
        hasNext: hasMore,
        hasPrev: offset > 0,
      },
    };
  }

  async getEscalations(
    instanceId: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<ApprovalEscalation>> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const rows = await this.db
      .selectFrom("wf.approval_escalation")
      .selectAll()
      .where("approval_instance_id", "=", instanceId)
      .orderBy("occurred_at", "desc")
      .limit(limit + 1)
      .offset(offset)
      .execute();

    const hasMore = rows.length > limit;
    const data = rows
      .slice(0, limit)
      .map((r) => mapEscalationFromDb(r as unknown as Record<string, unknown>));

    return {
      data,
      meta: {
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        total: -1,
        totalPages: -1,
        hasNext: hasMore,
        hasPrev: offset > 0,
      },
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      await sql`SELECT 1 FROM wf.approval_instance LIMIT 0`.execute(this.db);
      return { healthy: true, name: "approval-service" };
    } catch (error) {
      return {
        healthy: false,
        name: "approval-service",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // =========================================================================
  // Internal Helpers
  // =========================================================================

  /**
   * Resolve assignees from routing rules.
   *
   * When an ApproverResolverService is available, delegates to it for:
   * - Condition evaluation (shared condition evaluator)
   * - Multi-strategy resolution (role, group, hierarchy, department, custom_field)
   * - Redis-backed caching
   *
   * Falls back to simple direct assignment when no resolver is configured.
   */
  private async resolveAssignees(
    rules: Array<{
      id: string;
      conditions: unknown;
      assign_to: unknown;
      priority?: number;
    }>,
    context: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Array<{
    principalId?: string;
    groupId?: string;
    ruleId?: string;
  }>> {
    if (rules.length === 0) return [];

    // Delegate to resolver if available (full condition eval + strategy expansion)
    if (this.approverResolver && tenantId) {
      return this.approverResolver.resolveAssignees(rules, context, tenantId);
    }

    // Fallback: simple direct assignment (Phase-1 compatible)
    for (const rule of rules) {
      const assignTo = rule.assign_to as Record<string, unknown>;
      if (!assignTo) continue;

      const assignees: Array<{
        principalId?: string;
        groupId?: string;
        ruleId?: string;
      }> = [];

      const assignments = Array.isArray(assignTo.assignees)
        ? (assignTo.assignees as Record<string, unknown>[])
        : [assignTo];

      for (const assignment of assignments) {
        assignees.push({
          principalId: (assignment.principal_id as string) ?? undefined,
          groupId: (assignment.group_id as string) ?? undefined,
          ruleId: rule.id,
        });
      }

      if (assignees.length > 0) return assignees;
    }

    return [];
  }

  /**
   * Determine the outcome of a completed stage.
   * If any task was rejected, the stage outcome is "rejected".
   */
  private async resolveStageOutcome(
    stageId: string,
    tenantId: string
  ): Promise<"completed" | "rejected"> {
    const tasks = await this.db
      .selectFrom("wf.approval_task")
      .select(["status"])
      .where("approval_stage_id", "=", stageId)
      .where("tenant_id", "=", tenantId)
      .execute();

    const hasRejection = tasks.some((t) => t.status === "rejected");
    return hasRejection ? "rejected" : "completed";
  }

  /**
   * Resume lifecycle transition after approval completes.
   * Uses stored transition_id for deterministic operation lookup.
   * Passes _approvalBypass flag to prevent gate re-evaluation loop.
   */
  private async resumeLifecycleTransition(
    instanceId: string,
    tenantId: string
  ): Promise<boolean> {
    if (!this.lifecycleManager) return false;

    // Load instance to get transition_id
    const instance = await this.db
      .selectFrom("wf.approval_instance")
      .select(["transition_id", "entity_name", "entity_id"])
      .where("id", "=", instanceId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!instance?.transition_id) return false;

    // Look up operation_code from transition
    const transition = await this.db
      .selectFrom("meta.lifecycle_transition")
      .select(["operation_code"])
      .where("id", "=", instance.transition_id)
      .executeTakeFirst();

    if (!transition) return false;

    // Build system actor context with bypass flag
    const systemCtx: RequestContext = {
      userId: "system",
      tenantId,
      realmId: "system",
      roles: ["system"],
      metadata: {
        _approvalBypass: true,
        _approvalInstanceId: instanceId,
      },
    };

    try {
      const result = await this.lifecycleManager.transition({
        entityName: instance.entity_name,
        entityId: instance.entity_id,
        operationCode: transition.operation_code,
        ctx: systemCtx,
      });
      return result.success;
    } catch {
      // Log but don't fail the approval decision
      await this.logEvent(
        instanceId,
        tenantId,
        "lifecycle_resume_failed",
        { transitionId: instance.transition_id },
        "system"
      );
      return false;
    }
  }

  /**
   * Log an approval event
   */
  private async logEvent(
    instanceId: string,
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
    actorId?: string
  ): Promise<void> {
    try {
      await this.db
        .insertInto("wf.approval_event")
        .values({
          id: uuid(),
          tenant_id: tenantId,
          approval_instance_id: instanceId,
          approval_task_id: null,
          event_type: eventType,
          payload: JSON.stringify(payload),
          occurred_at: new Date(),
          actor_id: actorId ?? null,
          correlation_id: null,
        })
        .execute();
    } catch {
      // Best-effort logging — don't fail the operation
    }
  }
}
