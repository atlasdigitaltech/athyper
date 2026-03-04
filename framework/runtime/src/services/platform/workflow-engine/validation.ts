/**
 * Approval Workflow Validation
 *
 * Validates approval workflow template definitions for correctness,
 * consistency, and completeness.
 */

import type {
  ApprovalActionType,
  ApprovalCondition,
  ApprovalStep,
  ApprovalTrigger,
  ApprovalWorkflowTemplate,
  ApproverRule,
  CreateApprovalWorkflowInput,
  SlaConfiguration,
  TemplateValidationError,
  TemplateValidationResult,
  TemplateValidationWarning,
} from "./types.js";

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate an approval workflow template
 */
export function validateApprovalWorkflowTemplate(
  template: CreateApprovalWorkflowInput | ApprovalWorkflowTemplate
): TemplateValidationResult {
  const errors: TemplateValidationError[] = [];
  const warnings: TemplateValidationWarning[] = [];

  // Validate basic fields
  validateBasicFields(template, errors, warnings);

  // Validate triggers
  validateTriggers(template.triggers, errors, warnings);

  // Validate steps
  validateSteps(template.steps, errors, warnings);

  // Validate step dependencies (graph validation)
  validateStepDependencies(template.steps, errors, warnings);

  // Validate allowed actions
  validateAllowedActions(template.allowedActions, errors, warnings);

  // Validate global SLA
  if (template.globalSla) {
    validateSlaConfiguration(template.globalSla, "globalSla", errors, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate basic template fields
 */
function validateBasicFields(
  template: CreateApprovalWorkflowInput | ApprovalWorkflowTemplate,
  errors: TemplateValidationError[],
  warnings: TemplateValidationWarning[]
): void {
  // Name validation
  if (!template.name || template.name.trim().length === 0) {
    errors.push({
      code: "MISSING_NAME",
      message: "Template name is required",
      path: "name",
      severity: "error",
    });
  } else if (template.name.length > 200) {
    errors.push({
      code: "NAME_TOO_LONG",
      message: "Template name must be 200 characters or less",
      path: "name",
      severity: "error",
    });
  }

  // Code validation
  if (!template.code || template.code.trim().length === 0) {
    errors.push({
      code: "MISSING_CODE",
      message: "Template code is required",
      path: "code",
      severity: "error",
    });
  } else if (!/^[a-z][a-z0-9_-]*$/i.test(template.code)) {
    errors.push({
      code: "INVALID_CODE_FORMAT",
      message: "Template code must start with a letter and contain only letters, numbers, underscores, and hyphens",
      path: "code",
      severity: "error",
    });
  } else if (template.code.length > 100) {
    errors.push({
      code: "CODE_TOO_LONG",
      message: "Template code must be 100 characters or less",
      path: "code",
      severity: "error",
    });
  }

  // Entity type validation
  const validEntityTypes = [
    "purchase_order",
    "invoice",
    "contract",
    "master_data",
    "expense_report",
    "budget_request",
    "change_request",
    "leave_request",
    "custom",
  ];
  if (!template.entityType) {
    errors.push({
      code: "MISSING_ENTITY_TYPE",
      message: "Entity type is required",
      path: "entityType",
      severity: "error",
    });
  } else if (!validEntityTypes.includes(template.entityType)) {
    errors.push({
      code: "INVALID_ENTITY_TYPE",
      message: `Invalid entity type: ${template.entityType}. Valid types: ${validEntityTypes.join(", ")}`,
      path: "entityType",
      severity: "error",
    });
  }

  // Custom entity type required when entityType is "custom"
  if (template.entityType === "custom" && !template.customEntityType) {
    errors.push({
      code: "MISSING_CUSTOM_ENTITY_TYPE",
      message: "Custom entity type name is required when entity type is 'custom'",
      path: "customEntityType",
      severity: "error",
    });
  }

  // Priority validation
  if (template.priority !== undefined && template.priority !== null) {
    if (typeof template.priority !== "number" || template.priority < 0) {
      errors.push({
        code: "INVALID_PRIORITY",
        message: "Priority must be a non-negative number",
        path: "priority",
        severity: "error",
      });
    }
  }

  // Must have at least one trigger
  if (!template.triggers || template.triggers.length === 0) {
    errors.push({
      code: "NO_TRIGGERS",
      message: "At least one trigger is required",
      path: "triggers",
      severity: "error",
    });
  }

  // Must have at least one step
  if (!template.steps || template.steps.length === 0) {
    errors.push({
      code: "NO_STEPS",
      message: "At least one approval step is required",
      path: "steps",
      severity: "error",
    });
  }

  // Must have allowed actions
  if (!template.allowedActions || template.allowedActions.length === 0) {
    warnings.push({
      code: "NO_ALLOWED_ACTIONS",
      message: "No allowed actions defined; default actions will be used",
      path: "allowedActions",
      severity: "warning",
    });
  }

  // Description warning
  if (!template.description) {
    warnings.push({
      code: "NO_DESCRIPTION",
      message: "Consider adding a description for better documentation",
      path: "description",
      severity: "warning",
    });
  }
}

/**
 * Validate triggers
 */
function validateTriggers(
  triggers: ApprovalTrigger[],
  errors: TemplateValidationError[],
  warnings: TemplateValidationWarning[]
): void {
  if (!triggers) return;

  const validTriggerEvents = [
    "on_create",
    "on_submit",
    "on_update",
    "on_amount_threshold",
    "on_state_transition",
    "on_field_change",
    "manual",
  ];

  triggers.forEach((trigger, index) => {
    const path = `triggers[${index}]`;

    // Event validation
    if (!trigger.event) {
      errors.push({
        code: "MISSING_TRIGGER_EVENT",
        message: "Trigger event is required",
        path: `${path}.event`,
        severity: "error",
      });
    } else if (!validTriggerEvents.includes(trigger.event)) {
      errors.push({
        code: "INVALID_TRIGGER_EVENT",
        message: `Invalid trigger event: ${trigger.event}`,
        path: `${path}.event`,
        severity: "error",
      });
    }

    // State transition validation
    if (trigger.event === "on_state_transition") {
      if (!trigger.fromStates?.length && !trigger.toStates?.length) {
        warnings.push({
          code: "STATE_TRANSITION_NO_STATES",
          message: "State transition trigger has no from/to states defined; will trigger on any transition",
          path: path,
          severity: "warning",
        });
      }
    }

    // Field change validation
    if (trigger.event === "on_field_change") {
      if (!trigger.watchFields?.length) {
        errors.push({
          code: "FIELD_CHANGE_NO_FIELDS",
          message: "Field change trigger requires watchFields to be specified",
          path: `${path}.watchFields`,
          severity: "error",
        });
      }
    }

    // Amount threshold validation
    if (trigger.event === "on_amount_threshold") {
      if (!trigger.amountThreshold) {
        errors.push({
          code: "AMOUNT_THRESHOLD_MISSING",
          message: "Amount threshold configuration is required for on_amount_threshold trigger",
          path: `${path}.amountThreshold`,
          severity: "error",
        });
      } else {
        const threshold = trigger.amountThreshold;
        if (!threshold.field) {
          errors.push({
            code: "AMOUNT_THRESHOLD_NO_FIELD",
            message: "Amount threshold field is required",
            path: `${path}.amountThreshold.field`,
            severity: "error",
          });
        }
        if (threshold.value === undefined || threshold.value === null) {
          errors.push({
            code: "AMOUNT_THRESHOLD_NO_VALUE",
            message: "Amount threshold value is required",
            path: `${path}.amountThreshold.value`,
            severity: "error",
          });
        }
        if (threshold.operator === "between" && threshold.upperValue === undefined) {
          errors.push({
            code: "AMOUNT_THRESHOLD_BETWEEN_MISSING_UPPER",
            message: "Upper value is required for 'between' operator",
            path: `${path}.amountThreshold.upperValue`,
            severity: "error",
          });
        }
      }
    }

    // Validate conditions if present
    if (trigger.conditions) {
      trigger.conditions.forEach((condition, condIndex) => {
        validateCondition(condition, `${path}.conditions[${condIndex}]`, errors, warnings);
      });
    }
  });
}

/**
 * Validate approval steps
 */
function validateSteps(
  steps: ApprovalStep[],
  errors: TemplateValidationError[],
  warnings: TemplateValidationWarning[]
): void {
  if (!steps) return;

  const stepIds = new Set<string>();
  const stepLevels = new Map<number, ApprovalStep[]>();

  steps.forEach((step, index) => {
    const path = `steps[${index}]`;

    // ID validation
    if (!step.id) {
      errors.push({
        code: "MISSING_STEP_ID",
        message: "Step ID is required",
        path: `${path}.id`,
        severity: "error",
      });
    } else if (stepIds.has(step.id)) {
      errors.push({
        code: "DUPLICATE_STEP_ID",
        message: `Duplicate step ID: ${step.id}`,
        path: `${path}.id`,
        severity: "error",
      });
    } else {
      stepIds.add(step.id);
    }

    // Name validation
    if (!step.name) {
      errors.push({
        code: "MISSING_STEP_NAME",
        message: "Step name is required",
        path: `${path}.name`,
        severity: "error",
      });
    }

    // Level validation
    if (step.level === undefined || step.level === null) {
      errors.push({
        code: "MISSING_STEP_LEVEL",
        message: "Step level is required",
        path: `${path}.level`,
        severity: "error",
      });
    } else if (step.level < 1) {
      errors.push({
        code: "INVALID_STEP_LEVEL",
        message: "Step level must be at least 1",
        path: `${path}.level`,
        severity: "error",
      });
    } else {
      if (!stepLevels.has(step.level)) {
        stepLevels.set(step.level, []);
      }
      stepLevels.get(step.level)!.push(step);
    }

    // Type validation
    const validStepTypes = ["sequential", "parallel", "conditional"];
    if (!step.type) {
      errors.push({
        code: "MISSING_STEP_TYPE",
        message: "Step type is required",
        path: `${path}.type`,
        severity: "error",
      });
    } else if (!validStepTypes.includes(step.type)) {
      errors.push({
        code: "INVALID_STEP_TYPE",
        message: `Invalid step type: ${step.type}`,
        path: `${path}.type`,
        severity: "error",
      });
    }

    // Requirement validation
    const validRequirements = ["any", "all", "majority", "quorum"];
    if (!step.requirement) {
      errors.push({
        code: "MISSING_STEP_REQUIREMENT",
        message: "Step approval requirement is required",
        path: `${path}.requirement`,
        severity: "error",
      });
    } else if (!validRequirements.includes(step.requirement)) {
      errors.push({
        code: "INVALID_STEP_REQUIREMENT",
        message: `Invalid step requirement: ${step.requirement}`,
        path: `${path}.requirement`,
        severity: "error",
      });
    }

    // Quorum validation
    if (step.requirement === "quorum") {
      if (!step.quorum) {
        errors.push({
          code: "QUORUM_CONFIG_MISSING",
          message: "Quorum configuration is required when requirement is 'quorum'",
          path: `${path}.quorum`,
          severity: "error",
        });
      } else {
        if (!step.quorum.type || !["count", "percentage"].includes(step.quorum.type)) {
          errors.push({
            code: "INVALID_QUORUM_TYPE",
            message: "Quorum type must be 'count' or 'percentage'",
            path: `${path}.quorum.type`,
            severity: "error",
          });
        }
        if (step.quorum.value === undefined || step.quorum.value <= 0) {
          errors.push({
            code: "INVALID_QUORUM_VALUE",
            message: "Quorum value must be a positive number",
            path: `${path}.quorum.value`,
            severity: "error",
          });
        }
        if (step.quorum.type === "percentage" && step.quorum.value > 100) {
          errors.push({
            code: "QUORUM_PERCENTAGE_TOO_HIGH",
            message: "Quorum percentage cannot exceed 100",
            path: `${path}.quorum.value`,
            severity: "error",
          });
        }
      }
    }

    // Approvers validation
    if (!step.approvers || step.approvers.length === 0) {
      errors.push({
        code: "NO_APPROVERS",
        message: "At least one approver rule is required",
        path: `${path}.approvers`,
        severity: "error",
      });
    } else {
      step.approvers.forEach((approver, approverIndex) => {
        validateApproverRule(approver, `${path}.approvers[${approverIndex}]`, errors, warnings);
      });
    }

    // Conditional step must have conditions
    if (step.type === "conditional" && (!step.conditions || step.conditions.length === 0)) {
      errors.push({
        code: "CONDITIONAL_STEP_NO_CONDITIONS",
        message: "Conditional step must have conditions defined",
        path: `${path}.conditions`,
        severity: "error",
      });
    }

    // Validate conditions
    if (step.conditions) {
      step.conditions.forEach((condition, condIndex) => {
        validateCondition(condition, `${path}.conditions[${condIndex}]`, errors, warnings);
      });
    }

    // Validate skip conditions
    if (step.skipConditions) {
      step.skipConditions.forEach((condition, condIndex) => {
        validateCondition(condition, `${path}.skipConditions[${condIndex}]`, errors, warnings);
      });
    }

    // Validate auto-approve conditions
    if (step.autoApproveConditions) {
      step.autoApproveConditions.forEach((condition, condIndex) => {
        validateCondition(condition, `${path}.autoApproveConditions[${condIndex}]`, errors, warnings);
      });
    }

    // Validate step SLA
    if (step.sla) {
      validateSlaConfiguration(step.sla, `${path}.sla`, errors, warnings);
    }

    // Order validation
    if (step.order === undefined || step.order === null) {
      warnings.push({
        code: "MISSING_STEP_ORDER",
        message: "Step order not specified; will use array index",
        path: `${path}.order`,
        severity: "warning",
      });
    }
  });

  // Check for level gaps
  const levels = Array.from(stepLevels.keys()).sort((a, b) => a - b);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] !== levels[i - 1] + 1) {
      warnings.push({
        code: "LEVEL_GAP",
        message: `Gap in step levels: missing level ${levels[i - 1] + 1}`,
        path: "steps",
        severity: "warning",
      });
    }
  }
}

/**
 * Validate step dependencies (detect cycles)
 */
function validateStepDependencies(
  steps: ApprovalStep[],
  errors: TemplateValidationError[],
  _warnings: TemplateValidationWarning[]
): void {
  if (!steps) return;

  const stepIds = new Set(steps.map((s) => s.id));
  const adjacencyList = new Map<string, string[]>();

  // Build adjacency list
  steps.forEach((step) => {
    adjacencyList.set(step.id, step.dependsOn || []);

    // Validate dependency references
    if (step.dependsOn) {
      step.dependsOn.forEach((depId) => {
        if (!stepIds.has(depId)) {
          errors.push({
            code: "INVALID_DEPENDENCY",
            message: `Step '${step.id}' depends on non-existent step '${depId}'`,
            path: `steps`,
            severity: "error",
          });
        }
      });
    }
  });

  // Detect cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(nodeId: string, path: string[]): boolean {
    if (recursionStack.has(nodeId)) {
      errors.push({
        code: "CIRCULAR_DEPENDENCY",
        message: `Circular dependency detected: ${[...path, nodeId].join(" -> ")}`,
        path: "steps",
        severity: "error",
      });
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const dependencies = adjacencyList.get(nodeId) || [];
    for (const depId of dependencies) {
      if (hasCycle(depId, [...path, nodeId])) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.id)) {
      hasCycle(step.id, []);
    }
  }
}

/**
 * Validate approver rule
 */
function validateApproverRule(
  rule: ApproverRule,
  path: string,
  errors: TemplateValidationError[],
  warnings: TemplateValidationWarning[]
): void {
  // ID validation
  if (!rule.id) {
    errors.push({
      code: "MISSING_APPROVER_RULE_ID",
      message: "Approver rule ID is required",
      path: `${path}.id`,
      severity: "error",
    });
  }

  // Type validation
  const validTypes = ["role", "user", "dynamic", "group", "expression"];
  if (!rule.type) {
    errors.push({
      code: "MISSING_APPROVER_RULE_TYPE",
      message: "Approver rule type is required",
      path: `${path}.type`,
      severity: "error",
    });
  } else if (!validTypes.includes(rule.type)) {
    errors.push({
      code: "INVALID_APPROVER_RULE_TYPE",
      message: `Invalid approver rule type: ${rule.type}`,
      path: `${path}.type`,
      severity: "error",
    });
  }

  // Type-specific validation
  switch (rule.type) {
    case "role":
      if (!rule.role || !rule.role.roles?.length) {
        errors.push({
          code: "ROLE_RULE_NO_ROLES",
          message: "Role-based rule must specify at least one role",
          path: `${path}.role.roles`,
          severity: "error",
        });
      }
      break;

    case "user":
      if (!rule.user || !rule.user.userIds?.length) {
        errors.push({
          code: "USER_RULE_NO_USERS",
          message: "User-based rule must specify at least one user ID",
          path: `${path}.user.userIds`,
          severity: "error",
        });
      }
      break;

    case "dynamic":
      if (!rule.dynamic || !rule.dynamic.strategy) {
        errors.push({
          code: "DYNAMIC_RULE_NO_STRATEGY",
          message: "Dynamic rule must specify a resolution strategy",
          path: `${path}.dynamic.strategy`,
          severity: "error",
        });
      } else {
        const validStrategies = [
          "reporting_hierarchy",
          "cost_center_owner",
          "project_manager",
          "department_head",
          "budget_owner",
          "entity_owner",
          "custom_field",
        ];
        if (!validStrategies.includes(rule.dynamic.strategy)) {
          errors.push({
            code: "INVALID_DYNAMIC_STRATEGY",
            message: `Invalid dynamic strategy: ${rule.dynamic.strategy}`,
            path: `${path}.dynamic.strategy`,
            severity: "error",
          });
        }
        if (rule.dynamic.strategy === "custom_field" && !rule.dynamic.sourceField) {
          errors.push({
            code: "CUSTOM_FIELD_NO_SOURCE",
            message: "Custom field strategy requires sourceField to be specified",
            path: `${path}.dynamic.sourceField`,
            severity: "error",
          });
        }
      }
      break;

    case "group":
      if (!rule.group || !rule.group.groupIds?.length) {
        errors.push({
          code: "GROUP_RULE_NO_GROUPS",
          message: "Group-based rule must specify at least one group ID",
          path: `${path}.group.groupIds`,
          severity: "error",
        });
      }
      break;

    case "expression":
      if (!rule.expression || !rule.expression.expr) {
        errors.push({
          code: "EXPRESSION_RULE_NO_EXPR",
          message: "Expression-based rule must specify an expression",
          path: `${path}.expression.expr`,
          severity: "error",
        });
      }
      if (rule.expression && !rule.expression.language) {
        warnings.push({
          code: "EXPRESSION_NO_LANGUAGE",
          message: "Expression language not specified; defaulting to 'jsonpath'",
          path: `${path}.expression.language`,
          severity: "warning",
        });
      }
      break;
  }

  // Fallback validation
  if (rule.isFallback && rule.fallbackRuleId) {
    warnings.push({
      code: "FALLBACK_HAS_FALLBACK",
      message: "Fallback rule has its own fallback; this may cause unexpected behavior",
      path: `${path}.fallbackRuleId`,
      severity: "warning",
    });
  }

  // Validate conditions
  if (rule.conditions) {
    rule.conditions.forEach((condition, condIndex) => {
      validateCondition(condition, `${path}.conditions[${condIndex}]`, errors, warnings);
    });
  }
}

/**
 * Validate condition
 */
function validateCondition(
  condition: ApprovalCondition,
  path: string,
  errors: TemplateValidationError[],
  warnings: TemplateValidationWarning[]
): void {
  // Logic operator validation
  if (!condition.logic || !["and", "or"].includes(condition.logic)) {
    errors.push({
      code: "INVALID_CONDITION_LOGIC",
      message: "Condition logic must be 'and' or 'or'",
      path: `${path}.logic`,
      severity: "error",
    });
  }

  // Must have rules or nested conditions
  if ((!condition.rules || condition.rules.length === 0) &&
      (!condition.conditions || condition.conditions.length === 0)) {
    errors.push({
      code: "EMPTY_CONDITION",
      message: "Condition must have rules or nested conditions",
      path: path,
      severity: "error",
    });
  }

  // Validate rules
  if (condition.rules) {
    const validOperators = [
      "eq", "neq", "gt", "gte", "lt", "lte", "in", "nin",
      "contains", "startsWith", "endsWith", "matches",
      "exists", "notExists", "between", "empty", "notEmpty"
    ];

    condition.rules.forEach((rule, ruleIndex) => {
      const rulePath = `${path}.rules[${ruleIndex}]`;

      if (!rule.field) {
        errors.push({
          code: "MISSING_CONDITION_FIELD",
          message: "Condition rule field is required",
          path: `${rulePath}.field`,
          severity: "error",
        });
      }

      if (!rule.operator || !validOperators.includes(rule.operator)) {
        errors.push({
          code: "INVALID_CONDITION_OPERATOR",
          message: `Invalid condition operator: ${rule.operator}`,
          path: `${rulePath}.operator`,
          severity: "error",
        });
      }

      // Value required for most operators
      const noValueOperators = ["exists", "notExists", "empty", "notEmpty"];
      if (!noValueOperators.includes(rule.operator) && rule.value === undefined) {
        errors.push({
          code: "MISSING_CONDITION_VALUE",
          message: "Condition value is required for this operator",
          path: `${rulePath}.value`,
          severity: "error",
        });
      }

      // Between requires upperValue
      if (rule.operator === "between" && rule.upperValue === undefined) {
        errors.push({
          code: "BETWEEN_MISSING_UPPER_VALUE",
          message: "Upper value is required for 'between' operator",
          path: `${rulePath}.upperValue`,
          severity: "error",
        });
      }

      // In/nin require array value
      if ((rule.operator === "in" || rule.operator === "nin") && !Array.isArray(rule.value)) {
        errors.push({
          code: "IN_OPERATOR_NOT_ARRAY",
          message: "Value must be an array for 'in' or 'nin' operators",
          path: `${rulePath}.value`,
          severity: "error",
        });
      }
    });
  }

  // Validate nested conditions
  if (condition.conditions) {
    condition.conditions.forEach((nested, nestedIndex) => {
      validateCondition(nested, `${path}.conditions[${nestedIndex}]`, errors, warnings);
    });
  }
}

/**
 * Validate SLA configuration
 */
function validateSlaConfiguration(
  sla: SlaConfiguration,
  path: string,
  errors: TemplateValidationError[],
  warnings: TemplateValidationWarning[]
): void {
  // Validate durations
  if (sla.responseTime) {
    validateDuration(sla.responseTime, `${path}.responseTime`, errors);
  }

  if (sla.completionTime) {
    validateDuration(sla.completionTime, `${path}.completionTime`, errors);
  }

  // Warning threshold validation
  if (sla.warningThreshold !== undefined) {
    if (sla.warningThreshold <= 0 || sla.warningThreshold >= 100) {
      errors.push({
        code: "INVALID_WARNING_THRESHOLD",
        message: "Warning threshold must be between 0 and 100 (exclusive)",
        path: `${path}.warningThreshold`,
        severity: "error",
      });
    }
  }

  // Validate escalations
  if (sla.escalations) {
    sla.escalations.forEach((escalation, escIndex) => {
      const escPath = `${path}.escalations[${escIndex}]`;

      if (!escalation.id) {
        errors.push({
          code: "MISSING_ESCALATION_ID",
          message: "Escalation rule ID is required",
          path: `${escPath}.id`,
          severity: "error",
        });
      }

      if (!escalation.delay) {
        errors.push({
          code: "MISSING_ESCALATION_DELAY",
          message: "Escalation delay is required",
          path: `${escPath}.delay`,
          severity: "error",
        });
      } else {
        validateDuration(escalation.delay, `${escPath}.delay`, errors);
      }

      const validActions = ["notify", "reassign", "add_approver", "auto_approve", "auto_reject"];
      if (!escalation.action || !validActions.includes(escalation.action)) {
        errors.push({
          code: "INVALID_ESCALATION_ACTION",
          message: `Invalid escalation action: ${escalation.action}`,
          path: `${escPath}.action`,
          severity: "error",
        });
      }

      // Validate target
      if (!escalation.target) {
        if (escalation.action !== "notify") {
          errors.push({
            code: "MISSING_ESCALATION_TARGET",
            message: "Escalation target is required for non-notify actions",
            path: `${escPath}.target`,
            severity: "error",
          });
        }
      }

      // Validate repeat configuration
      if (escalation.repeat) {
        validateDuration(escalation.repeat.interval, `${escPath}.repeat.interval`, errors);
        if (escalation.repeat.maxRepeats <= 0) {
          errors.push({
            code: "INVALID_MAX_REPEATS",
            message: "Max repeats must be a positive number",
            path: `${escPath}.repeat.maxRepeats`,
            severity: "error",
          });
        }
      }
    });
  }

  // Validate reminders
  if (sla.reminders?.enabled && (!sla.reminders.intervals || sla.reminders.intervals.length === 0)) {
    warnings.push({
      code: "REMINDERS_NO_INTERVALS",
      message: "Reminders enabled but no intervals specified",
      path: `${path}.reminders.intervals`,
      severity: "warning",
    });
  }

  // Validate business hours
  if (sla.businessHours) {
    const bh = sla.businessHours;
    if (bh.startHour < 0 || bh.startHour > 23 || bh.endHour < 0 || bh.endHour > 23) {
      errors.push({
        code: "INVALID_BUSINESS_HOURS",
        message: "Business hours must be between 0 and 23",
        path: `${path}.businessHours`,
        severity: "error",
      });
    }
    if (bh.startHour >= bh.endHour) {
      warnings.push({
        code: "BUSINESS_HOURS_OVERLAP",
        message: "Business hours start time is >= end time; this may indicate overnight hours or an error",
        path: `${path}.businessHours`,
        severity: "warning",
      });
    }
    if (!bh.workingDays || bh.workingDays.length === 0) {
      errors.push({
        code: "NO_WORKING_DAYS",
        message: "At least one working day must be specified",
        path: `${path}.businessHours.workingDays`,
        severity: "error",
      });
    }
    if (!bh.timezone) {
      warnings.push({
        code: "NO_TIMEZONE",
        message: "Business hours timezone not specified; will use UTC",
        path: `${path}.businessHours.timezone`,
        severity: "warning",
      });
    }
  }
}

/**
 * Validate duration
 */
function validateDuration(
  duration: { value: number; unit: string },
  path: string,
  errors: TemplateValidationError[]
): void {
  if (duration.value === undefined || duration.value <= 0) {
    errors.push({
      code: "INVALID_DURATION_VALUE",
      message: "Duration value must be a positive number",
      path: `${path}.value`,
      severity: "error",
    });
  }

  const validUnits = ["minutes", "hours", "days", "business_days"];
  if (!duration.unit || !validUnits.includes(duration.unit)) {
    errors.push({
      code: "INVALID_DURATION_UNIT",
      message: `Invalid duration unit: ${duration.unit}. Valid units: ${validUnits.join(", ")}`,
      path: `${path}.unit`,
      severity: "error",
    });
  }
}

/**
 * Validate allowed actions
 */
function validateAllowedActions(
  actions: ApprovalActionType[],
  errors: TemplateValidationError[],
  warnings: TemplateValidationWarning[]
): void {
  if (!actions || actions.length === 0) return;

  const validActions: ApprovalActionType[] = [
    "approve",
    "reject",
    "request_changes",
    "delegate",
    "escalate",
    "bypass",
    "withdraw",
    "reassign",
    "comment",
    "hold",
    "release",
  ];

  const seen = new Set<string>();

  actions.forEach((action, index) => {
    if (!validActions.includes(action)) {
      errors.push({
        code: "INVALID_ACTION",
        message: `Invalid action: ${action}`,
        path: `allowedActions[${index}]`,
        severity: "error",
      });
    }

    if (seen.has(action)) {
      warnings.push({
        code: "DUPLICATE_ACTION",
        message: `Duplicate action: ${action}`,
        path: `allowedActions[${index}]`,
        severity: "warning",
      });
    }
    seen.add(action);
  });

  // Must have approve and reject
  if (!actions.includes("approve") || !actions.includes("reject")) {
    warnings.push({
      code: "MISSING_BASIC_ACTIONS",
      message: "Workflow should include both 'approve' and 'reject' actions",
      path: "allowedActions",
      severity: "warning",
    });
  }
}

// ============================================================================
// Export
// ============================================================================

export {
  validateBasicFields,
  validateTriggers,
  validateSteps,
  validateStepDependencies,
  validateApproverRule,
  validateCondition,
  validateSlaConfiguration,
  validateAllowedActions,
};
