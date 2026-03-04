/**
 * Approval Instance Service
 *
 * Business logic for creating and managing approval instances at runtime.
 * Handles instance creation, step materialization, approver resolution,
 * and entity state management.
 */

import type {
  ApprovalActionRecord,
  ApprovalInstance,
  ApprovalInstanceQueryOptions,
  ApprovalInstanceStatus,
  ApprovalStepInstance,
  AssignedApprover,
  CreateApprovalInstanceInput,
  CreateApprovalInstanceResult,
  EntityApprovalState,
  EntityLock,
  IApprovalInstanceRepository,
  IApprovalInstanceService,
  IEntityStateHandler,
  StepInstanceStatus,
} from "./types.js";
import type {
  ApprovalCondition,
  ApprovalEntityType,
  ApprovalStep,
  ApprovalTriggerEvent,
  ApprovalWorkflowTemplate,
  ApproverResolutionContext,
  IApprovalWorkflowService,
  ResolvedApprover,
  SlaConfiguration,
  SlaDuration,
} from "../types.js";

// ============================================================================
// Default Entity State Handler
// ============================================================================

/**
 * Default entity state handler that does nothing.
 * Applications should provide their own implementation.
 */
export class DefaultEntityStateHandler implements IEntityStateHandler {
  async getEntityState(): Promise<string | undefined> {
    return undefined;
  }

  async updateEntityState(): Promise<void> {
    // No-op
  }

  async lockEntity(): Promise<void> {
    // No-op
  }

  async unlockEntity(): Promise<void> {
    // No-op
  }

  async canEditEntity(): Promise<{ allowed: boolean; reason?: string }> {
    return { allowed: true };
  }
}

// ============================================================================
// Approval Instance Service
// ============================================================================

/**
 * Service for managing approval instances at runtime
 */
export class ApprovalInstanceService implements IApprovalInstanceService {
  constructor(
    private readonly repository: IApprovalInstanceRepository,
    private readonly workflowService: IApprovalWorkflowService,
    private readonly entityStateHandler: IEntityStateHandler = new DefaultEntityStateHandler()
  ) {}

  // ==========================================================================
  // Instance Creation
  // ==========================================================================

  /**
   * Create a new approval instance for an entity
   */
  async createInstance(
    tenantId: string,
    input: CreateApprovalInstanceInput
  ): Promise<CreateApprovalInstanceResult> {
    const warnings: string[] = [];

    try {
      // 1. Find matching workflow template
      const template = await this.findMatchingTemplate(tenantId, input);
      if (!template) {
        return {
          success: false,
          error: "No matching approval workflow template found",
          errorCode: "NO_TEMPLATE",
        };
      }

      // 2. Check if entity already has active approval
      const existingInstances = await this.repository.getByEntityId(
        tenantId,
        input.entity.type,
        input.entity.id
      );
      const activeInstance = existingInstances.find(
        (i) => !this.isCompletedStatus(i.status)
      );
      if (activeInstance) {
        return {
          success: false,
          error: "Entity already has an active approval instance",
          errorCode: "ACTIVE_INSTANCE_EXISTS",
        };
      }

      // 3. Create the approval instance
      const now = new Date();
      const instance = await this.repository.create(tenantId, {
        tenantId,
        orgId: input.orgId,
        entity: {
          type: input.entity.type,
          id: input.entity.id,
          version: input.entity.version,
          referenceCode: input.entity.referenceCode,
          displayName: input.entity.displayName,
        },
        workflowSnapshot: {
          templateId: template.id,
          templateCode: template.code,
          templateVersion: template.version,
          templateName: template.name,
          definition: template,
        },
        status: "pending",
        entityState: "pending_approval",
        lockMode: this.determineLockMode(template),
        isLocked: false,
        requester: {
          userId: input.requester.userId,
          displayName: input.requester.displayName,
          email: input.requester.email,
          departmentId: input.requester.departmentId,
          costCenterId: input.requester.costCenterId,
          orgId: input.requester.orgId,
        },
        trigger: {
          event: input.triggerEvent,
          triggeredAt: now,
          context: input.triggerContext,
        },
        activeStepIds: [],
        completedStepIds: [],
        skippedStepIds: [],
        sla: this.calculateInitialSla(template.globalSla, now),
        priority: input.priority ?? template.priority,
        tags: input.tags,
        metadata: input.metadata,
        version: 1,
        createdBy: input.requester.userId,
      });

      // 4. Materialize step instances
      const stepInstances = await this.materializeSteps(
        tenantId,
        instance,
        template,
        input
      );

      // 5. Determine initial active steps
      const initialActiveSteps = this.determineInitialActiveSteps(stepInstances);

      // 6. Update instance with active steps
      const updatedInstance = await this.repository.update(tenantId, instance.id, {
        status: "in_progress",
        activeStepIds: initialActiveSteps.map((s) => s.id),
        updatedBy: input.requester.userId,
      });

      // 7. Activate the initial steps
      for (const step of initialActiveSteps) {
        await this.repository.updateStepInstance(tenantId, step.id, {
          status: "active",
          activatedAt: now,
        });
      }

      // 8. Lock entity if required
      let entityLock: EntityLock | undefined;
      if (updatedInstance.lockMode !== "none") {
        try {
          entityLock = await this.lockEntity(tenantId, updatedInstance, input.requester.userId);
        } catch (lockError) {
          warnings.push(`Failed to acquire entity lock: ${String(lockError)}`);
        }
      }

      // 9. Update entity state
      try {
        await this.entityStateHandler.updateEntityState(
          tenantId,
          input.entity.type,
          input.entity.id,
          "pending_approval",
          { instanceId: instance.id, reason: "Approval workflow initiated" }
        );

        // Record state transition
        await this.repository.recordStateTransition(tenantId, {
          entityType: input.entity.type,
          entityId: input.entity.id,
          tenantId,
          approvalInstanceId: instance.id,
          fromState: "draft",
          toState: "pending_approval",
          reason: `Approval workflow started: ${template.name}`,
          transitionedAt: now,
          transitionedBy: input.requester.userId,
        });
      } catch (stateError) {
        warnings.push(`Failed to update entity state: ${String(stateError)}`);
      }

      // 10. Return result
      return {
        success: true,
        instance: updatedInstance,
        stepInstances: await this.repository.getStepInstances(tenantId, instance.id),
        entityLock,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: "CREATION_FAILED",
      };
    }
  }

  /**
   * Find matching workflow template for the input
   */
  private async findMatchingTemplate(
    tenantId: string,
    input: CreateApprovalInstanceInput
  ): Promise<ApprovalWorkflowTemplate | undefined> {
    // If template code is specified, use that
    if (input.templateCode) {
      return this.workflowService.getActiveTemplate(tenantId, input.templateCode);
    }

    // Otherwise, find matching templates
    const templates = await this.workflowService.findTemplatesForEntity(
      tenantId,
      input.entity.type as ApprovalEntityType,
      input.triggerEvent as ApprovalTriggerEvent,
      input.entity.data
    );

    // Return first matching template (sorted by priority)
    return templates[0];
  }

  /**
   * Materialize step instances from template definition
   */
  private async materializeSteps(
    tenantId: string,
    instance: ApprovalInstance,
    template: ApprovalWorkflowTemplate,
    input: CreateApprovalInstanceInput
  ): Promise<ApprovalStepInstance[]> {
    const stepInstances: Omit<ApprovalStepInstance, "id">[] = [];
    const now = new Date();

    for (const stepDef of template.steps) {
      // Check step conditions
      const conditionsMet = await this.evaluateStepConditions(stepDef, input);

      // Check skip conditions
      const shouldSkip = await this.evaluateSkipConditions(stepDef, input);

      // Resolve approvers
      let approvers: AssignedApprover[] = [];
      if (!shouldSkip) {
        const resolvedApprovers = await this.resolveStepApprovers(
          tenantId,
          stepDef,
          instance,
          input
        );
        approvers = resolvedApprovers.map((ra) => this.toAssignedApprover(ra, now));
      }

      // Check auto-approve conditions
      const autoApproveResult = await this.evaluateAutoApproveConditions(stepDef, input);

      // Calculate quorum if needed - create instance quorum with requiredCount
      let stepQuorum: { type: "count" | "percentage"; value: number; requiredCount: number } | undefined;
      if (stepDef.quorum) {
        const requiredCount = stepDef.quorum.type === "percentage"
          ? Math.ceil((stepDef.quorum.value / 100) * approvers.length)
          : stepDef.quorum.value;
        stepQuorum = {
          type: stepDef.quorum.type,
          value: stepDef.quorum.value,
          requiredCount,
        };
      }

      // Determine initial status
      let status: StepInstanceStatus = "pending";
      let skipReason: string | undefined;
      let autoApproved: boolean | undefined;
      let autoApproveReason: string | undefined;

      if (shouldSkip) {
        status = "skipped";
        skipReason = "Skip conditions met";
      } else if (!conditionsMet) {
        status = "skipped";
        skipReason = "Step conditions not met";
      } else if (autoApproveResult.autoApprove) {
        status = "approved";
        autoApproved = true;
        autoApproveReason = autoApproveResult.reason;
      }

      // Calculate step SLA
      const sla = stepDef.sla ? this.calculateInitialSla(stepDef.sla, now) : undefined;

      // Create step instance
      stepInstances.push({
        instanceId: instance.id,
        stepDefinitionId: stepDef.id,
        name: stepDef.name,
        level: stepDef.level,
        order: stepDef.order,
        type: stepDef.type,
        requirement: stepDef.requirement,
        quorum: stepQuorum,
        status,
        approvers,
        dependsOn: stepDef.dependsOn || [],
        dependenciesSatisfied: !stepDef.dependsOn || stepDef.dependsOn.length === 0,
        conditions: stepDef.conditions,
        conditionsMet,
        skipReason,
        autoApproved,
        autoApproveReason,
        sla,
        approvalCounts: {
          total: approvers.length,
          approved: autoApproved ? approvers.length : 0,
          rejected: 0,
          pending: autoApproved ? 0 : approvers.length,
          delegated: 0,
        },
      });
    }

    return this.repository.createStepInstances(tenantId, stepInstances);
  }

  /**
   * Determine initial active steps
   */
  private determineInitialActiveSteps(stepInstances: ApprovalStepInstance[]): ApprovalStepInstance[] {
    const activeSteps: ApprovalStepInstance[] = [];

    // Get level 1 steps that are pending and have satisfied dependencies
    const level1Steps = stepInstances.filter(
      (s) => s.level === 1 && s.status === "pending" && s.dependenciesSatisfied
    );

    for (const step of level1Steps) {
      if (step.type === "parallel") {
        // All parallel steps at level 1 are active
        activeSteps.push(step);
      } else if (step.type === "sequential") {
        // Only the first sequential step is active
        if (activeSteps.length === 0) {
          activeSteps.push(step);
        }
      } else if (step.type === "conditional" && step.conditionsMet) {
        // Conditional steps are active if conditions are met
        activeSteps.push(step);
      }
    }

    return activeSteps;
  }

  /**
   * Resolve approvers for a step
   */
  private async resolveStepApprovers(
    tenantId: string,
    stepDef: ApprovalStep,
    instance: ApprovalInstance,
    input: CreateApprovalInstanceInput
  ): Promise<ResolvedApprover[]> {
    const context: ApproverResolutionContext = {
      entity: input.entity.data || {},
      requester: {
        userId: input.requester.userId,
        roles: input.requester.roles,
        orgId: input.requester.orgId,
        departmentId: input.requester.departmentId,
        costCenterId: input.requester.costCenterId,
        managerId: input.requester.managerId,
      },
      stepId: stepDef.id,
    };

    return this.workflowService.resolveApprovers(tenantId, stepDef, context);
  }

  /**
   * Convert resolved approver to assigned approver
   */
  private toAssignedApprover(resolved: ResolvedApprover, assignedAt: Date): AssignedApprover {
    return {
      id: `aa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: resolved.userId,
      displayName: resolved.displayName,
      email: resolved.email,
      resolvedBy: resolved.resolvedBy,
      resolutionStrategy: resolved.strategy,
      isFallback: resolved.isFallback,
      status: "pending",
      assignedAt,
      reminderCount: 0,
    };
  }

  /**
   * Evaluate step conditions
   */
  private async evaluateStepConditions(
    stepDef: ApprovalStep,
    input: CreateApprovalInstanceInput
  ): Promise<boolean> {
    if (!stepDef.conditions || stepDef.conditions.length === 0) {
      return true;
    }

    const data = {
      entity: input.entity.data || {},
      requester: input.requester,
      trigger: { event: input.triggerEvent, context: input.triggerContext },
    };

    return stepDef.conditions.every((condition) =>
      this.evaluateCondition(condition, data)
    );
  }

  /**
   * Evaluate skip conditions
   */
  private async evaluateSkipConditions(
    stepDef: ApprovalStep,
    input: CreateApprovalInstanceInput
  ): Promise<boolean> {
    if (!stepDef.canSkip || !stepDef.skipConditions || stepDef.skipConditions.length === 0) {
      return false;
    }

    const data = {
      entity: input.entity.data || {},
      requester: input.requester,
      trigger: { event: input.triggerEvent, context: input.triggerContext },
    };

    return stepDef.skipConditions.some((condition) =>
      this.evaluateCondition(condition, data)
    );
  }

  /**
   * Evaluate auto-approve conditions
   */
  private async evaluateAutoApproveConditions(
    stepDef: ApprovalStep,
    input: CreateApprovalInstanceInput
  ): Promise<{ autoApprove: boolean; reason?: string }> {
    if (!stepDef.autoApproveConditions || stepDef.autoApproveConditions.length === 0) {
      return { autoApprove: false };
    }

    const data = {
      entity: input.entity.data || {},
      requester: input.requester,
      trigger: { event: input.triggerEvent, context: input.triggerContext },
    };

    const autoApprove = stepDef.autoApproveConditions.some((condition) =>
      this.evaluateCondition(condition, data)
    );

    return {
      autoApprove,
      reason: autoApprove ? "Auto-approve conditions met" : undefined,
    };
  }

  /**
   * Evaluate a condition
   */
  private evaluateCondition(condition: ApprovalCondition, data: Record<string, unknown>): boolean {
    const results: boolean[] = [];

    if (condition.rules) {
      for (const rule of condition.rules) {
        const fieldValue = this.getFieldValue(data, rule.field);
        const result = this.evaluateConditionRule(fieldValue, rule.operator, rule.value, rule.upperValue);
        results.push(result);
      }
    }

    if (condition.conditions) {
      for (const nested of condition.conditions) {
        results.push(this.evaluateCondition(nested, data));
      }
    }

    if (condition.logic === "or") {
      return results.some((r) => r);
    }
    return results.every((r) => r);
  }

  /**
   * Evaluate a single condition rule
   */
  private evaluateConditionRule(
    fieldValue: unknown,
    operator: string,
    value?: unknown,
    upperValue?: unknown
  ): boolean {
    switch (operator) {
      case "eq":
        return fieldValue === value;
      case "neq":
        return fieldValue !== value;
      case "gt":
        return Number(fieldValue) > Number(value);
      case "gte":
        return Number(fieldValue) >= Number(value);
      case "lt":
        return Number(fieldValue) < Number(value);
      case "lte":
        return Number(fieldValue) <= Number(value);
      case "in":
        return Array.isArray(value) && value.includes(fieldValue);
      case "nin":
        return Array.isArray(value) && !value.includes(fieldValue);
      case "exists":
        return fieldValue !== undefined && fieldValue !== null;
      case "notExists":
        return fieldValue === undefined || fieldValue === null;
      case "between":
        return Number(fieldValue) >= Number(value) && Number(fieldValue) <= Number(upperValue);
      default:
        return false;
    }
  }

  /**
   * Get field value from object using dot notation
   */
  private getFieldValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Determine lock mode from template
   */
  private determineLockMode(_template: ApprovalWorkflowTemplate): "none" | "soft" | "hard" {
    // Default to soft lock for approval workflows
    return "soft";
  }

  /**
   * Calculate initial SLA
   */
  private calculateInitialSla(
    slaConfig: SlaConfiguration | undefined,
    startTime: Date
  ): ApprovalInstance["sla"] | undefined {
    if (!slaConfig) return undefined;

    return {
      responseDueAt: slaConfig.responseTime
        ? this.addDuration(startTime, slaConfig.responseTime)
        : undefined,
      completionDueAt: slaConfig.completionTime
        ? this.addDuration(startTime, slaConfig.completionTime)
        : undefined,
      warningTriggered: false,
      escalationCount: 0,
    };
  }

  /**
   * Add duration to date
   */
  private addDuration(date: Date, duration: SlaDuration): Date {
    const result = new Date(date);
    switch (duration.unit) {
      case "minutes":
        result.setMinutes(result.getMinutes() + duration.value);
        break;
      case "hours":
        result.setHours(result.getHours() + duration.value);
        break;
      case "days":
        result.setDate(result.getDate() + duration.value);
        break;
      case "business_days":
        // Simplified: just add days (proper implementation should skip weekends/holidays)
        result.setDate(result.getDate() + duration.value);
        break;
    }
    return result;
  }

  /**
   * Lock entity for approval
   */
  private async lockEntity(
    tenantId: string,
    instance: ApprovalInstance,
    userId: string
  ): Promise<EntityLock> {
    const lock = await this.repository.acquireLock(tenantId, {
      entityType: instance.entity.type,
      entityId: instance.entity.id,
      tenantId,
      approvalInstanceId: instance.id,
      mode: instance.lockMode,
      lockedAt: new Date(),
      lockedBy: userId,
    });

    // Update entity state handler
    await this.entityStateHandler.lockEntity(
      tenantId,
      instance.entity.type,
      instance.entity.id,
      instance.lockMode,
      { instanceId: instance.id }
    );

    // Update instance
    await this.repository.update(tenantId, instance.id, { isLocked: true });

    return lock;
  }

  /**
   * Check if status is a completed status
   */
  private isCompletedStatus(status: ApprovalInstanceStatus): boolean {
    return ["approved", "rejected", "cancelled", "expired", "withdrawn"].includes(status);
  }

  // ==========================================================================
  // Instance Retrieval
  // ==========================================================================

  async getInstance(tenantId: string, instanceId: string): Promise<ApprovalInstance | undefined> {
    return this.repository.getById(tenantId, instanceId);
  }

  async getInstancesForEntity(
    tenantId: string,
    entityType: string,
    entityId: string
  ): Promise<ApprovalInstance[]> {
    return this.repository.getByEntityId(tenantId, entityType, entityId);
  }

  async listInstances(
    tenantId: string,
    options?: ApprovalInstanceQueryOptions
  ): Promise<ApprovalInstance[]> {
    return this.repository.list(tenantId, options);
  }

  async getStepInstances(tenantId: string, instanceId: string): Promise<ApprovalStepInstance[]> {
    return this.repository.getStepInstances(tenantId, instanceId);
  }

  async getPendingForUser(tenantId: string, userId: string): Promise<ApprovalInstance[]> {
    return this.repository.getPendingForUser(tenantId, userId);
  }

  // ==========================================================================
  // Instance State Management
  // ==========================================================================

  async cancelInstance(
    tenantId: string,
    instanceId: string,
    userId: string,
    reason?: string
  ): Promise<ApprovalInstance> {
    const instance = await this.repository.getById(tenantId, instanceId);
    if (!instance) {
      throw new ApprovalInstanceError("NOT_FOUND", `Instance not found: ${instanceId}`);
    }

    if (this.isCompletedStatus(instance.status)) {
      throw new ApprovalInstanceError("INVALID_STATE", "Cannot cancel a completed instance");
    }

    const now = new Date();

    // Update instance
    const updated = await this.repository.update(tenantId, instanceId, {
      status: "cancelled",
      decision: {
        outcome: "cancelled",
        decidedAt: now,
        decidedBy: userId,
        reason,
      },
      completedAt: now,
      updatedBy: userId,
    });

    // Release lock
    if (instance.isLocked) {
      await this.releaseLock(tenantId, instance, userId);
    }

    // Update entity state
    await this.updateEntityState(tenantId, instance, "cancelled", userId, reason || "Cancelled");

    return updated;
  }

  async withdrawInstance(
    tenantId: string,
    instanceId: string,
    userId: string,
    reason?: string
  ): Promise<ApprovalInstance> {
    const instance = await this.repository.getById(tenantId, instanceId);
    if (!instance) {
      throw new ApprovalInstanceError("NOT_FOUND", `Instance not found: ${instanceId}`);
    }

    // Only requester can withdraw
    if (instance.requester.userId !== userId) {
      throw new ApprovalInstanceError("UNAUTHORIZED", "Only the requester can withdraw");
    }

    if (this.isCompletedStatus(instance.status)) {
      throw new ApprovalInstanceError("INVALID_STATE", "Cannot withdraw a completed instance");
    }

    const now = new Date();

    // Update instance
    const updated = await this.repository.update(tenantId, instanceId, {
      status: "withdrawn",
      decision: {
        outcome: "withdrawn",
        decidedAt: now,
        decidedBy: userId,
        reason,
      },
      completedAt: now,
      updatedBy: userId,
    });

    // Release lock
    if (instance.isLocked) {
      await this.releaseLock(tenantId, instance, userId);
    }

    // Update entity state
    await this.updateEntityState(tenantId, instance, "draft", userId, reason || "Withdrawn by requester");

    return updated;
  }

  async holdInstance(
    tenantId: string,
    instanceId: string,
    userId: string,
    reason?: string
  ): Promise<ApprovalInstance> {
    const instance = await this.repository.getById(tenantId, instanceId);
    if (!instance) {
      throw new ApprovalInstanceError("NOT_FOUND", `Instance not found: ${instanceId}`);
    }

    if (instance.status !== "in_progress") {
      throw new ApprovalInstanceError("INVALID_STATE", "Can only hold in-progress instances");
    }

    const updated = await this.repository.update(tenantId, instanceId, {
      status: "on_hold",
      metadata: {
        ...instance.metadata,
        holdReason: reason,
        heldAt: new Date(),
        heldBy: userId,
      },
      updatedBy: userId,
    });

    return updated;
  }

  async releaseInstance(tenantId: string, instanceId: string, userId: string): Promise<ApprovalInstance> {
    const instance = await this.repository.getById(tenantId, instanceId);
    if (!instance) {
      throw new ApprovalInstanceError("NOT_FOUND", `Instance not found: ${instanceId}`);
    }

    if (instance.status !== "on_hold") {
      throw new ApprovalInstanceError("INVALID_STATE", "Instance is not on hold");
    }

    const updated = await this.repository.update(tenantId, instanceId, {
      status: "in_progress",
      metadata: {
        ...instance.metadata,
        holdReason: undefined,
        heldAt: undefined,
        heldBy: undefined,
        releasedAt: new Date(),
        releasedBy: userId,
      },
      updatedBy: userId,
    });

    return updated;
  }

  // ==========================================================================
  // Entity Lock Management
  // ==========================================================================

  async checkEntityLock(
    tenantId: string,
    entityType: string,
    entityId: string
  ): Promise<EntityLock | undefined> {
    return this.repository.getLock(tenantId, entityType, entityId);
  }

  private async releaseLock(
    tenantId: string,
    instance: ApprovalInstance,
    userId: string
  ): Promise<void> {
    await this.repository.releaseLock(tenantId, instance.entity.type, instance.entity.id);
    await this.entityStateHandler.unlockEntity(
      tenantId,
      instance.entity.type,
      instance.entity.id,
      { instanceId: instance.id }
    );
    await this.repository.update(tenantId, instance.id, { isLocked: false, updatedBy: userId });
  }

  private async updateEntityState(
    tenantId: string,
    instance: ApprovalInstance,
    newState: EntityApprovalState,
    userId: string,
    reason: string
  ): Promise<void> {
    const now = new Date();

    await this.entityStateHandler.updateEntityState(
      tenantId,
      instance.entity.type,
      instance.entity.id,
      newState,
      { instanceId: instance.id, reason }
    );

    await this.repository.recordStateTransition(tenantId, {
      entityType: instance.entity.type,
      entityId: instance.entity.id,
      tenantId,
      approvalInstanceId: instance.id,
      fromState: instance.entityState,
      toState: newState,
      reason,
      transitionedAt: now,
      transitionedBy: userId,
    });
  }

  // ==========================================================================
  // Action History
  // ==========================================================================

  async getActionHistory(tenantId: string, instanceId: string): Promise<ApprovalActionRecord[]> {
    return this.repository.getActionHistory(tenantId, instanceId);
  }
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Error class for approval instance operations
 */
export class ApprovalInstanceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApprovalInstanceError";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create approval instance service
 */
export function createApprovalInstanceService(
  repository: IApprovalInstanceRepository,
  workflowService: IApprovalWorkflowService,
  entityStateHandler?: IEntityStateHandler
): ApprovalInstanceService {
  return new ApprovalInstanceService(repository, workflowService, entityStateHandler);
}
