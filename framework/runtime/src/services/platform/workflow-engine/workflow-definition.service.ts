/**
 * Approval Workflow Definition Service
 *
 * Business logic layer for managing approval workflow templates.
 * Handles validation, versioning, publishing, and approver resolution.
 */

import { validateApprovalWorkflowTemplate } from "./validation.js";

import type {
  ApprovalCondition,
  ApprovalEntityType,
  ApprovalStep,
  ApprovalTriggerEvent,
  ApprovalWorkflowQueryOptions,
  ApproverResolutionContext,
  ApproverRule,
  CreateApprovalWorkflowInput,
  IApprovalWorkflowRepository,
  IApprovalWorkflowService,
  ResolvedApprover,
  StoredApprovalWorkflowTemplate,
  TemplateValidationResult,
  UpdateApprovalWorkflowInput,
} from "./types.js";

// ============================================================================
// User/Role Resolver Interface
// ============================================================================

/**
 * Interface for resolving users by role, group, or hierarchy
 */
export interface IUserResolver {
  /** Get users with a specific role in scope */
  getUsersByRole(
    tenantId: string,
    roleCode: string,
    scope?: { orgId?: string; entityId?: string }
  ): Promise<Array<{ userId: string; displayName?: string; email?: string }>>;

  /** Get users in a group */
  getUsersByGroup(
    tenantId: string,
    groupId: string
  ): Promise<Array<{ userId: string; displayName?: string; email?: string }>>;

  /** Get manager(s) in hierarchy */
  getManagerInHierarchy(
    tenantId: string,
    userId: string,
    options?: { level?: number; stopAtRole?: string }
  ): Promise<Array<{ userId: string; displayName?: string; email?: string; level: number }>>;

  /** Get cost center owner */
  getCostCenterOwner(
    tenantId: string,
    costCenterId: string
  ): Promise<{ userId: string; displayName?: string; email?: string } | undefined>;

  /** Get department head */
  getDepartmentHead(
    tenantId: string,
    departmentId: string
  ): Promise<{ userId: string; displayName?: string; email?: string } | undefined>;

  /** Get user by field value */
  getUserByFieldValue(
    tenantId: string,
    fieldPath: string,
    value: unknown
  ): Promise<{ userId: string; displayName?: string; email?: string } | undefined>;
}

// ============================================================================
// Default User Resolver (stub for testing)
// ============================================================================

/**
 * Default user resolver that returns empty results.
 * Override with actual implementation in production.
 */
export class DefaultUserResolver implements IUserResolver {
  async getUsersByRole(): Promise<Array<{ userId: string; displayName?: string; email?: string }>> {
    return [];
  }

  async getUsersByGroup(): Promise<Array<{ userId: string; displayName?: string; email?: string }>> {
    return [];
  }

  async getManagerInHierarchy(): Promise<Array<{ userId: string; displayName?: string; email?: string; level: number }>> {
    return [];
  }

  async getCostCenterOwner(): Promise<{ userId: string; displayName?: string; email?: string } | undefined> {
    return undefined;
  }

  async getDepartmentHead(): Promise<{ userId: string; displayName?: string; email?: string } | undefined> {
    return undefined;
  }

  async getUserByFieldValue(): Promise<{ userId: string; displayName?: string; email?: string } | undefined> {
    return undefined;
  }
}

// ============================================================================
// Approval Workflow Definition Service
// ============================================================================

/**
 * Service for managing approval workflow templates
 */
export class ApprovalWorkflowDefinitionService implements IApprovalWorkflowService {
  constructor(
    private readonly repository: IApprovalWorkflowRepository,
    private readonly userResolver: IUserResolver = new DefaultUserResolver()
  ) {}

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate an approval workflow template
   */
  validate(template: CreateApprovalWorkflowInput | StoredApprovalWorkflowTemplate): TemplateValidationResult {
    return validateApprovalWorkflowTemplate(template);
  }

  // ==========================================================================
  // Template CRUD
  // ==========================================================================

  /**
   * Create a new approval workflow template
   */
  async createTemplate(
    tenantId: string,
    template: CreateApprovalWorkflowInput,
    createdBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    // Validate template
    const validation = this.validate(template);
    if (!validation.valid) {
      throw new ApprovalWorkflowError(
        "VALIDATION_ERROR",
        `Template validation failed: ${validation.errors.map((e) => e.message).join(", ")}`,
        validation
      );
    }

    // Check for duplicate code
    const existing = await this.repository.getByCode(tenantId, template.code);
    if (existing) {
      throw new ApprovalWorkflowError(
        "DUPLICATE_CODE",
        `Template with code '${template.code}' already exists`
      );
    }

    // Create template
    return this.repository.create(tenantId, template, createdBy);
  }

  /**
   * Update an existing approval workflow template
   * Creates a new version of the template
   */
  async updateTemplate(
    tenantId: string,
    templateId: string,
    updates: UpdateApprovalWorkflowInput,
    updatedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    // Get existing template
    const existing = await this.repository.getById(tenantId, templateId);
    if (!existing) {
      throw new ApprovalWorkflowError("NOT_FOUND", `Template not found: ${templateId}`);
    }

    // Merge and validate
    const merged = { ...existing, ...updates };
    const validation = this.validate(merged);
    if (!validation.valid) {
      throw new ApprovalWorkflowError(
        "VALIDATION_ERROR",
        `Template validation failed: ${validation.errors.map((e) => e.message).join(", ")}`,
        validation
      );
    }

    // Cannot change code
    if (updates.code && updates.code !== existing.code) {
      throw new ApprovalWorkflowError(
        "INVALID_UPDATE",
        "Cannot change template code. Clone the template instead."
      );
    }

    // Create new version
    return this.repository.update(tenantId, templateId, updates, updatedBy);
  }

  /**
   * Publish a template (make it the active version)
   */
  async publishTemplate(
    tenantId: string,
    templateId: string,
    publishedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    // Get template
    const template = await this.repository.getById(tenantId, templateId);
    if (!template) {
      throw new ApprovalWorkflowError("NOT_FOUND", `Template not found: ${templateId}`);
    }

    // Validate before publishing
    const validation = this.validate(template);
    if (!validation.valid) {
      throw new ApprovalWorkflowError(
        "VALIDATION_ERROR",
        `Cannot publish invalid template: ${validation.errors.map((e) => e.message).join(", ")}`,
        validation
      );
    }

    // Must be enabled to publish
    if (!template.enabled) {
      throw new ApprovalWorkflowError(
        "INVALID_STATE",
        "Cannot publish disabled template. Enable it first."
      );
    }

    // Publish
    return this.repository.publish(tenantId, templateId, publishedBy);
  }

  /**
   * Get a template by ID
   */
  async getTemplate(
    tenantId: string,
    templateId: string
  ): Promise<StoredApprovalWorkflowTemplate | undefined> {
    return this.repository.getById(tenantId, templateId);
  }

  /**
   * Get the active template by code
   */
  async getActiveTemplate(
    tenantId: string,
    code: string
  ): Promise<StoredApprovalWorkflowTemplate | undefined> {
    return this.repository.getActiveByCode(tenantId, code);
  }

  /**
   * List templates
   */
  async listTemplates(
    tenantId: string,
    options?: ApprovalWorkflowQueryOptions
  ): Promise<StoredApprovalWorkflowTemplate[]> {
    return this.repository.list(tenantId, options);
  }

  /**
   * Delete a template
   */
  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    const template = await this.repository.getById(tenantId, templateId);
    if (!template) {
      throw new ApprovalWorkflowError("NOT_FOUND", `Template not found: ${templateId}`);
    }

    // Cannot delete active template
    if (template.isActive) {
      throw new ApprovalWorkflowError(
        "INVALID_STATE",
        "Cannot delete active template. Unpublish it first."
      );
    }

    return this.repository.delete(tenantId, templateId);
  }

  /**
   * Clone a template
   */
  async cloneTemplate(
    tenantId: string,
    templateId: string,
    newCode: string,
    newName: string,
    clonedBy: string
  ): Promise<StoredApprovalWorkflowTemplate> {
    // Check source exists
    const source = await this.repository.getById(tenantId, templateId);
    if (!source) {
      throw new ApprovalWorkflowError("NOT_FOUND", `Template not found: ${templateId}`);
    }

    // Check new code doesn't exist
    const existing = await this.repository.getByCode(tenantId, newCode);
    if (existing) {
      throw new ApprovalWorkflowError(
        "DUPLICATE_CODE",
        `Template with code '${newCode}' already exists`
      );
    }

    return this.repository.clone(tenantId, templateId, newCode, newName, clonedBy);
  }

  // ==========================================================================
  // Template Discovery
  // ==========================================================================

  /**
   * Find templates that match entity type and trigger event
   */
  async findTemplatesForEntity(
    tenantId: string,
    entityType: ApprovalEntityType,
    triggerEvent: ApprovalTriggerEvent,
    entityData?: Record<string, unknown>
  ): Promise<StoredApprovalWorkflowTemplate[]> {
    // Get matching templates
    const templates = await this.repository.findMatchingTemplates(
      tenantId,
      entityType,
      triggerEvent
    );

    if (!entityData || templates.length === 0) {
      return templates;
    }

    // Filter by trigger conditions
    return templates.filter((template) => {
      // Find matching trigger
      const trigger = template.triggers.find((t) => t.event === triggerEvent);
      if (!trigger) return false;

      // Check trigger conditions
      if (trigger.conditions && trigger.conditions.length > 0) {
        return trigger.conditions.every((condition) =>
          this.evaluateCondition(condition, entityData)
        );
      }

      // Check amount threshold
      if (trigger.amountThreshold) {
        const amount = this.getFieldValue(entityData, trigger.amountThreshold.field);
        if (amount === undefined) return false;

        const numAmount = Number(amount);
        if (isNaN(numAmount)) return false;

        return this.checkAmountThreshold(
          numAmount,
          trigger.amountThreshold.operator,
          trigger.amountThreshold.value,
          trigger.amountThreshold.upperValue
        );
      }

      return true;
    });
  }

  // ==========================================================================
  // Approver Resolution
  // ==========================================================================

  /**
   * Resolve approvers for a step
   */
  async resolveApprovers(
    tenantId: string,
    step: ApprovalStep,
    context: ApproverResolutionContext
  ): Promise<ResolvedApprover[]> {
    const resolvedApprovers: ResolvedApprover[] = [];
    const seenUserIds = new Set<string>();

    // Sort approver rules by priority
    const sortedRules = [...step.approvers].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      // Skip fallback rules on first pass
      if (rule.isFallback) continue;

      // Check rule conditions
      if (rule.conditions && rule.conditions.length > 0) {
        const conditionsMet = rule.conditions.every((condition) =>
          this.evaluateCondition(condition, {
            entity: context.entity,
            requester: context.requester,
            metadata: context.metadata,
          })
        );
        if (!conditionsMet) continue;
      }

      // Resolve approvers based on rule type
      const users = await this.resolveApproverRule(tenantId, rule, context);

      for (const user of users) {
        if (!seenUserIds.has(user.userId)) {
          seenUserIds.add(user.userId);
          resolvedApprovers.push({
            userId: user.userId,
            displayName: user.displayName,
            email: user.email,
            resolvedBy: rule.id,
            strategy: rule.type,
            isFallback: false,
          });
        }
      }
    }

    // If no approvers found, try fallback rules
    if (resolvedApprovers.length === 0) {
      const fallbackRules = sortedRules.filter((r) => r.isFallback);

      for (const rule of fallbackRules) {
        const users = await this.resolveApproverRule(tenantId, rule, context);

        for (const user of users) {
          if (!seenUserIds.has(user.userId)) {
            seenUserIds.add(user.userId);
            resolvedApprovers.push({
              userId: user.userId,
              displayName: user.displayName,
              email: user.email,
              resolvedBy: rule.id,
              strategy: rule.type,
              isFallback: true,
            });
          }
        }

        // Stop after first fallback rule that returns users
        if (resolvedApprovers.length > 0) break;
      }
    }

    return resolvedApprovers;
  }

  /**
   * Resolve a single approver rule
   */
  private async resolveApproverRule(
    tenantId: string,
    rule: ApproverRule,
    context: ApproverResolutionContext
  ): Promise<Array<{ userId: string; displayName?: string; email?: string }>> {
    switch (rule.type) {
      case "role":
        return this.resolveRoleApprovers(tenantId, rule, context);

      case "user":
        return this.resolveUserApprovers(rule);

      case "dynamic":
        return this.resolveDynamicApprovers(tenantId, rule, context);

      case "group":
        return this.resolveGroupApprovers(tenantId, rule);

      case "expression":
        return this.resolveExpressionApprovers(rule, context);

      default:
        return [];
    }
  }

  /**
   * Resolve role-based approvers
   */
  private async resolveRoleApprovers(
    tenantId: string,
    rule: ApproverRule,
    context: ApproverResolutionContext
  ): Promise<Array<{ userId: string; displayName?: string; email?: string }>> {
    if (!rule.role) return [];

    const allUsers: Array<{ userId: string; displayName?: string; email?: string }> = [];

    for (const roleCode of rule.role.roles) {
      const scope: { orgId?: string; entityId?: string } = {};

      // Apply scope based on configuration
      if (rule.role.scope === "org" && context.requester.orgId) {
        scope.orgId = context.requester.orgId;
      }

      const users = await this.userResolver.getUsersByRole(tenantId, roleCode, scope);
      allUsers.push(...users);
    }

    // Apply min/max limits
    let result = allUsers;
    if (rule.role.maxApprovers && result.length > rule.role.maxApprovers) {
      result = result.slice(0, rule.role.maxApprovers);
    }

    return result;
  }

  /**
   * Resolve user-based approvers
   */
  private async resolveUserApprovers(
    rule: ApproverRule
  ): Promise<Array<{ userId: string; displayName?: string; email?: string }>> {
    if (!rule.user) return [];

    return rule.user.userIds.map((userId) => ({ userId }));
  }

  /**
   * Resolve dynamic approvers
   */
  private async resolveDynamicApprovers(
    tenantId: string,
    rule: ApproverRule,
    context: ApproverResolutionContext
  ): Promise<Array<{ userId: string; displayName?: string; email?: string }>> {
    if (!rule.dynamic) return [];

    switch (rule.dynamic.strategy) {
      case "reporting_hierarchy": {
        const options = rule.dynamic.hierarchyOptions;
        const managers = await this.userResolver.getManagerInHierarchy(
          tenantId,
          context.requester.userId,
          {
            level: options?.maxLevels,
            stopAtRole: options?.stopAtRole,
          }
        );

        // Apply skip and include options
        let result = managers;
        if (options?.skipLevels) {
          result = result.filter((m) => m.level > options.skipLevels!);
        }
        if (options?.includeLevels && options.includeLevels.length > 0) {
          result = result.filter((m) => options.includeLevels!.includes(m.level));
        }

        return result;
      }

      case "cost_center_owner": {
        if (!context.requester.costCenterId) return [];
        const owner = await this.userResolver.getCostCenterOwner(
          tenantId,
          context.requester.costCenterId
        );
        return owner ? [owner] : [];
      }

      case "department_head": {
        if (!context.requester.departmentId) return [];
        const head = await this.userResolver.getDepartmentHead(
          tenantId,
          context.requester.departmentId
        );
        return head ? [head] : [];
      }

      case "entity_owner": {
        const ownerId = this.getFieldValue(context.entity, "owner_id") ||
                        this.getFieldValue(context.entity, "ownerId") ||
                        this.getFieldValue(context.entity, "created_by") ||
                        this.getFieldValue(context.entity, "createdBy");
        if (!ownerId) return [];
        return [{ userId: String(ownerId) }];
      }

      case "custom_field": {
        if (!rule.dynamic.sourceField) return [];
        const fieldValue = this.getFieldValue(context.entity, rule.dynamic.sourceField);
        if (!fieldValue) return [];

        const user = await this.userResolver.getUserByFieldValue(
          tenantId,
          rule.dynamic.sourceField,
          fieldValue
        );
        return user ? [user] : [];
      }

      default:
        return [];
    }
  }

  /**
   * Resolve group-based approvers
   */
  private async resolveGroupApprovers(
    tenantId: string,
    rule: ApproverRule
  ): Promise<Array<{ userId: string; displayName?: string; email?: string }>> {
    if (!rule.group) return [];

    const allUsers: Array<{ userId: string; displayName?: string; email?: string }> = [];

    for (const groupId of rule.group.groupIds) {
      const users = await this.userResolver.getUsersByGroup(tenantId, groupId);
      allUsers.push(...users);
    }

    // Apply min from group limit
    if (rule.group.minFromGroup && allUsers.length < rule.group.minFromGroup) {
      // Not enough users from groups
      return [];
    }

    return allUsers;
  }

  /**
   * Resolve expression-based approvers
   */
  private async resolveExpressionApprovers(
    rule: ApproverRule,
    context: ApproverResolutionContext
  ): Promise<Array<{ userId: string; displayName?: string; email?: string }>> {
    if (!rule.expression) return [];

    // Simple expression evaluation (extend for more complex languages)
    const expr = rule.expression.expr;
    const language = rule.expression.language || "jsonpath";

    if (language === "jsonpath") {
      // Very simple JSONPath-like evaluation
      // Format: $.entity.approver_id or $.requester.managerId
      const match = expr.match(/^\$\.(\w+)\.(\w+)$/);
      if (match) {
        const [, root, field] = match;
        const source = root === "entity" ? context.entity : context.requester;
        const value = this.getFieldValue(source, field);
        if (value) {
          return [{ userId: String(value) }];
        }
      }
    }

    return [];
  }

  // ==========================================================================
  // Condition Evaluation
  // ==========================================================================

  /**
   * Evaluate a condition against data
   */
  private evaluateCondition(condition: ApprovalCondition, data: Record<string, unknown>): boolean {
    const results: boolean[] = [];

    // Evaluate rules
    if (condition.rules) {
      for (const rule of condition.rules) {
        const fieldValue = this.getFieldValue(data, rule.field);
        const result = this.evaluateConditionRule(fieldValue, rule.operator, rule.value, rule.upperValue);
        results.push(result);
      }
    }

    // Evaluate nested conditions
    if (condition.conditions) {
      for (const nested of condition.conditions) {
        results.push(this.evaluateCondition(nested, data));
      }
    }

    // Apply logic operator
    if (condition.logic === "or") {
      return results.some((r) => r);
    } else {
      return results.every((r) => r);
    }
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
        return fieldValue !== undefined && fieldValue !== null && Number(fieldValue) > Number(value);
      case "gte":
        return fieldValue !== undefined && fieldValue !== null && Number(fieldValue) >= Number(value);
      case "lt":
        return fieldValue !== undefined && fieldValue !== null && Number(fieldValue) < Number(value);
      case "lte":
        return fieldValue !== undefined && fieldValue !== null && Number(fieldValue) <= Number(value);
      case "in":
        return Array.isArray(value) && value.includes(fieldValue);
      case "nin":
        return Array.isArray(value) && !value.includes(fieldValue);
      case "contains":
        return typeof fieldValue === "string" && typeof value === "string" && fieldValue.includes(value);
      case "startsWith":
        return typeof fieldValue === "string" && typeof value === "string" && fieldValue.startsWith(value);
      case "endsWith":
        return typeof fieldValue === "string" && typeof value === "string" && fieldValue.endsWith(value);
      case "matches":
        return typeof fieldValue === "string" && typeof value === "string" && new RegExp(value).test(fieldValue);
      case "exists":
        return fieldValue !== undefined && fieldValue !== null;
      case "notExists":
        return fieldValue === undefined || fieldValue === null;
      case "between":
        return (
          fieldValue !== undefined &&
          fieldValue !== null &&
          Number(fieldValue) >= Number(value) &&
          Number(fieldValue) <= Number(upperValue)
        );
      case "empty":
        return (
          fieldValue === undefined ||
          fieldValue === null ||
          fieldValue === "" ||
          (Array.isArray(fieldValue) && fieldValue.length === 0)
        );
      case "notEmpty":
        return (
          fieldValue !== undefined &&
          fieldValue !== null &&
          fieldValue !== "" &&
          !(Array.isArray(fieldValue) && fieldValue.length === 0)
        );
      default:
        return false;
    }
  }

  /**
   * Check amount threshold
   */
  private checkAmountThreshold(
    amount: number,
    operator: string,
    value: number,
    upperValue?: number
  ): boolean {
    switch (operator) {
      case "gt":
        return amount > value;
      case "gte":
        return amount >= value;
      case "lt":
        return amount < value;
      case "lte":
        return amount <= value;
      case "eq":
        return amount === value;
      case "between":
        return amount >= value && (upperValue === undefined || amount <= upperValue);
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
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Error class for approval workflow operations
 */
export class ApprovalWorkflowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApprovalWorkflowError";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create approval workflow definition service
 */
export function createApprovalWorkflowDefinitionService(
  repository: IApprovalWorkflowRepository,
  userResolver?: IUserResolver
): ApprovalWorkflowDefinitionService {
  return new ApprovalWorkflowDefinitionService(repository, userResolver);
}
