/**
 * SLA Timer Worker — BullMQ job handler for approval reminders & escalations.
 *
 * Two job types share the same worker:
 *   - "approval-sla-reminder" — nudges assignees that a task is nearing its SLA deadline.
 *   - "approval-sla-escalation" — fires when SLA is breached; records an escalation
 *     event and (optionally) reassigns / notifies managers.
 *
 * Both handlers are guard-checked: if the task is no longer pending when the job
 * fires (decision already made, instance cancelled, etc.) the job is silently skipped.
 */

import type { Job, JobHandler } from "@athyper/core";
import type { ApprovalService } from "@athyper/core/meta";

// ============================================================================
// Payload Types
// ============================================================================

export interface SlaReminderPayload {
  taskId: string;
  tenantId: string;
  instanceId: string;
  stageId: string;
}

export interface SlaEscalationPayload {
  taskId: string;
  tenantId: string;
  instanceId: string;
  stageId: string;
  escalation: Record<string, unknown>;
}

// ============================================================================
// Job Type Constants
// ============================================================================

export const SLA_JOB_TYPES = {
  REMINDER: "approval-sla-reminder",
  ESCALATION: "approval-sla-escalation",
} as const;

// ============================================================================
// Worker Handler Factories
// ============================================================================

/**
 * Creates a BullMQ handler for SLA reminder jobs.
 *
 * When fired, the handler loads the task; if it's still pending
 * it delegates to `ApprovalService.processReminder()`.
 */
export function createSlaReminderHandler(
  approvalService: ApprovalService,
): JobHandler<SlaReminderPayload, void> {
  return async (job: Job<SlaReminderPayload>): Promise<void> => {
    const { taskId, tenantId } = job.data.payload;

    // Guard: skip if task is no longer pending
    const task = await approvalService.getTask(taskId, tenantId);
    if (!task || task.status !== "pending") return;

    await approvalService.processReminder(taskId, tenantId);
  };
}

/**
 * Creates a BullMQ handler for SLA escalation jobs.
 *
 * When fired, the handler loads the task; if it's still pending
 * it delegates to `ApprovalService.processEscalation()`.
 */
export function createSlaEscalationHandler(
  approvalService: ApprovalService,
): JobHandler<SlaEscalationPayload, void> {
  return async (job: Job<SlaEscalationPayload>): Promise<void> => {
    const { taskId, tenantId, escalation } = job.data.payload;

    // Guard: skip if task is no longer pending
    const task = await approvalService.getTask(taskId, tenantId);
    if (!task || task.status !== "pending") return;

    await approvalService.processEscalation(taskId, escalation, tenantId);
  };
}
