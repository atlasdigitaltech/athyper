/**
 * Approval Task Service
 *
 * Manages approval tasks, inbox operations, and work queue.
 */

import { DEFAULT_WORK_QUEUE_CONFIG } from "./types.js";

import type {
  ApprovalTask,
  IApprovalTaskRepository,
  IApprovalTaskService,
  InboxFilterOptions,
  InboxSummary,
  INotificationService,
  ReminderSchedule,
  TaskPriority,
  TaskType,
  WorkQueueConfig,
  WorkQueueItem,
} from "./types.js";
import type {
  ApprovalInstance,
  ApprovalStepInstance,
  AssignedApprover,
} from "../instance/types.js";
import type { ApprovalActionType, SlaDuration } from "../types.js";

/**
 * Generate unique ID
 */
function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Calculate due date from SLA duration
 */
function _calculateDueDate(sla: SlaDuration, startFrom: Date = new Date()): Date {
  const dueDate = new Date(startFrom);

  switch (sla.unit) {
    case "minutes":
      dueDate.setMinutes(dueDate.getMinutes() + sla.value);
      break;
    case "hours":
      dueDate.setHours(dueDate.getHours() + sla.value);
      break;
    case "days":
      dueDate.setDate(dueDate.getDate() + sla.value);
      break;
    case "business_days": {
      // Simple implementation: add days, skipping weekends
      let daysToAdd = sla.value;
      while (daysToAdd > 0) {
        dueDate.setDate(dueDate.getDate() + 1);
        const dayOfWeek = dueDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          daysToAdd--;
        }
      }
      break;
    }
  }

  return dueDate;
}

/**
 * Calculate warning date (percentage of SLA time)
 */
function calculateWarningDate(
  startDate: Date,
  dueDate: Date,
  warningThresholdPercent: number = 80
): Date {
  const totalMs = dueDate.getTime() - startDate.getTime();
  const warningMs = totalMs * (warningThresholdPercent / 100);
  return new Date(startDate.getTime() + warningMs);
}

/**
 * Determine task priority from step configuration
 */
function determineTaskPriority(
  stepInstance: ApprovalStepInstance,
  instance: ApprovalInstance
): TaskPriority {
  // Check if this is an escalated step
  const escalationCount = stepInstance.sla?.escalationCount ?? 0;
  if (escalationCount > 0) {
    return "urgent";
  }

  // Check entity amount for priority from metadata
  const entityData = instance.metadata as Record<string, unknown> | undefined;
  const amount = entityData?.amount;
  if (typeof amount === "number") {
    if (amount >= 100000) return "urgent";
    if (amount >= 50000) return "high";
    if (amount >= 10000) return "normal";
  }

  return "normal";
}

/**
 * Determine task type from approver assignment
 */
function determineTaskType(
  approver: AssignedApprover,
  stepInstance: ApprovalStepInstance
): TaskType {
  const escalationCount = stepInstance.sla?.escalationCount ?? 0;
  if (escalationCount > 0) {
    return "escalation";
  }

  if (approver.delegatedTo) {
    return "delegation";
  }

  return "approval";
}

/**
 * Calculate SLA status
 */
function calculateSlaStatus(
  dueAt: Date,
  warningAt?: Date
): {
  isOverdue: boolean;
  timeRemainingMs: number;
  slaStatus: "on_track" | "warning" | "breached";
} {
  const now = new Date();
  const timeRemainingMs = dueAt.getTime() - now.getTime();
  const isOverdue = timeRemainingMs < 0;

  let slaStatus: "on_track" | "warning" | "breached";

  if (isOverdue) {
    slaStatus = "breached";
  } else if (warningAt && now >= warningAt) {
    slaStatus = "warning";
  } else {
    slaStatus = "on_track";
  }

  return { isOverdue, timeRemainingMs, slaStatus };
}

/**
 * Calculate urgency score for work queue ordering
 */
function calculateUrgencyScore(
  task: ApprovalTask,
  config: WorkQueueConfig
): number {
  let score = 0;
  const weights = config.urgencyWeights;

  // SLA status
  if (task.sla.slaStatus === "breached") {
    score += weights.overdue;
  } else if (task.sla.slaStatus === "warning") {
    score += weights.warning;
  }

  // Priority
  if (task.priority === "urgent") {
    score += weights.urgent;
  } else if (task.priority === "high") {
    score += weights.highPriority;
  }

  // Task type
  if (task.type === "escalation") {
    score += weights.escalated;
  } else if (task.type === "delegation") {
    score += weights.delegated;
  }

  return score;
}

/**
 * Get allowed actions from workflow template
 */
function getStepAllowedActions(
  stepInstance: ApprovalStepInstance,
  instance: ApprovalInstance
): ApprovalActionType[] {
  // Get from workflow snapshot
  const template = instance.workflowSnapshot.definition;
  const stepDef = template.steps.find(s => s.id === stepInstance.stepDefinitionId);

  // Step-level allowed actions override template-level
  if (stepDef?.allowedActions && stepDef.allowedActions.length > 0) {
    return stepDef.allowedActions;
  }

  // Fall back to template-level allowed actions
  if (template.allowedActions && template.allowedActions.length > 0) {
    return template.allowedActions;
  }

  // Default actions
  return ["approve", "reject"];
}

/**
 * Approval Task Service Implementation
 */
export class ApprovalTaskService implements IApprovalTaskService {
  constructor(
    private readonly repository: IApprovalTaskRepository,
    private readonly notificationService?: INotificationService
  ) {}

  /**
   * Create tasks for a step (called when step is activated)
   */
  async createTasksForStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance
  ): Promise<ApprovalTask[]> {
    const tasks: ApprovalTask[] = [];
    const now = new Date();

    // Get SLA due date from step instance
    const dueAt = stepInstance.sla?.responseDueAt ||
                  stepInstance.sla?.completionDueAt ||
                  new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default 24 hours

    const warningAt = calculateWarningDate(now, dueAt, 80);

    const priority = determineTaskPriority(stepInstance, instance);
    const allowedActions = getStepAllowedActions(stepInstance, instance);

    // Create a task for each assigned approver
    for (const approver of stepInstance.approvers) {
      const taskType = determineTaskType(approver, stepInstance);
      const slaInfo = calculateSlaStatus(dueAt, warningAt);

      const taskData: Omit<ApprovalTask, "id" | "createdAt"> = {
        tenantId,
        orgId: instance.orgId,
        instanceId: instance.id,
        stepInstanceId: stepInstance.id,
        assignmentId: approver.id,
        type: taskType,
        status: "pending",
        priority,
        assigneeId: approver.userId,
        assigneeDisplayName: approver.displayName,
        assigneeEmail: approver.email,
        title: `Approval required: ${instance.entity.type} - ${instance.entity.referenceCode || instance.entity.id}`,
        description: `${stepInstance.name}: Please review and take action on this ${instance.entity.type}.`,
        entity: {
          type: instance.entity.type,
          id: instance.entity.id,
          referenceCode: instance.entity.referenceCode,
          displayName: instance.entity.displayName,
        },
        workflow: {
          templateCode: instance.workflowSnapshot.templateCode,
          templateName: instance.workflowSnapshot.templateName,
          stepName: stepInstance.name,
          stepLevel: stepInstance.level,
        },
        requester: {
          userId: instance.requester.userId,
          displayName: instance.requester.displayName,
        },
        availableActions: allowedActions,
        sla: {
          dueAt,
          warningAt,
          ...slaInfo,
        },
        delegation: approver.delegatedTo
          ? {
              originalAssigneeId: approver.userId,
              originalAssigneeDisplayName: approver.displayName,
              delegatedBy: approver.userId,
              delegatedAt: approver.delegatedTo.delegatedAt,
              reason: approver.delegatedTo.reason,
            }
          : undefined,
        escalation:
          (stepInstance.sla?.escalationCount ?? 0) > 0
            ? {
                escalationLevel: stepInstance.sla?.escalationCount ?? 1,
                escalatedAt: now,
              }
            : undefined,
        isRead: false,
      };

      tasks.push(taskData as ApprovalTask);
    }

    // Bulk create tasks
    const createdTasks = await this.repository.createBulk(tenantId, tasks);

    // Send notifications for each created task
    if (this.notificationService) {
      for (const task of createdTasks) {
        await this.notificationService.sendTaskAssigned(tenantId, task);
      }
    }

    // Schedule reminders
    for (const task of createdTasks) {
      await this.scheduleReminders(tenantId, task);
    }

    return createdTasks;
  }

  /**
   * Get user's inbox with filtering
   */
  async getInbox(
    tenantId: string,
    userId: string,
    options?: InboxFilterOptions
  ): Promise<ApprovalTask[]> {
    const tasks = await this.repository.list(tenantId, userId, options);

    // Update SLA info for each task (it may have changed since last fetch)
    return tasks.map((task) => ({
      ...task,
      sla: {
        ...task.sla,
        ...calculateSlaStatus(task.sla.dueAt, task.sla.warningAt),
      },
    }));
  }

  /**
   * Get inbox summary for quick overview
   */
  async getInboxSummary(tenantId: string, userId: string): Promise<InboxSummary> {
    return this.repository.getInboxSummary(tenantId, userId);
  }

  /**
   * Get work queue with urgency scoring
   */
  async getWorkQueue(
    tenantId: string,
    userId: string,
    config?: Partial<WorkQueueConfig>
  ): Promise<WorkQueueItem[]> {
    const fullConfig: WorkQueueConfig = {
      ...DEFAULT_WORK_QUEUE_CONFIG,
      ...config,
    };

    // Build filter options
    const filterOptions: InboxFilterOptions = {
      status: ["pending", "in_progress"],
      limit: fullConfig.maxItems,
    };

    // Get tasks
    const tasks = await this.repository.list(tenantId, userId, filterOptions);

    // Calculate work queue items with scores
    const now = new Date();
    const workQueueItems: WorkQueueItem[] = tasks.map((task) => {
      const slaInfo = calculateSlaStatus(task.sla.dueAt, task.sla.warningAt);
      const taskWithUpdatedSla: ApprovalTask = {
        ...task,
        sla: { ...task.sla, ...slaInfo },
      };

      const urgencyScore = calculateUrgencyScore(taskWithUpdatedSla, fullConfig);
      const ageMs = now.getTime() - task.createdAt.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      const hoursUntilDue = slaInfo.timeRemainingMs / (1000 * 60 * 60);

      return {
        ...taskWithUpdatedSla,
        urgencyScore,
        ageHours,
        hoursUntilDue,
      };
    });

    // Sort by urgency score (descending)
    workQueueItems.sort((a, b) => b.urgencyScore - a.urgencyScore);

    return workQueueItems;
  }

  /**
   * Get a single task by ID
   */
  async getTask(tenantId: string, taskId: string): Promise<ApprovalTask | undefined> {
    const task = await this.repository.getById(tenantId, taskId);
    if (!task) return undefined;

    // Update SLA info
    return {
      ...task,
      sla: {
        ...task.sla,
        ...calculateSlaStatus(task.sla.dueAt, task.sla.warningAt),
      },
    };
  }

  /**
   * Mark task as read
   */
  async markAsRead(tenantId: string, taskId: string): Promise<ApprovalTask> {
    const task = await this.repository.getById(tenantId, taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.isRead) {
      return task;
    }

    return this.repository.update(tenantId, taskId, {
      isRead: true,
      readAt: new Date(),
    });
  }

  /**
   * Mark all tasks as read for a user
   */
  async markAllAsRead(tenantId: string, userId: string): Promise<void> {
    const tasks = await this.repository.list(tenantId, userId, {
      unreadOnly: true,
    });

    const now = new Date();
    for (const task of tasks) {
      await this.repository.update(tenantId, task.id, {
        isRead: true,
        readAt: now,
      });
    }
  }

  /**
   * Complete task (called when action is taken)
   */
  async completeTask(
    tenantId: string,
    taskId: string,
    action: ApprovalActionType,
    userId: string
  ): Promise<ApprovalTask> {
    const task = await this.repository.getById(tenantId, taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.assigneeId !== userId) {
      throw new Error("Only the assigned user can complete this task");
    }

    if (task.status === "completed" || task.status === "cancelled") {
      throw new Error(`Task is already ${task.status}`);
    }

    const updatedTask = await this.repository.update(tenantId, taskId, {
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    });

    // Send notification about completion
    if (this.notificationService) {
      // Notification to requester will be handled by instance service
    }

    return updatedTask;
  }

  /**
   * Delegate task to another user
   */
  async delegateTask(
    tenantId: string,
    taskId: string,
    delegateTo: string,
    delegatedBy: string,
    reason?: string
  ): Promise<ApprovalTask> {
    const originalTask = await this.repository.getById(tenantId, taskId);
    if (!originalTask) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (originalTask.assigneeId !== delegatedBy) {
      throw new Error("Only the assigned user can delegate this task");
    }

    if (originalTask.status !== "pending" && originalTask.status !== "in_progress") {
      throw new Error("Can only delegate pending or in-progress tasks");
    }

    const now = new Date();

    // Update original task as delegated
    await this.repository.update(tenantId, taskId, {
      status: "delegated",
      updatedAt: now,
    });

    // Create new task for delegatee
    const delegatedTask: Omit<ApprovalTask, "id" | "createdAt"> = {
      ...originalTask,
      assigneeId: delegateTo,
      assigneeDisplayName: undefined, // Will be resolved by caller
      assigneeEmail: undefined,
      type: "delegation",
      status: "pending",
      isRead: false,
      readAt: undefined,
      delegation: {
        originalAssigneeId: originalTask.assigneeId,
        originalAssigneeDisplayName: originalTask.assigneeDisplayName,
        delegatedBy,
        delegatedAt: now,
        reason,
      },
      updatedAt: now,
      completedAt: undefined,
    };

    const newTask = await this.repository.create(tenantId, delegatedTask);

    // Send notification to delegatee
    if (this.notificationService) {
      await this.notificationService.sendTaskAssigned(tenantId, newTask);
    }

    return newTask;
  }

  /**
   * Cancel tasks for an instance
   */
  async cancelTasksForInstance(tenantId: string, instanceId: string): Promise<void> {
    await this.repository.updateByInstanceId(tenantId, instanceId, {
      status: "cancelled",
      updatedAt: new Date(),
    });
  }

  /**
   * Process overdue tasks
   */
  async processOverdueTasks(tenantId: string): Promise<void> {
    const overdueTasks = await this.repository.getOverdueTasks(tenantId);

    for (const task of overdueTasks) {
      // Mark as expired
      await this.repository.update(tenantId, task.id, {
        status: "expired",
        sla: {
          ...task.sla,
          isOverdue: true,
          slaStatus: "breached",
        },
        updatedAt: new Date(),
      });

      // Send SLA breach notification
      if (this.notificationService) {
        await this.notificationService.sendSlaBreach(tenantId, task);
      }
    }
  }

  /**
   * Schedule reminders for a task
   */
  async scheduleReminders(
    tenantId: string,
    task: ApprovalTask
  ): Promise<ReminderSchedule[]> {
    const schedules: ReminderSchedule[] = [];
    const now = new Date();
    const dueAt = task.sla.dueAt;

    // Calculate reminder times (at 50%, 75%, 90% of SLA time)
    const reminderPercentages = [50, 75, 90];
    const totalMs = dueAt.getTime() - now.getTime();

    for (let i = 0; i < reminderPercentages.length; i++) {
      const pct = reminderPercentages[i];
      const reminderMs = totalMs * (pct / 100);
      const scheduledAt = new Date(now.getTime() + reminderMs);

      // Only schedule if in the future
      if (scheduledAt > now) {
        schedules.push({
          id: generateId(),
          taskId: task.id,
          instanceId: task.instanceId,
          reminderNumber: i + 1,
          scheduledAt,
          status: "pending",
        });
      }
    }

    // Also schedule a warning reminder at the warning threshold
    if (task.sla.warningAt && task.sla.warningAt > now) {
      schedules.push({
        id: generateId(),
        taskId: task.id,
        instanceId: task.instanceId,
        reminderNumber: schedules.length + 1,
        scheduledAt: task.sla.warningAt,
        status: "pending",
      });
    }

    return schedules;
  }

  /**
   * Get tasks for an instance (admin operation)
   */
  async getTasksForInstance(
    tenantId: string,
    instanceId: string
  ): Promise<ApprovalTask[]> {
    return this.repository.getTasksForInstance(tenantId, instanceId);
  }

  /**
   * Reassign task to a different user (admin operation)
   */
  async reassignTask(
    tenantId: string,
    taskId: string,
    newAssigneeId: string,
    reassignedBy: string
  ): Promise<ApprovalTask> {
    const task = await this.repository.getById(tenantId, taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === "completed" || task.status === "cancelled") {
      throw new Error(`Cannot reassign ${task.status} task`);
    }

    const now = new Date();
    const updatedTask = await this.repository.update(tenantId, taskId, {
      assigneeId: newAssigneeId,
      assigneeDisplayName: undefined, // Will be resolved by caller
      assigneeEmail: undefined,
      isRead: false,
      readAt: undefined,
      delegation: {
        originalAssigneeId: task.assigneeId,
        originalAssigneeDisplayName: task.assigneeDisplayName,
        delegatedBy: reassignedBy,
        delegatedAt: now,
        reason: "Reassigned by administrator",
      },
      updatedAt: now,
    });

    // Send notification to new assignee
    if (this.notificationService) {
      await this.notificationService.sendTaskAssigned(tenantId, updatedTask);
    }

    return updatedTask;
  }
}

/**
 * Factory function to create task service
 */
export function createApprovalTaskService(
  repository: IApprovalTaskRepository,
  notificationService?: INotificationService
): IApprovalTaskService {
  return new ApprovalTaskService(repository, notificationService);
}
