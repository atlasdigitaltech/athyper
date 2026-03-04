/**
 * Action Dispatcher Service Implementation
 *
 * Routes action execution requests to the correct backend service
 * based on the action's handler routing key.
 *
 * Handler format: "{group}.{operation}" where group is one of:
 * - lifecycle: routes to LifecycleManager.transition()
 * - approval: routes to ApprovalService.makeDecision()
 * - entity: routes to GenericDataAPI.update/delete/restore()
 */

import type {
  ActionDispatcher,
  ActionExecutionRequest,
  ActionExecutionResult,
  ApprovalService,
  GenericDataAPI,
  LifecycleManager,
  ReasonCode,
  RequestContext,
} from "@athyper/core/meta";

export class ActionDispatcherServiceImpl implements ActionDispatcher {
  constructor(
    private readonly lifecycleManager: LifecycleManager,
    private readonly approvalService: ApprovalService,
    private readonly dataAPI: GenericDataAPI,
  ) {}

  async execute(
    request: ActionExecutionRequest,
    ctx: RequestContext,
  ): Promise<ActionExecutionResult> {
    const { actionCode, entityName, entityId, payload } = request;

    // Parse handler routing key from action code
    // Action codes follow the pattern: "group.operation"
    const dotIndex = actionCode.indexOf(".");
    if (dotIndex === -1) {
      return {
        success: false,
        actionCode,
        error: {
          reasonCode: "validation_failed",
          blockedBy: "dispatcher",
          details: [{ message: `Invalid action code format: ${actionCode}` }],
        },
      };
    }

    const group = actionCode.substring(0, dotIndex);
    const operation = actionCode.substring(dotIndex + 1);

    try {
      switch (group) {
        case "lifecycle":
          return await this.executeLifecycleAction(entityName, entityId, operation, ctx, payload);

        case "approval":
          return await this.executeApprovalAction(entityName, entityId, operation, ctx, payload);

        case "entity":
          return await this.executeEntityAction(entityName, entityId, operation, ctx, payload);

        default:
          return {
            success: false,
            actionCode,
            error: {
              reasonCode: "validation_failed",
              blockedBy: "dispatcher",
              details: [{ message: `Unknown action group: ${group}` }],
            },
          };
      }
    } catch (error) {
      console.error(JSON.stringify({
        msg: "action_dispatch_error",
        actionCode,
        entityName,
        entityId,
        error: String(error),
      }));

      return {
        success: false,
        actionCode,
        error: {
          reasonCode: "validation_failed",
          blockedBy: "dispatcher",
          details: [{ message: String(error) }],
        },
      };
    }
  }

  // ==========================================================================
  // Lifecycle Actions
  // ==========================================================================

  private async executeLifecycleAction(
    entityName: string,
    entityId: string,
    operationCode: string,
    ctx: RequestContext,
    payload?: Record<string, unknown>,
  ): Promise<ActionExecutionResult> {
    const result = await this.lifecycleManager.transition({
      entityName,
      entityId,
      operationCode: operationCode.toUpperCase(),
      ctx,
      payload,
    });

    if (result.success) {
      return {
        success: true,
        actionCode: `lifecycle.${operationCode}`,
      };
    }

    // Map lifecycle failure to structured error
    let reasonCode: ReasonCode = "validation_failed";
    if (result.reason?.includes("terminal")) {
      reasonCode = "terminal_state";
    } else if (result.reason?.includes("Approval")) {
      reasonCode = "approval_pending";
    } else if (result.reason?.includes("denied") || result.reason?.includes("Missing required")) {
      reasonCode = "policy_denied";
    }

    return {
      success: false,
      actionCode: `lifecycle.${operationCode}`,
      error: {
        reasonCode,
        blockedBy: "lifecycle",
        details: [{ message: result.error ?? result.reason ?? "Transition failed" }],
      },
    };
  }

  // ==========================================================================
  // Approval Actions
  // ==========================================================================

  private async executeApprovalAction(
    entityName: string,
    entityId: string,
    operation: string,
    ctx: RequestContext,
    payload?: Record<string, unknown>,
  ): Promise<ActionExecutionResult> {
    // Get approval instance for entity
    const instance = await this.approvalService.getInstanceForEntity(
      entityName,
      entityId,
      ctx.tenantId,
    );

    if (!instance) {
      return {
        success: false,
        actionCode: `approval.${operation}`,
        error: {
          reasonCode: "not_found",
          blockedBy: "approval",
          details: [{ message: "No active approval instance found" }],
        },
      };
    }

    // Find user's pending task
    const userTasks = await this.approvalService.getTasksForUser(ctx.userId, ctx.tenantId);
    const myTask = userTasks.data.find(
      (t) => t.approvalInstanceId === instance.id && t.status === "pending",
    );

    if (!myTask) {
      return {
        success: false,
        actionCode: `approval.${operation}`,
        error: {
          reasonCode: "policy_denied",
          blockedBy: "approval",
          details: [{ message: "You have no pending approval task for this record" }],
        },
      };
    }

    // Execute decision
    const decision = operation === "approve" ? "approve" : "reject";
    const result = await this.approvalService.makeDecision({
      taskId: myTask.id,
      decision,
      note: payload?.note as string | undefined,
      ctx,
    });

    if (result.success) {
      return {
        success: true,
        actionCode: `approval.${operation}`,
      };
    }

    return {
      success: false,
      actionCode: `approval.${operation}`,
      error: {
        reasonCode: "validation_failed",
        blockedBy: "approval",
        details: [{ message: result.error ?? result.reason ?? "Decision failed" }],
      },
    };
  }

  // ==========================================================================
  // Entity Actions (CRUD)
  // ==========================================================================

  private async executeEntityAction(
    entityName: string,
    entityId: string,
    operation: string,
    ctx: RequestContext,
    payload?: Record<string, unknown>,
  ): Promise<ActionExecutionResult> {
    switch (operation) {
      case "update": {
        if (!payload) {
          return {
            success: false,
            actionCode: "entity.update",
            error: {
              reasonCode: "validation_failed",
              blockedBy: "entity",
              details: [{ message: "Update payload is required" }],
            },
          };
        }

        await this.dataAPI.update(entityName, entityId, payload, ctx);
        return { success: true, actionCode: "entity.update" };
      }

      case "delete": {
        await this.dataAPI.delete(entityName, entityId, ctx);
        return { success: true, actionCode: "entity.delete" };
      }

      case "restore": {
        await this.dataAPI.restore(entityName, entityId, ctx);
        return { success: true, actionCode: "entity.restore" };
      }

      default:
        return {
          success: false,
          actionCode: `entity.${operation}`,
          error: {
            reasonCode: "validation_failed",
            blockedBy: "entity",
            details: [{ message: `Unknown entity operation: ${operation}` }],
          },
        };
    }
  }
}
