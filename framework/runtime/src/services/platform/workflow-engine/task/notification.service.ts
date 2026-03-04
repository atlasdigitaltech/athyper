/**
 * Notification Service — Event-based Facade
 *
 * Thin facade over the notification framework. Publishes domain events
 * (as plan-notification jobs) instead of handling delivery directly.
 * The NotificationOrchestrator picks these up via BullMQ workers.
 *
 * Backward-compatible with INotificationService interface.
 */

import type {
  ApprovalTask,
  INotificationSender,
  INotificationService,
  NotificationChannel,
  NotificationPreferences,
  NotificationRecord,
  NotificationRecipient,
  NotificationTemplate,
  NotificationType,
} from "./types.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { ApprovalInstance } from "../instance/types.js";
import type { JobData, JobQueue } from "@athyper/core";

/**
 * Job payload for plan-notification jobs (matches NotificationOrchestrator expectation).
 */
interface PlanNotificationPayload {
  eventId: string;
  eventType: string;
  tenantId: string;
  payload: Record<string, unknown>;
  aggregateId?: string;
  aggregateType?: string;
  occurredAt: string;
}

/**
 * Notification Service — Event-based Implementation
 *
 * Instead of sending notifications directly, this facade enqueues
 * plan-notification jobs. The notification framework's workers handle
 * rule matching, recipient resolution, template rendering, and delivery.
 */
export class NotificationService implements INotificationService {
  constructor(
    private readonly jobQueue: JobQueue,
    private readonly logger: Logger,
  ) {}

  /**
   * @deprecated Use registerSender on channel adapters instead.
   */
  registerSender(_sender: INotificationSender): void {
    this.logger.warn(
      "registerSender() is deprecated — use channel adapters in the notification framework",
    );
  }

  async sendTaskAssigned(tenantId: string, task: ApprovalTask): Promise<void> {
    await this.publishEvent(
      tenantId,
      "workflow.task.assigned",
      task.id,
      "approval_task",
      {
        taskId: task.id,
        instanceId: task.instanceId,
        assigneeId: task.assigneeId,
        assigneeDisplayName: task.assigneeDisplayName,
        entityType: task.entity.type,
        entityDisplayName: task.entity.displayName || task.entity.id,
        workflowName: task.workflow.templateName,
        stepName: task.workflow.stepName,
        requesterName: task.requester.displayName || task.requester.userId,
        dueDate: task.sla.dueAt.toISOString(),
        priority: task.priority,
      },
    );
  }

  async sendReminder(
    tenantId: string,
    task: ApprovalTask,
    reminderNumber: number,
  ): Promise<void> {
    await this.publishEvent(
      tenantId,
      "workflow.task.reminder",
      task.id,
      "approval_task",
      {
        taskId: task.id,
        instanceId: task.instanceId,
        assigneeId: task.assigneeId,
        reminderNumber,
        entityType: task.entity.type,
        entityDisplayName: task.entity.displayName || task.entity.id,
        dueDate: task.sla.dueAt.toISOString(),
        timeRemainingMs: task.sla.timeRemainingMs,
      },
    );
  }

  async sendSlaWarning(tenantId: string, task: ApprovalTask): Promise<void> {
    await this.publishEvent(
      tenantId,
      "workflow.task.sla_warning",
      task.id,
      "approval_task",
      {
        taskId: task.id,
        instanceId: task.instanceId,
        assigneeId: task.assigneeId,
        entityType: task.entity.type,
        entityDisplayName: task.entity.displayName || task.entity.id,
        dueDate: task.sla.dueAt.toISOString(),
        timeRemainingMs: task.sla.timeRemainingMs,
      },
    );
  }

  async sendSlaBreach(tenantId: string, task: ApprovalTask): Promise<void> {
    await this.publishEvent(
      tenantId,
      "workflow.task.sla_breached",
      task.id,
      "approval_task",
      {
        taskId: task.id,
        instanceId: task.instanceId,
        assigneeId: task.assigneeId,
        entityType: task.entity.type,
        entityDisplayName: task.entity.displayName || task.entity.id,
        dueDate: task.sla.dueAt.toISOString(),
        timeRemainingMs: task.sla.timeRemainingMs,
      },
    );
  }

  async sendEscalation(
    tenantId: string,
    task: ApprovalTask,
    escalatedTo: NotificationRecipient,
  ): Promise<void> {
    await this.publishEvent(
      tenantId,
      "workflow.task.escalated",
      task.id,
      "approval_task",
      {
        taskId: task.id,
        instanceId: task.instanceId,
        assigneeId: escalatedTo.userId,
        originalAssignee:
          task.delegation?.originalAssigneeDisplayName ||
          task.assigneeDisplayName,
        escalationReason: task.escalation?.reason || "SLA breach",
        entityType: task.entity.type,
        entityDisplayName: task.entity.displayName || task.entity.id,
        dueDate: task.sla.dueAt.toISOString(),
      },
    );
  }

  async sendApprovalComplete(
    tenantId: string,
    instance: ApprovalInstance,
    outcome: "approved" | "rejected",
  ): Promise<void> {
    await this.publishEvent(
      tenantId,
      "workflow.approval.completed",
      instance.id,
      "approval_instance",
      {
        instanceId: instance.id,
        requesterId: instance.requester.userId,
        outcome,
        entityType: instance.entity.type,
        entityDisplayName: instance.entity.displayName || instance.entity.id,
        completedAt: new Date().toISOString(),
      },
    );
  }

  async sendBulkReminders(
    tenantId: string,
    tasks: ApprovalTask[],
  ): Promise<void> {
    for (const task of tasks) {
      await this.sendReminder(tenantId, task, 1);
    }
  }

  // ─── Notification Management (delegates to notification framework via API) ─

  async getNotifications(
    _tenantId: string,
    _userId: string,
    _options?: {
      unreadOnly?: boolean;
      type?: NotificationType;
      limit?: number;
      offset?: number;
    },
  ): Promise<NotificationRecord[]> {
    // Notification inbox is now served by the notification framework's REST API.
    // This method is kept for backward compat — callers should migrate to the API.
    this.logger.warn(
      "getNotifications() via service is deprecated — use /api/notifications REST API",
    );
    return [];
  }

  async markAsRead(_tenantId: string, _notificationId: string): Promise<void> {
    this.logger.warn(
      "markAsRead() via service is deprecated — use /api/notifications/:id/read REST API",
    );
  }

  async markAllAsRead(_tenantId: string, _userId: string): Promise<void> {
    this.logger.warn(
      "markAllAsRead() via service is deprecated — use /api/notifications/mark-all-read REST API",
    );
  }

  async getPreferences(
    _tenantId: string,
    _userId: string,
  ): Promise<NotificationPreferences | undefined> {
    this.logger.warn(
      "getPreferences() via service is deprecated — use /api/notifications/preferences REST API",
    );
    return undefined;
  }

  async updatePreferences(
    _tenantId: string,
    _userId: string,
    _preferences: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    this.logger.warn(
      "updatePreferences() via service is deprecated — use PUT /api/notifications/preferences REST API",
    );
    return _preferences as NotificationPreferences;
  }

  async getTemplate(
    _tenantId: string,
    _type: NotificationType,
    _channel: NotificationChannel,
    _locale?: string,
  ): Promise<NotificationTemplate | undefined> {
    this.logger.warn(
      "getTemplate() via service is deprecated — use /api/admin/notifications/templates REST API",
    );
    return undefined;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async publishEvent(
    tenantId: string,
    eventType: string,
    aggregateId: string,
    aggregateType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const jobData: JobData<PlanNotificationPayload> = {
      type: "plan-notification",
      payload: {
        eventId: crypto.randomUUID(),
        eventType,
        tenantId,
        payload: { ...payload, tenantId },
        aggregateId,
        aggregateType,
        occurredAt: new Date().toISOString(),
      },
    };

    await this.jobQueue.add(jobData, {
      priority: "normal",
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
    });

    this.logger.debug(
      { eventType, aggregateId, tenantId },
      `Published ${eventType} event for notification planning`,
    );
  }
}

/**
 * Factory function to create notification service
 */
export function createNotificationService(
  jobQueue: JobQueue,
  logger: Logger,
): INotificationService {
  return new NotificationService(jobQueue, logger);
}
