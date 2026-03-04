/**
 * Approval Workflow Definition Types
 *
 * Design-time types for configuring approval workflows.
 * These define the structure of approval templates, steps,
 * approver rules, conditions, SLAs, and actions.
 */

// ============================================================================
// 1.1 Approval Template Setup
// ============================================================================

/**
 * Entity types that can have approval workflows attached
 */
export type ApprovalEntityType =
  | "purchase_order"
  | "invoice"
  | "contract"
  | "master_data"
  | "expense_report"
  | "budget_request"
  | "change_request"
  | "leave_request"
  | "custom";

/**
 * Events that can trigger an approval workflow
 */
export type ApprovalTriggerEvent =
  | "on_create"
  | "on_submit"
  | "on_update"
  | "on_amount_threshold"
  | "on_state_transition"
  | "on_field_change"
  | "manual";

/**
 * Trigger configuration with optional conditions
 */
export interface ApprovalTrigger {
  /** Trigger event type */
  event: ApprovalTriggerEvent;

  /** For state transitions: from state(s) */
  fromStates?: string[];

  /** For state transitions: to state(s) */
  toStates?: string[];

  /** For field change triggers: fields to watch */
  watchFields?: string[];

  /** For amount threshold: threshold configuration */
  amountThreshold?: {
    field: string;
    operator: "gt" | "gte" | "lt" | "lte" | "eq" | "between";
    value: number;
    upperValue?: number; // For "between" operator
    currency?: string;
  };

  /** Additional conditions for this trigger */
  conditions?: ApprovalCondition[];
}

/**
 * Approval workflow template definition
 */
export interface ApprovalWorkflowTemplate {
  /** Unique identifier */
  id: string;

  /** Tenant this template belongs to */
  tenantId: string;

  /** Human-readable name */
  name: string;

  /** Unique code for referencing in code/config */
  code: string;

  /** Description of the workflow */
  description?: string;

  /** Entity type this workflow applies to */
  entityType: ApprovalEntityType;

  /** Custom entity type name (when entityType is "custom") */
  customEntityType?: string;

  /** Version number for template versioning */
  version: number;

  /** Whether this is the active version */
  isActive: boolean;

  /** Whether this template is enabled */
  enabled: boolean;

  /** Trigger configuration */
  triggers: ApprovalTrigger[];

  /** Priority for trigger matching (lower = higher priority) */
  priority: number;

  /** Approval steps */
  steps: ApprovalStep[];

  /** Global SLA settings (can be overridden per step) */
  globalSla?: SlaConfiguration;

  /** Allowed actions for this workflow */
  allowedActions: ApprovalActionType[];

  /** Metadata for custom extensions */
  metadata?: Record<string, unknown>;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  publishedAt?: Date;
  publishedBy?: string;
}

// ============================================================================
// 1.2 Approval Steps Configuration
// ============================================================================

/**
 * Step execution type
 */
export type ApprovalStepType =
  | "sequential" // Must complete before next step
  | "parallel" // Can run in parallel with other steps
  | "conditional"; // Only runs if conditions are met

/**
 * Approval requirement for a step
 */
export type ApprovalRequirement =
  | "any" // Any one approver can approve
  | "all" // All approvers must approve
  | "majority" // More than half must approve
  | "quorum"; // Configurable number/percentage

/**
 * Quorum configuration for approval requirements
 */
export interface QuorumConfig {
  /** Type of quorum */
  type: "count" | "percentage";
  /** Minimum count or percentage */
  value: number;
}

/**
 * Approval step definition
 */
export interface ApprovalStep {
  /** Step identifier (unique within workflow) */
  id: string;

  /** Step name */
  name: string;

  /** Step description */
  description?: string;

  /** Step level (L1, L2, L3...) */
  level: number;

  /** Step execution type */
  type: ApprovalStepType;

  /** Approval requirement */
  requirement: ApprovalRequirement;

  /** Quorum configuration (when requirement is "quorum") */
  quorum?: QuorumConfig;

  /** Approver resolution rules */
  approvers: ApproverRule[];

  /** Step dependencies (IDs of steps that must complete first) */
  dependsOn?: string[];

  /** Conditions for this step to be active */
  conditions?: ApprovalCondition[];

  /** Whether this step can be skipped */
  canSkip: boolean;

  /** Skip conditions (when step should be auto-skipped) */
  skipConditions?: ApprovalCondition[];

  /** Step-specific SLA (overrides global) */
  sla?: SlaConfiguration;

  /** Allowed actions for this step */
  allowedActions?: ApprovalActionType[];

  /** Order within the same level */
  order: number;

  /** Whether step is optional */
  optional: boolean;

  /** Auto-approve conditions */
  autoApproveConditions?: ApprovalCondition[];

  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 1.3 Approver Resolution Rules
// ============================================================================

/**
 * Approver resolution strategy
 */
export type ApproverResolutionType =
  | "role" // Role-based approvers
  | "user" // Named user approvers
  | "dynamic" // Dynamic resolution
  | "group" // User group
  | "expression"; // Custom expression

/**
 * Dynamic approver resolution strategy
 */
export type DynamicApproverStrategy =
  | "reporting_hierarchy" // Manager chain
  | "cost_center_owner" // Cost center owner
  | "project_manager" // Project manager
  | "department_head" // Department head
  | "budget_owner" // Budget owner
  | "entity_owner" // Owner of the entity
  | "custom_field"; // Custom field reference

/**
 * Hierarchy traversal options
 */
export interface HierarchyOptions {
  /** Maximum levels to traverse */
  maxLevels?: number;
  /** Skip levels (e.g., skip direct manager) */
  skipLevels?: number;
  /** Include specific levels only */
  includeLevels?: number[];
  /** Stop at role (e.g., stop at "Director") */
  stopAtRole?: string;
  /** Stop at user */
  stopAtUserId?: string;
}

/**
 * Approver resolution rule
 */
export interface ApproverRule {
  /** Rule identifier */
  id: string;

  /** Resolution type */
  type: ApproverResolutionType;

  /** Priority for fallback ordering */
  priority: number;

  /** Role-based configuration */
  role?: {
    /** Role code(s) */
    roles: string[];
    /** Scope: global, tenant, org, or entity-specific */
    scope?: "global" | "tenant" | "org" | "entity";
    /** Minimum number of approvers with this role */
    minApprovers?: number;
    /** Maximum number of approvers with this role */
    maxApprovers?: number;
  };

  /** User-based configuration */
  user?: {
    /** Specific user IDs */
    userIds: string[];
  };

  /** Dynamic resolution configuration */
  dynamic?: {
    /** Resolution strategy */
    strategy: DynamicApproverStrategy;
    /** Source field for custom_field strategy */
    sourceField?: string;
    /** Hierarchy options */
    hierarchyOptions?: HierarchyOptions;
    /** Additional parameters */
    params?: Record<string, unknown>;
  };

  /** Group-based configuration */
  group?: {
    /** Group ID(s) */
    groupIds: string[];
    /** Minimum approvers from group */
    minFromGroup?: number;
  };

  /** Expression-based configuration */
  expression?: {
    /** Expression to evaluate (returns user IDs) */
    expr: string;
    /** Expression language (e.g., "jsonpath", "jexl") */
    language: string;
  };

  /** Conditions for this rule to apply */
  conditions?: ApprovalCondition[];

  /** Whether this is a fallback rule */
  isFallback: boolean;

  /** Fallback rule ID (if this rule fails, use fallback) */
  fallbackRuleId?: string;
}

/**
 * Resolved approver information
 */
export interface ResolvedApprover {
  /** User ID */
  userId: string;

  /** User display name */
  displayName?: string;

  /** User email */
  email?: string;

  /** Resolution source (which rule resolved this) */
  resolvedBy: string;

  /** Resolution strategy used */
  strategy: ApproverResolutionType;

  /** Whether this is a fallback approver */
  isFallback: boolean;

  /** Delegation info if delegated */
  delegatedFrom?: string;

  /** Delegation reason */
  delegationReason?: string;
}

// ============================================================================
// 1.4 Conditions & Thresholds
// ============================================================================

/**
 * Condition operator types
 */
export type ConditionOperator =
  | "eq" // Equal
  | "neq" // Not equal
  | "gt" // Greater than
  | "gte" // Greater than or equal
  | "lt" // Less than
  | "lte" // Less than or equal
  | "in" // In array
  | "nin" // Not in array
  | "contains" // String contains
  | "startsWith" // String starts with
  | "endsWith" // String ends with
  | "matches" // Regex match
  | "exists" // Field exists
  | "notExists" // Field does not exist
  | "between" // Between two values
  | "empty" // Is empty/null
  | "notEmpty"; // Is not empty/null

/**
 * Logical operator for combining conditions
 */
export type LogicalOperator = "and" | "or";

/**
 * Single approval condition
 */
export interface ApprovalConditionRule {
  /** Field path to evaluate */
  field: string;

  /** Operator */
  operator: ConditionOperator;

  /** Value(s) to compare against */
  value?: unknown;

  /** Upper value for "between" operator */
  upperValue?: unknown;

  /** Whether comparison is case-insensitive */
  caseInsensitive?: boolean;
}

/**
 * Composite approval condition (supports nested AND/OR)
 */
export interface ApprovalCondition {
  /** Logical operator for combining rules */
  logic: LogicalOperator;

  /** Condition rules */
  rules?: ApprovalConditionRule[];

  /** Nested conditions */
  conditions?: ApprovalCondition[];
}

/**
 * Amount-based threshold rule
 */
export interface AmountThreshold {
  /** Unique identifier */
  id: string;

  /** Threshold name */
  name: string;

  /** Field containing the amount */
  amountField: string;

  /** Currency field (optional) */
  currencyField?: string;

  /** Threshold ranges */
  ranges: AmountRange[];
}

/**
 * Amount range configuration
 */
export interface AmountRange {
  /** Minimum amount (inclusive) */
  min?: number;

  /** Maximum amount (exclusive) */
  max?: number;

  /** Currency (if currency-specific) */
  currency?: string;

  /** Step ID(s) to activate for this range */
  activateSteps: string[];

  /** Additional approvers for this range */
  additionalApprovers?: ApproverRule[];

  /** Skip steps for this range */
  skipSteps?: string[];
}

/**
 * Risk-based rule
 */
export interface RiskRule {
  /** Risk category */
  category: string;

  /** Risk level (1-5 or custom) */
  level: number | string;

  /** Additional steps for this risk level */
  additionalSteps?: string[];

  /** Required approver roles */
  requiredRoles?: string[];
}

/**
 * Skip logic configuration
 */
export interface SkipLogic {
  /** Conditions that trigger skip */
  conditions: ApprovalCondition;

  /** Steps to skip */
  stepsToSkip: string[];

  /** Reason for skip (logged in audit) */
  reason: string;
}

// ============================================================================
// 1.5 SLA & Escalation Rules
// ============================================================================

/**
 * Duration unit for SLA
 */
export type DurationUnit = "minutes" | "hours" | "days" | "business_days";

/**
 * SLA duration configuration
 */
export interface SlaDuration {
  /** Duration value */
  value: number;

  /** Duration unit */
  unit: DurationUnit;
}

/**
 * Escalation target type
 */
export type EscalationTargetType = "role" | "user" | "hierarchy" | "group";

/**
 * Escalation action type
 */
export type EscalationActionType =
  | "notify" // Just notify
  | "reassign" // Reassign to escalation target
  | "add_approver" // Add escalation target as additional approver
  | "auto_approve" // Auto-approve after escalation
  | "auto_reject"; // Auto-reject after escalation

/**
 * Escalation rule
 */
export interface EscalationRule {
  /** Rule identifier */
  id: string;

  /** Rule name */
  name: string;

  /** Delay before escalation */
  delay: SlaDuration;

  /** Escalation action */
  action: EscalationActionType;

  /** Target type */
  targetType: EscalationTargetType;

  /** Target configuration */
  target: {
    /** Role code(s) for role-based escalation */
    roles?: string[];
    /** User IDs for user-based escalation */
    userIds?: string[];
    /** Hierarchy levels to escalate */
    hierarchyLevels?: number;
    /** Group IDs for group-based escalation */
    groupIds?: string[];
  };

  /** Notification template */
  notificationTemplate?: string;

  /** Whether this escalation repeats */
  repeat?: {
    /** Repeat interval */
    interval: SlaDuration;
    /** Maximum repeats */
    maxRepeats: number;
  };

  /** Conditions for this escalation to apply */
  conditions?: ApprovalCondition[];
}

/**
 * Reminder configuration
 */
export interface ReminderConfig {
  /** Send reminders */
  enabled: boolean;

  /** Reminder intervals */
  intervals: SlaDuration[];

  /** Notification template */
  template?: string;
}

/**
 * SLA configuration
 */
export interface SlaConfiguration {
  /** Response SLA (time to first action) */
  responseTime?: SlaDuration;

  /** Completion SLA (time to final decision) */
  completionTime?: SlaDuration;

  /** Warning threshold (percentage of SLA) */
  warningThreshold?: number;

  /** Escalation rules */
  escalations?: EscalationRule[];

  /** Reminder configuration */
  reminders?: ReminderConfig;

  /** Business hours configuration */
  businessHours?: {
    /** Start hour (0-23) */
    startHour: number;
    /** End hour (0-23) */
    endHour: number;
    /** Working days (0=Sunday, 6=Saturday) */
    workingDays: number[];
    /** Timezone */
    timezone: string;
    /** Holiday calendar ID */
    holidayCalendarId?: string;
  };

  /** Exclude weekends from SLA calculation */
  excludeWeekends?: boolean;

  /** Exclude holidays from SLA calculation */
  excludeHolidays?: boolean;
}

// ============================================================================
// 1.6 Approval Actions
// ============================================================================

/**
 * Approval action types
 */
export type ApprovalActionType =
  | "approve"
  | "reject"
  | "request_changes"
  | "delegate"
  | "escalate"
  | "bypass"
  | "withdraw"
  | "reassign"
  | "comment"
  | "hold"
  | "release";

/**
 * Action configuration
 */
export interface ApprovalActionConfig {
  /** Action type */
  action: ApprovalActionType;

  /** Whether action is enabled */
  enabled: boolean;

  /** Whether comment is required */
  commentRequired: boolean;

  /** Minimum comment length */
  minCommentLength?: number;

  /** Roles that can perform this action */
  allowedRoles?: string[];

  /** Users that can perform this action */
  allowedUsers?: string[];

  /** Conditions for action availability */
  conditions?: ApprovalCondition[];

  /** Confirmation required */
  requireConfirmation?: boolean;

  /** Confirmation message */
  confirmationMessage?: string;

  /** Additional fields required for this action */
  requiredFields?: ActionField[];

  /** Post-action hooks */
  hooks?: ActionHook[];
}

/**
 * Additional field for an action
 */
export interface ActionField {
  /** Field name */
  name: string;

  /** Field label */
  label: string;

  /** Field type */
  type: "text" | "textarea" | "select" | "multiselect" | "date" | "number" | "boolean";

  /** Whether field is required */
  required: boolean;

  /** Options for select fields */
  options?: Array<{ value: string; label: string }>;

  /** Validation rules */
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
}

/**
 * Action hook configuration
 */
export interface ActionHook {
  /** Hook type */
  type: "webhook" | "event" | "state_transition" | "notification";

  /** Hook configuration */
  config: {
    /** Webhook URL */
    url?: string;
    /** Event name */
    eventName?: string;
    /** Target state */
    targetState?: string;
    /** Notification template */
    notificationTemplate?: string;
    /** Additional parameters */
    params?: Record<string, unknown>;
  };

  /** Conditions for hook execution */
  conditions?: ApprovalCondition[];

  /** Whether hook failure should fail the action */
  failOnError?: boolean;
}

// ============================================================================
// Repository & Service Interfaces
// ============================================================================

/**
 * Stored approval workflow template
 */
export interface StoredApprovalWorkflowTemplate extends ApprovalWorkflowTemplate {
  /** Database record ID */
  _id?: string;
}

/**
 * Create template input
 */
export type CreateApprovalWorkflowInput = Omit<
  ApprovalWorkflowTemplate,
  "id" | "tenantId" | "version" | "createdAt" | "createdBy" | "isActive"
>;

/**
 * Update template input
 */
export type UpdateApprovalWorkflowInput = Partial<
  Omit<ApprovalWorkflowTemplate, "id" | "tenantId" | "version" | "createdAt" | "createdBy">
>;

/**
 * Template query options
 */
export interface ApprovalWorkflowQueryOptions {
  /** Filter by entity type */
  entityType?: ApprovalEntityType;

  /** Filter by enabled status */
  enabled?: boolean;

  /** Filter by active version */
  activeOnly?: boolean;

  /** Filter by code */
  code?: string;

  /** Search by name */
  searchName?: string;

  /** Include inactive versions */
  includeInactive?: boolean;

  /** Pagination: limit */
  limit?: number;

  /** Pagination: offset */
  offset?: number;

  /** Sort field */
  sortBy?: "name" | "code" | "createdAt" | "updatedAt" | "priority";

  /** Sort direction */
  sortDirection?: "asc" | "desc";
}

/**
 * Template validation result
 */
export interface TemplateValidationResult {
  /** Whether template is valid */
  valid: boolean;

  /** Validation errors */
  errors: TemplateValidationError[];

  /** Validation warnings */
  warnings: TemplateValidationWarning[];
}

/**
 * Template validation error
 */
export interface TemplateValidationError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Path to invalid field */
  path: string;

  /** Severity */
  severity: "error";
}

/**
 * Template validation warning
 */
export interface TemplateValidationWarning {
  /** Warning code */
  code: string;

  /** Warning message */
  message: string;

  /** Path to field */
  path: string;

  /** Severity */
  severity: "warning";
}

/**
 * Approval workflow repository interface
 */
export interface IApprovalWorkflowRepository {
  /** Get template by ID */
  getById(tenantId: string, templateId: string): Promise<StoredApprovalWorkflowTemplate | undefined>;

  /** Get template by code */
  getByCode(tenantId: string, code: string, version?: number): Promise<StoredApprovalWorkflowTemplate | undefined>;

  /** Get active template by code */
  getActiveByCode(tenantId: string, code: string): Promise<StoredApprovalWorkflowTemplate | undefined>;

  /** List templates */
  list(tenantId: string, options?: ApprovalWorkflowQueryOptions): Promise<StoredApprovalWorkflowTemplate[]>;

  /** Create template */
  create(
    tenantId: string,
    template: CreateApprovalWorkflowInput,
    createdBy: string
  ): Promise<StoredApprovalWorkflowTemplate>;

  /** Update template (creates new version) */
  update(
    tenantId: string,
    templateId: string,
    updates: UpdateApprovalWorkflowInput,
    updatedBy: string
  ): Promise<StoredApprovalWorkflowTemplate>;

  /** Publish template (make version active) */
  publish(tenantId: string, templateId: string, publishedBy: string): Promise<StoredApprovalWorkflowTemplate>;

  /** Unpublish template */
  unpublish(tenantId: string, templateId: string, unpublishedBy: string): Promise<StoredApprovalWorkflowTemplate>;

  /** Delete template */
  delete(tenantId: string, templateId: string): Promise<void>;

  /** Get all versions of a template */
  getVersionHistory(tenantId: string, code: string): Promise<StoredApprovalWorkflowTemplate[]>;

  /** Clone template */
  clone(
    tenantId: string,
    templateId: string,
    newCode: string,
    newName: string,
    clonedBy: string
  ): Promise<StoredApprovalWorkflowTemplate>;

  /** Find templates matching trigger conditions */
  findMatchingTemplates(
    tenantId: string,
    entityType: ApprovalEntityType,
    triggerEvent: ApprovalTriggerEvent
  ): Promise<StoredApprovalWorkflowTemplate[]>;
}

/**
 * Approval workflow service interface
 */
export interface IApprovalWorkflowService {
  /** Validate template */
  validate(template: CreateApprovalWorkflowInput | ApprovalWorkflowTemplate): TemplateValidationResult;

  /** Create template */
  createTemplate(
    tenantId: string,
    template: CreateApprovalWorkflowInput,
    createdBy: string
  ): Promise<StoredApprovalWorkflowTemplate>;

  /** Update template */
  updateTemplate(
    tenantId: string,
    templateId: string,
    updates: UpdateApprovalWorkflowInput,
    updatedBy: string
  ): Promise<StoredApprovalWorkflowTemplate>;

  /** Publish template */
  publishTemplate(
    tenantId: string,
    templateId: string,
    publishedBy: string
  ): Promise<StoredApprovalWorkflowTemplate>;

  /** Get template */
  getTemplate(tenantId: string, templateId: string): Promise<StoredApprovalWorkflowTemplate | undefined>;

  /** Get active template by code */
  getActiveTemplate(tenantId: string, code: string): Promise<StoredApprovalWorkflowTemplate | undefined>;

  /** List templates */
  listTemplates(
    tenantId: string,
    options?: ApprovalWorkflowQueryOptions
  ): Promise<StoredApprovalWorkflowTemplate[]>;

  /** Delete template */
  deleteTemplate(tenantId: string, templateId: string): Promise<void>;

  /** Clone template */
  cloneTemplate(
    tenantId: string,
    templateId: string,
    newCode: string,
    newName: string,
    clonedBy: string
  ): Promise<StoredApprovalWorkflowTemplate>;

  /** Find templates for entity */
  findTemplatesForEntity(
    tenantId: string,
    entityType: ApprovalEntityType,
    triggerEvent: ApprovalTriggerEvent,
    entityData?: Record<string, unknown>
  ): Promise<StoredApprovalWorkflowTemplate[]>;

  /** Resolve approvers for a step */
  resolveApprovers(
    tenantId: string,
    step: ApprovalStep,
    context: ApproverResolutionContext
  ): Promise<ResolvedApprover[]>;
}

/**
 * Context for approver resolution
 */
export interface ApproverResolutionContext {
  /** Entity being approved */
  entity: Record<string, unknown>;

  /** Requester/submitter info */
  requester: {
    userId: string;
    roles?: string[];
    orgId?: string;
    departmentId?: string;
    costCenterId?: string;
    managerId?: string;
  };

  /** Current step */
  stepId: string;

  /** Previous approvers (for delegation/escalation) */
  previousApprovers?: ResolvedApprover[];

  /** Additional context */
  metadata?: Record<string, unknown>;
}
