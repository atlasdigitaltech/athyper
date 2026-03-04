/**
 * Workflow Completion Service
 *
 * Handles workflow completion, entity state transitions, post-approval hooks,
 * and domain event firing.
 */

import type {
  HookExecutionResult,
  IWorkflowCompletionService,
  IWorkflowEventHandler,
  PostApprovalHook,
  WorkflowCompletionResult,
  WorkflowEvent,
} from "./types.js";
import type {
  ApprovalInstance,
  EntityApprovalState,
  IApprovalInstanceRepository,
  IEntityStateHandler,
} from "../instance/types.js";
import type { INotificationService } from "../task/types.js";

/**
 * Generate unique ID
 */
function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Workflow Completion Service Implementation
 */
export class WorkflowCompletionService implements IWorkflowCompletionService {
  private eventHandlers: IWorkflowEventHandler[] = [];

  constructor(
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly entityStateHandler?: IEntityStateHandler,
    private readonly notificationService?: INotificationService
  ) {}

  /**
   * Register an event handler
   */
  registerEventHandler(handler: IWorkflowEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Complete workflow with approval
   */
  async completeAsApproved(
    tenantId: string,
    instance: ApprovalInstance
  ): Promise<WorkflowCompletionResult> {
    const now = new Date();
    const eventsFired: WorkflowEvent[] = [];
    const hooksExecuted: HookExecutionResult[] = [];

    try {
      // Update instance status
      const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
        status: "approved",
        entityState: "approved",
        decision: {
          outcome: "approved",
          decidedAt: now,
        },
        completedAt: now,
        updatedAt: now,
        activeStepIds: [],
      });

      // Update entity state via handler
      const newEntityState: EntityApprovalState = "approved";
      if (this.entityStateHandler) {
        await this.entityStateHandler.updateEntityState(
          tenantId,
          instance.entity.type,
          instance.entity.id,
          newEntityState,
          { instanceId: instance.id, reason: "Workflow approved" }
        );
      }

      // Unlock entity
      let entityUnlocked = false;
      try {
        await this.instanceRepository.releaseLock(
          tenantId,
          instance.entity.type,
          instance.entity.id
        );
        entityUnlocked = true;

        if (this.entityStateHandler) {
          await this.entityStateHandler.unlockEntity(
            tenantId,
            instance.entity.type,
            instance.entity.id,
            { instanceId: instance.id }
          );
        }
      } catch (err) {
        console.error("Failed to unlock entity:", err);
      }

      // Record state transition
      await this.instanceRepository.recordStateTransition(tenantId, {
        entityType: instance.entity.type,
        entityId: instance.entity.id,
        tenantId,
        approvalInstanceId: instance.id,
        fromState: instance.entityState,
        toState: newEntityState,
        reason: "Workflow approved",
        transitionedAt: now,
        transitionedBy: "system",
      });

      // Fire workflow approved event
      const approvedEvent: WorkflowEvent = {
        id: generateId("evt"),
        type: "workflow.approved",
        tenantId,
        instanceId: instance.id,
        entity: { type: instance.entity.type, id: instance.entity.id },
        timestamp: now,
        payload: {
          workflowCode: instance.workflowSnapshot.templateCode,
          entityVersion: instance.entity.version,
        },
      };
      await this.fireEvent(approvedEvent);
      eventsFired.push(approvedEvent);

      // Fire entity state changed event
      const stateChangedEvent: WorkflowEvent = {
        id: generateId("evt"),
        type: "entity.state_changed",
        tenantId,
        instanceId: instance.id,
        entity: { type: instance.entity.type, id: instance.entity.id },
        timestamp: now,
        payload: {
          fromState: instance.entityState,
          toState: newEntityState,
          reason: "Workflow approved",
        },
      };
      await this.fireEvent(stateChangedEvent);
      eventsFired.push(stateChangedEvent);

      // Fire entity unlocked event
      if (entityUnlocked) {
        const unlockedEvent: WorkflowEvent = {
          id: generateId("evt"),
          type: "entity.unlocked",
          tenantId,
          instanceId: instance.id,
          entity: { type: instance.entity.type, id: instance.entity.id },
          timestamp: now,
          payload: { reason: "Workflow completed" },
        };
        await this.fireEvent(unlockedEvent);
        eventsFired.push(unlockedEvent);
      }

      // Execute post-approval hooks
      const hookResults = await this.executeHooks(tenantId, updatedInstance, "approved");
      hooksExecuted.push(...hookResults);

      // Send completion notification
      if (this.notificationService) {
        await this.notificationService.sendApprovalComplete(tenantId, updatedInstance, "approved");
      }

      return {
        success: true,
        outcome: "approved",
        instance: updatedInstance,
        newEntityState,
        entityUnlocked,
        eventsFired,
        hooksExecuted,
      };
    } catch (error) {
      return {
        success: false,
        outcome: "approved",
        instance,
        newEntityState: instance.entityState,
        entityUnlocked: false,
        eventsFired,
        hooksExecuted,
        error: String(error),
      };
    }
  }

  /**
   * Complete workflow with rejection
   */
  async completeAsRejected(
    tenantId: string,
    instance: ApprovalInstance,
    reason: string
  ): Promise<WorkflowCompletionResult> {
    const now = new Date();
    const eventsFired: WorkflowEvent[] = [];
    const hooksExecuted: HookExecutionResult[] = [];

    try {
      // Determine target entity state (could be configurable per template)
      const template = instance.workflowSnapshot.definition;
      const targetState: EntityApprovalState =
        (template.metadata?.rejectionTargetState as EntityApprovalState) || "rejected";

      // Update instance status
      const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
        status: "rejected",
        entityState: targetState,
        decision: {
          outcome: "rejected",
          decidedAt: now,
          reason,
        },
        completedAt: now,
        updatedAt: now,
        activeStepIds: [],
      });

      // Update entity state via handler
      if (this.entityStateHandler) {
        await this.entityStateHandler.updateEntityState(
          tenantId,
          instance.entity.type,
          instance.entity.id,
          targetState,
          { instanceId: instance.id, reason: `Workflow rejected: ${reason}` }
        );
      }

      // Unlock entity
      let entityUnlocked = false;
      try {
        await this.instanceRepository.releaseLock(
          tenantId,
          instance.entity.type,
          instance.entity.id
        );
        entityUnlocked = true;

        if (this.entityStateHandler) {
          await this.entityStateHandler.unlockEntity(
            tenantId,
            instance.entity.type,
            instance.entity.id,
            { instanceId: instance.id }
          );
        }
      } catch (err) {
        console.error("Failed to unlock entity:", err);
      }

      // Record state transition
      await this.instanceRepository.recordStateTransition(tenantId, {
        entityType: instance.entity.type,
        entityId: instance.entity.id,
        tenantId,
        approvalInstanceId: instance.id,
        fromState: instance.entityState,
        toState: targetState,
        reason: `Workflow rejected: ${reason}`,
        transitionedAt: now,
        transitionedBy: "system",
      });

      // Fire workflow rejected event
      const rejectedEvent: WorkflowEvent = {
        id: generateId("evt"),
        type: "workflow.rejected",
        tenantId,
        instanceId: instance.id,
        entity: { type: instance.entity.type, id: instance.entity.id },
        timestamp: now,
        payload: {
          reason,
          workflowCode: instance.workflowSnapshot.templateCode,
          targetState,
        },
      };
      await this.fireEvent(rejectedEvent);
      eventsFired.push(rejectedEvent);

      // Fire entity state changed event
      const stateChangedEvent: WorkflowEvent = {
        id: generateId("evt"),
        type: "entity.state_changed",
        tenantId,
        instanceId: instance.id,
        entity: { type: instance.entity.type, id: instance.entity.id },
        timestamp: now,
        payload: {
          fromState: instance.entityState,
          toState: targetState,
          reason: `Workflow rejected: ${reason}`,
        },
      };
      await this.fireEvent(stateChangedEvent);
      eventsFired.push(stateChangedEvent);

      // Execute post-rejection hooks
      const hookResults = await this.executeHooks(tenantId, updatedInstance, "rejected");
      hooksExecuted.push(...hookResults);

      // Send completion notification
      if (this.notificationService) {
        await this.notificationService.sendApprovalComplete(tenantId, updatedInstance, "rejected");
      }

      return {
        success: true,
        outcome: "rejected",
        instance: updatedInstance,
        newEntityState: targetState,
        entityUnlocked,
        eventsFired,
        hooksExecuted,
      };
    } catch (error) {
      return {
        success: false,
        outcome: "rejected",
        instance,
        newEntityState: instance.entityState,
        entityUnlocked: false,
        eventsFired,
        hooksExecuted,
        error: String(error),
      };
    }
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(
    tenantId: string,
    instance: ApprovalInstance,
    userId: string,
    reason?: string
  ): Promise<WorkflowCompletionResult> {
    const now = new Date();
    const eventsFired: WorkflowEvent[] = [];
    const hooksExecuted: HookExecutionResult[] = [];

    try {
      // Update instance status
      const updatedInstance = await this.instanceRepository.update(tenantId, instance.id, {
        status: "cancelled",
        entityState: "cancelled",
        decision: {
          outcome: "cancelled",
          decidedAt: now,
          decidedBy: userId,
          reason: reason || "Cancelled by user",
        },
        completedAt: now,
        updatedAt: now,
        updatedBy: userId,
        activeStepIds: [],
      });

      // Update entity state via handler
      const newEntityState: EntityApprovalState = "cancelled";
      if (this.entityStateHandler) {
        await this.entityStateHandler.updateEntityState(
          tenantId,
          instance.entity.type,
          instance.entity.id,
          newEntityState,
          { instanceId: instance.id, reason: reason || "Workflow cancelled" }
        );
      }

      // Unlock entity
      let entityUnlocked = false;
      try {
        await this.instanceRepository.releaseLock(
          tenantId,
          instance.entity.type,
          instance.entity.id
        );
        entityUnlocked = true;

        if (this.entityStateHandler) {
          await this.entityStateHandler.unlockEntity(
            tenantId,
            instance.entity.type,
            instance.entity.id,
            { instanceId: instance.id }
          );
        }
      } catch (err) {
        console.error("Failed to unlock entity:", err);
      }

      // Record state transition
      await this.instanceRepository.recordStateTransition(tenantId, {
        entityType: instance.entity.type,
        entityId: instance.entity.id,
        tenantId,
        approvalInstanceId: instance.id,
        fromState: instance.entityState,
        toState: newEntityState,
        reason: reason || "Workflow cancelled",
        transitionedAt: now,
        transitionedBy: userId,
      });

      // Fire workflow cancelled event
      const cancelledEvent: WorkflowEvent = {
        id: generateId("evt"),
        type: "workflow.cancelled",
        tenantId,
        instanceId: instance.id,
        entity: { type: instance.entity.type, id: instance.entity.id },
        timestamp: now,
        actor: { userId },
        payload: {
          reason: reason || "Cancelled by user",
          workflowCode: instance.workflowSnapshot.templateCode,
        },
      };
      await this.fireEvent(cancelledEvent);
      eventsFired.push(cancelledEvent);

      // Execute post-cancellation hooks
      const hookResults = await this.executeHooks(tenantId, updatedInstance, "cancelled");
      hooksExecuted.push(...hookResults);

      return {
        success: true,
        outcome: "cancelled",
        instance: updatedInstance,
        newEntityState,
        entityUnlocked,
        eventsFired,
        hooksExecuted,
      };
    } catch (error) {
      return {
        success: false,
        outcome: "cancelled",
        instance,
        newEntityState: instance.entityState,
        entityUnlocked: false,
        eventsFired,
        hooksExecuted,
        error: String(error),
      };
    }
  }

  /**
   * Execute post-approval hooks
   */
  async executeHooks(
    tenantId: string,
    instance: ApprovalInstance,
    outcome: "approved" | "rejected" | "cancelled"
  ): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    // Get hooks from template
    const template = instance.workflowSnapshot.definition;
    const hooks = (template.metadata?.postApprovalHooks as PostApprovalHook[]) || [];

    // Filter hooks for this outcome
    const applicableHooks = hooks.filter(
      (h) => h.enabled && (h.triggerOn === outcome || h.triggerOn === "completed")
    );

    for (const hook of applicableHooks) {
      const startTime = Date.now();
      let success = false;
      let response: unknown;
      let error: string | undefined;
      let retryCount = 0;

      const maxAttempts = hook.config.retry?.maxAttempts || 1;
      const backoffMs = hook.config.retry?.backoffMs || 1000;

      while (retryCount < maxAttempts) {
        try {
          response = await this.executeHook(hook, tenantId, instance, outcome);
          success = true;
          break;
        } catch (err) {
          error = String(err);
          retryCount++;

          if (retryCount < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, backoffMs * retryCount));
          }
        }
      }

      results.push({
        hookId: hook.id,
        success,
        response,
        error,
        executionTimeMs: Date.now() - startTime,
        retryCount,
      });
    }

    return results;
  }

  /**
   * Execute a single hook
   */
  private async executeHook(
    hook: PostApprovalHook,
    tenantId: string,
    instance: ApprovalInstance,
    outcome: "approved" | "rejected" | "cancelled"
  ): Promise<unknown> {
    const payload = {
      tenantId,
      instanceId: instance.id,
      workflowCode: instance.workflowSnapshot.templateCode,
      outcome,
      entity: instance.entity,
      requester: instance.requester,
      completedAt: new Date().toISOString(),
    };

    switch (hook.type) {
      case "webhook":
        if (hook.config.url) {
          const response = await fetch(hook.config.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...hook.config.headers,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(hook.config.timeout || 30000),
          });

          if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
          }

          return await response.json();
        }
        break;

      case "event": {
        // Fire a domain event
        const event: WorkflowEvent = {
          id: generateId("evt"),
          type: `workflow.${outcome}` as any,
          tenantId,
          instanceId: instance.id,
          entity: { type: instance.entity.type, id: instance.entity.id },
          timestamp: new Date(),
          payload: {
            ...payload,
            hookId: hook.id,
            eventTopic: hook.config.eventTopic,
          },
        };
        await this.fireEvent(event);
        return { eventId: event.id };
      }

      case "workflow":
        // Trigger another workflow (would integrate with workflow engine)
        if (hook.config.workflowCode) {
          // In real implementation, this would trigger another workflow
          return {
            triggeredWorkflow: hook.config.workflowCode,
            status: "pending",
          };
        }
        break;

      case "function":
        // Call a registered function
        if (hook.config.functionName) {
          // In real implementation, this would call a registered function
          return {
            functionName: hook.config.functionName,
            status: "executed",
          };
        }
        break;
    }

    return null;
  }

  /**
   * Fire a workflow event
   */
  async fireEvent(event: WorkflowEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler.handleEvent(event);
      } catch (err) {
        console.error("Event handler error:", err);
      }
    }
  }
}

/**
 * Factory function to create workflow completion service
 */
export function createWorkflowCompletionService(
  instanceRepository: IApprovalInstanceRepository,
  entityStateHandler?: IEntityStateHandler,
  notificationService?: INotificationService
): IWorkflowCompletionService {
  return new WorkflowCompletionService(
    instanceRepository,
    entityStateHandler,
    notificationService
  );
}
