/**
 * Step Completion Service
 *
 * Handles evaluation of step completion for parallel approvals,
 * quorum-based decisions, and conditional branching.
 */

import type {
  ConditionEvaluationContext,
  IStepCompletionService,
  StepActivationDecision,
  StepCompletionEvaluation,
  WorkflowEvent,
} from "./types.js";
import type {
  ApprovalInstance,
  ApprovalStepInstance,
  IApprovalInstanceRepository,
} from "../instance/types.js";
import type { ApprovalCondition } from "../types.js";

/**
 * Generate unique ID
 */
function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  condition: ApprovalCondition,
  context: ConditionEvaluationContext
): boolean {
  const { rules, logic } = condition;

  // If no rules, evaluate nested conditions
  if (!rules || rules.length === 0) {
    if (condition.conditions && condition.conditions.length > 0) {
      const nestedResults = condition.conditions.map((c) => evaluateCondition(c, context));
      return logic === "and" ? nestedResults.every(Boolean) : nestedResults.some(Boolean);
    }
    return true; // No rules or conditions means condition is met
  }

  const results = rules.map((rule) => {
    const value = getValueFromContext(rule.field, context);

    switch (rule.operator) {
      case "eq":
        return value === rule.value;
      case "neq":
        return value !== rule.value;
      case "gt":
        return typeof value === "number" && value > (rule.value as number);
      case "gte":
        return typeof value === "number" && value >= (rule.value as number);
      case "lt":
        return typeof value === "number" && value < (rule.value as number);
      case "lte":
        return typeof value === "number" && value <= (rule.value as number);
      case "in":
        return Array.isArray(rule.value) && rule.value.includes(value);
      case "nin":
        return Array.isArray(rule.value) && !rule.value.includes(value);
      case "contains":
        return typeof value === "string" && value.includes(rule.value as string);
      case "startsWith":
        return typeof value === "string" && value.startsWith(rule.value as string);
      case "endsWith":
        return typeof value === "string" && value.endsWith(rule.value as string);
      case "matches":
        return typeof value === "string" && new RegExp(rule.value as string).test(value);
      case "between":
        if (typeof value === "number" && Array.isArray(rule.value) && rule.value.length === 2) {
          return value >= rule.value[0] && value <= rule.value[1];
        }
        return false;
      case "exists":
        return value !== undefined;
      case "notExists":
        return value === undefined;
      case "empty":
        return value === "" || value === null || value === undefined ||
               (Array.isArray(value) && value.length === 0);
      case "notEmpty":
        return value !== "" && value !== null && value !== undefined &&
               !(Array.isArray(value) && value.length === 0);
      default:
        return false;
    }
  });

  if (logic === "and") {
    return results.every(Boolean);
  } else {
    return results.some(Boolean);
  }
}

/**
 * Get value from context based on field path
 */
function getValueFromContext(
  field: string,
  context: ConditionEvaluationContext
): unknown {
  const parts = field.split(".");

  // Handle special prefixes
  if (parts[0] === "entity") {
    return getNestedValue(context.entityData, parts.slice(1));
  }

  if (parts[0] === "requester") {
    return getNestedValue(context.requester as Record<string, unknown>, parts.slice(1));
  }

  if (parts[0] === "instance") {
    return getNestedValue(context.instance as unknown as Record<string, unknown>, parts.slice(1));
  }

  if (parts[0] === "step") {
    return getNestedValue(context.currentStep as unknown as Record<string, unknown>, parts.slice(1));
  }

  if (parts[0] === "context" && context.customContext) {
    return getNestedValue(context.customContext, parts.slice(1));
  }

  // Default: try entity data
  return getNestedValue(context.entityData, parts);
}

/**
 * Get nested value from object
 */
function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;

  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Step Completion Service Implementation
 */
export class StepCompletionService implements IStepCompletionService {
  constructor(
    private readonly instanceRepository: IApprovalInstanceRepository,
    private readonly eventHandlers?: Array<(event: WorkflowEvent) => Promise<void>>
  ) {}

  /**
   * Evaluate if a step is complete based on its requirement
   */
  async evaluateStepCompletion(
    tenantId: string,
    stepInstance: ApprovalStepInstance
  ): Promise<StepCompletionEvaluation> {
    const counts = stepInstance.approvalCounts;
    const requirement = stepInstance.requirement;

    let requiredCount: number;
    let isComplete = false;
    let outcome: "approved" | "rejected" | "skipped" | undefined;
    let reason: string | undefined;
    let quorumMet = false;

    switch (requirement) {
      case "any":
        // Any one approval or rejection completes the step
        requiredCount = 1;
        isComplete = counts.approved > 0 || counts.rejected > 0;
        if (isComplete) {
          outcome = counts.approved > 0 ? "approved" : "rejected";
          quorumMet = true;
          reason = `First response: ${outcome}`;
        }
        break;

      case "all":
        // All approvers must respond, and all must approve for step to be approved
        requiredCount = counts.total;
        isComplete = counts.pending === 0;
        if (isComplete) {
          outcome = counts.rejected === 0 ? "approved" : "rejected";
          quorumMet = counts.approved === counts.total;
          reason = counts.rejected === 0
            ? `All ${counts.total} approvers approved`
            : `${counts.rejected} of ${counts.total} rejected`;
        }
        break;

      case "majority": {
        // More than half must approve for approval
        requiredCount = Math.floor(counts.total / 2) + 1;
        const majorityApproved = counts.approved >= requiredCount;
        const majorityRejected = counts.rejected >= requiredCount;
        isComplete = majorityApproved || majorityRejected;
        if (isComplete) {
          outcome = majorityApproved ? "approved" : "rejected";
          quorumMet = majorityApproved;
          reason = `Majority (${requiredCount} of ${counts.total}) ${outcome}`;
        }
        break;
      }

      case "quorum": {
        // Configurable quorum
        if (stepInstance.quorum) {
          if (stepInstance.quorum.type === "count") {
            requiredCount = stepInstance.quorum.value;
          } else {
            // Percentage
            requiredCount = Math.ceil((stepInstance.quorum.value / 100) * counts.total);
          }
        } else {
          // Default to majority
          requiredCount = Math.floor(counts.total / 2) + 1;
        }

        const quorumApproved = counts.approved >= requiredCount;
        const quorumRejected = counts.rejected >= requiredCount;
        isComplete = quorumApproved || quorumRejected;
        if (isComplete) {
          outcome = quorumApproved ? "approved" : "rejected";
          quorumMet = quorumApproved;
          reason = `Quorum (${requiredCount} of ${counts.total}) ${outcome}`;
        }
        break;
      }

      default:
        requiredCount = 1;
    }

    return {
      isComplete,
      outcome,
      reason,
      counts,
      requiredCount,
      quorumMet,
    };
  }

  /**
   * Get next steps to activate after a step completes
   */
  async getNextStepsToActivate(
    tenantId: string,
    instance: ApprovalInstance,
    completedStep: ApprovalStepInstance
  ): Promise<StepActivationDecision[]> {
    const allSteps = await this.instanceRepository.getStepInstances(tenantId, instance.id);
    const decisions: StepActivationDecision[] = [];

    // Get completed step IDs including the just-completed one
    const completedStepIds = new Set([...instance.completedStepIds, completedStep.id]);

    // Find pending steps
    const pendingSteps = allSteps.filter(
      (s) => s.status === "pending" && !completedStepIds.has(s.id)
    );

    // Build context for condition evaluation
    const context: ConditionEvaluationContext = {
      instance,
      currentStep: completedStep,
      allSteps,
      entityData: (instance.metadata as Record<string, unknown>) || {},
      requester: instance.requester,
    };

    // Get step definitions from template for canSkip and skipConditions
    const template = instance.workflowSnapshot.definition;
    const stepDefinitions = new Map(template.steps.map((s) => [s.id, s]));

    for (const step of pendingSteps) {
      // Get the step definition for this instance
      const stepDef = stepDefinitions.get(step.stepDefinitionId);

      const decision: StepActivationDecision = {
        stepInstanceId: step.id,
        shouldActivate: false,
        shouldSkip: false,
        shouldAutoApprove: false,
        dependenciesSatisfied: false,
        conditionsMet: true,
      };

      // Check dependencies
      const dependenciesSatisfied =
        step.dependsOn.length === 0 ||
        step.dependsOn.every((depId) => completedStepIds.has(depId));

      decision.dependenciesSatisfied = dependenciesSatisfied;

      if (!dependenciesSatisfied) {
        // Dependencies not met, cannot activate yet
        decisions.push(decision);
        continue;
      }

      // Evaluate conditions from step instance (copied from definition during materialization)
      if (step.conditions && step.conditions.length > 0) {
        const conditionsContext: ConditionEvaluationContext = {
          ...context,
          currentStep: step,
        };

        const conditionsMet = step.conditions.every((cond) =>
          evaluateCondition(cond, conditionsContext)
        );

        decision.conditionsMet = conditionsMet;

        if (!conditionsMet) {
          // Conditions not met - check if we should skip (from step definition)
          decision.shouldSkip = stepDef?.canSkip ?? false;
          decision.skipReason = "Conditions not met";
          decisions.push(decision);
          continue;
        }
      }

      // Check skip conditions (auto-skip) from step definition
      if (stepDef?.skipConditions && stepDef.skipConditions.length > 0) {
        const skipContext: ConditionEvaluationContext = {
          ...context,
          currentStep: step,
        };

        const shouldSkip = stepDef.skipConditions.some((cond) =>
          evaluateCondition(cond, skipContext)
        );

        if (shouldSkip) {
          decision.shouldSkip = true;
          decision.skipReason = "Skip condition met";
          decisions.push(decision);
          continue;
        }
      }

      // Check for auto-approve conditions
      const autoApproveReason = await this.checkAutoApprove(tenantId, instance, step);
      if (autoApproveReason) {
        decision.shouldAutoApprove = true;
        decision.autoApproveReason = autoApproveReason;
      }

      // Step can be activated
      decision.shouldActivate = true;
      decisions.push(decision);
    }

    return decisions;
  }

  /**
   * Activate a step
   */
  async activateStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance
  ): Promise<ApprovalStepInstance> {
    const now = new Date();

    // Update step status
    const activated = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        status: "active",
        activatedAt: now,
        dependenciesSatisfied: true,
      }
    );

    // Fire activation event
    await this.fireEvent({
      id: generateId("evt"),
      type: "step.activated",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      payload: {
        stepName: stepInstance.name,
        stepLevel: stepInstance.level,
        approverCount: stepInstance.approvers.length,
      },
    });

    return activated;
  }

  /**
   * Skip a step
   */
  async skipStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    reason: string
  ): Promise<ApprovalStepInstance> {
    const now = new Date();

    // Update step status
    const skipped = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        status: "skipped",
        skipReason: reason,
        completedAt: now,
      }
    );

    // Fire skip event
    await this.fireEvent({
      id: generateId("evt"),
      type: "step.skipped",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      payload: {
        stepName: stepInstance.name,
        reason,
      },
    });

    return skipped;
  }

  /**
   * Auto-approve a step
   */
  async autoApproveStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance,
    reason: string
  ): Promise<ApprovalStepInstance> {
    const now = new Date();

    // Mark all approvers as auto-approved
    const updatedApprovers = stepInstance.approvers.map((a) => ({
      ...a,
      status: "approved" as const,
      actionTaken: "approve" as const,
      respondedAt: now,
      comment: `Auto-approved: ${reason}`,
    }));

    // Update step status
    const approved = await this.instanceRepository.updateStepInstance(
      tenantId,
      stepInstance.id,
      {
        status: "approved",
        approvers: updatedApprovers,
        approvalCounts: {
          ...stepInstance.approvalCounts,
          approved: stepInstance.approvalCounts.total,
          pending: 0,
        },
        autoApproved: true,
        autoApproveReason: reason,
        completedAt: now,
      }
    );

    // Fire completion event
    await this.fireEvent({
      id: generateId("evt"),
      type: "step.completed",
      tenantId,
      instanceId: instance.id,
      stepInstanceId: stepInstance.id,
      entity: { type: instance.entity.type, id: instance.entity.id },
      timestamp: now,
      payload: {
        stepName: stepInstance.name,
        outcome: "approved",
        autoApproved: true,
        reason,
      },
    });

    return approved;
  }

  /**
   * Check if step should be auto-approved
   */
  private async checkAutoApprove(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance
  ): Promise<string | null> {
    // Check for self-approval (requester is the only approver)
    if (stepInstance.approvers.length === 1 &&
        stepInstance.approvers[0].userId === instance.requester.userId) {
      // Check if self-approval is allowed in template
      const template = instance.workflowSnapshot.definition;
      const stepDef = template.steps.find((s) => s.id === stepInstance.stepDefinitionId);

      // If step definition allows self-approval, auto-approve
      // (This would be controlled by a property in the step definition)
      const allowSelfApproval = stepDef?.metadata?.allowSelfApproval as boolean | undefined;
      if (allowSelfApproval) {
        return "Requester is the only approver (self-approval allowed)";
      }
    }

    // Check for low-value auto-approval
    const entityData = instance.metadata as Record<string, unknown> | undefined;
    const amount = entityData?.amount as number | undefined;
    const template = instance.workflowSnapshot.definition;
    const stepDef = template.steps.find((s) => s.id === stepInstance.stepDefinitionId);

    const autoApproveThreshold = stepDef?.metadata?.autoApproveThreshold as number | undefined;
    if (autoApproveThreshold && amount !== undefined && amount < autoApproveThreshold) {
      return `Amount (${amount}) below auto-approve threshold (${autoApproveThreshold})`;
    }

    return null;
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
 * Factory function to create step completion service
 */
export function createStepCompletionService(
  instanceRepository: IApprovalInstanceRepository,
  eventHandlers?: Array<(event: WorkflowEvent) => Promise<void>>
): IStepCompletionService {
  return new StepCompletionService(instanceRepository, eventHandlers);
}
