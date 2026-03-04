/**
 * Admin Actions Service
 *
 * Handles administrative actions on approval workflows including
 * force approve/reject, reassignments, and workflow control.
 */

import type {
  AdminActionLog,
  AdminActionResult,
  AdminActionType,
  DeadlineModification,
  IAdminActionRepository,
  IAdminActionsService,
  RestartOptions,
  StepReassignment,
} from "./types.js";
import type { IAuditTrailService } from "../audit/types.js";
import type {
  AssignedApprover,
  IApprovalInstanceRepository,
} from "../instance/types.js";

/**
 * Generate unique ID
 */
function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Admin Actions Service Implementation
 */
export class AdminActionsService implements IAdminActionsService {
  constructor(
    private readonly adminRepository: IAdminActionRepository,
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly auditService?: IAuditTrailService
  ) {}

  /**
   * Force approve a step
   */
  async forceApprove(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult> {
    // Validate action
    const validation = await this.validateAction(
      tenantId,
      instanceId,
      stepInstanceId,
      "force_approve",
      adminId
    );

    if (!validation.allowed) {
      return {
        success: false,
        message: validation.reason || "Action not allowed",
        affectedEntities: {},
      };
    }

    const step = await this.instanceRepository.getStepInstance(tenantId, stepInstanceId);
    if (!step) {
      return {
        success: false,
        message: "Step not found",
        affectedEntities: {},
      };
    }

    const previousState = { status: step.status, approvalCounts: step.approvalCounts };
    const now = new Date();

    // Update all pending approvers to approved (by admin)
    const updatedApprovers: AssignedApprover[] = step.approvers.map((a) => {
      if (a.status === "pending") {
        return {
          ...a,
          status: "approved" as const,
          actionTaken: "approve" as const,
          respondedAt: now,
          comment: `Force approved by admin: ${reason}`,
          delegatedFrom: adminId,
        };
      }
      return a;
    });

    // Update step
    await this.instanceRepository.updateStepInstance(tenantId, stepInstanceId, {
      status: "approved",
      approvers: updatedApprovers,
      approvalCounts: {
        ...step.approvalCounts,
        approved: step.approvalCounts.total,
        pending: 0,
      },
      completedAt: now,
      autoApproved: false,
    });

    // Log the action
    await this.logAction(tenantId, instanceId, stepInstanceId, "force_approve", adminId, reason, {
      success: true,
      message: "Step force approved",
      affectedEntities: { steps: [stepInstanceId] },
      previousState,
      newState: { status: "approved" },
    });

    // Record audit event
    if (this.auditService) {
      await this.auditService.recordEvent(tenantId, {
        instanceId,
        stepInstanceId,
        eventType: "admin_force_approve",
        severity: "warning",
        actor: { type: "admin", id: adminId },
        timestamp: now,
        description: `Step force approved: ${reason}`,
        metadata: {
          previousStatus: step.status,
          pendingApprovers: step.approvers.filter((a) => a.status === "pending").length,
        },
      });
    }

    return {
      success: true,
      message: "Step force approved successfully",
      affectedEntities: { steps: [stepInstanceId] },
      previousState,
      newState: { status: "approved" },
    };
  }

  /**
   * Force reject a step
   */
  async forceReject(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult> {
    const validation = await this.validateAction(
      tenantId,
      instanceId,
      stepInstanceId,
      "force_reject",
      adminId
    );

    if (!validation.allowed) {
      return {
        success: false,
        message: validation.reason || "Action not allowed",
        affectedEntities: {},
      };
    }

    const step = await this.instanceRepository.getStepInstance(tenantId, stepInstanceId);
    if (!step) {
      return {
        success: false,
        message: "Step not found",
        affectedEntities: {},
      };
    }

    const previousState = { status: step.status };
    const now = new Date();

    // Update all pending approvers to rejected (by admin)
    const updatedApprovers: AssignedApprover[] = step.approvers.map((a) => {
      if (a.status === "pending") {
        return {
          ...a,
          status: "rejected" as const,
          actionTaken: "reject" as const,
          respondedAt: now,
          comment: `Force rejected by admin: ${reason}`,
          delegatedFrom: adminId,
        };
      }
      return a;
    });

    // Update step
    await this.instanceRepository.updateStepInstance(tenantId, stepInstanceId, {
      status: "rejected",
      approvers: updatedApprovers,
      approvalCounts: {
        ...step.approvalCounts,
        rejected: step.approvalCounts.total,
        pending: 0,
      },
      completedAt: now,
    });

    // Update instance status
    await this.instanceRepository.update(tenantId, instanceId, {
      status: "rejected",
      completedAt: now,
    });

    // Log the action
    await this.logAction(tenantId, instanceId, stepInstanceId, "force_reject", adminId, reason, {
      success: true,
      message: "Step force rejected",
      affectedEntities: { steps: [stepInstanceId], instances: [instanceId] },
      previousState,
      newState: { status: "rejected" },
    });

    // Record audit event
    if (this.auditService) {
      await this.auditService.recordEvent(tenantId, {
        instanceId,
        stepInstanceId,
        eventType: "admin_force_reject",
        severity: "warning",
        actor: { type: "admin", id: adminId },
        timestamp: now,
        description: `Step force rejected: ${reason}`,
        metadata: { previousStatus: step.status },
      });
    }

    return {
      success: true,
      message: "Step force rejected successfully",
      affectedEntities: { steps: [stepInstanceId], instances: [instanceId] },
      previousState,
      newState: { status: "rejected" },
    };
  }

  /**
   * Reassign approvers for a step
   */
  async reassignApprovers(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    newApprovers: Array<{ userId: string; name: string; email: string }>,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult> {
    const validation = await this.validateAction(
      tenantId,
      instanceId,
      stepInstanceId,
      "reassign_step",
      adminId
    );

    if (!validation.allowed) {
      return {
        success: false,
        message: validation.reason || "Action not allowed",
        affectedEntities: {},
      };
    }

    const step = await this.instanceRepository.getStepInstance(tenantId, stepInstanceId);
    if (!step) {
      return {
        success: false,
        message: "Step not found",
        affectedEntities: {},
      };
    }

    const now = new Date();
    const previousApprovers = step.approvers.filter((a) => a.status === "pending");

    // Create new approver list
    const updatedApprovers: AssignedApprover[] = [
      // Keep completed approvers
      ...step.approvers.filter((a) => a.status !== "pending"),
      // Add new approvers
      ...newApprovers.map((a) => ({
        id: generateId("appr"),
        userId: a.userId,
        displayName: a.name,
        email: a.email,
        resolvedBy: adminId,
        resolutionStrategy: "admin_reassignment",
        isFallback: false,
        status: "pending" as const,
        assignedAt: now,
        reminderCount: 0,
      })),
    ];

    // Update step
    await this.instanceRepository.updateStepInstance(tenantId, stepInstanceId, {
      approvers: updatedApprovers,
      approvalCounts: {
        ...step.approvalCounts,
        total: updatedApprovers.length,
        pending: newApprovers.length,
      },
    });

    // Record reassignment
    const reassignment: StepReassignment = {
      stepInstanceId,
      fromApprovers: previousApprovers.map((a) => ({ userId: a.userId, name: a.displayName || a.userId })),
      toApprovers: newApprovers,
      reason,
      reassignedBy: adminId,
      reassignedAt: now,
      notifyOriginal: true,
      notifyNew: true,
    };

    await this.adminRepository.createReassignment(reassignment);

    // Log the action
    await this.logAction(tenantId, instanceId, stepInstanceId, "reassign_step", adminId, reason, {
      success: true,
      message: `Reassigned from ${previousApprovers.length} to ${newApprovers.length} approvers`,
      affectedEntities: {
        steps: [stepInstanceId],
        approvers: [...previousApprovers.map((a) => a.userId), ...newApprovers.map((a) => a.userId)],
      },
    });

    // Record audit event
    if (this.auditService) {
      await this.auditService.recordEvent(tenantId, {
        instanceId,
        stepInstanceId,
        eventType: "approver_reassigned",
        severity: "info",
        actor: { type: "admin", id: adminId },
        timestamp: now,
        description: `Approvers reassigned: ${reason}`,
        metadata: {
          fromCount: previousApprovers.length,
          toCount: newApprovers.length,
        },
      });
    }

    return {
      success: true,
      message: `Successfully reassigned to ${newApprovers.length} approvers`,
      affectedEntities: {
        steps: [stepInstanceId],
        approvers: newApprovers.map((a) => a.userId),
      },
    };
  }

  /**
   * Add an approver to a step
   */
  async addApprover(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    approver: { userId: string; name: string; email: string },
    adminId: string,
    reason: string
  ): Promise<AdminActionResult> {
    const step = await this.instanceRepository.getStepInstance(tenantId, stepInstanceId);
    if (!step) {
      return {
        success: false,
        message: "Step not found",
        affectedEntities: {},
      };
    }

    // Check if already an approver
    if (step.approvers.some((a) => a.userId === approver.userId)) {
      return {
        success: false,
        message: "User is already an approver",
        affectedEntities: {},
      };
    }

    const now = new Date();
    const newApprover: AssignedApprover = {
      id: generateId("appr"),
      userId: approver.userId,
      displayName: approver.name,
      email: approver.email,
      resolvedBy: adminId,
      resolutionStrategy: "admin_added",
      isFallback: false,
      status: "pending",
      assignedAt: now,
      reminderCount: 0,
    };

    await this.instanceRepository.updateStepInstance(tenantId, stepInstanceId, {
      approvers: [...step.approvers, newApprover],
      approvalCounts: {
        ...step.approvalCounts,
        total: step.approvalCounts.total + 1,
        pending: step.approvalCounts.pending + 1,
      },
    });

    await this.logAction(tenantId, instanceId, stepInstanceId, "add_approver", adminId, reason, {
      success: true,
      message: `Added approver ${approver.name}`,
      affectedEntities: { approvers: [approver.userId] },
    });

    return {
      success: true,
      message: `Added ${approver.name} as approver`,
      affectedEntities: { steps: [stepInstanceId], approvers: [approver.userId] },
    };
  }

  /**
   * Remove an approver from a step
   */
  async removeApprover(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    approverId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult> {
    const step = await this.instanceRepository.getStepInstance(tenantId, stepInstanceId);
    if (!step) {
      return {
        success: false,
        message: "Step not found",
        affectedEntities: {},
      };
    }

    const approver = step.approvers.find((a) => a.userId === approverId);
    if (!approver) {
      return {
        success: false,
        message: "Approver not found",
        affectedEntities: {},
      };
    }

    if (approver.status !== "pending") {
      return {
        success: false,
        message: "Cannot remove approver who has already responded",
        affectedEntities: {},
      };
    }

    const updatedApprovers = step.approvers.filter((a) => a.userId !== approverId);

    await this.instanceRepository.updateStepInstance(tenantId, stepInstanceId, {
      approvers: updatedApprovers,
      approvalCounts: {
        ...step.approvalCounts,
        total: step.approvalCounts.total - 1,
        pending: step.approvalCounts.pending - 1,
      },
    });

    await this.logAction(tenantId, instanceId, stepInstanceId, "remove_approver", adminId, reason, {
      success: true,
      message: `Removed approver ${approver.displayName || approver.userId}`,
      affectedEntities: { approvers: [approverId] },
    });

    return {
      success: true,
      message: `Removed ${approver.displayName || approver.userId} from approvers`,
      affectedEntities: { steps: [stepInstanceId], approvers: [approverId] },
    };
  }

  /**
   * Skip a step
   */
  async skipStep(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult> {
    const step = await this.instanceRepository.getStepInstance(tenantId, stepInstanceId);
    if (!step) {
      return {
        success: false,
        message: "Step not found",
        affectedEntities: {},
      };
    }

    const previousState = { status: step.status };
    const now = new Date();

    await this.instanceRepository.updateStepInstance(tenantId, stepInstanceId, {
      status: "skipped",
      skipReason: `Admin skip: ${reason}`,
      completedAt: now,
    });

    await this.logAction(tenantId, instanceId, stepInstanceId, "skip_step", adminId, reason, {
      success: true,
      message: "Step skipped",
      affectedEntities: { steps: [stepInstanceId] },
      previousState,
      newState: { status: "skipped" },
    });

    if (this.auditService) {
      await this.auditService.recordEvent(tenantId, {
        instanceId,
        stepInstanceId,
        eventType: "admin_skip_step",
        severity: "warning",
        actor: { type: "admin", id: adminId },
        timestamp: now,
        description: `Step skipped by admin: ${reason}`,
      });
    }

    return {
      success: true,
      message: "Step skipped successfully",
      affectedEntities: { steps: [stepInstanceId] },
      previousState,
      newState: { status: "skipped" },
    };
  }

  /**
   * Cancel a workflow instance
   */
  async cancelWorkflow(
    tenantId: string,
    instanceId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult> {
    const instance = await this.instanceRepository.getById(tenantId, instanceId);
    if (!instance) {
      return {
        success: false,
        message: "Instance not found",
        affectedEntities: {},
      };
    }

    if (["completed", "rejected", "cancelled"].includes(instance.status)) {
      return {
        success: false,
        message: `Cannot cancel workflow in ${instance.status} status`,
        affectedEntities: {},
      };
    }

    const previousState = { status: instance.status };
    const now = new Date();

    await this.instanceRepository.update(tenantId, instanceId, {
      status: "cancelled",
      completedAt: now,
    });

    // Cancel all active steps
    const steps = await this.instanceRepository.getStepInstances(tenantId, instanceId);
    const activeSteps = steps.filter((s) => s.status === "active" || s.status === "pending");

    for (const step of activeSteps) {
      await this.instanceRepository.updateStepInstance(tenantId, step.id, {
        status: "skipped",
        skipReason: `Workflow cancelled: ${reason}`,
        completedAt: now,
      });
    }

    await this.logAction(tenantId, instanceId, undefined, "cancel_workflow", adminId, reason, {
      success: true,
      message: "Workflow cancelled",
      affectedEntities: {
        instances: [instanceId],
        steps: activeSteps.map((s) => s.id),
      },
      previousState,
      newState: { status: "cancelled" },
    });

    if (this.auditService) {
      await this.auditService.recordEvent(tenantId, {
        instanceId,
        eventType: "workflow_cancelled",
        severity: "warning",
        actor: { type: "admin", id: adminId },
        timestamp: now,
        description: `Workflow cancelled: ${reason}`,
        metadata: { cancelledSteps: activeSteps.length },
      });
    }

    return {
      success: true,
      message: "Workflow cancelled successfully",
      affectedEntities: {
        instances: [instanceId],
        steps: activeSteps.map((s) => s.id),
      },
      previousState,
      newState: { status: "cancelled" },
    };
  }

  /**
   * Restart workflow from a specific step
   */
  async restartFromStep(
    tenantId: string,
    instanceId: string,
    options: RestartOptions,
    adminId: string
  ): Promise<AdminActionResult> {
    const instance = await this.instanceRepository.getById(tenantId, instanceId);
    if (!instance) {
      return {
        success: false,
        message: "Instance not found",
        affectedEntities: {},
      };
    }

    const steps = await this.instanceRepository.getStepInstances(tenantId, instanceId);
    const restartStep = steps.find((s) => s.id === options.fromStepId);

    if (!restartStep) {
      return {
        success: false,
        message: "Step to restart from not found",
        affectedEntities: {},
      };
    }

    const now = new Date();
    const affectedSteps: string[] = [];

    // Reset steps from the restart point
    for (const step of steps) {
      const stepLevel = step.level;
      const restartLevel = restartStep.level;

      if (stepLevel >= restartLevel) {
        // Reset this step
        let resetApprovers = step.approvers;

        if (options.resetCompletedSteps) {
          resetApprovers = step.approvers.map((a) => ({
            ...a,
            status: "pending" as const,
            actionTaken: undefined,
            respondedAt: undefined,
            comment: options.preserveComments ? a.comment : undefined,
          }));
        }

        await this.instanceRepository.updateStepInstance(tenantId, step.id, {
          status: step.id === options.fromStepId ? "active" : "pending",
          approvers: resetApprovers,
          approvalCounts: {
            total: resetApprovers.length,
            pending: resetApprovers.length,
            approved: 0,
            rejected: 0,
            delegated: 0,
          },
          completedAt: undefined,
          activatedAt: step.id === options.fromStepId ? now : undefined,
        });

        affectedSteps.push(step.id);
      }
    }

    // Update instance status
    await this.instanceRepository.update(tenantId, instanceId, {
      status: "in_progress",
      completedAt: undefined,
    });

    await this.logAction(tenantId, instanceId, options.fromStepId, "restart_from_step", adminId, options.reason, {
      success: true,
      message: `Workflow restarted from step ${restartStep.name}`,
      affectedEntities: {
        instances: [instanceId],
        steps: affectedSteps,
      },
    });

    if (this.auditService) {
      await this.auditService.recordEvent(tenantId, {
        instanceId,
        stepInstanceId: options.fromStepId,
        eventType: "workflow_restarted",
        severity: "warning",
        actor: { type: "admin", id: adminId },
        timestamp: now,
        description: `Workflow restarted from step: ${options.reason}`,
        metadata: {
          restartStep: restartStep.name,
          resetSteps: affectedSteps.length,
        },
      });
    }

    return {
      success: true,
      message: `Workflow restarted from ${restartStep.name}`,
      affectedEntities: {
        instances: [instanceId],
        steps: affectedSteps,
      },
    };
  }

  /**
   * Modify step deadline
   */
  async modifyDeadline(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    newDeadline: Date,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult> {
    const step = await this.instanceRepository.getStepInstance(tenantId, stepInstanceId);
    if (!step) {
      return {
        success: false,
        message: "Step not found",
        affectedEntities: {},
      };
    }

    const originalDeadline = step.sla?.completionDueAt;
    const now = new Date();

    await this.instanceRepository.updateStepInstance(tenantId, stepInstanceId, {
      sla: {
        ...step.sla,
        completionDueAt: newDeadline,
        escalationCount: step.sla?.escalationCount || 0,
      },
    });

    // Record modification
    const modification: DeadlineModification = {
      stepInstanceId,
      originalDeadline: originalDeadline || now,
      newDeadline,
      reason,
      modifiedBy: adminId,
      modifiedAt: now,
    };

    await this.adminRepository.createDeadlineModification(modification);

    await this.logAction(tenantId, instanceId, stepInstanceId, "modify_deadline", adminId, reason, {
      success: true,
      message: `Deadline modified to ${newDeadline.toISOString()}`,
      affectedEntities: { steps: [stepInstanceId] },
      previousState: { deadline: originalDeadline },
      newState: { deadline: newDeadline },
    });

    return {
      success: true,
      message: `Deadline updated successfully`,
      affectedEntities: { steps: [stepInstanceId] },
      previousState: { deadline: originalDeadline },
      newState: { deadline: newDeadline },
    };
  }

  /**
   * Get admin action history for an instance
   */
  async getActionHistory(tenantId: string, instanceId: string): Promise<AdminActionLog[]> {
    return this.adminRepository.getActionLogs(tenantId, instanceId);
  }

  /**
   * Check if admin can perform action
   */
  async canPerformAction(
    tenantId: string,
    adminId: string,
    actionType: AdminActionType,
    instanceId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const instance = await this.instanceRepository.getById(tenantId, instanceId);

    if (!instance) {
      return { allowed: false, reason: "Instance not found" };
    }

    // Check instance status
    const terminalStatuses = ["completed", "rejected", "cancelled"];
    if (terminalStatuses.includes(instance.status)) {
      if (!["restart_from_step"].includes(actionType)) {
        return { allowed: false, reason: `Cannot perform action on ${instance.status} workflow` };
      }
    }

    // Additional checks could be added here (role-based, rate limiting, etc.)
    return { allowed: true };
  }

  /**
   * Validate action
   */
  private async validateAction(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string | undefined,
    actionType: AdminActionType,
    adminId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const canPerform = await this.canPerformAction(tenantId, adminId, actionType, instanceId);

    if (!canPerform.allowed) {
      return canPerform;
    }

    if (stepInstanceId) {
      const step = await this.instanceRepository.getStepInstance(tenantId, stepInstanceId);
      if (!step) {
        return { allowed: false, reason: "Step not found" };
      }

      const terminalStepStatuses = ["approved", "rejected", "skipped", "cancelled", "expired"];
      if (terminalStepStatuses.includes(step.status)) {
        return { allowed: false, reason: `Cannot perform action on ${step.status} step` };
      }
    }

    return { allowed: true };
  }

  /**
   * Log admin action
   */
  private async logAction(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string | undefined,
    actionType: AdminActionType,
    performedBy: string,
    reason: string,
    result: AdminActionResult
  ): Promise<void> {
    await this.adminRepository.createActionLog({
      tenantId,
      actionRequestId: generateId("req"),
      instanceId,
      stepInstanceId,
      actionType,
      performedBy,
      performedAt: new Date(),
      reason,
      result,
    });
  }
}

/**
 * Factory function to create admin actions service
 */
export function createAdminActionsService(
  adminRepository: IAdminActionRepository,
  instanceRepository: IApprovalInstanceRepository,
  auditService?: IAuditTrailService
): IAdminActionsService {
  return new AdminActionsService(adminRepository, instanceRepository, auditService);
}
