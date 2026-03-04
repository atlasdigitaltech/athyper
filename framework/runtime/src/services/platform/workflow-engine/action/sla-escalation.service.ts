/**
 * SLA Monitoring and Escalation Service
 *
 * Monitors SLA compliance, detects breaches, and executes escalation rules.
 */

import type {
  EscalationResult,
  EscalationTarget,
  IEscalationService,
  ISlaMonitoringService,
  StepSlaStatus,
  WorkflowEvent,
} from "./types.js";
import type {
  ApprovalInstance,
  ApprovalStepInstance,
  AssignedApprover,
  IApprovalInstanceRepository,
} from "../instance/types.js";
import type { INotificationService } from "../task/types.js";



/**
 * Generate unique ID
 */
function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * SLA Monitoring Service Implementation
 */
export class SlaMonitoringService implements ISlaMonitoringService {
  constructor(
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly notificationService?: INotificationService,
    private readonly eventHandlers?: Array<(event: WorkflowEvent) => Promise<void>>
  ) {}

  /**
   * Check SLA status for a step
   */
  async checkStepSla(
    tenantId: string,
    stepInstance: ApprovalStepInstance
  ): Promise<StepSlaStatus> {
    const now = new Date();

    const status: StepSlaStatus = {
      stepInstanceId: stepInstance.id,
      overallStatus: "on_track",
      warningNotified: stepInstance.sla?.warningTriggered || false,
      breachNotified: false,
    };

    // Check response SLA
    if (stepInstance.sla?.responseDueAt) {
      const responseDueAt = new Date(stepInstance.sla.responseDueAt);
      const timeRemainingMs = responseDueAt.getTime() - now.getTime();
      const isBreached = timeRemainingMs < 0;

      // Calculate warning threshold (default 80%)
      const totalTime = responseDueAt.getTime() - (stepInstance.activatedAt?.getTime() || now.getTime());
      const warningThreshold = totalTime * 0.8;
      const elapsedTime = now.getTime() - (stepInstance.activatedAt?.getTime() || now.getTime());
      const isWarning = elapsedTime >= warningThreshold && !isBreached;

      status.responseSla = {
        dueAt: responseDueAt,
        status: isBreached ? "breached" : isWarning ? "warning" : "on_track",
        timeRemainingMs,
      };

      if (isBreached) {
        status.overallStatus = "breached";
      } else if (isWarning && status.overallStatus === "on_track") {
        status.overallStatus = "warning";
      }
    }

    // Check completion SLA
    if (stepInstance.sla?.completionDueAt) {
      const completionDueAt = new Date(stepInstance.sla.completionDueAt);
      const timeRemainingMs = completionDueAt.getTime() - now.getTime();
      const isBreached = timeRemainingMs < 0;

      const totalTime = completionDueAt.getTime() - (stepInstance.activatedAt?.getTime() || now.getTime());
      const warningThreshold = totalTime * 0.8;
      const elapsedTime = now.getTime() - (stepInstance.activatedAt?.getTime() || now.getTime());
      const isWarning = elapsedTime >= warningThreshold && !isBreached;

      status.completionSla = {
        dueAt: completionDueAt,
        status: isBreached ? "breached" : isWarning ? "warning" : "on_track",
        timeRemainingMs,
      };

      if (isBreached) {
        status.overallStatus = "breached";
      } else if (isWarning && status.overallStatus === "on_track") {
        status.overallStatus = "warning";
      }
    }

    return status;
  }

  /**
   * Check SLA for all active steps in an instance
   */
  async checkInstanceSla(
    tenantId: string,
    instance: ApprovalInstance
  ): Promise<StepSlaStatus[]> {
    const stepInstances = await this.instanceRepository.getStepInstances(
      tenantId,
      instance.id
    );

    const activeSteps = stepInstances.filter((s) => s.status === "active");
    const statuses: StepSlaStatus[] = [];

    for (const step of activeSteps) {
      const status = await this.checkStepSla(tenantId, step);
      statuses.push(status);
    }

    return statuses;
  }

  /**
   * Process SLA breaches (called by scheduler)
   */
  async processSlaBreaches(tenantId: string): Promise<EscalationResult[]> {
    const results: EscalationResult[] = [];

    // Get all active instances
    const instances = await this.instanceRepository.list(tenantId, {
      status: ["in_progress"],
    });

    for (const instance of instances) {
      const slaStatuses = await this.checkInstanceSla(tenantId, instance);

      for (const status of slaStatuses) {
        if (status.overallStatus === "breached" && !status.breachNotified) {
          // Get step instance
          const stepInstances = await this.instanceRepository.getStepInstances(
            tenantId,
            instance.id
          );
          const stepInstance = stepInstances.find((s) => s.id === status.stepInstanceId);

          if (stepInstance) {
            // Fire breach event
            await this.fireEvent({
              id: generateId("evt"),
              type: "sla.breach",
              tenantId,
              instanceId: instance.id,
              stepInstanceId: stepInstance.id,
              entity: { type: instance.entity.type, id: instance.entity.id },
              timestamp: new Date(),
              payload: {
                slaStatus: status,
                escalationCount: stepInstance.sla?.escalationCount || 0,
              },
            });

            // Mark breach notified
            await this.instanceRepository.updateStepInstance(
              tenantId,
              stepInstance.id,
              {
                sla: {
                  responseDueAt: stepInstance.sla?.responseDueAt,
                  completionDueAt: stepInstance.sla?.completionDueAt,
                  escalationCount: stepInstance.sla?.escalationCount ?? 0,
                  warningTriggered: true,
                },
              }
            );
          }
        }
      }
    }

    return results;
  }

  /**
   * Send SLA warning notifications
   */
  async sendSlaWarnings(tenantId: string): Promise<number> {
    let warningsSent = 0;

    // Get all active instances
    const instances = await this.instanceRepository.list(tenantId, {
      status: ["in_progress"],
    });

    for (const instance of instances) {
      const slaStatuses = await this.checkInstanceSla(tenantId, instance);

      for (const status of slaStatuses) {
        if (status.overallStatus === "warning" && !status.warningNotified) {
          // Get step instance
          const stepInstances = await this.instanceRepository.getStepInstances(
            tenantId,
            instance.id
          );
          const stepInstance = stepInstances.find((s) => s.id === status.stepInstanceId);

          if (stepInstance) {
            // Fire warning event
            await this.fireEvent({
              id: generateId("evt"),
              type: "sla.warning",
              tenantId,
              instanceId: instance.id,
              stepInstanceId: stepInstance.id,
              entity: { type: instance.entity.type, id: instance.entity.id },
              timestamp: new Date(),
              payload: { slaStatus: status },
            });

            // Mark warning sent
            await this.instanceRepository.updateStepInstance(
              tenantId,
              stepInstance.id,
              {
                sla: {
                  responseDueAt: stepInstance.sla?.responseDueAt,
                  completionDueAt: stepInstance.sla?.completionDueAt,
                  escalationCount: stepInstance.sla?.escalationCount ?? 0,
                  warningTriggered: true,
                },
              }
            );

            warningsSent++;
          }
        }
      }
    }

    return warningsSent;
  }

  /**
   * Fire a workflow event
   */
  private async fireEvent(event: WorkflowEvent): Promise<void> {
    if (this.eventHandlers) {
      for (const handler of this.eventHandlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error("Event handler error:", err);
        }
      }
    }
  }
}

/**
 * Escalation Service Implementation
 */
export class EscalationService implements IEscalationService {
  constructor(
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly notificationService?: INotificationService,
    private readonly eventHandlers?: Array<(event: WorkflowEvent) => Promise<void>>
  ) {}

  /**
   * Execute escalation for a step
   */
  async executeEscalation(
    tenantId: string,
    stepInstance: ApprovalStepInstance,
    reason: string
  ): Promise<EscalationResult> {
    const now = new Date();
    const currentLevel = stepInstance.sla?.escalationCount || 0;
    const newLevel = currentLevel + 1;

    const result: EscalationResult = {
      executed: false,
      newEscalationLevel: newLevel,
      actionsTaken: [],
      notificationsSent: [],
    };

    // Get instance for context
    const instance = await this.instanceRepository.getById(tenantId, stepInstance.instanceId);
    if (!instance) {
      result.error = "Instance not found";
      return result;
    }

    // Get escalation rules from template
    const template = instance.workflowSnapshot.definition;
    const stepDef = template.steps.find((s) => s.id === stepInstance.stepDefinitionId);
    const escalationRules = stepDef?.sla?.escalations || template.globalSla?.escalations || [];

    // Find applicable escalation rule for current level (use array index)
    // newLevel is 1-based, array is 0-based
    const applicableRule = escalationRules[newLevel - 1] ||
                          escalationRules[escalationRules.length - 1];

    if (!applicableRule) {
      // No escalation rule defined, just notify
      result.actionsTaken.push({
        type: "notify",
        comment: `Escalation level ${newLevel}: ${reason}`,
      });
      result.executed = true;

      // Update step with new escalation level
      await this.instanceRepository.updateStepInstance(tenantId, stepInstance.id, {
        sla: {
          ...stepInstance.sla,
          escalationCount: newLevel,
        },
      });

      return result;
    }

    // Execute escalation actions based on rule
    const escalationTargets = await this.getEscalationTargets(
      tenantId,
      instance,
      stepInstance,
      newLevel
    );

    switch (applicableRule.action) {
      case "reassign":
        if (escalationTargets.length > 0) {
          const newAssignees = await this.reassignToTargets(
            tenantId,
            instance,
            stepInstance,
            escalationTargets,
            reason
          );

          result.newAssignees = newAssignees;
          result.actionsTaken.push({
            type: "reassign",
            target: escalationTargets[0],
            comment: `Escalated to level ${newLevel}: ${reason}`,
          });
        }
        break;

      case "notify":
        for (const target of escalationTargets) {
          for (const userId of target.resolvedUserIds) {
            result.notificationsSent.push(userId);
          }
        }
        result.actionsTaken.push({
          type: "notify",
          notifyUsers: result.notificationsSent,
          comment: `Escalation notification for level ${newLevel}`,
        });
        break;

      case "auto_approve":
        await this.autoApproveStep(tenantId, instance, stepInstance, reason);
        result.actionsTaken.push({
          type: "auto_approve",
          comment: `Auto-approved due to escalation level ${newLevel}`,
        });
        break;

      case "auto_reject":
        await this.autoRejectStep(tenantId, instance, stepInstance, reason);
        result.actionsTaken.push({
          type: "auto_reject",
          comment: `Auto-rejected due to escalation level ${newLevel}`,
        });
        break;

      case "add_approver":
        // Add escalation targets as additional approvers without removing existing ones
        if (escalationTargets.length > 0) {
          const newAssignees = await this.addApproversToStep(
            tenantId,
            instance,
            stepInstance,
            escalationTargets,
            reason
          );
          result.newAssignees = newAssignees;
          result.actionsTaken.push({
            type: "reassign",
            target: escalationTargets[0],
            comment: `Added approvers at escalation level ${newLevel}: ${reason}`,
          });
        }
        break;
    }

    // Update step with new escalation level
    await this.instanceRepository.updateStepInstance(tenantId, stepInstance.id, {
      sla: {
        ...stepInstance.sla,
        escalationCount: newLevel,
      },
    });

    // Fire escalation event
    await this.fireEvent({
      id: generateId("evt"),
      type: "step.escalated",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      payload: {
        previousLevel: currentLevel,
        newLevel,
        reason,
        actions: result.actionsTaken,
      },
    });

    result.executed = true;
    return result;
  }

  /**
   * Get escalation targets for a step
   */
  async getEscalationTargets(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    escalationLevel: number
  ): Promise<EscalationTarget[]> {
    const targets: EscalationTarget[] = [];

    // Get escalation rules from template
    const template = instance.workflowSnapshot.definition;
    const stepDef = template.steps.find((s) => s.id === stepInstance.stepDefinitionId);
    const escalationRules = stepDef?.sla?.escalations || template.globalSla?.escalations || [];

    // Find rule for this level (use array index, 1-based to 0-based)
    const rule = escalationRules[escalationLevel - 1] ||
                 escalationRules[escalationRules.length - 1];

    if (!rule || !rule.target) {
      // Default: escalate to requester's manager if available
      // Note: managerId may be stored in metadata during instance creation
      const managerId = (instance.metadata as Record<string, unknown> | undefined)?.requesterManagerId as string | undefined;
      if (managerId) {
        targets.push({
          type: "manager",
          targetId: managerId,
          resolvedUserIds: [managerId],
          displayName: "Requester's Manager",
        });
      }
      return targets;
    }

    // Resolve targets based on rule.targetType and rule.target configuration
    const targetType = rule.targetType;
    const targetConfig = rule.target;

    switch (targetType) {
      case "user":
        // Direct user IDs
        if (targetConfig.userIds && targetConfig.userIds.length > 0) {
          for (const userId of targetConfig.userIds) {
            targets.push({
              type: "user",
              targetId: userId,
              resolvedUserIds: [userId],
            });
          }
        }
        break;

      case "role":
        // Role-based - in real implementation would resolve roles to users
        if (targetConfig.roles && targetConfig.roles.length > 0) {
          targets.push({
            type: "role",
            targetId: targetConfig.roles.join(","),
            resolvedUserIds: [], // Would be populated by role resolution service
            displayName: `Roles: ${targetConfig.roles.join(", ")}`,
          });
        }
        break;

      case "hierarchy": {
        // Hierarchy-based escalation (manager chain)
        const managerId = (instance.metadata as Record<string, unknown> | undefined)?.requesterManagerId as string | undefined;
        if (managerId) {
          targets.push({
            type: "manager",
            targetId: managerId,
            resolvedUserIds: [managerId],
            displayName: "Requester's Manager",
          });
        }
        break;
      }

      case "group":
        // Group-based - in real implementation would resolve groups to users
        if (targetConfig.groupIds && targetConfig.groupIds.length > 0) {
          for (const groupId of targetConfig.groupIds) {
            targets.push({
              type: "group",
              targetId: groupId,
              resolvedUserIds: [], // Would be populated by group resolution service
            });
          }
        }
        break;
    }

    return targets;
  }

  /**
   * Reassign step to escalation targets
   */
  private async reassignToTargets(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    targets: EscalationTarget[],
    _reason: string
  ): Promise<AssignedApprover[]> {
    const now = new Date();
    const newApprovers: AssignedApprover[] = [];

    // Mark existing approvers as escalated - explicitly type as AssignedApprover[]
    const updatedApprovers: AssignedApprover[] = stepInstance.approvers.map((a): AssignedApprover => ({
      ...a,
      status: a.status === "pending" ? "escalated" : a.status,
    }));

    // Add new approvers from escalation targets
    for (const target of targets) {
      for (const userId of target.resolvedUserIds) {
        const newApprover: AssignedApprover = {
          id: generateId("asgn"),
          userId,
          displayName: target.displayName,
          resolvedBy: "escalation",
          resolutionStrategy: `escalation_${target.type}`,
          isFallback: false,
          status: "pending",
          assignedAt: now,
          reminderCount: 0,
        };
        newApprovers.push(newApprover);
        updatedApprovers.push(newApprover);
      }
    }

    // Update step instance
    await this.instanceRepository.updateStepInstance(tenantId, stepInstance.id, {
      approvers: updatedApprovers,
      approvalCounts: {
        ...stepInstance.approvalCounts,
        total: updatedApprovers.length,
        pending: updatedApprovers.filter((a) => a.status === "pending").length,
      },
    });

    return newApprovers;
  }

  /**
   * Add approvers to step without removing existing pending approvers
   */
  private async addApproversToStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    targets: EscalationTarget[],
    _reason: string
  ): Promise<AssignedApprover[]> {
    const now = new Date();
    const newApprovers: AssignedApprover[] = [];

    // Keep existing approvers as-is
    const updatedApprovers: AssignedApprover[] = [...stepInstance.approvers];

    // Add new approvers from escalation targets
    for (const target of targets) {
      for (const userId of target.resolvedUserIds) {
        const newApprover: AssignedApprover = {
          id: generateId("asgn"),
          userId,
          displayName: target.displayName,
          resolvedBy: "escalation",
          resolutionStrategy: `escalation_${target.type}`,
          isFallback: false,
          status: "pending",
          assignedAt: now,
          reminderCount: 0,
        };
        newApprovers.push(newApprover);
        updatedApprovers.push(newApprover);
      }
    }

    // Update step instance
    await this.instanceRepository.updateStepInstance(tenantId, stepInstance.id, {
      approvers: updatedApprovers,
      approvalCounts: {
        ...stepInstance.approvalCounts,
        total: updatedApprovers.length,
        pending: updatedApprovers.filter((a) => a.status === "pending").length,
      },
    });

    return newApprovers;
  }

  /**
   * Auto-approve step due to escalation
   */
  private async autoApproveStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    reason: string
  ): Promise<void> {
    const now = new Date();

    // Mark all pending approvers as auto-approved
    const updatedApprovers = stepInstance.approvers.map((a) => ({
      ...a,
      status: a.status === "pending" ? ("approved" as const) : a.status,
      respondedAt: a.status === "pending" ? now : a.respondedAt,
      comment: a.status === "pending" ? `Auto-approved: ${reason}` : a.comment,
    }));

    await this.instanceRepository.updateStepInstance(tenantId, stepInstance.id, {
      status: "approved",
      approvers: updatedApprovers,
      autoApproved: true,
      autoApproveReason: reason,
      completedAt: now,
    });
  }

  /**
   * Auto-reject step due to escalation
   */
  private async autoRejectStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    reason: string
  ): Promise<void> {
    const now = new Date();

    await this.instanceRepository.updateStepInstance(tenantId, stepInstance.id, {
      status: "rejected",
      completedAt: now,
    });

    // Also update instance
    await this.instanceRepository.update(tenantId, instance.id, {
      status: "rejected",
      entityState: "rejected",
      decision: {
        outcome: "rejected",
        decidedAt: now,
        reason: `Auto-rejected due to escalation: ${reason}`,
      },
      completedAt: now,
    });
  }

  /**
   * Cancel workflow due to escalation
   */
  private async cancelWorkflow(
    tenantId: string,
    instance: ApprovalInstance,
    reason: string
  ): Promise<void> {
    const now = new Date();

    await this.instanceRepository.update(tenantId, instance.id, {
      status: "cancelled",
      entityState: "cancelled",
      decision: {
        outcome: "cancelled",
        decidedAt: now,
        reason: `Cancelled due to escalation: ${reason}`,
      },
      completedAt: now,
    });

    // Release entity lock
    await this.instanceRepository.releaseLock(
      tenantId,
      instance.entity.type,
      instance.entity.id
    );
  }

  /**
   * Fire a workflow event
   */
  private async fireEvent(event: WorkflowEvent): Promise<void> {
    if (this.eventHandlers) {
      for (const handler of this.eventHandlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error("Event handler error:", err);
        }
      }
    }
  }
}

/**
 * Factory function to create SLA monitoring service
 */
export function createSlaMonitoringService(
  instanceRepository: IApprovalInstanceRepository,
  notificationService?: INotificationService,
  eventHandlers?: Array<(event: WorkflowEvent) => Promise<void>>
): ISlaMonitoringService {
  return new SlaMonitoringService(instanceRepository, notificationService, eventHandlers);
}

/**
 * Factory function to create escalation service
 */
export function createEscalationService(
  instanceRepository: IApprovalInstanceRepository,
  notificationService?: INotificationService,
  eventHandlers?: Array<(event: WorkflowEvent) => Promise<void>>
): IEscalationService {
  return new EscalationService(instanceRepository, notificationService, eventHandlers);
}
