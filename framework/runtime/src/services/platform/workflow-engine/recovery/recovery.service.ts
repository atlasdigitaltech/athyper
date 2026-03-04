/**
 * Recovery Service
 *
 * Handles recovery actions for workflow errors including
 * reassignment, skipping, pausing, and resuming workflows.
 */

import type {
  IRecoveryErrorRepository,
  IRecoveryService,
  PauseReason,
  RecoveryAction,
  RecoveryResult,
  WorkflowError,
  WorkflowPause,
} from "./types.js";
import type { IAuditTrailService } from "../audit/types.js";
import type {
  ApprovalInstance,
  AssignedApprover,
  IApprovalInstanceRepository,
} from "../instance/types.js";

/**
 * User resolution service interface
 */
interface IUserResolutionService {
  getUserById(userId: string): Promise<{ id: string; name: string; email: string } | null>;
  getUsersByRole(roleId: string): Promise<Array<{ id: string; name: string; email: string }>>;
  getUserManager(userId: string): Promise<{ id: string; name: string; email: string } | null>;
}

/**
 * Recovery Service Implementation
 */
export class RecoveryService implements IRecoveryService {
  constructor(
    private readonly errorRepository: IRecoveryErrorRepository,
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly userService: IUserResolutionService,
    private readonly auditService?: IAuditTrailService
  ) {}

  /**
   * Get suggested recovery actions for an error
   */
  async getSuggestedActions(
    tenantId: string,
    error: WorkflowError
  ): Promise<RecoveryAction[]> {
    // Return cached suggestions if available
    if (error.suggestedActions && error.suggestedActions.length > 0) {
      return error.suggestedActions;
    }

    // Generate suggestions based on error type
    const actions: RecoveryAction[] = [];

    switch (error.errorType) {
      case "deactivated_user":
      case "missing_approver":
        actions.push(
          {
            type: "reassign_approver",
            description: "Reassign to a different user",
            requiresConfirmation: true,
            estimatedImpact: "Workflow will continue with new approver",
          },
          {
            type: "reassign_to_manager",
            description: "Reassign to the original approver's manager",
            requiresConfirmation: true,
            estimatedImpact: "Manager will handle the approval",
          },
          {
            type: "skip_approver",
            description: "Skip this approver and continue",
            requiresConfirmation: true,
            estimatedImpact: "May affect quorum calculation",
          }
        );
        break;

      case "role_mismatch":
        actions.push(
          {
            type: "reassign_to_role",
            description: "Reassign to another user with the required role",
            requiresConfirmation: true,
            estimatedImpact: "New role member will be assigned",
          }
        );
        break;

      case "quorum_unreachable":
        actions.push(
          {
            type: "admin_override",
            description: "Admin force approve or reject the step",
            requiresConfirmation: true,
            estimatedImpact: "Admin decision will override quorum requirement",
          },
          {
            type: "cancel_workflow",
            description: "Cancel the workflow",
            requiresConfirmation: true,
            estimatedImpact: "Workflow will be terminated",
          }
        );
        break;

      case "sla_expired":
        actions.push(
          {
            type: "escalate",
            description: "Escalate to higher level",
            requiresConfirmation: false,
            estimatedImpact: "Additional approvers will be notified",
          }
        );
        break;

      case "notification_failed":
        actions.push(
          {
            type: "retry_action",
            description: "Retry sending notification",
            requiresConfirmation: false,
            estimatedImpact: "Notification will be resent",
          }
        );
        break;

      default:
        actions.push(
          {
            type: "pause_workflow",
            description: "Pause workflow for investigation",
            requiresConfirmation: true,
            estimatedImpact: "Workflow will be paused until resumed",
          },
          {
            type: "admin_override",
            description: "Request admin intervention",
            requiresConfirmation: true,
            estimatedImpact: "Admin will manually resolve the issue",
          }
        );
    }

    return actions;
  }

  /**
   * Execute a recovery action
   */
  async executeRecoveryAction(
    tenantId: string,
    errorId: string,
    action: RecoveryAction,
    performedBy: string
  ): Promise<RecoveryResult> {
    const error = await this.errorRepository.getError(tenantId, errorId);

    if (!error) {
      return {
        success: false,
        action: action.type,
        errorId,
        message: "Error not found",
        timestamp: new Date(),
        performedBy,
      };
    }

    // Update error status
    await this.errorRepository.updateError(tenantId, errorId, {
      status: "resolving",
    });

    try {
      let result: RecoveryResult;

      switch (action.type) {
        case "reassign_approver":
          result = await this.executeReassignApprover(
            tenantId,
            error,
            action.parameters as { newUserId: string },
            performedBy
          );
          break;

        case "reassign_to_manager":
          result = await this.executeReassignToManager(tenantId, error, performedBy);
          break;

        case "reassign_to_role":
          result = await this.executeReassignToRole(
            tenantId,
            error,
            action.parameters as { roleId: string },
            performedBy
          );
          break;

        case "skip_approver":
          result = await this.executeSkipApprover(tenantId, error, performedBy);
          break;

        case "skip_step":
          result = await this.executeSkipStep(tenantId, error, performedBy);
          break;

        case "pause_workflow":
          result = await this.executePauseWorkflow(tenantId, error, performedBy);
          break;

        case "cancel_workflow":
          result = await this.executeCancelWorkflow(tenantId, error, performedBy);
          break;

        case "retry_action":
          result = await this.executeRetryAction(tenantId, error, performedBy);
          break;

        default:
          result = {
            success: false,
            action: action.type,
            errorId,
            message: `Unsupported action type: ${action.type}`,
            timestamp: new Date(),
            performedBy,
          };
      }

      // Update error status based on result
      if (result.success) {
        await this.errorRepository.updateError(tenantId, errorId, {
          status: "resolved",
          resolvedAt: new Date(),
          resolvedBy: performedBy,
          resolution: result.message,
        });
      } else {
        await this.errorRepository.updateError(tenantId, errorId, {
          status: "detected", // Reset to detected for retry
        });
      }

      // Record audit event
      if (this.auditService && error.instanceId) {
        await this.auditService.recordEvent(tenantId, {
          instanceId: error.instanceId,
          stepInstanceId: error.stepInstanceId,
          eventType: "recovery_action",
          severity: result.success ? "info" : "warning",
          actor: { type: "user", id: performedBy },
          timestamp: new Date(),
          description: `Recovery action ${action.type}: ${result.message}`,
          metadata: {
            actionType: action.type,
            errorId,
            success: result.success,
          },
        });
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await this.errorRepository.updateError(tenantId, errorId, {
        status: "detected",
      });

      return {
        success: false,
        action: action.type,
        errorId,
        message: `Recovery action failed: ${errorMessage}`,
        timestamp: new Date(),
        performedBy,
      };
    }
  }

  /**
   * Pause a workflow
   */
  async pauseWorkflow(
    tenantId: string,
    instanceId: string,
    reason: PauseReason,
    message: string,
    pausedBy: string
  ): Promise<WorkflowPause> {
    // Check if already paused
    const existingPause = await this.errorRepository.getActivePause(tenantId, instanceId);
    if (existingPause) {
      throw new Error("Workflow is already paused");
    }

    // Update instance status
    const _instance = await this.instanceRepository.update(tenantId, instanceId, {
      status: "on_hold",
    });

    // Create pause record
    const pause = await this.errorRepository.createPause({
      instanceId,
      reason,
      message,
      pausedAt: new Date(),
      pausedBy,
    });

    // Record audit event
    if (this.auditService) {
      await this.auditService.recordEvent(tenantId, {
        instanceId,
        eventType: "workflow_paused",
        severity: "warning",
        actor: { type: "user", id: pausedBy },
        timestamp: new Date(),
        description: `Workflow paused: ${message}`,
        metadata: {
          reason,
          pauseId: pause.id,
        },
      });
    }

    return pause;
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(
    tenantId: string,
    instanceId: string,
    resumedBy: string
  ): Promise<ApprovalInstance> {
    // Get active pause
    const pause = await this.errorRepository.getActivePause(tenantId, instanceId);
    if (!pause) {
      throw new Error("Workflow is not paused");
    }

    // Update pause record
    await this.errorRepository.updatePause(tenantId, pause.id, {
      resumedAt: new Date(),
      resumedBy,
    });

    // Update instance status
    const instance = await this.instanceRepository.update(tenantId, instanceId, {
      status: "in_progress",
    });

    // Record audit event
    if (this.auditService) {
      await this.auditService.recordEvent(tenantId, {
        instanceId,
        eventType: "workflow_resumed",
        severity: "info",
        actor: { type: "user", id: resumedBy },
        timestamp: new Date(),
        description: "Workflow resumed",
        metadata: {
          pauseId: pause.id,
          pauseDuration: new Date().getTime() - new Date(pause.pausedAt).getTime(),
        },
      });
    }

    return instance;
  }

  /**
   * Attempt auto-recovery for an error
   */
  async attemptAutoRecovery(
    tenantId: string,
    error: WorkflowError
  ): Promise<RecoveryResult | null> {
    // Only attempt auto-recovery for specific error types
    if (!["notification_failed", "system_error"].includes(error.errorType)) {
      return null;
    }

    // Check retry count
    if (error.retryCount >= error.maxRetries) {
      return null;
    }

    // Execute retry
    const result = await this.executeRetryAction(tenantId, error, "system");

    // Update retry count
    await this.errorRepository.updateError(tenantId, error.id, {
      retryCount: error.retryCount + 1,
    });

    return result;
  }

  /**
   * Execute reassign to specific user
   */
  private async executeReassignApprover(
    tenantId: string,
    error: WorkflowError,
    params: { newUserId: string },
    performedBy: string
  ): Promise<RecoveryResult> {
    if (!error.stepInstanceId || !error.approverId || !params?.newUserId) {
      return {
        success: false,
        action: "reassign_approver",
        errorId: error.id,
        message: "Missing required parameters",
        timestamp: new Date(),
        performedBy,
      };
    }

    const newUser = await this.userService.getUserById(params.newUserId);
    if (!newUser) {
      return {
        success: false,
        action: "reassign_approver",
        errorId: error.id,
        message: "New user not found",
        timestamp: new Date(),
        performedBy,
      };
    }

    // Get step instance
    const step = await this.instanceRepository.getStepInstance(
      tenantId,
      error.stepInstanceId
    );

    if (!step) {
      return {
        success: false,
        action: "reassign_approver",
        errorId: error.id,
        message: "Step instance not found",
        timestamp: new Date(),
        performedBy,
      };
    }

    // Replace the approver
    const updatedApprovers: AssignedApprover[] = step.approvers.map((a) => {
      if (a.userId === error.approverId) {
        return {
          ...a,
          userId: newUser.id,
          name: newUser.name,
          email: newUser.email,
          assignedVia: "reassignment" as const,
          reassignedFrom: error.approverId,
          reassignedAt: new Date(),
          reassignedBy: performedBy,
        };
      }
      return a;
    });

    await this.instanceRepository.updateStepInstance(tenantId, error.stepInstanceId, {
      approvers: updatedApprovers,
    });

    return {
      success: true,
      action: "reassign_approver",
      errorId: error.id,
      message: `Reassigned from ${error.approverId} to ${newUser.name}`,
      timestamp: new Date(),
      performedBy,
    };
  }

  /**
   * Execute reassign to manager
   */
  private async executeReassignToManager(
    tenantId: string,
    error: WorkflowError,
    performedBy: string
  ): Promise<RecoveryResult> {
    if (!error.stepInstanceId || !error.approverId) {
      return {
        success: false,
        action: "reassign_to_manager",
        errorId: error.id,
        message: "Missing required parameters",
        timestamp: new Date(),
        performedBy,
      };
    }

    const manager = await this.userService.getUserManager(error.approverId);
    if (!manager) {
      return {
        success: false,
        action: "reassign_to_manager",
        errorId: error.id,
        message: "Manager not found for approver",
        timestamp: new Date(),
        performedBy,
      };
    }

    return this.executeReassignApprover(
      tenantId,
      error,
      { newUserId: manager.id },
      performedBy
    );
  }

  /**
   * Execute reassign to role
   */
  private async executeReassignToRole(
    tenantId: string,
    error: WorkflowError,
    params: { roleId: string },
    performedBy: string
  ): Promise<RecoveryResult> {
    if (!error.stepInstanceId || !params?.roleId) {
      return {
        success: false,
        action: "reassign_to_role",
        errorId: error.id,
        message: "Missing required parameters",
        timestamp: new Date(),
        performedBy,
      };
    }

    const roleMembers = await this.userService.getUsersByRole(params.roleId);
    if (roleMembers.length === 0) {
      return {
        success: false,
        action: "reassign_to_role",
        errorId: error.id,
        message: "No users found with the required role",
        timestamp: new Date(),
        performedBy,
      };
    }

    // Pick first available member (could be enhanced with load balancing)
    const newApprover = roleMembers[0];

    return this.executeReassignApprover(
      tenantId,
      error,
      { newUserId: newApprover.id },
      performedBy
    );
  }

  /**
   * Execute skip approver
   */
  private async executeSkipApprover(
    tenantId: string,
    error: WorkflowError,
    performedBy: string
  ): Promise<RecoveryResult> {
    if (!error.stepInstanceId || !error.approverId) {
      return {
        success: false,
        action: "skip_approver",
        errorId: error.id,
        message: "Missing required parameters",
        timestamp: new Date(),
        performedBy,
      };
    }

    const step = await this.instanceRepository.getStepInstance(
      tenantId,
      error.stepInstanceId
    );

    if (!step) {
      return {
        success: false,
        action: "skip_approver",
        errorId: error.id,
        message: "Step instance not found",
        timestamp: new Date(),
        performedBy,
      };
    }

    // Update approver status to withdrawn (used for skipped approvers)
    const updatedApprovers: AssignedApprover[] = step.approvers.map((a) => {
      if (a.userId === error.approverId) {
        return {
          ...a,
          status: "withdrawn" as const,
          comment: `Skipped due to: ${error.message}`,
          respondedAt: new Date(),
        };
      }
      return a;
    });

    // Update counts
    const newCounts = {
      ...step.approvalCounts,
      pending: step.approvalCounts.pending - 1,
      delegated: step.approvalCounts.delegated, // Keep delegated count unchanged
    };

    await this.instanceRepository.updateStepInstance(tenantId, error.stepInstanceId, {
      approvers: updatedApprovers,
      approvalCounts: newCounts,
    });

    return {
      success: true,
      action: "skip_approver",
      errorId: error.id,
      message: `Approver ${error.approverId} skipped`,
      timestamp: new Date(),
      performedBy,
    };
  }

  /**
   * Execute skip step
   */
  private async executeSkipStep(
    tenantId: string,
    error: WorkflowError,
    performedBy: string
  ): Promise<RecoveryResult> {
    if (!error.stepInstanceId) {
      return {
        success: false,
        action: "skip_step",
        errorId: error.id,
        message: "Step instance ID not provided",
        timestamp: new Date(),
        performedBy,
      };
    }

    await this.instanceRepository.updateStepInstance(tenantId, error.stepInstanceId, {
      status: "skipped",
      skipReason: `Recovery action: ${error.message}`,
      completedAt: new Date(),
    });

    return {
      success: true,
      action: "skip_step",
      errorId: error.id,
      message: "Step skipped",
      newState: { stepStatus: "skipped" },
      timestamp: new Date(),
      performedBy,
    };
  }

  /**
   * Execute pause workflow
   */
  private async executePauseWorkflow(
    tenantId: string,
    error: WorkflowError,
    performedBy: string
  ): Promise<RecoveryResult> {
    try {
      await this.pauseWorkflow(
        tenantId,
        error.instanceId,
        "error_recovery",
        error.message,
        performedBy
      );

      return {
        success: true,
        action: "pause_workflow",
        errorId: error.id,
        message: "Workflow paused for recovery",
        newState: { instanceStatus: "on_hold" },
        timestamp: new Date(),
        performedBy,
      };
    } catch (err) {
      return {
        success: false,
        action: "pause_workflow",
        errorId: error.id,
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date(),
        performedBy,
      };
    }
  }

  /**
   * Execute cancel workflow
   */
  private async executeCancelWorkflow(
    tenantId: string,
    error: WorkflowError,
    performedBy: string
  ): Promise<RecoveryResult> {
    await this.instanceRepository.update(tenantId, error.instanceId, {
      status: "cancelled",
      completedAt: new Date(),
    });

    return {
      success: true,
      action: "cancel_workflow",
      errorId: error.id,
      message: "Workflow cancelled",
      newState: { instanceStatus: "cancelled" },
      timestamp: new Date(),
      performedBy,
    };
  }

  /**
   * Execute retry action
   */
  private async executeRetryAction(
    tenantId: string,
    error: WorkflowError,
    performedBy: string
  ): Promise<RecoveryResult> {
    // This would integrate with the specific action that failed
    // For now, just mark as retried
    await this.errorRepository.updateError(tenantId, error.id, {
      retryCount: error.retryCount + 1,
      nextRetryAt: new Date(Date.now() + 60000), // Retry in 1 minute
    });

    return {
      success: true,
      action: "retry_action",
      errorId: error.id,
      message: `Retry scheduled (attempt ${error.retryCount + 1}/${error.maxRetries})`,
      timestamp: new Date(),
      performedBy,
    };
  }
}

/**
 * Factory function to create recovery service
 */
export function createRecoveryService(
  errorRepository: IRecoveryErrorRepository,
  instanceRepository: IApprovalInstanceRepository,
  userService: IUserResolutionService,
  auditService?: IAuditTrailService
): IRecoveryService {
  return new RecoveryService(
    errorRepository,
    instanceRepository,
    userService,
    auditService
  );
}
