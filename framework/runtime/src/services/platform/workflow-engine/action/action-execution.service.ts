/**
 * Action Execution Service
 *
 * Handles execution of approval actions: approve, reject, request changes,
 * delegate, escalate, hold, resume, and recall.
 */

import type {
  ActionInput,
  ActionResult,
  ApproveActionInput,
  BypassActionInput,
  CommentActionInput,
  DelegateActionInput,
  EscalateActionInput,
  HoldActionInput,
  IActionExecutionService,
  ReassignActionInput,
  RecallActionInput,
  RejectActionInput,
  ReleaseActionInput,
  RequestChangesInput,
  ResumeActionInput,
  WithdrawActionInput,
  WorkflowEvent,
} from "./types.js";
import type {
  ApprovalInstance,
  ApprovalStepInstance,
  AssignedApprover,
  IApprovalInstanceRepository,
} from "../instance/types.js";
import type { IApprovalTaskService } from "../task/types.js";
import type { ApprovalActionType } from "../types.js";

/**
 * Generate unique ID
 */
function generateId(prefix: string = "act"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Validate action input requirements
 */
function validateActionInput(input: ActionInput): ValidationResult {
  // Common validation
  if (!input.tenantId) {
    return { valid: false, error: "tenantId is required", errorCode: "MISSING_TENANT_ID" };
  }
  if (!input.instanceId) {
    return { valid: false, error: "instanceId is required", errorCode: "MISSING_INSTANCE_ID" };
  }
  if (!input.stepInstanceId) {
    return { valid: false, error: "stepInstanceId is required", errorCode: "MISSING_STEP_ID" };
  }
  if (!input.userId) {
    return { valid: false, error: "userId is required", errorCode: "MISSING_USER_ID" };
  }

  // Action-specific validation
  switch (input.action) {
    case "reject":
      if (!input.reason || input.reason.trim().length === 0) {
        return { valid: false, error: "Rejection reason is required", errorCode: "MISSING_REASON" };
      }
      break;

    case "request_changes":
      if (!input.requestedChanges || input.requestedChanges.trim().length === 0) {
        return { valid: false, error: "Requested changes description is required", errorCode: "MISSING_CHANGES" };
      }
      break;

    case "delegate":
      if (!input.delegateToUserId) {
        return { valid: false, error: "Delegate target user is required", errorCode: "MISSING_DELEGATE" };
      }
      break;

    case "escalate":
      if (!input.escalationReason || input.escalationReason.trim().length === 0) {
        return { valid: false, error: "Escalation reason is required", errorCode: "MISSING_REASON" };
      }
      break;

    case "hold":
      if (!input.holdReason || input.holdReason.trim().length === 0) {
        return { valid: false, error: "Hold reason is required", errorCode: "MISSING_REASON" };
      }
      break;

    case "bypass":
      if (!input.reason || input.reason.trim().length === 0) {
        return { valid: false, error: "Bypass reason is required (mandatory for admin override)", errorCode: "MISSING_REASON" };
      }
      if (!input.decision || !["approve", "reject"].includes(input.decision)) {
        return { valid: false, error: "Bypass decision (approve/reject) is required", errorCode: "MISSING_DECISION" };
      }
      break;

    case "reassign":
      if (!input.toApprover || !input.toApprover.userId) {
        return { valid: false, error: "New approver is required for reassignment", errorCode: "MISSING_APPROVER" };
      }
      if (!input.reason || input.reason.trim().length === 0) {
        return { valid: false, error: "Reassignment reason is required", errorCode: "MISSING_REASON" };
      }
      break;

    case "comment":
      if (!input.commentText || input.commentText.trim().length === 0) {
        return { valid: false, error: "Comment text is required", errorCode: "MISSING_COMMENT" };
      }
      break;
  }

  return { valid: true };
}

/**
 * Action Execution Service Implementation
 */
export class ActionExecutionService implements IActionExecutionService {
  constructor(
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly taskService?: IApprovalTaskService,
    private readonly eventHandlers?: Array<(event: WorkflowEvent) => Promise<void>>
  ) {}

  /**
   * Execute an approval action
   */
  async executeAction(input: ActionInput): Promise<ActionResult> {
    // Validate input requirements
    const validation = validateActionInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        errorCode: validation.errorCode,
      };
    }

    const { tenantId, instanceId, stepInstanceId, userId } = input;

    // Get instance and step
    const instance = await this.instanceRepository.getById(tenantId, instanceId);
    if (!instance) {
      return {
        success: false,
        error: `Instance not found: ${instanceId}`,
        errorCode: "INSTANCE_NOT_FOUND",
      };
    }

    // Validate instance status allows action
    const terminalStatuses = ["approved", "rejected", "cancelled", "withdrawn", "expired"];
    if (terminalStatuses.includes(instance.status)) {
      return {
        success: false,
        error: `Cannot perform action on ${instance.status} instance`,
        errorCode: "INSTANCE_TERMINAL",
      };
    }

    // Try to acquire optimistic lock if supported
    const expectedVersion = instance.version;
    let lockToken: string | undefined;

    if (this.instanceRepository.acquireInstanceLock) {
      const lock = await this.instanceRepository.acquireInstanceLock(
        tenantId,
        instanceId,
        userId,
        5000 // 5 second timeout
      );
      if (!lock) {
        return {
          success: false,
          error: "Could not acquire lock on instance - another action may be in progress",
          errorCode: "LOCK_UNAVAILABLE",
        };
      }
      lockToken = lock.lockToken;
    }

    try {
      // Re-check instance after lock to ensure it hasn't changed
      const lockedInstance = await this.instanceRepository.getById(tenantId, instanceId);
      if (lockedInstance && lockedInstance.version !== expectedVersion) {
        return {
          success: false,
          error: "Instance was modified by another request",
          errorCode: "CONCURRENCY_CONFLICT",
        };
      }

      const stepInstances = await this.instanceRepository.getStepInstances(tenantId, instanceId);
      const stepInstance = stepInstances.find((s) => s.id === stepInstanceId);
      if (!stepInstance) {
        return {
          success: false,
          error: `Step instance not found: ${stepInstanceId}`,
          errorCode: "STEP_NOT_FOUND",
        };
      }

      // Actions that bypass standard approver validation
    const specialActions = ["resume", "recall", "withdraw", "bypass", "reassign", "comment", "release"];
    if (!specialActions.includes(input.action)) {
      // Map to valid ApprovalActionType for validation
      const actionForValidation = input.action as ApprovalActionType;
      const canPerform = await this.canPerformAction(
        tenantId,
        instanceId,
        stepInstanceId,
        userId,
        actionForValidation
      );

      if (!canPerform.allowed) {
        return {
          success: false,
          error: canPerform.reason || "Action not allowed",
          errorCode: "ACTION_NOT_ALLOWED",
        };
      }
    }

      // Execute based on action type
      let result: ActionResult;
      switch (input.action) {
        case "approve":
          result = await this.executeApprove(instance, stepInstance, stepInstances, input);
          break;
        case "reject":
          result = await this.executeReject(instance, stepInstance, input);
          break;
        case "request_changes":
          result = await this.executeRequestChanges(instance, stepInstance, input);
          break;
        case "delegate":
          result = await this.executeDelegate(instance, stepInstance, input);
          break;
        case "escalate":
          result = await this.executeEscalate(instance, stepInstance, input);
          break;
        case "hold":
          result = await this.executeHold(instance, stepInstance, input);
          break;
        case "resume":
          result = await this.executeResume(instance, stepInstance, input);
          break;
        case "recall":
          result = await this.executeRecall(instance, stepInstance, input);
          break;
        case "withdraw":
          result = await this.executeWithdraw(instance, stepInstance, input);
          break;
        case "bypass":
          result = await this.executeBypass(instance, stepInstance, stepInstances, input);
          break;
        case "reassign":
          result = await this.executeReassign(instance, stepInstance, input);
          break;
        case "comment":
          result = await this.executeComment(instance, stepInstance, input);
          break;
        case "release":
          result = await this.executeRelease(instance, stepInstance, input);
          break;
        default:
          result = {
            success: false,
            error: `Unknown action: ${(input as ActionInput).action}`,
            errorCode: "UNKNOWN_ACTION",
          };
      }
      return result;
    } finally {
      // Always release the lock
      if (lockToken && this.instanceRepository.releaseInstanceLock) {
        await this.instanceRepository.releaseInstanceLock(tenantId, instanceId, lockToken);
      }
    }
  }

  /**
   * Execute approve action
   */
  private async executeApprove(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    allSteps: ApprovalStepInstance[],
    input: ApproveActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, comment, attachments } = input;
    const now = new Date();

    // Find the approver assignment
    const approverIndex = stepInstance.approvers.findIndex(
      (a) => a.userId === userId && a.status === "pending"
    );

    if (approverIndex === -1) {
      return {
        success: false,
        error: "No pending approval found for this user",
        errorCode: "NO_PENDING_APPROVAL",
      };
    }

    // Update approver status
    const updatedApprovers = [...stepInstance.approvers];
    updatedApprovers[approverIndex] = {
      ...updatedApprovers[approverIndex],
      status: "approved",
      actionTaken: "approve",
      respondedAt: now,
      comment,
    };

    // Update approval counts
    const approvalCounts = {
      ...stepInstance.approvalCounts,
      approved: stepInstance.approvalCounts.approved + 1,
      pending: stepInstance.approvalCounts.pending - 1,
    };

    // Check if step is now complete
    const stepComplete = this.isStepComplete(stepInstance, approvalCounts);
    const stepOutcome = stepComplete ? this.determineStepOutcome(stepInstance, approvalCounts) : undefined;

    // Update step instance
    const updatedStepInstance = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        approvers: updatedApprovers,
        approvalCounts,
        status: stepComplete ? (stepOutcome === "approved" ? "approved" : "rejected") : "active",
        completedAt: stepComplete ? now : undefined,
      }
    );

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: updatedApprovers[approverIndex].id,
      userId,
      userDisplayName: updatedApprovers[approverIndex].displayName,
      action: "approve",
      comment,
      additionalFields: {
        conditions: input.conditions,
        capturedFields: input.capturedFields,
        attachments,
      },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Complete the task
    if (this.taskService) {
      try {
        const task = await this.findTaskForApprover(tenantId, stepInstance.id, userId);
        if (task) {
          await this.taskService.completeTask(tenantId, task.id, "approve", userId);
        }
      } catch (err) {
        // Log but don't fail
        console.error("Failed to complete task:", err);
      }
    }

    const result: ActionResult = {
      success: true,
      instance,
      stepInstance: updatedStepInstance,
      approverAssignment: updatedApprovers[approverIndex],
      actionRecord,
      eventsTriggered: [],
    };

    // If step is complete, handle next steps or workflow completion
    if (stepComplete) {
      await this.handleStepCompletion(
        tenantId,
        instance,
        updatedStepInstance,
        allSteps,
        stepOutcome!,
        result
      );
    }

    // Fire action event
    await this.fireEvent({
      id: generateId("evt"),
      type: "action.approve",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: { comment, stepComplete, stepOutcome },
    });

    return result;
  }

  /**
   * Execute reject action
   */
  private async executeReject(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: RejectActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, reason, comment, targetEntityState } = input;
    const now = new Date();

    // Find the approver assignment
    const approverIndex = stepInstance.approvers.findIndex(
      (a) => a.userId === userId && a.status === "pending"
    );

    if (approverIndex === -1) {
      return {
        success: false,
        error: "No pending approval found for this user",
        errorCode: "NO_PENDING_APPROVAL",
      };
    }

    // Update approver status
    const updatedApprovers = [...stepInstance.approvers];
    updatedApprovers[approverIndex] = {
      ...updatedApprovers[approverIndex],
      status: "rejected",
      actionTaken: "reject",
      respondedAt: now,
      comment: comment || reason,
    };

    // Update approval counts
    const approvalCounts = {
      ...stepInstance.approvalCounts,
      rejected: stepInstance.approvalCounts.rejected + 1,
      pending: stepInstance.approvalCounts.pending - 1,
    };

    // Mark step as rejected
    const updatedStepInstance = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        approvers: updatedApprovers,
        approvalCounts,
        status: "rejected",
        completedAt: now,
      }
    );

    // Mark workflow as rejected
    const targetState = targetEntityState || "rejected";
    const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
      status: "rejected",
      entityState: targetState as any,
      decision: {
        outcome: "rejected",
        decidedAt: now,
        decidedBy: userId,
        reason: reason || comment,
      },
      completedAt: now,
      updatedAt: now,
      updatedBy: userId,
    });

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: updatedApprovers[approverIndex].id,
      userId,
      userDisplayName: updatedApprovers[approverIndex].displayName,
      action: "reject",
      comment: reason || comment,
      additionalFields: { targetEntityState: targetState },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Cancel remaining tasks
    if (this.taskService) {
      await this.taskService.cancelTasksForInstance(tenantId, instance.id);
    }

    // Unlock entity
    await this.instanceRepository.releaseLock(
      tenantId,
      instance.entity.type,
      instance.entity.id
    );

    // Fire events
    await this.fireEvent({
      id: generateId("evt"),
      type: "action.reject",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: { reason, targetEntityState: targetState },
    });

    await this.fireEvent({
      id: generateId("evt"),
      type: "workflow.rejected",
      tenantId,
      instanceId: instance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: { reason, finalState: targetState },
    });

    return {
      success: true,
      instance: updatedInstance,
      stepInstance: updatedStepInstance,
      approverAssignment: updatedApprovers[approverIndex],
      actionRecord,
      workflowComplete: true,
      finalOutcome: "rejected",
    };
  }

  /**
   * Execute request changes action
   */
  private async executeRequestChanges(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: RequestChangesInput
  ): Promise<ActionResult> {
    const { tenantId, userId, requestedChanges, fieldsToChange, resubmissionDeadline, comment } = input;
    const now = new Date();

    // Find the approver assignment
    const approverIndex = stepInstance.approvers.findIndex(
      (a) => a.userId === userId && a.status === "pending"
    );

    if (approverIndex === -1) {
      return {
        success: false,
        error: "No pending approval found for this user",
        errorCode: "NO_PENDING_APPROVAL",
      };
    }

    // Update approver - mark as pending again after changes
    const updatedApprovers = [...stepInstance.approvers];
    updatedApprovers[approverIndex] = {
      ...updatedApprovers[approverIndex],
      actionTaken: "request_changes",
      respondedAt: now,
      comment: comment || requestedChanges,
    };

    // Update step - paused for changes
    const updatedStepInstance = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        approvers: updatedApprovers,
        status: "active", // Keep active but paused
      }
    );

    // Get current revision count
    const currentRevisionCount = (instance.metadata?.revisionCount as number) || 0;

    // Update instance - mark as changes requested
    const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
      entityState: "changes_requested",
      metadata: {
        ...instance.metadata,
        revisionCount: currentRevisionCount + 1,
        lastChangeRequest: {
          requestedBy: userId,
          requestedAt: now,
          requestedChanges,
          fieldsToChange,
          resubmissionDeadline,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    });

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: updatedApprovers[approverIndex].id,
      userId,
      userDisplayName: updatedApprovers[approverIndex].displayName,
      action: "request_changes",
      comment: requestedChanges,
      additionalFields: {
        fieldsToChange,
        resubmissionDeadline,
        revisionNumber: currentRevisionCount + 1,
      },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Fire event
    await this.fireEvent({
      id: generateId("evt"),
      type: "action.request_changes",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: {
        requestedChanges,
        fieldsToChange,
        resubmissionDeadline,
        revisionNumber: currentRevisionCount + 1,
      },
    });

    return {
      success: true,
      instance: updatedInstance,
      stepInstance: updatedStepInstance,
      approverAssignment: updatedApprovers[approverIndex],
      actionRecord,
    };
  }

  /**
   * Execute delegate action
   */
  private async executeDelegate(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: DelegateActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, delegateToUserId, delegateToDisplayName, delegationReason, comment } = input;
    const now = new Date();

    // Find the approver assignment
    const approverIndex = stepInstance.approvers.findIndex(
      (a) => a.userId === userId && a.status === "pending"
    );

    if (approverIndex === -1) {
      return {
        success: false,
        error: "No pending approval found for this user",
        errorCode: "NO_PENDING_APPROVAL",
      };
    }

    // Update original approver as delegated
    const updatedApprovers = [...stepInstance.approvers];
    updatedApprovers[approverIndex] = {
      ...updatedApprovers[approverIndex],
      status: "delegated",
      actionTaken: "delegate",
      respondedAt: now,
      comment: comment || delegationReason,
      delegatedTo: {
        userId: delegateToUserId,
        displayName: delegateToDisplayName,
        reason: delegationReason,
        delegatedAt: now,
      },
    };

    // Add new approver
    const newApprover: AssignedApprover = {
      id: generateId("asgn"),
      userId: delegateToUserId,
      displayName: delegateToDisplayName,
      resolvedBy: userId,
      resolutionStrategy: "delegation",
      isFallback: false,
      status: "pending",
      assignedAt: now,
      reminderCount: 0,
    };
    updatedApprovers.push(newApprover);

    // Update counts
    const approvalCounts = {
      ...stepInstance.approvalCounts,
      total: stepInstance.approvalCounts.total + 1,
      pending: stepInstance.approvalCounts.pending, // Same, one delegated one added
      delegated: stepInstance.approvalCounts.delegated + 1,
    };

    // Update step instance
    const updatedStepInstance = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        approvers: updatedApprovers,
        approvalCounts,
      }
    );

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: updatedApprovers[approverIndex].id,
      userId,
      userDisplayName: updatedApprovers[approverIndex].displayName,
      action: "delegate",
      comment: comment || delegationReason,
      delegationTarget: {
        userId: delegateToUserId,
        displayName: delegateToDisplayName,
        reason: delegationReason,
      },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Delegate the task
    if (this.taskService) {
      try {
        const task = await this.findTaskForApprover(tenantId, stepInstance.id, userId);
        if (task) {
          await this.taskService.delegateTask(
            tenantId,
            task.id,
            delegateToUserId,
            userId,
            delegationReason
          );
        }
      } catch (err) {
        console.error("Failed to delegate task:", err);
      }
    }

    // Fire event
    await this.fireEvent({
      id: generateId("evt"),
      type: "action.delegate",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: {
        delegateToUserId,
        delegateToDisplayName,
        delegationReason,
      },
    });

    return {
      success: true,
      instance,
      stepInstance: updatedStepInstance,
      approverAssignment: newApprover,
      actionRecord,
    };
  }

  /**
   * Execute escalate action
   */
  private async executeEscalate(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: EscalateActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, escalationReason, targetLevel } = input;
    const now = new Date();

    const currentLevel = stepInstance.sla?.escalationCount || 0;
    const newLevel = targetLevel ?? currentLevel + 1;

    // Update step with escalation
    const updatedStepInstance = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        status: "active",
        sla: {
          ...stepInstance.sla,
          escalationCount: newLevel,
        },
      }
    );

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: stepInstance.approvers[0]?.id || "manual",
      userId,
      action: "escalate",
      comment: escalationReason,
      additionalFields: {
        previousLevel: currentLevel,
        newLevel,
      },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Update instance SLA tracking
    await this.instanceRepository.update(tenantId, instance.id, {
      sla: {
        ...instance.sla,
        escalationCount: (instance.sla?.escalationCount || 0) + 1,
        lastEscalationAt: now,
      },
      updatedAt: now,
      updatedBy: userId,
    });

    // Fire event
    await this.fireEvent({
      id: generateId("evt"),
      type: "action.escalate",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: { escalationReason, previousLevel: currentLevel, newLevel },
    });

    await this.fireEvent({
      id: generateId("evt"),
      type: "step.escalated",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: { escalationLevel: newLevel, reason: escalationReason },
    });

    return {
      success: true,
      instance,
      stepInstance: updatedStepInstance,
      actionRecord,
    };
  }

  /**
   * Execute hold action
   */
  private async executeHold(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: HoldActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, holdReason, expectedResumeDate, comment } = input;
    const now = new Date();

    // Update instance to on_hold
    const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
      status: "on_hold",
      metadata: {
        ...instance.metadata,
        holdInfo: {
          heldBy: userId,
          heldAt: now,
          reason: holdReason,
          expectedResumeDate,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    });

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: "hold",
      userId,
      action: "hold" as any,
      comment: comment || holdReason,
      additionalFields: { expectedResumeDate },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      success: true,
      instance: updatedInstance,
      stepInstance,
      actionRecord,
    };
  }

  /**
   * Execute resume action
   */
  private async executeResume(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: ResumeActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, resumeComment, comment } = input;
    const now = new Date();

    if (instance.status !== "on_hold") {
      return {
        success: false,
        error: "Instance is not on hold",
        errorCode: "NOT_ON_HOLD",
      };
    }

    // Update instance to resume
    const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
      status: "in_progress",
      metadata: {
        ...instance.metadata,
        holdInfo: undefined,
        lastResumed: {
          resumedBy: userId,
          resumedAt: now,
          comment: resumeComment,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    });

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: "resume",
      userId,
      action: "resume" as any,
      comment: comment || resumeComment,
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      success: true,
      instance: updatedInstance,
      stepInstance,
      actionRecord,
    };
  }

  /**
   * Execute recall action (requester recalls their submission)
   */
  private async executeRecall(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: RecallActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, recallReason, comment } = input;
    const now = new Date();

    // Verify user is the requester
    if (instance.requester.userId !== userId) {
      return {
        success: false,
        error: "Only the requester can recall this submission",
        errorCode: "NOT_REQUESTER",
      };
    }

    // Update instance to withdrawn
    const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
      status: "withdrawn",
      entityState: "draft",
      decision: {
        outcome: "withdrawn",
        decidedAt: now,
        decidedBy: userId,
        reason: recallReason || "Recalled by requester",
      },
      completedAt: now,
      updatedAt: now,
      updatedBy: userId,
    });

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: "recall",
      userId,
      action: "recall" as any,
      comment: comment || recallReason,
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Cancel all tasks
    if (this.taskService) {
      await this.taskService.cancelTasksForInstance(tenantId, instance.id);
    }

    // Unlock entity
    await this.instanceRepository.releaseLock(
      tenantId,
      instance.entity.type,
      instance.entity.id
    );

    return {
      success: true,
      instance: updatedInstance,
      stepInstance,
      actionRecord,
      workflowComplete: true,
      finalOutcome: "cancelled",
    };
  }

  /**
   * Handle step completion - evaluate next steps or complete workflow
   */
  private async handleStepCompletion(
    tenantId: string,
    instance: ApprovalInstance,
    completedStep: ApprovalStepInstance,
    allSteps: ApprovalStepInstance[],
    outcome: "approved" | "rejected",
    result: ActionResult
  ): Promise<void> {
    const now = new Date();

    // Update completed steps list
    const completedStepIds = [...instance.completedStepIds, completedStep.id];

    // Find next steps to activate
    const pendingSteps = allSteps.filter(
      (s) => s.status === "pending" && !completedStepIds.includes(s.id)
    );

    // Check dependencies
    const stepsToActivate: ApprovalStepInstance[] = [];

    for (const step of pendingSteps) {
      const dependenciesMet =
        step.dependsOn.length === 0 ||
        step.dependsOn.every((depId) => completedStepIds.includes(depId));

      if (dependenciesMet && step.conditionsMet !== false) {
        stepsToActivate.push(step);
      }
    }

    if (stepsToActivate.length > 0) {
      // Activate next steps
      const activatedSteps: ApprovalStepInstance[] = [];

      for (const step of stepsToActivate) {
        const activated = await this.instanceRepository.updateStepInstance(
          tenantId,
          step.id,
          {
            status: "active",
            activatedAt: now,
            dependenciesSatisfied: true,
          }
        );
        activatedSteps.push(activated);

        // Create tasks for the step
        if (this.taskService) {
          await (this.taskService as any).createTasksForStep(tenantId, instance, activated);
        }

        // Fire step activated event
        await this.fireEvent({
          id: generateId("evt"),
          type: "step.activated",
          tenantId,
          instanceId: instance.id,
          stepInstanceId: step.id,
          entity: { type: instance.entity.type, id: instance.entity.id },
          timestamp: now,
          payload: { stepName: step.name, stepLevel: step.level },
        });
      }

      // Update instance
      await this.instanceRepository.update(tenantId, instance.id, {
        completedStepIds,
        activeStepIds: activatedSteps.map((s) => s.id),
        updatedAt: now,
      });

      result.activatedSteps = activatedSteps;
    } else {
      // No more steps - workflow is complete
      const finalOutcome = outcome;

      const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
        status: finalOutcome,
        entityState: finalOutcome,
        completedStepIds,
        activeStepIds: [],
        decision: {
          outcome: finalOutcome,
          decidedAt: now,
        },
        completedAt: now,
        updatedAt: now,
      });

      result.instance = updatedInstance;
      result.workflowComplete = true;
      result.finalOutcome = finalOutcome;

      // Unlock entity
      await this.instanceRepository.releaseLock(
        tenantId,
        instance.entity.type,
        instance.entity.id
      );

      // Fire workflow completed event
      await this.fireEvent({
        id: generateId("evt"),
        type: finalOutcome === "approved" ? "workflow.approved" : "workflow.rejected",
        tenantId,
        instanceId: instance.id,
        entity: { type: instance.entity.type, id: instance.entity.id },
        timestamp: now,
        payload: { outcome: finalOutcome },
      });
    }

    // Fire step completed event
    await this.fireEvent({
      id: generateId("evt"),
      type: "step.completed",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: completedStep.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      payload: { outcome, stepName: completedStep.name },
    });
  }

  /**
   * Check if step is complete based on requirement
   */
  private isStepComplete(
    step: ApprovalStepInstance,
    counts: ApprovalStepInstance["approvalCounts"]
  ): boolean {
    switch (step.requirement) {
      case "any":
        // Complete if any one approved or rejected
        return counts.approved > 0 || counts.rejected > 0;

      case "all":
        // Complete if all responded (none pending)
        return counts.pending === 0;

      case "majority": {
        // Complete if majority approved or rejected
        const majorityNeeded = Math.floor(counts.total / 2) + 1;
        return counts.approved >= majorityNeeded || counts.rejected >= majorityNeeded;
      }

      case "quorum": {
        // Complete if quorum reached
        const requiredCount = step.quorum?.requiredCount || Math.ceil(counts.total / 2);
        return counts.approved >= requiredCount || counts.rejected >= requiredCount;
      }

      default:
        return false;
    }
  }

  /**
   * Determine step outcome based on counts
   */
  private determineStepOutcome(
    step: ApprovalStepInstance,
    counts: ApprovalStepInstance["approvalCounts"]
  ): "approved" | "rejected" {
    switch (step.requirement) {
      case "any":
        // First response wins
        return counts.approved > 0 ? "approved" : "rejected";

      case "all":
        // All must approve
        return counts.rejected === 0 ? "approved" : "rejected";

      case "majority":
      case "quorum":
        // Whoever reaches threshold first
        return counts.approved >= counts.rejected ? "approved" : "rejected";

      default:
        return "rejected";
    }
  }

  /**
   * Validate if user can perform action
   */
  async canPerformAction(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    userId: string,
    action: ApprovalActionType
  ): Promise<{ allowed: boolean; reason?: string }> {
    const instance = await this.instanceRepository.getById(tenantId, instanceId);
    if (!instance) {
      return { allowed: false, reason: "Instance not found" };
    }

    // Check instance status
    if (instance.status === "approved" || instance.status === "rejected" ||
        instance.status === "cancelled" || instance.status === "withdrawn") {
      return { allowed: false, reason: "Workflow is already completed" };
    }

    if (instance.status === "on_hold" && action !== "release") {
      return { allowed: false, reason: "Workflow is on hold" };
    }

    // Get step instance
    const stepInstances = await this.instanceRepository.getStepInstances(tenantId, instanceId);
    const stepInstance = stepInstances.find((s) => s.id === stepInstanceId);

    if (!stepInstance) {
      return { allowed: false, reason: "Step not found" };
    }

    if (stepInstance.status !== "active") {
      return { allowed: false, reason: "Step is not active" };
    }

    // Check if user has pending approval
    const approver = stepInstance.approvers.find(
      (a) => a.userId === userId && a.status === "pending"
    );

    // Actions that don't require the user to be an approver
    const nonApproverActions: string[] = ["escalate", "hold", "withdraw"];
    if (!approver && !nonApproverActions.includes(action)) {
      return { allowed: false, reason: "No pending approval for this user" };
    }

    // Check allowed actions from template
    const template = instance.workflowSnapshot.definition;
    const stepDef = template.steps.find((s) => s.id === stepInstance.stepDefinitionId);
    const allowedActions = stepDef?.allowedActions || template.allowedActions || [];

    if (allowedActions.length > 0 && !allowedActions.includes(action)) {
      return { allowed: false, reason: `Action '${action}' is not allowed for this step` };
    }

    return { allowed: true };
  }

  /**
   * Get available actions for a user
   */
  async getAvailableActions(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    userId: string
  ): Promise<ApprovalActionType[]> {
    const instance = await this.instanceRepository.getById(tenantId, instanceId);
    if (!instance) return [];

    const stepInstances = await this.instanceRepository.getStepInstances(tenantId, instanceId);
    const stepInstance = stepInstances.find((s) => s.id === stepInstanceId);
    if (!stepInstance) return [];

    // Get allowed actions from template
    const template = instance.workflowSnapshot.definition;
    const stepDef = template.steps.find((s) => s.id === stepInstance.stepDefinitionId);
    const allowedActions = stepDef?.allowedActions || template.allowedActions || [
      "approve",
      "reject",
      "delegate",
      "request_changes",
    ];

    // Filter based on user's assignment
    const approver = stepInstance.approvers.find(
      (a) => a.userId === userId && a.status === "pending"
    );

    if (!approver) {
      // User not an approver, can only escalate or view
      return [];
    }

    return allowedActions;
  }

  /**
   * Execute withdraw action (requester withdraws submission)
   */
  private async executeWithdraw(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: WithdrawActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, reason, comment } = input;
    const now = new Date();

    // Verify user is the requester or has admin privileges
    if (instance.requester.userId !== userId) {
      // TODO: Check for admin privileges
      return {
        success: false,
        error: "Only the requester can withdraw this submission",
        errorCode: "NOT_REQUESTER",
      };
    }

    // Check if instance can be withdrawn
    const terminalStatuses = ["approved", "rejected", "cancelled", "withdrawn", "expired"];
    if (terminalStatuses.includes(instance.status)) {
      return {
        success: false,
        error: `Cannot withdraw instance in ${instance.status} status`,
        errorCode: "INVALID_STATUS",
      };
    }

    // Update instance to withdrawn
    const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
      status: "withdrawn",
      entityState: "draft",
      decision: {
        outcome: "withdrawn",
        decidedAt: now,
        decidedBy: userId,
        reason: reason || "Withdrawn by requester",
      },
      completedAt: now,
      updatedAt: now,
      updatedBy: userId,
    });

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: "withdraw",
      userId,
      action: "withdraw" as any,
      comment: comment || reason,
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Cancel all tasks
    if (this.taskService) {
      await this.taskService.cancelTasksForInstance(tenantId, instance.id);
    }

    // Unlock entity
    await this.instanceRepository.releaseLock(
      tenantId,
      instance.entity.type,
      instance.entity.id
    );

    // Fire events
    await this.fireEvent({
      id: generateId("evt"),
      type: "workflow.cancelled",
      tenantId,
      instanceId: instance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: { reason: reason || "Withdrawn by requester", withdrawnBy: userId },
    });

    return {
      success: true,
      instance: updatedInstance,
      stepInstance,
      actionRecord,
      workflowComplete: true,
      finalOutcome: "cancelled",
    };
  }

  /**
   * Execute bypass action (admin force approve/reject)
   */
  private async executeBypass(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    allSteps: ApprovalStepInstance[],
    input: BypassActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, decision, reason, completeRemainingSteps } = input;
    const now = new Date();

    // TODO: Validate admin privileges
    // For now, allow bypass (in production, check roles/permissions)

    // Check if instance can be bypassed
    const terminalStatuses = ["approved", "rejected", "cancelled", "withdrawn", "expired"];
    if (terminalStatuses.includes(instance.status)) {
      return {
        success: false,
        error: `Cannot bypass instance in ${instance.status} status`,
        errorCode: "INVALID_STATUS",
      };
    }

    // Mark all pending approvers in current step as bypassed
    const updatedApprovers: AssignedApprover[] = stepInstance.approvers.map((a) => {
      if (a.status === "pending") {
        return {
          ...a,
          status: decision === "approve" ? "approved" : "rejected",
          actionTaken: decision === "approve" ? "approve" : "reject",
          respondedAt: now,
          comment: `Admin bypass: ${reason}`,
        };
      }
      return a;
    });

    // Update step
    await this.instanceRepository.updateStepInstance(tenantId, stepInstance.id, {
      status: decision === "approve" ? "approved" : "rejected",
      approvers: updatedApprovers,
      approvalCounts: {
        ...stepInstance.approvalCounts,
        approved: decision === "approve" ? stepInstance.approvalCounts.total : stepInstance.approvalCounts.approved,
        rejected: decision === "reject" ? stepInstance.approvalCounts.total : stepInstance.approvalCounts.rejected,
        pending: 0,
      },
      completedAt: now,
      autoApproved: true,
      autoApproveReason: `Admin bypass by ${userId}: ${reason}`,
    });

    // If completing remaining steps, mark them all
    if (completeRemainingSteps) {
      for (const step of allSteps) {
        if (step.id !== stepInstance.id && (step.status === "pending" || step.status === "active")) {
          await this.instanceRepository.updateStepInstance(tenantId, step.id, {
            status: "skipped",
            skipReason: `Skipped due to admin bypass: ${reason}`,
            completedAt: now,
          });
        }
      }
    }

    // Update instance
    const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
      status: decision === "approve" ? "approved" : "rejected",
      entityState: decision === "approve" ? "approved" : "rejected",
      decision: {
        outcome: decision === "approve" ? "approved" : "rejected",
        decidedAt: now,
        decidedBy: userId,
        reason: `Admin bypass: ${reason}`,
      },
      completedAt: now,
      updatedAt: now,
      updatedBy: userId,
    });

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: "bypass",
      userId,
      action: "bypass" as any,
      comment: reason,
      additionalFields: {
        decision,
        completeRemainingSteps,
        isAdminOverride: true,
      },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Cancel all tasks
    if (this.taskService) {
      await this.taskService.cancelTasksForInstance(tenantId, instance.id);
    }

    // Unlock entity
    await this.instanceRepository.releaseLock(
      tenantId,
      instance.entity.type,
      instance.entity.id
    );

    // Fire events
    await this.fireEvent({
      id: generateId("evt"),
      type: decision === "approve" ? "workflow.approved" : "workflow.rejected",
      tenantId,
      instanceId: instance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: {
        reason,
        isAdminBypass: true,
        bypassedBy: userId,
      },
    });

    return {
      success: true,
      instance: updatedInstance,
      stepInstance,
      actionRecord,
      workflowComplete: true,
      finalOutcome: decision === "approve" ? "approved" : "rejected",
    };
  }

  /**
   * Execute reassign action (admin/manager reassigns approvers)
   */
  private async executeReassign(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: ReassignActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, fromApproverId, toApprover, reason } = input;
    const now = new Date();

    // TODO: Validate admin/manager privileges

    // Check if step is active
    if (stepInstance.status !== "active") {
      return {
        success: false,
        error: `Cannot reassign approvers on ${stepInstance.status} step`,
        errorCode: "INVALID_STEP_STATUS",
      };
    }

    const updatedApprovers = [...stepInstance.approvers];
    const approvalCounts = { ...stepInstance.approvalCounts };

    if (fromApproverId) {
      // Find and update the original approver
      const fromApproverIndex = updatedApprovers.findIndex(
        (a) => a.userId === fromApproverId && a.status === "pending"
      );

      if (fromApproverIndex === -1) {
        return {
          success: false,
          error: "Original approver not found or not pending",
          errorCode: "APPROVER_NOT_FOUND",
        };
      }

      // Mark original as reassigned
      updatedApprovers[fromApproverIndex] = {
        ...updatedApprovers[fromApproverIndex],
        status: "delegated",
        actionTaken: "delegate",
        respondedAt: now,
        comment: `Reassigned by admin: ${reason}`,
        delegatedTo: {
          userId: toApprover.userId,
          displayName: toApprover.displayName,
          reason,
          delegatedAt: now,
        },
      };

      approvalCounts.delegated = (approvalCounts.delegated || 0) + 1;
    }

    // Add new approver
    const newApprover: AssignedApprover = {
      id: generateId("asgn"),
      userId: toApprover.userId,
      displayName: toApprover.displayName,
      email: toApprover.email,
      resolvedBy: userId,
      resolutionStrategy: "reassignment",
      isFallback: false,
      status: "pending",
      assignedAt: now,
      reminderCount: 0,
    };
    updatedApprovers.push(newApprover);
    approvalCounts.total += 1;
    if (!fromApproverId) {
      approvalCounts.pending += 1;
    }

    // Update step instance
    const updatedStepInstance = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        approvers: updatedApprovers,
        approvalCounts,
      }
    );

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: newApprover.id,
      userId,
      action: "reassign" as any,
      comment: reason,
      additionalFields: {
        fromApproverId,
        toApprover,
        isAdminReassignment: true,
      },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Handle tasks
    if (this.taskService) {
      // Cancel old approver's task if reassigning from someone
      if (fromApproverId) {
        // Task service should handle cancellation
      }
      // Create task for new approver
      await (this.taskService as any).createTasksForStep?.(tenantId, instance, updatedStepInstance);
    }

    // Fire event
    await this.fireEvent({
      id: generateId("evt"),
      type: "step.escalated", // Using escalated event for reassignment
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: {
        fromApproverId,
        toApprover,
        reason,
        isReassignment: true,
      },
    });

    return {
      success: true,
      instance,
      stepInstance: updatedStepInstance,
      approverAssignment: newApprover,
      actionRecord,
    };
  }

  /**
   * Execute comment action (non-decision activity)
   */
  private async executeComment(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: CommentActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, commentText, isInternal } = input;
    const now = new Date();

    // Record the comment as an action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: "comment",
      userId,
      action: "comment" as any,
      comment: commentText,
      additionalFields: {
        isInternal: isInternal ?? false,
        isCommentOnly: true,
      },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // No status changes for comment-only action
    return {
      success: true,
      instance,
      stepInstance,
      actionRecord,
    };
  }

  /**
   * Execute release action (release from hold)
   */
  private async executeRelease(
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    input: ReleaseActionInput
  ): Promise<ActionResult> {
    const { tenantId, userId, releaseComment, renotifyApprovers } = input;
    const now = new Date();

    if (instance.status !== "on_hold") {
      return {
        success: false,
        error: "Instance is not on hold",
        errorCode: "NOT_ON_HOLD",
      };
    }

    // Calculate hold duration for SLA adjustment
    const holdInfo = instance.metadata?.holdInfo as { heldAt?: string } | undefined;
    const holdStartTime = holdInfo?.heldAt ? new Date(holdInfo.heldAt) : now;
    const holdDurationMs = now.getTime() - holdStartTime.getTime();

    // Update instance to resume
    const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
      status: "in_progress",
      metadata: {
        ...instance.metadata,
        holdInfo: undefined,
        lastRelease: {
          releasedBy: userId,
          releasedAt: now,
          comment: releaseComment,
          holdDurationMs,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    });

    // Extend SLA deadlines by hold duration
    if (holdDurationMs > 0) {
      const steps = await this.instanceRepository.getStepInstances(tenantId, instance.id);
      for (const step of steps) {
        if (step.status === "active" && step.sla?.completionDueAt) {
          const newDueAt = new Date(new Date(step.sla.completionDueAt).getTime() + holdDurationMs);
          await this.instanceRepository.updateStepInstance(tenantId, step.id, {
            sla: {
              ...step.sla,
              completionDueAt: newDueAt,
              responseDueAt: step.sla.responseDueAt
                ? new Date(new Date(step.sla.responseDueAt).getTime() + holdDurationMs)
                : undefined,
            },
          });
        }
      }
    }

    // Record the action
    const actionRecord = await this.instanceRepository.recordAction(tenantId, {
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      assignmentId: "release",
      userId,
      action: "release" as any,
      comment: releaseComment,
      additionalFields: {
        holdDurationMs,
        slaExtended: holdDurationMs > 0,
      },
      performedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Re-notify approvers if requested
    if (renotifyApprovers && this.taskService) {
      // Task service would handle notifications
    }

    // Fire event
    await this.fireEvent({
      id: generateId("evt"),
      type: "workflow.started", // Using workflow.started as a resume indicator
      tenantId,
      instanceId: instance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      actor: { userId },
      payload: {
        isResume: true,
        holdDurationMs,
        releasedBy: userId,
      },
    });

    return {
      success: true,
      instance: updatedInstance,
      stepInstance,
      actionRecord,
    };
  }

  /**
   * Find task for an approver
   */
  private async findTaskForApprover(
    _tenantId: string,
    _stepInstanceId: string,
    _userId: string
  ): Promise<{ id: string } | undefined> {
    // This would query the task repository
    // For now, return undefined - the task service will handle this internally
    return undefined;
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
 * Factory function to create action execution service
 */
export function createActionExecutionService(
  instanceRepository: IApprovalInstanceRepository,
  taskService?: IApprovalTaskService,
  eventHandlers?: Array<(event: WorkflowEvent) => Promise<void>>
): IActionExecutionService {
  return new ActionExecutionService(instanceRepository, taskService, eventHandlers);
}
