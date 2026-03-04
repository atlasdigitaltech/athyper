/**
 * Approval Action API
 *
 * REST API endpoints for executing approval actions.
 */

import type {
  ActionResult,
  ApproveActionInput,
  DelegateActionInput,
  EscalateActionInput,
  EscalationResult,
  HoldActionInput,
  IActionExecutionService,
  IEscalationService,
  ISlaMonitoringService,
  IStepCompletionService,
  IWorkflowCompletionService,
  RecallActionInput,
  RejectActionInput,
  RequestChangesInput,
  ResumeActionInput,
  StepCompletionEvaluation,
  StepSlaStatus,
} from "./types.js";
import type { ApprovalActionType } from "../types.js";

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Execute action request base
 */
export interface ExecuteActionRequestBase {
  tenantId: string;
  instanceId: string;
  stepInstanceId: string;
  userId: string;
  comment?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Approve request
 */
export interface ApproveRequest extends ExecuteActionRequestBase {
  conditions?: string[];
  capturedFields?: Record<string, unknown>;
}

/**
 * Reject request
 */
export interface RejectRequest extends ExecuteActionRequestBase {
  reason: string;
  targetEntityState?: "draft" | "rework" | "rejected";
}

/**
 * Request changes request
 */
export interface RequestChangesRequest extends ExecuteActionRequestBase {
  requestedChanges: string;
  fieldsToChange?: string[];
  resubmissionDeadline?: string; // ISO date string
}

/**
 * Delegate request
 */
export interface DelegateRequest extends ExecuteActionRequestBase {
  delegateToUserId: string;
  delegateToDisplayName?: string;
  delegationReason?: string;
  allowFurtherDelegation?: boolean;
}

/**
 * Escalate request
 */
export interface EscalateRequest extends ExecuteActionRequestBase {
  escalationReason: string;
  targetLevel?: number;
}

/**
 * Hold request
 */
export interface HoldRequest extends ExecuteActionRequestBase {
  holdReason: string;
  expectedResumeDate?: string; // ISO date string
}

/**
 * Resume request
 */
export interface ResumeRequest extends ExecuteActionRequestBase {
  resumeComment?: string;
}

/**
 * Recall request
 */
export interface RecallRequest extends ExecuteActionRequestBase {
  recallReason?: string;
}

/**
 * Action response
 */
export interface ActionResponse {
  success: boolean;
  data?: ActionResult;
  error?: string;
  errorCode?: string;
}

/**
 * Get available actions response
 */
export interface GetAvailableActionsResponse {
  success: boolean;
  data: {
    actions: ApprovalActionType[];
  };
}

/**
 * Get step completion response
 */
export interface GetStepCompletionResponse {
  success: boolean;
  data: StepCompletionEvaluation;
}

/**
 * Get SLA status response
 */
export interface GetSlaStatusResponse {
  success: boolean;
  data: StepSlaStatus[];
}

/**
 * Escalate response
 */
export interface EscalationResponse {
  success: boolean;
  data: EscalationResult;
}

/**
 * Route definition
 */
export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  handler: string;
  description: string;
  auth?: boolean;
}

// ============================================================================
// API Controller
// ============================================================================

/**
 * Approval Action API Controller
 */
export class ApprovalActionApiController {
  constructor(
    private readonly actionService: IActionExecutionService,
    private readonly stepCompletionService: IStepCompletionService,
    private readonly slaService: ISlaMonitoringService,
    private readonly escalationService: IEscalationService,
    private readonly completionService: IWorkflowCompletionService
  ) {}

  /**
   * Execute approve action
   */
  async approve(request: ApproveRequest): Promise<ActionResponse> {
    const input: ApproveActionInput = {
      action: "approve",
      tenantId: request.tenantId,
      instanceId: request.instanceId,
      stepInstanceId: request.stepInstanceId,
      userId: request.userId,
      comment: request.comment,
      conditions: request.conditions,
      capturedFields: request.capturedFields,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    const result = await this.actionService.executeAction(input);

    return {
      success: result.success,
      data: result,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Execute reject action
   */
  async reject(request: RejectRequest): Promise<ActionResponse> {
    const input: RejectActionInput = {
      action: "reject",
      tenantId: request.tenantId,
      instanceId: request.instanceId,
      stepInstanceId: request.stepInstanceId,
      userId: request.userId,
      comment: request.comment,
      reason: request.reason,
      targetEntityState: request.targetEntityState,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    const result = await this.actionService.executeAction(input);

    return {
      success: result.success,
      data: result,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Execute request changes action
   */
  async requestChanges(request: RequestChangesRequest): Promise<ActionResponse> {
    const input: RequestChangesInput = {
      action: "request_changes",
      tenantId: request.tenantId,
      instanceId: request.instanceId,
      stepInstanceId: request.stepInstanceId,
      userId: request.userId,
      comment: request.comment,
      requestedChanges: request.requestedChanges,
      fieldsToChange: request.fieldsToChange,
      resubmissionDeadline: request.resubmissionDeadline
        ? new Date(request.resubmissionDeadline)
        : undefined,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    const result = await this.actionService.executeAction(input);

    return {
      success: result.success,
      data: result,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Execute delegate action
   */
  async delegate(request: DelegateRequest): Promise<ActionResponse> {
    const input: DelegateActionInput = {
      action: "delegate",
      tenantId: request.tenantId,
      instanceId: request.instanceId,
      stepInstanceId: request.stepInstanceId,
      userId: request.userId,
      comment: request.comment,
      delegateToUserId: request.delegateToUserId,
      delegateToDisplayName: request.delegateToDisplayName,
      delegationReason: request.delegationReason,
      allowFurtherDelegation: request.allowFurtherDelegation,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    const result = await this.actionService.executeAction(input);

    return {
      success: result.success,
      data: result,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Execute escalate action
   */
  async escalate(request: EscalateRequest): Promise<ActionResponse> {
    const input: EscalateActionInput = {
      action: "escalate",
      tenantId: request.tenantId,
      instanceId: request.instanceId,
      stepInstanceId: request.stepInstanceId,
      userId: request.userId,
      comment: request.comment,
      escalationReason: request.escalationReason,
      targetLevel: request.targetLevel,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    const result = await this.actionService.executeAction(input);

    return {
      success: result.success,
      data: result,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Execute hold action
   */
  async hold(request: HoldRequest): Promise<ActionResponse> {
    const input: HoldActionInput = {
      action: "hold",
      tenantId: request.tenantId,
      instanceId: request.instanceId,
      stepInstanceId: request.stepInstanceId,
      userId: request.userId,
      comment: request.comment,
      holdReason: request.holdReason,
      expectedResumeDate: request.expectedResumeDate
        ? new Date(request.expectedResumeDate)
        : undefined,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    const result = await this.actionService.executeAction(input);

    return {
      success: result.success,
      data: result,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Execute resume action
   */
  async resume(request: ResumeRequest): Promise<ActionResponse> {
    const input: ResumeActionInput = {
      action: "resume",
      tenantId: request.tenantId,
      instanceId: request.instanceId,
      stepInstanceId: request.stepInstanceId,
      userId: request.userId,
      comment: request.comment,
      resumeComment: request.resumeComment,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    const result = await this.actionService.executeAction(input);

    return {
      success: result.success,
      data: result,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Execute recall action
   */
  async recall(request: RecallRequest): Promise<ActionResponse> {
    const input: RecallActionInput = {
      action: "recall",
      tenantId: request.tenantId,
      instanceId: request.instanceId,
      stepInstanceId: request.stepInstanceId,
      userId: request.userId,
      comment: request.comment,
      recallReason: request.recallReason,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    const result = await this.actionService.executeAction(input);

    return {
      success: result.success,
      data: result,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Get available actions for a user
   */
  async getAvailableActions(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    userId: string
  ): Promise<GetAvailableActionsResponse> {
    const actions = await this.actionService.getAvailableActions(
      tenantId,
      instanceId,
      stepInstanceId,
      userId
    );

    return {
      success: true,
      data: { actions },
    };
  }

  /**
   * Can perform action check
   */
  async canPerformAction(
    tenantId: string,
    instanceId: string,
    stepInstanceId: string,
    userId: string,
    action: ApprovalActionType
  ): Promise<{ success: boolean; allowed: boolean; reason?: string }> {
    const result = await this.actionService.canPerformAction(
      tenantId,
      instanceId,
      stepInstanceId,
      userId,
      action
    );

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Get SLA status for instance
   */
  async getSlaStatus(
    _tenantId: string,
    _instanceId: string
  ): Promise<GetSlaStatusResponse> {
    // Get instance first (would normally be passed in)
    // For now, return empty array if we can't get instance
    // In real implementation, this would fetch the instance
    return {
      success: true,
      data: [],
    };
  }

  /**
   * Process SLA breaches (admin/scheduler)
   */
  async processSlaBreaches(tenantId: string): Promise<{
    success: boolean;
    data: { breachesProcessed: number; escalations: EscalationResult[] };
  }> {
    const escalations = await this.slaService.processSlaBreaches(tenantId);

    return {
      success: true,
      data: {
        breachesProcessed: escalations.length,
        escalations,
      },
    };
  }

  /**
   * Send SLA warnings (admin/scheduler)
   */
  async sendSlaWarnings(tenantId: string): Promise<{
    success: boolean;
    data: { warningsSent: number };
  }> {
    const count = await this.slaService.sendSlaWarnings(tenantId);

    return {
      success: true,
      data: { warningsSent: count },
    };
  }
}

// ============================================================================
// Route Definitions
// ============================================================================

/**
 * Get approval action routes
 */
export function getApprovalActionRoutes(): RouteDefinition[] {
  return [
    // Action execution routes
    {
      method: "POST",
      path: "/api/approval/instances/:instanceId/steps/:stepInstanceId/approve",
      handler: "approve",
      description: "Approve a step",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/instances/:instanceId/steps/:stepInstanceId/reject",
      handler: "reject",
      description: "Reject a step",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/instances/:instanceId/steps/:stepInstanceId/request-changes",
      handler: "requestChanges",
      description: "Request changes on a step",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/instances/:instanceId/steps/:stepInstanceId/delegate",
      handler: "delegate",
      description: "Delegate approval to another user",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/instances/:instanceId/steps/:stepInstanceId/escalate",
      handler: "escalate",
      description: "Escalate a step",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/instances/:instanceId/hold",
      handler: "hold",
      description: "Put instance on hold",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/instances/:instanceId/resume",
      handler: "resume",
      description: "Resume instance from hold",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/instances/:instanceId/recall",
      handler: "recall",
      description: "Recall submission (requester only)",
      auth: true,
    },

    // Query routes
    {
      method: "GET",
      path: "/api/approval/instances/:instanceId/steps/:stepInstanceId/available-actions",
      handler: "getAvailableActions",
      description: "Get available actions for user on step",
      auth: true,
    },
    {
      method: "GET",
      path: "/api/approval/instances/:instanceId/steps/:stepInstanceId/can-perform/:action",
      handler: "canPerformAction",
      description: "Check if user can perform action",
      auth: true,
    },
    {
      method: "GET",
      path: "/api/approval/instances/:instanceId/sla-status",
      handler: "getSlaStatus",
      description: "Get SLA status for instance",
      auth: true,
    },

    // Admin/Scheduler routes
    {
      method: "POST",
      path: "/api/approval/admin/process-sla-breaches",
      handler: "processSlaBreaches",
      description: "Process SLA breaches (scheduler)",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/admin/send-sla-warnings",
      handler: "sendSlaWarnings",
      description: "Send SLA warning notifications (scheduler)",
      auth: true,
    },
  ];
}

/**
 * Factory function to create API controller
 */
export function createApprovalActionApiController(
  actionService: IActionExecutionService,
  stepCompletionService: IStepCompletionService,
  slaService: ISlaMonitoringService,
  escalationService: IEscalationService,
  completionService: IWorkflowCompletionService
): ApprovalActionApiController {
  return new ApprovalActionApiController(
    actionService,
    stepCompletionService,
    slaService,
    escalationService,
    completionService
  );
}
