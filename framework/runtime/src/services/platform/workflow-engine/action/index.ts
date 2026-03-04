/**
 * Approval Action Module
 *
 * This module handles approval action execution including:
 *
 * Action Execution:
 * - Approve (validate authority, capture metadata, activate next step)
 * - Reject (capture reason, mark rejected, unlock entity)
 * - Request Changes (pause workflow, send back, track revisions)
 * - Delegate (validate rules, reassign, audit trail)
 * - Escalate (manual escalation)
 * - Hold/Resume (pause and resume workflows)
 * - Recall (requester withdraws submission)
 *
 * Parallel & Conditional Approvals:
 * - Track individual approver responses
 * - Evaluate completion rules (all, any, majority, quorum)
 * - Conditional branching based on step conditions
 * - Skip/add steps dynamically
 *
 * SLA & Escalation:
 * - Track elapsed time per step
 * - Detect SLA warnings and breaches
 * - Auto-assign to escalation approvers
 * - Auto-approve/reject on escalation
 *
 * Workflow Completion:
 * - Mark workflow as approved/rejected/cancelled
 * - Transition entity to next business state
 * - Execute post-approval hooks
 * - Fire domain events
 *
 * @module approval/action
 */

// Types
export type {
  // Action inputs
  BaseActionInput,
  ActionAttachment,
  ApproveActionInput,
  RejectActionInput,
  RequestChangesInput,
  DelegateActionInput,
  EscalateActionInput,
  HoldActionInput,
  ResumeActionInput,
  RecallActionInput,
  ActionInput,
  ActionResult,

  // Step completion
  StepCompletionEvaluation,
  ConditionEvaluationContext,
  StepActivationDecision,

  // SLA & Escalation
  StepSlaStatus,
  EscalationTarget,
  EscalationAction,
  EscalationResult,

  // Workflow completion
  WorkflowEventType,
  WorkflowEvent,
  PostApprovalHook,
  HookExecutionResult,
  WorkflowCompletionResult,

  // Service interfaces
  IActionExecutionService,
  IStepCompletionService,
  ISlaMonitoringService,
  IEscalationService,
  IWorkflowCompletionService,
  IWorkflowEventHandler,
  IDelegationValidator,
} from "./types.js";

// Action Execution Service
export {
  ActionExecutionService,
  createActionExecutionService,
} from "./action-execution.service.js";

// Step Completion Service
export {
  StepCompletionService,
  createStepCompletionService,
} from "./step-completion.service.js";

// SLA & Escalation Services
export {
  SlaMonitoringService,
  EscalationService,
  createSlaMonitoringService,
  createEscalationService,
} from "./sla-escalation.service.js";

// Workflow Completion Service
export {
  WorkflowCompletionService,
  createWorkflowCompletionService,
} from "./workflow-completion.service.js";

// API
export {
  ApprovalActionApiController,
  getApprovalActionRoutes,
  createApprovalActionApiController,
  type ExecuteActionRequestBase,
  type ApproveRequest,
  type RejectRequest,
  type RequestChangesRequest,
  type DelegateRequest,
  type EscalateRequest,
  type HoldRequest,
  type ResumeRequest,
  type RecallRequest,
  type ActionResponse,
  type GetAvailableActionsResponse,
  type GetStepCompletionResponse,
  type GetSlaStatusResponse,
  type EscalationResponse,
  type RouteDefinition,
} from "./api.js";
