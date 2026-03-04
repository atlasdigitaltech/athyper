/**
 * Approval Action Execution Types
 *
 * Types for executing approval actions, handling parallel approvals,
 * escalation, and workflow completion.
 */

import type {
  ApprovalActionRecord,
  ApprovalInstance,
  ApprovalStepInstance,
  AssignedApprover,
  EntityApprovalState,
} from "../instance/types.js";
import type { ApprovalActionType } from "../types.js";

// ============================================================================
// 4.1-4.4 Action Execution
// ============================================================================

/**
 * Base action input
 */
export interface BaseActionInput {
  /** Tenant ID */
  tenantId: string;

  /** Approval instance ID */
  instanceId: string;

  /** Step instance ID */
  stepInstanceId: string;

  /** User performing the action */
  userId: string;

  /** Optional comment/reason */
  comment?: string;

  /** Optional attachments */
  attachments?: ActionAttachment[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** IP address for audit */
  ipAddress?: string;

  /** User agent for audit */
  userAgent?: string;
}

/**
 * Attachment for an action
 */
export interface ActionAttachment {
  /** Attachment ID */
  id: string;

  /** File name */
  fileName: string;

  /** File type/MIME */
  fileType: string;

  /** File size in bytes */
  fileSize: number;

  /** Storage URL/path */
  url: string;

  /** Upload timestamp */
  uploadedAt: Date;
}

/**
 * Approve action input
 */
export interface ApproveActionInput extends BaseActionInput {
  action: "approve";

  /** Optional conditions/stipulations for approval */
  conditions?: string[];

  /** Fields/values captured during approval */
  capturedFields?: Record<string, unknown>;
}

/**
 * Reject action input
 */
export interface RejectActionInput extends BaseActionInput {
  action: "reject";

  /** Rejection reason (required) */
  reason: string;

  /** Target state for entity after rejection */
  targetEntityState?: "draft" | "rework" | "rejected";
}

/**
 * Request changes action input
 */
export interface RequestChangesInput extends BaseActionInput {
  action: "request_changes";

  /** Requested changes (required) */
  requestedChanges: string;

  /** Fields that need to be changed */
  fieldsToChange?: string[];

  /** Deadline for resubmission */
  resubmissionDeadline?: Date;
}

/**
 * Delegate action input
 */
export interface DelegateActionInput extends BaseActionInput {
  action: "delegate";

  /** User ID to delegate to */
  delegateToUserId: string;

  /** Delegate display name */
  delegateToDisplayName?: string;

  /** Reason for delegation */
  delegationReason?: string;

  /** Whether delegatee can further delegate */
  allowFurtherDelegation?: boolean;
}

/**
 * Escalate action input
 */
export interface EscalateActionInput extends BaseActionInput {
  action: "escalate";

  /** Reason for escalation */
  escalationReason: string;

  /** Target escalation level (optional, defaults to next level) */
  targetLevel?: number;
}

/**
 * Hold action input
 */
export interface HoldActionInput extends BaseActionInput {
  action: "hold";

  /** Reason for hold */
  holdReason: string;

  /** Expected resume date */
  expectedResumeDate?: Date;
}

/**
 * Resume action input
 */
export interface ResumeActionInput extends BaseActionInput {
  action: "resume";

  /** Comment on why resuming */
  resumeComment?: string;
}

/**
 * Recall action input (requester recalls their submission)
 */
export interface RecallActionInput extends BaseActionInput {
  action: "recall";

  /** Reason for recall */
  recallReason?: string;
}

/**
 * Withdraw action input (requester withdraws submission)
 */
export interface WithdrawActionInput extends BaseActionInput {
  action: "withdraw";

  /** Reason for withdrawal */
  reason?: string;
}

/**
 * Bypass action input (admin force approve/reject)
 */
export interface BypassActionInput extends BaseActionInput {
  action: "bypass";

  /** Bypass decision (approve or reject) */
  decision: "approve" | "reject";

  /** Mandatory reason for bypass */
  reason: string;

  /** Whether to complete remaining steps */
  completeRemainingSteps?: boolean;
}

/**
 * Reassign action input (admin/manager reassigns approvers)
 */
export interface ReassignActionInput extends BaseActionInput {
  action: "reassign";

  /** Current approver to remove (optional - if not specified, adds to step) */
  fromApproverId?: string;

  /** New approver to assign */
  toApprover: {
    userId: string;
    displayName?: string;
    email?: string;
  };

  /** Reason for reassignment */
  reason: string;

  /** Notify original approver */
  notifyOriginal?: boolean;

  /** Notify new approver */
  notifyNew?: boolean;
}

/**
 * Comment action input (non-decision activity)
 */
export interface CommentActionInput extends BaseActionInput {
  action: "comment";

  /** Comment content (required) */
  commentText: string;

  /** Notify watchers */
  notifyWatchers?: boolean;

  /** Is internal (not visible to requester) */
  isInternal?: boolean;
}

/**
 * Release action input (release from hold)
 */
export interface ReleaseActionInput extends BaseActionInput {
  action: "release";

  /** Comment on release */
  releaseComment?: string;

  /** Re-notify approvers */
  renotifyApprovers?: boolean;
}

/**
 * Union of all action inputs
 */
export type ActionInput =
  | ApproveActionInput
  | RejectActionInput
  | RequestChangesInput
  | DelegateActionInput
  | EscalateActionInput
  | HoldActionInput
  | ResumeActionInput
  | RecallActionInput
  | WithdrawActionInput
  | BypassActionInput
  | ReassignActionInput
  | CommentActionInput
  | ReleaseActionInput;

/**
 * Action result
 */
export interface ActionResult {
  /** Whether action succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Error code */
  errorCode?: string;

  /** Updated instance */
  instance?: ApprovalInstance;

  /** Updated step instance */
  stepInstance?: ApprovalStepInstance;

  /** Updated approver assignment */
  approverAssignment?: AssignedApprover;

  /** Recorded action */
  actionRecord?: ApprovalActionRecord;

  /** Next steps activated (if any) */
  activatedSteps?: ApprovalStepInstance[];

  /** Whether workflow is complete */
  workflowComplete?: boolean;

  /** Final outcome (if complete) */
  finalOutcome?: "approved" | "rejected" | "cancelled";

  /** Events triggered */
  eventsTriggered?: WorkflowEvent[];

  /** Warnings (non-fatal issues) */
  warnings?: string[];
}

// ============================================================================
// 5.1-5.2 Parallel & Conditional Approvals
// ============================================================================

/**
 * Step completion evaluation result
 */
export interface StepCompletionEvaluation {
  /** Whether step is complete */
  isComplete: boolean;

  /** Completion outcome (if complete) */
  outcome?: "approved" | "rejected" | "skipped";

  /** Reason for outcome */
  reason?: string;

  /** Counts */
  counts: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    delegated: number;
  };

  /** Required count for approval (based on requirement type) */
  requiredCount: number;

  /** Whether quorum is met */
  quorumMet: boolean;
}

/**
 * Condition evaluation context
 */
export interface ConditionEvaluationContext {
  /** The approval instance */
  instance: ApprovalInstance;

  /** Current step instance */
  currentStep: ApprovalStepInstance;

  /** All step instances */
  allSteps: ApprovalStepInstance[];

  /** Entity data for condition evaluation */
  entityData: Record<string, unknown>;

  /** Requester information */
  requester: {
    userId: string;
    roles?: string[];
    departmentId?: string;
    costCenterId?: string;
    managerId?: string;
  };

  /** Custom context variables */
  customContext?: Record<string, unknown>;
}

/**
 * Step activation decision
 */
export interface StepActivationDecision {
  /** Step instance ID */
  stepInstanceId: string;

  /** Whether to activate */
  shouldActivate: boolean;

  /** Whether to skip */
  shouldSkip: boolean;

  /** Skip reason */
  skipReason?: string;

  /** Whether to auto-approve */
  shouldAutoApprove: boolean;

  /** Auto-approve reason */
  autoApproveReason?: string;

  /** Dependencies satisfied */
  dependenciesSatisfied: boolean;

  /** Conditions met */
  conditionsMet: boolean;
}

// ============================================================================
// 6.1-6.2 Escalation & SLA Handling
// ============================================================================

/**
 * SLA status for a step
 */
export interface StepSlaStatus {
  /** Step instance ID */
  stepInstanceId: string;

  /** Response SLA status */
  responseSla?: {
    dueAt: Date;
    status: "on_track" | "warning" | "breached";
    timeRemainingMs: number;
  };

  /** Completion SLA status */
  completionSla?: {
    dueAt: Date;
    status: "on_track" | "warning" | "breached";
    timeRemainingMs: number;
  };

  /** Overall status */
  overallStatus: "on_track" | "warning" | "breached";

  /** Whether warning notification sent */
  warningNotified: boolean;

  /** Whether breach notification sent */
  breachNotified: boolean;
}

/**
 * Escalation target
 */
export interface EscalationTarget {
  /** Target type */
  type: "user" | "role" | "manager" | "group";

  /** Target identifier */
  targetId: string;

  /** Resolved user IDs */
  resolvedUserIds: string[];

  /** Display name */
  displayName?: string;
}

/**
 * Escalation action to take
 */
export interface EscalationAction {
  /** Action type */
  type: "reassign" | "notify" | "auto_approve" | "auto_reject" | "cancel";

  /** Target for reassignment */
  target?: EscalationTarget;

  /** Notification recipients */
  notifyUsers?: string[];

  /** Comment/reason */
  comment?: string;
}

/**
 * Escalation execution result
 */
export interface EscalationResult {
  /** Whether escalation executed */
  executed: boolean;

  /** New escalation level */
  newEscalationLevel: number;

  /** Actions taken */
  actionsTaken: EscalationAction[];

  /** New assignees (if reassigned) */
  newAssignees?: AssignedApprover[];

  /** Notifications sent */
  notificationsSent: string[];

  /** Error if failed */
  error?: string;
}

// ============================================================================
// 7.1-7.2 Workflow Completion
// ============================================================================

/**
 * Workflow event types
 */
export type WorkflowEventType =
  | "workflow.started"
  | "workflow.approved"
  | "workflow.rejected"
  | "workflow.cancelled"
  | "workflow.expired"
  | "step.activated"
  | "step.completed"
  | "step.skipped"
  | "step.escalated"
  | "action.approve"
  | "action.reject"
  | "action.delegate"
  | "action.request_changes"
  | "action.escalate"
  | "sla.warning"
  | "sla.breach"
  | "entity.state_changed"
  | "entity.locked"
  | "entity.unlocked";

/**
 * Workflow event
 */
export interface WorkflowEvent {
  /** Event ID */
  id: string;

  /** Event type */
  type: WorkflowEventType;

  /** Tenant ID */
  tenantId: string;

  /** Instance ID */
  instanceId: string;

  /** Step instance ID (if applicable) */
  stepInstanceId?: string;

  /** Entity information */
  entity: {
    type: string;
    id: string;
  };

  /** Event timestamp */
  timestamp: Date;

  /** Actor (user who triggered) */
  actor?: {
    userId: string;
    displayName?: string;
  };

  /** Event payload */
  payload: Record<string, unknown>;

  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Post-approval hook definition
 */
export interface PostApprovalHook {
  /** Hook ID */
  id: string;

  /** Hook name */
  name: string;

  /** When to trigger */
  triggerOn: "approved" | "rejected" | "completed" | "cancelled";

  /** Hook type */
  type: "webhook" | "event" | "workflow" | "function";

  /** Configuration */
  config: {
    /** Webhook URL */
    url?: string;

    /** Event topic */
    eventTopic?: string;

    /** Workflow to trigger */
    workflowCode?: string;

    /** Function to call */
    functionName?: string;

    /** Headers for webhook */
    headers?: Record<string, string>;

    /** Timeout in ms */
    timeout?: number;

    /** Retry configuration */
    retry?: {
      maxAttempts: number;
      backoffMs: number;
    };
  };

  /** Enabled */
  enabled: boolean;
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  /** Hook ID */
  hookId: string;

  /** Whether execution succeeded */
  success: boolean;

  /** Response/result */
  response?: unknown;

  /** Error if failed */
  error?: string;

  /** Execution time in ms */
  executionTimeMs: number;

  /** Retry count */
  retryCount: number;
}

/**
 * Workflow completion result
 */
export interface WorkflowCompletionResult {
  /** Whether completion succeeded */
  success: boolean;

  /** Final outcome */
  outcome: "approved" | "rejected" | "cancelled" | "expired";

  /** Updated instance */
  instance: ApprovalInstance;

  /** Entity state after completion */
  newEntityState: EntityApprovalState;

  /** Whether entity was unlocked */
  entityUnlocked: boolean;

  /** Events fired */
  eventsFired: WorkflowEvent[];

  /** Hooks executed */
  hooksExecuted: HookExecutionResult[];

  /** Downstream workflows triggered */
  downstreamWorkflows?: string[];

  /** Error if failed */
  error?: string;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Action execution service interface
 */
export interface IActionExecutionService {
  /** Execute an approval action */
  executeAction(input: ActionInput): Promise<ActionResult>;

  /** Validate if user can perform action */
  canPerformAction(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    userId: string,
    action: ApprovalActionType
  ): Promise<{ allowed: boolean; reason?: string }>;

  /** Get available actions for a user on a step */
  getAvailableActions(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    userId: string
  ): Promise<ApprovalActionType[]>;
}

/**
 * Step completion service interface
 */
export interface IStepCompletionService {
  /** Evaluate if step is complete */
  evaluateStepCompletion(
    tenantId: string,
    stepInstance: ApprovalStepInstance
  ): Promise<StepCompletionEvaluation>;

  /** Get next steps to activate */
  getNextStepsToActivate(
    tenantId: string,
    instance: ApprovalInstance,
    completedStep: ApprovalStepInstance
  ): Promise<StepActivationDecision[]>;

  /** Activate a step */
  activateStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance
  ): Promise<ApprovalStepInstance>;
}

/**
 * SLA monitoring service interface
 */
export interface ISlaMonitoringService {
  /** Check SLA status for a step */
  checkStepSla(
    tenantId: string,
    stepInstance: ApprovalStepInstance
  ): Promise<StepSlaStatus>;

  /** Check SLA for all active steps in an instance */
  checkInstanceSla(
    tenantId: string,
    instance: ApprovalInstance
  ): Promise<StepSlaStatus[]>;

  /** Process SLA breaches (called by scheduler) */
  processSlaBreaches(tenantId: string): Promise<EscalationResult[]>;

  /** Send SLA warning notifications */
  sendSlaWarnings(tenantId: string): Promise<number>;
}

/**
 * Escalation service interface
 */
export interface IEscalationService {
  /** Execute escalation for a step */
  executeEscalation(
    tenantId: string,
    stepInstance: ApprovalStepInstance,
    reason: string
  ): Promise<EscalationResult>;

  /** Get escalation targets for a step */
  getEscalationTargets(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    escalationLevel: number
  ): Promise<EscalationTarget[]>;
}

/**
 * Workflow completion service interface
 */
export interface IWorkflowCompletionService {
  /** Complete workflow with approval */
  completeAsApproved(
    tenantId: string,
    instance: ApprovalInstance
  ): Promise<WorkflowCompletionResult>;

  /** Complete workflow with rejection */
  completeAsRejected(
    tenantId: string,
    instance: ApprovalInstance,
    reason: string
  ): Promise<WorkflowCompletionResult>;

  /** Cancel workflow */
  cancelWorkflow(
    tenantId: string,
    instance: ApprovalInstance,
    userId: string,
    reason?: string
  ): Promise<WorkflowCompletionResult>;

  /** Execute post-approval hooks */
  executeHooks(
    tenantId: string,
    instance: ApprovalInstance,
    outcome: "approved" | "rejected" | "cancelled"
  ): Promise<HookExecutionResult[]>;

  /** Fire workflow event */
  fireEvent(event: WorkflowEvent): Promise<void>;
}

/**
 * Event handler interface (to be implemented by consuming applications)
 */
export interface IWorkflowEventHandler {
  /** Handle workflow event */
  handleEvent(event: WorkflowEvent): Promise<void>;
}

/**
 * Delegation rules validator interface
 */
export interface IDelegationValidator {
  /** Validate if delegation is allowed */
  canDelegate(
    tenantId: string,
    fromUserId: string,
    toUserId: string,
    stepInstance: ApprovalStepInstance
  ): Promise<{ allowed: boolean; reason?: string }>;

  /** Get allowed delegation targets */
  getAllowedDelegationTargets(
    tenantId: string,
    userId: string,
    stepInstance: ApprovalStepInstance
  ): Promise<Array<{ userId: string; displayName?: string }>>;
}
