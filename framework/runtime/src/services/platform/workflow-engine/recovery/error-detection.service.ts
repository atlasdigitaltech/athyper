/**
 * Error Detection Service
 *
 * Detects and identifies errors in approval workflows,
 * including missing approvers, deactivated users, and role mismatches.
 */

import type {
  IErrorDetectionService,
  IRecoveryErrorRepository,
  RecoveryAction,
  WorkflowError,
  WorkflowErrorType,
  WorkflowHealthCheck,
  WorkflowHealthIssue,
} from "./types.js";
import type {
  ApprovalInstance,
  ApprovalStepInstance,
  AssignedApprover,
  IApprovalInstanceRepository,
} from "../instance/types.js";

/**
 * User validation service interface (would be provided by IAM)
 */
interface IUserValidationService {
  isUserActive(userId: string): Promise<boolean>;
  getUserRoles(userId: string): Promise<string[]>;
  getGroupMembers(groupId: string): Promise<string[]>;
  getUserManager(userId: string): Promise<string | null>;
}

/**
 * Error Detection Service Implementation
 */
export class ErrorDetectionService implements IErrorDetectionService {
  constructor(
    private readonly errorRepository: IRecoveryErrorRepository,
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly userService: IUserValidationService
  ) {}

  /**
   * Run health check on a workflow instance
   */
  async checkInstanceHealth(
    tenantId: string,
    instanceId: string
  ): Promise<WorkflowHealthCheck> {
    const instance = await this.instanceRepository.getById(tenantId, instanceId);

    if (!instance) {
      return {
        instanceId,
        healthy: false,
        checkedAt: new Date(),
        issues: [
          {
            type: "system_error",
            severity: "critical",
            message: "Instance not found",
            autoResolvable: false,
          },
        ],
        recommendations: ["Verify instance ID is correct"],
      };
    }

    const issues: WorkflowHealthIssue[] = [];
    const recommendations: string[] = [];

    // Check if instance is in a terminal state
    if (["completed", "rejected", "cancelled"].includes(instance.status)) {
      return {
        instanceId,
        healthy: true,
        checkedAt: new Date(),
        issues: [],
        recommendations: [],
      };
    }

    // Get all step instances
    const steps = await this.instanceRepository.getStepInstances(tenantId, instanceId);

    // Check active and pending steps
    for (const step of steps) {
      if (step.status === "active" || step.status === "pending") {
        const stepIssues = await this.checkStepHealth(tenantId, instance, step);
        issues.push(...stepIssues);
      }
    }

    // Check for SLA violations
    const slaIssues = this.checkSlaHealth(instance, steps);
    issues.push(...slaIssues);

    // Check for stuck workflows
    const stuckIssue = this.checkForStuckWorkflow(instance, steps);
    if (stuckIssue) {
      issues.push(stuckIssue);
    }

    // Generate recommendations based on issues
    for (const issue of issues) {
      const recs = this.getRecommendationsForIssue(issue);
      recommendations.push(...recs);
    }

    return {
      instanceId,
      healthy: issues.filter((i) => i.severity === "critical").length === 0,
      checkedAt: new Date(),
      issues,
      recommendations: [...new Set(recommendations)], // Deduplicate
    };
  }

  /**
   * Check health of a specific step
   */
  private async checkStepHealth(
    tenantId: string,
    instance: ApprovalInstance,
    step: ApprovalStepInstance
  ): Promise<WorkflowHealthIssue[]> {
    const issues: WorkflowHealthIssue[] = [];

    // Validate all approvers
    const validation = await this.validateApprovers(tenantId, step.approvers);

    for (const { approver, reason } of validation.invalid) {
      issues.push({
        type: reason,
        severity: reason === "deactivated_user" ? "critical" : "error",
        message: this.getErrorMessage(reason, approver),
        stepInstanceId: step.id,
        approverId: approver.userId,
        autoResolvable: this.isAutoResolvable(reason),
      });
    }

    // Check if quorum is still reachable
    const validApprovers = validation.valid.length;
    const requiredCount = step.quorum?.requiredCount || 1;

    if (validApprovers < requiredCount && step.status === "active") {
      issues.push({
        type: "quorum_unreachable",
        severity: "critical",
        message: `Only ${validApprovers} valid approvers remaining, but ${requiredCount} required for quorum`,
        stepInstanceId: step.id,
        autoResolvable: false,
      });
    }

    return issues;
  }

  /**
   * Check for SLA violations
   */
  private checkSlaHealth(
    instance: ApprovalInstance,
    steps: ApprovalStepInstance[]
  ): WorkflowHealthIssue[] {
    const issues: WorkflowHealthIssue[] = [];
    const now = new Date();

    for (const step of steps) {
      if (step.status !== "active") continue;

      if (step.sla?.completionDueAt && new Date(step.sla.completionDueAt) < now) {
        issues.push({
          type: "sla_expired",
          severity: "error",
          message: `Step "${step.name}" has exceeded its SLA deadline`,
          stepInstanceId: step.id,
          autoResolvable: false,
        });
      }
    }

    return issues;
  }

  /**
   * Check if workflow is stuck
   */
  private checkForStuckWorkflow(
    instance: ApprovalInstance,
    steps: ApprovalStepInstance[]
  ): WorkflowHealthIssue | null {
    // Check for no active steps when workflow is in progress
    if (instance.status === "in_progress") {
      const activeSteps = steps.filter((s) => s.status === "active");
      const pendingSteps = steps.filter((s) => s.status === "pending");

      if (activeSteps.length === 0 && pendingSteps.length > 0) {
        // Check if any pending steps can be activated
        const canActivate = pendingSteps.some((s) => s.dependenciesSatisfied);

        if (!canActivate) {
          return {
            type: "system_error",
            severity: "critical",
            message: "Workflow appears stuck - no active steps and no steps can be activated",
            autoResolvable: false,
          };
        }
      }
    }

    return null;
  }

  /**
   * Detect errors for a specific step
   */
  async detectStepErrors(
    tenantId: string,
    instance: ApprovalInstance,
    step: ApprovalStepInstance
  ): Promise<WorkflowError[]> {
    const errors: WorkflowError[] = [];
    const validation = await this.validateApprovers(tenantId, step.approvers);

    for (const { approver, reason } of validation.invalid) {
      const error: Omit<WorkflowError, "id"> = {
        instanceId: instance.id,
        stepInstanceId: step.id,
        approverId: approver.userId,
        errorType: reason,
        severity: this.getSeverityForError(reason),
        status: "detected",
        message: this.getErrorMessage(reason, approver),
        details: {
          approverName: approver.displayName,
          approverEmail: approver.email,
          stepName: step.name,
        },
        detectedAt: new Date(),
        retryCount: 0,
        maxRetries: this.getMaxRetriesForError(reason),
        affectedApprovers: [approver.userId],
        suggestedActions: this.getSuggestedActionsForError(reason, approver),
      };

      const created = await this.errorRepository.createError(error);
      errors.push(created);
    }

    return errors;
  }

  /**
   * Validate approvers are still valid
   */
  async validateApprovers(
    tenantId: string,
    approvers: AssignedApprover[]
  ): Promise<{
    valid: AssignedApprover[];
    invalid: Array<{ approver: AssignedApprover; reason: WorkflowErrorType }>;
  }> {
    const valid: AssignedApprover[] = [];
    const invalid: Array<{ approver: AssignedApprover; reason: WorkflowErrorType }> = [];

    for (const approver of approvers) {
      // Skip already responded approvers
      if (approver.status !== "pending") {
        valid.push(approver);
        continue;
      }

      // Check if user is active
      const isActive = await this.userService.isUserActive(approver.userId);
      if (!isActive) {
        invalid.push({ approver, reason: "deactivated_user" });
        continue;
      }

      // Check if user still has required roles (if role-based assignment)
      if (approver.resolutionStrategy === "role" && approver.resolvedBy) {
        const userRoles = await this.userService.getUserRoles(approver.userId);
        if (!userRoles.includes(approver.resolvedBy)) {
          invalid.push({ approver, reason: "role_mismatch" });
          continue;
        }
      }

      // Check if group still has members (if group-based assignment)
      if (approver.resolutionStrategy === "group" && approver.resolvedBy) {
        const members = await this.userService.getGroupMembers(approver.resolvedBy);
        if (!members.includes(approver.userId)) {
          invalid.push({ approver, reason: "group_empty" });
          continue;
        }
      }

      valid.push(approver);
    }

    return { valid, invalid };
  }

  /**
   * Get error message for error type
   */
  private getErrorMessage(
    errorType: WorkflowErrorType,
    approver: AssignedApprover
  ): string {
    switch (errorType) {
      case "deactivated_user":
        return `Approver "${approver.displayName}" (${approver.email}) has been deactivated`;
      case "role_mismatch":
        return `Approver "${approver.displayName}" no longer has the required role`;
      case "group_empty":
        return `Approver "${approver.displayName}" is no longer a member of the required group`;
      case "missing_approver":
        return `Approver "${approver.displayName}" could not be found in the system`;
      default:
        return `Error with approver "${approver.displayName}"`;
    }
  }

  /**
   * Get severity for error type
   */
  private getSeverityForError(errorType: WorkflowErrorType): "warning" | "error" | "critical" {
    switch (errorType) {
      case "deactivated_user":
      case "quorum_unreachable":
        return "critical";
      case "role_mismatch":
      case "group_empty":
      case "sla_expired":
        return "error";
      case "notification_failed":
        return "warning";
      default:
        return "error";
    }
  }

  /**
   * Get max retries for error type
   */
  private getMaxRetriesForError(errorType: WorkflowErrorType): number {
    switch (errorType) {
      case "notification_failed":
        return 3;
      case "system_error":
        return 2;
      default:
        return 0; // Non-retryable errors
    }
  }

  /**
   * Check if error is auto-resolvable
   */
  private isAutoResolvable(errorType: WorkflowErrorType): boolean {
    switch (errorType) {
      case "notification_failed":
        return true;
      default:
        return false;
    }
  }

  /**
   * Get suggested actions for error
   */
  private getSuggestedActionsForError(
    errorType: WorkflowErrorType,
    approver: AssignedApprover
  ): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (errorType) {
      case "deactivated_user":
        actions.push(
          {
            type: "reassign_approver",
            description: "Reassign to a different user",
            requiresConfirmation: true,
            estimatedImpact: "Workflow will continue with new approver",
          },
          {
            type: "reassign_to_manager",
            description: "Reassign to the approver's manager",
            requiresConfirmation: true,
            estimatedImpact: "Manager will take over approval responsibility",
          },
          {
            type: "skip_approver",
            description: "Skip this approver",
            requiresConfirmation: true,
            estimatedImpact: "May affect quorum requirements",
          }
        );
        break;

      case "role_mismatch":
        actions.push(
          {
            type: "reassign_to_role",
            description: "Reassign to another user with the required role",
            parameters: { roleId: approver.resolvedBy },
            requiresConfirmation: true,
            estimatedImpact: "Another role member will be assigned",
          },
          {
            type: "skip_approver",
            description: "Skip this approver",
            requiresConfirmation: true,
            estimatedImpact: "May affect quorum requirements",
          }
        );
        break;

      case "quorum_unreachable":
        actions.push(
          {
            type: "admin_override",
            description: "Admin force approve or reject",
            requiresConfirmation: true,
            estimatedImpact: "Admin decision will be recorded",
          },
          {
            type: "cancel_workflow",
            description: "Cancel the workflow",
            requiresConfirmation: true,
            estimatedImpact: "Workflow will be cancelled",
          }
        );
        break;

      case "sla_expired":
        actions.push(
          {
            type: "escalate",
            description: "Escalate to next level",
            requiresConfirmation: false,
            estimatedImpact: "Additional approvers will be notified",
          },
          {
            type: "admin_override",
            description: "Admin takes action",
            requiresConfirmation: true,
            estimatedImpact: "Admin decision will be recorded",
          }
        );
        break;

      default:
        actions.push(
          {
            type: "retry_action",
            description: "Retry the failed operation",
            requiresConfirmation: false,
            estimatedImpact: "Operation will be retried",
          },
          {
            type: "admin_override",
            description: "Admin intervention required",
            requiresConfirmation: true,
            estimatedImpact: "Admin will manually resolve",
          }
        );
    }

    return actions;
  }

  /**
   * Get recommendations for an issue
   */
  private getRecommendationsForIssue(issue: WorkflowHealthIssue): string[] {
    const recommendations: string[] = [];

    switch (issue.type) {
      case "deactivated_user":
        recommendations.push("Reassign the approval task to an active user");
        recommendations.push("Review user deactivation policies");
        break;

      case "role_mismatch":
        recommendations.push("Reassign to another user with the required role");
        recommendations.push("Review role assignment policies");
        break;

      case "quorum_unreachable":
        recommendations.push("Add additional approvers to the step");
        recommendations.push("Consider admin override if business-critical");
        break;

      case "sla_expired":
        recommendations.push("Escalate to management for urgent attention");
        recommendations.push("Review SLA configuration for appropriateness");
        break;

      case "system_error":
        recommendations.push("Contact system administrator");
        recommendations.push("Check system logs for details");
        break;
    }

    return recommendations;
  }
}

/**
 * Factory function to create error detection service
 */
export function createErrorDetectionService(
  errorRepository: IRecoveryErrorRepository,
  instanceRepository: IApprovalInstanceRepository,
  userService: IUserValidationService
): IErrorDetectionService {
  return new ErrorDetectionService(errorRepository, instanceRepository, userService);
}
