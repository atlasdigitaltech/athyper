/**
 * Admin Actions Module Types
 *
 * Types for administrative actions on approval workflows
 * including force actions, reassignments, and workflow control.
 */

import type { ApprovalInstance } from "../instance/types.js";

/**
 * Types of admin actions
 */
export type AdminActionType =
  | "force_approve"
  | "force_reject"
  | "reassign_approver"
  | "reassign_step"
  | "skip_step"
  | "cancel_workflow"
  | "restart_from_step"
  | "resume_workflow"
  | "pause_workflow"
  | "modify_deadline"
  | "add_approver"
  | "remove_approver";

/**
 * Admin action request
 */
export type AdminActionRequest = {
  id: string;
  tenantId: string;
  instanceId: string;
  stepInstanceId?: string;
  actionType: AdminActionType;
  reason: string;
  requestedBy: string;
  requestedAt: Date;
  parameters?: Record<string, unknown>;

  // Approval workflow for admin actions
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;

  // Execution status
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  executedAt?: Date;
  executedBy?: string;
  result?: AdminActionResult;
  error?: string;
};

/**
 * Result of an admin action
 */
export type AdminActionResult = {
  success: boolean;
  message: string;
  affectedEntities: {
    instances?: string[];
    steps?: string[];
    approvers?: string[];
  };
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
};

/**
 * Step reassignment details
 */
export type StepReassignment = {
  stepInstanceId: string;
  fromApprovers: Array<{ userId: string; name: string }>;
  toApprovers: Array<{ userId: string; name: string; email: string }>;
  reason: string;
  reassignedBy: string;
  reassignedAt: Date;
  notifyOriginal: boolean;
  notifyNew: boolean;
};

/**
 * Workflow restart options
 */
export type RestartOptions = {
  fromStepId: string;
  resetCompletedSteps: boolean;
  preserveComments: boolean;
  preserveAttachments: boolean;
  notifyApprovers: boolean;
  reason: string;
};

/**
 * Deadline modification
 */
export type DeadlineModification = {
  stepInstanceId: string;
  originalDeadline: Date;
  newDeadline: Date;
  reason: string;
  modifiedBy: string;
  modifiedAt: Date;
};

/**
 * Admin action policy
 */
export type AdminActionPolicy = {
  actionType: AdminActionType;
  requiredRoles: string[];
  requiresApproval: boolean;
  approverRoles?: string[];
  maxActionsPerDay?: number;
  allowedOnStatuses: ApprovalInstance["status"][];
  requiresReason: boolean;
  minReasonLength?: number;
};

/**
 * Admin action log entry
 */
export type AdminActionLog = {
  id: string;
  tenantId: string;
  actionRequestId: string;
  instanceId: string;
  stepInstanceId?: string;
  actionType: AdminActionType;
  performedBy: string;
  performedAt: Date;
  reason: string;
  result: AdminActionResult;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Admin action repository interface
 */
export interface IAdminActionRepository {
  // Action requests
  createActionRequest(request: Omit<AdminActionRequest, "id">): Promise<AdminActionRequest>;
  getActionRequest(tenantId: string, requestId: string): Promise<AdminActionRequest | null>;
  getActionRequestsByInstance(tenantId: string, instanceId: string): Promise<AdminActionRequest[]>;
  getPendingActionRequests(tenantId: string): Promise<AdminActionRequest[]>;
  updateActionRequest(tenantId: string, requestId: string, updates: Partial<AdminActionRequest>): Promise<AdminActionRequest>;

  // Action logs
  createActionLog(log: Omit<AdminActionLog, "id">): Promise<AdminActionLog>;
  getActionLogs(tenantId: string, instanceId: string): Promise<AdminActionLog[]>;
  getActionLogsByUser(tenantId: string, userId: string, since?: Date): Promise<AdminActionLog[]>;

  // Reassignments
  createReassignment(reassignment: StepReassignment): Promise<StepReassignment>;
  getReassignments(tenantId: string, stepInstanceId: string): Promise<StepReassignment[]>;

  // Deadline modifications
  createDeadlineModification(modification: DeadlineModification): Promise<DeadlineModification>;
  getDeadlineModifications(tenantId: string, stepInstanceId: string): Promise<DeadlineModification[]>;
}

/**
 * Admin actions service interface
 */
export interface IAdminActionsService {
  /**
   * Force approve a step
   */
  forceApprove(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult>;

  /**
   * Force reject a step
   */
  forceReject(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult>;

  /**
   * Reassign approvers for a step
   */
  reassignApprovers(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    newApprovers: Array<{ userId: string; name: string; email: string }>,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult>;

  /**
   * Add an approver to a step
   */
  addApprover(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    approver: { userId: string; name: string; email: string },
    adminId: string,
    reason: string
  ): Promise<AdminActionResult>;

  /**
   * Remove an approver from a step
   */
  removeApprover(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    approverId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult>;

  /**
   * Skip a step
   */
  skipStep(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult>;

  /**
   * Cancel a workflow instance
   */
  cancelWorkflow(
    tenantId: string,
    instanceId: string,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult>;

  /**
   * Restart workflow from a specific step
   */
  restartFromStep(
    tenantId: string,
    instanceId: string,
    options: RestartOptions,
    adminId: string
  ): Promise<AdminActionResult>;

  /**
   * Modify step deadline
   */
  modifyDeadline(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    newDeadline: Date,
    adminId: string,
    reason: string
  ): Promise<AdminActionResult>;

  /**
   * Get admin action history for an instance
   */
  getActionHistory(tenantId: string, instanceId: string): Promise<AdminActionLog[]>;

  /**
   * Check if admin can perform action
   */
  canPerformAction(
    tenantId: string,
    adminId: string,
    actionType: AdminActionType,
    instanceId: string
  ): Promise<{ allowed: boolean; reason?: string }>;
}
