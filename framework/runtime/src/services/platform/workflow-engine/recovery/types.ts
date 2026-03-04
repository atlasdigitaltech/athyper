/**
 * Recovery Module Types
 *
 * Types for error handling, recovery, and retry functionality
 * in approval workflows.
 */

import type { ApprovalInstance, ApprovalStepInstance, AssignedApprover } from "../instance/types.js";

/**
 * Types of workflow errors that can be recovered
 */
export type WorkflowErrorType =
  | "missing_approver"      // Approver not found in system
  | "deactivated_user"      // Approver account is deactivated
  | "role_mismatch"         // User no longer has required role
  | "group_empty"           // Approval group has no members
  | "sla_expired"           // SLA deadline passed
  | "escalation_failed"     // Escalation could not be completed
  | "notification_failed"   // Failed to notify approvers
  | "condition_error"       // Error evaluating conditions
  | "quorum_unreachable"    // Not enough approvers to reach quorum
  | "system_error";         // General system error

/**
 * Severity of the workflow error
 */
export type ErrorSeverity = "warning" | "error" | "critical";

/**
 * Current status of an error
 */
export type ErrorStatus = "detected" | "acknowledged" | "resolving" | "resolved" | "ignored";

/**
 * Workflow error record
 */
export type WorkflowError = {
  id: string;
  instanceId: string;
  stepInstanceId?: string;
  approverId?: string;

  errorType: WorkflowErrorType;
  severity: ErrorSeverity;
  status: ErrorStatus;

  message: string;
  details?: Record<string, unknown>;
  stackTrace?: string;

  detectedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;

  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;

  // Related entities
  affectedApprovers?: string[];
  suggestedActions?: RecoveryAction[];
};

/**
 * Types of recovery actions
 */
export type RecoveryActionType =
  | "reassign_approver"       // Reassign to different user
  | "reassign_to_role"        // Reassign to role members
  | "reassign_to_manager"     // Reassign to manager
  | "skip_approver"           // Skip this approver
  | "skip_step"               // Skip entire step
  | "pause_workflow"          // Pause workflow
  | "resume_workflow"         // Resume paused workflow
  | "retry_action"            // Retry failed action
  | "escalate"                // Escalate to next level
  | "admin_override"          // Admin takes direct action
  | "cancel_workflow";        // Cancel the workflow

/**
 * Recovery action definition
 */
export type RecoveryAction = {
  type: RecoveryActionType;
  description: string;
  parameters?: Record<string, unknown>;
  requiresConfirmation: boolean;
  estimatedImpact?: string;
};

/**
 * Result of a recovery action
 */
export type RecoveryResult = {
  success: boolean;
  action: RecoveryActionType;
  errorId: string;
  message: string;
  newState?: {
    instanceStatus?: ApprovalInstance["status"];
    stepStatus?: ApprovalStepInstance["status"];
  };
  timestamp: Date;
  performedBy: string;
};

/**
 * Workflow pause reason
 */
export type PauseReason =
  | "error_recovery"
  | "admin_request"
  | "system_maintenance"
  | "external_dependency"
  | "investigation_required";

/**
 * Workflow pause record
 */
export type WorkflowPause = {
  id: string;
  instanceId: string;
  reason: PauseReason;
  message: string;
  pausedAt: Date;
  pausedBy: string;
  resumedAt?: Date;
  resumedBy?: string;
  relatedErrorIds?: string[];
};

/**
 * Retry configuration
 */
export type RetryConfig = {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: WorkflowErrorType[];
};

/**
 * Retry attempt record
 */
export type RetryAttempt = {
  id: string;
  errorId: string;
  instanceId: string;
  attemptNumber: number;
  action: string;
  startedAt: Date;
  completedAt?: Date;
  success: boolean;
  error?: string;
  nextRetryAt?: Date;
};

/**
 * Admin override request
 */
export type AdminOverrideRequest = {
  id: string;
  instanceId: string;
  stepInstanceId?: string;
  requestType: "force_approve" | "force_reject" | "skip_step" | "cancel" | "resume";
  reason: string;
  requestedBy: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  status: "pending" | "approved" | "rejected" | "executed";
  executedAt?: Date;
  result?: string;
};

/**
 * Health check result for a workflow
 */
export type WorkflowHealthCheck = {
  instanceId: string;
  healthy: boolean;
  checkedAt: Date;
  issues: WorkflowHealthIssue[];
  recommendations: string[];
};

/**
 * Individual health issue
 */
export type WorkflowHealthIssue = {
  type: WorkflowErrorType;
  severity: ErrorSeverity;
  message: string;
  stepInstanceId?: string;
  approverId?: string;
  autoResolvable: boolean;
};

/**
 * Recovery error repository interface
 */
export interface IRecoveryErrorRepository {
  // Error management
  createError(error: Omit<WorkflowError, "id">): Promise<WorkflowError>;
  getError(tenantId: string, errorId: string): Promise<WorkflowError | null>;
  getErrorsByInstance(tenantId: string, instanceId: string): Promise<WorkflowError[]>;
  getActiveErrors(tenantId: string): Promise<WorkflowError[]>;
  updateError(tenantId: string, errorId: string, updates: Partial<WorkflowError>): Promise<WorkflowError>;

  // Pause management
  createPause(pause: Omit<WorkflowPause, "id">): Promise<WorkflowPause>;
  getPause(tenantId: string, pauseId: string): Promise<WorkflowPause | null>;
  getActivePause(tenantId: string, instanceId: string): Promise<WorkflowPause | null>;
  updatePause(tenantId: string, pauseId: string, updates: Partial<WorkflowPause>): Promise<WorkflowPause>;

  // Retry management
  createRetryAttempt(attempt: Omit<RetryAttempt, "id">): Promise<RetryAttempt>;
  getRetryAttempts(tenantId: string, errorId: string): Promise<RetryAttempt[]>;
  updateRetryAttempt(tenantId: string, attemptId: string, updates: Partial<RetryAttempt>): Promise<RetryAttempt>;

  // Admin override management
  createOverrideRequest(request: Omit<AdminOverrideRequest, "id">): Promise<AdminOverrideRequest>;
  getOverrideRequest(tenantId: string, requestId: string): Promise<AdminOverrideRequest | null>;
  getOverridesByInstance(tenantId: string, instanceId: string): Promise<AdminOverrideRequest[]>;
  updateOverrideRequest(tenantId: string, requestId: string, updates: Partial<AdminOverrideRequest>): Promise<AdminOverrideRequest>;
}

/**
 * Error detection service interface
 */
export interface IErrorDetectionService {
  /**
   * Run health check on a workflow instance
   */
  checkInstanceHealth(tenantId: string, instanceId: string): Promise<WorkflowHealthCheck>;

  /**
   * Detect errors for a specific step
   */
  detectStepErrors(
    tenantId: string,
    instance: ApprovalInstance,
    step: ApprovalStepInstance
  ): Promise<WorkflowError[]>;

  /**
   * Validate approvers are still valid
   */
  validateApprovers(
    tenantId: string,
    approvers: AssignedApprover[]
  ): Promise<{ valid: AssignedApprover[]; invalid: Array<{ approver: AssignedApprover; reason: WorkflowErrorType }> }>;
}

/**
 * Recovery service interface
 */
export interface IRecoveryService {
  /**
   * Get suggested recovery actions for an error
   */
  getSuggestedActions(tenantId: string, error: WorkflowError): Promise<RecoveryAction[]>;

  /**
   * Execute a recovery action
   */
  executeRecoveryAction(
    tenantId: string,
    errorId: string,
    action: RecoveryAction,
    performedBy: string
  ): Promise<RecoveryResult>;

  /**
   * Pause a workflow
   */
  pauseWorkflow(
    tenantId: string,
    instanceId: string,
    reason: PauseReason,
    message: string,
    pausedBy: string
  ): Promise<WorkflowPause>;

  /**
   * Resume a paused workflow
   */
  resumeWorkflow(
    tenantId: string,
    instanceId: string,
    resumedBy: string
  ): Promise<ApprovalInstance>;

  /**
   * Attempt auto-recovery for an error
   */
  attemptAutoRecovery(tenantId: string, error: WorkflowError): Promise<RecoveryResult | null>;
}

/**
 * Retry service interface
 */
export interface IRetryService {
  /**
   * Schedule a retry for an error
   */
  scheduleRetry(tenantId: string, error: WorkflowError): Promise<RetryAttempt>;

  /**
   * Execute a scheduled retry
   */
  executeRetry(tenantId: string, attemptId: string): Promise<RetryAttempt>;

  /**
   * Cancel pending retries for an error
   */
  cancelRetries(tenantId: string, errorId: string): Promise<void>;

  /**
   * Get pending retries
   */
  getPendingRetries(tenantId: string): Promise<RetryAttempt[]>;

  /**
   * Process due retries
   */
  processDueRetries(tenantId: string): Promise<RetryAttempt[]>;
}

/**
 * Admin override service interface
 */
export interface IAdminOverrideService {
  /**
   * Request an admin override
   */
  requestOverride(
    tenantId: string,
    request: Omit<AdminOverrideRequest, "id" | "status" | "requestedAt">
  ): Promise<AdminOverrideRequest>;

  /**
   * Approve an override request
   */
  approveOverride(
    tenantId: string,
    requestId: string,
    approvedBy: string
  ): Promise<AdminOverrideRequest>;

  /**
   * Reject an override request
   */
  rejectOverride(
    tenantId: string,
    requestId: string,
    rejectedBy: string,
    reason: string
  ): Promise<AdminOverrideRequest>;

  /**
   * Execute an approved override
   */
  executeOverride(tenantId: string, requestId: string): Promise<AdminOverrideRequest>;

  /**
   * Force approve a step (admin action)
   */
  forceApprove(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    adminId: string,
    reason: string
  ): Promise<ApprovalStepInstance>;

  /**
   * Force reject a step (admin action)
   */
  forceReject(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    adminId: string,
    reason: string
  ): Promise<ApprovalStepInstance>;

  /**
   * Cancel a workflow instance (admin action)
   */
  cancelWorkflow(
    tenantId: string,
    instanceId: string,
    adminId: string,
    reason: string
  ): Promise<ApprovalInstance>;
}
