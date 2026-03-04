/**
 * META Engine Type Definitions
 *
 * Core types for the META Engine system including:
 * - Entity schema definitions
 * - Compiled model structures
 * - Policy definitions
 * - Audit event types
 *
 * These are pure types with no implementation - they define the contracts
 * that all META Engine components must adhere to.
 */

import type { ConditionGroup } from "./validation-rules.js";

// ============================================================================
// Field Types and Definitions
// ============================================================================

/**
 * Supported field types for entity schemas
 */
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "reference"
  | "enum"
  | "json"
  | "uuid"
  | "decimal"
  | "rich_text";

/**
 * Field definition in entity schema
 * Defines structure, validation rules, and UI hints for a single field
 */
export type FieldDefinition = {
  /** Field name (camelCase) */
  name: string;

  /** Field data type */
  type: FieldType;

  /** Whether field is required (non-nullable) */
  required: boolean;

  /** Human-readable label for UI */
  label?: string;

  /** Field description/help text */
  description?: string;

  // ===== Type-Specific Options =====

  /** For reference fields: target entity name */
  referenceTo?: string;

  /**
   * For reference fields: cascade rule when referenced record is deleted
   * - "CASCADE": Delete this record when referenced record is deleted
   * - "SET_NULL": Set this field to null when referenced record is deleted
   * - "RESTRICT": Prevent deletion of referenced record if this record exists
   * - undefined: No cascade (default) - orphaned references allowed
   */
  onDelete?: "CASCADE" | "SET_NULL" | "RESTRICT";

  /** For enum fields: allowed values */
  enumValues?: string[];

  // ===== Validation Rules =====

  /** Min length for string fields */
  minLength?: number;

  /** Max length for string fields */
  maxLength?: number;

  /** Regex pattern for string validation */
  pattern?: string;

  /** Minimum value for number fields */
  min?: number;

  /** Maximum value for number fields */
  max?: number;

  /** Default value (JSON-serializable) */
  defaultValue?: unknown;

  // ===== UI Hints =====

  /** Placeholder text for input fields */
  placeholder?: string;

  /** Help text shown near field */
  helpText?: string;

  /** Whether field should be indexed in database */
  indexed?: boolean;

  /** Whether field is unique */
  unique?: boolean;
};

// ============================================================================
// Policy Definitions
// ============================================================================

/**
 * Policy effect: allow or deny
 */
export type PolicyEffect = "allow" | "deny";

/**
 * Policy action (CRUD operation)
 */
export type PolicyAction = "create" | "read" | "update" | "delete" | "*";

/**
 * Policy condition operators
 */
export type PolicyOperator =
  | "eq" // Equal
  | "ne" // Not equal
  | "in" // In array
  | "not_in" // Not in array
  | "gt" // Greater than
  | "gte" // Greater than or equal
  | "lt" // Less than
  | "lte" // Less than or equal
  | "contains" // String contains
  | "starts_with" // String starts with
  | "ends_with"; // String ends with

/**
 * Policy condition
 * Evaluates to true/false based on context and record data
 */
export type PolicyCondition = {
  /** Field to check (e.g., "user.role", "record.userId") */
  field: string;

  /** Comparison operator */
  operator: PolicyOperator;

  /** Value to compare against */
  value: unknown;
};

/**
 * Policy definition
 * Defines access control rules for entities
 */
export type PolicyDefinition = {
  /** Policy name (unique within entity) */
  name: string;

  /** Policy effect (allow or deny) */
  effect: PolicyEffect;

  /** Action this policy applies to */
  action: PolicyAction;

  /** Resource (entity name) this policy applies to */
  resource: string;

  /** Conditions that must be met (AND logic) */
  conditions?: PolicyCondition[];

  /**
   * Field-level access control (optional)
   * If specified, this policy grants access only to these fields.
   * - ["*"] = all fields (default if not specified)
   * - ["field1", "field2"] = only these specific fields
   * - Applies to both read and write operations
   */
  fields?: string[];

  /** Policy description */
  description?: string;

  /** Policy priority (higher = evaluated first) */
  priority?: number;
};

// ============================================================================
// Entity Schema
// ============================================================================

/**
 * Complete entity schema definition
 * Defines structure, validation, and policies for an entity
 */
export type EntitySchema = {
  /** Entity fields */
  fields: FieldDefinition[];

  /** Access control policies */
  policies?: PolicyDefinition[];

  /** Schema metadata */
  metadata?: {
    /** Display label */
    label?: string;

    /** Entity description */
    description?: string;

    /** Icon identifier */
    icon?: string;

    /** Color for UI */
    color?: string;

    /** Tags for categorization */
    tags?: string[];

    /** Custom metadata (extensible) */
    [key: string]: unknown;
  };
};

// ============================================================================
// Compiled Model (Optimized IR)
// ============================================================================

/**
 * Compiled field definition
 * Optimized version of FieldDefinition for runtime use
 */
export type CompiledField = {
  /** Field name (camelCase, as in API) */
  name: string;

  /** Database column name (snake_case) */
  columnName: string;

  /** Field type */
  type: FieldType;

  /** Whether field is required */
  required: boolean;

  /** SELECT fragment: "column_name as fieldName" */
  selectAs: string;

  /** Validation function (optional, for runtime validation) */
  validator?: (value: unknown) => boolean;

  /** Transform function (DB → API format) */
  transformer?: (dbValue: unknown) => unknown;

  /** Indexed flag */
  indexed?: boolean;

  /** Unique flag */
  unique?: boolean;

  // ===== Validation Constraints (for runtime validation) =====

  /** For reference fields: target entity name */
  referenceTo?: string;

  /** For reference fields: cascade behavior on delete */
  onDelete?: "CASCADE" | "SET_NULL" | "RESTRICT";

  /** For enum fields: allowed values */
  enumValues?: string[];

  /** Min length for string fields */
  minLength?: number;

  /** Max length for string fields */
  maxLength?: number;

  /** Regex pattern for string validation */
  pattern?: string;

  /** Minimum value for number fields */
  min?: number;

  /** Maximum value for number fields */
  max?: number;
};

/**
 * Compiled policy definition
 * Optimized version of PolicyDefinition for runtime evaluation
 */
export type CompiledPolicy = {
  /** Policy name */
  name: string;

  /** Policy effect */
  effect: PolicyEffect;

  /** Action */
  action: PolicyAction;

  /** Resource */
  resource: string;

  /** Field-level access control */
  fields?: string[];

  /** Compiled evaluator function */
  evaluate: (ctx: RequestContext, record?: unknown) => boolean;

  /** Policy priority */
  priority: number;

  /** Compiled at timestamp */
  compiledAt: Date;

  /** Schema hash (for cache invalidation) */
  hash: string;
};

/**
 * Compiled model IR (Intermediate Representation)
 * Optimized representation of entity schema for runtime queries
 */
export type CompiledModel = {
  /** Entity name */
  entityName: string;

  /** Schema version */
  version: string;

  /** Physical table name (e.g., "ent_invoice") */
  tableName: string;

  /** Compiled fields */
  fields: CompiledField[];

  /** Compiled policies */
  policies: CompiledPolicy[];

  // ===== Pre-built Query Fragments =====

  /** SELECT clause (all fields) */
  selectFragment: string;

  /** FROM clause with tenant filter */
  fromFragment: string;

  /** WHERE clause for tenant isolation */
  tenantFilterFragment: string;

  // ===== Metadata =====

  /** Database indexes */
  indexes: string[];

  /** Compilation timestamp */
  compiledAt: Date;

  /** Compiled by (user/service) */
  compiledBy: string;

  /** Schema hash (for cache invalidation) */
  hash: string;

  // ===== Compilation Identity (Phase 9.1) =====

  /** Input hash: stable hash of compilation inputs (entity + version + fields + policies + etc.) */
  inputHash?: string;

  /** Output hash: hash of the compiled JSON output */
  outputHash?: string;

  /** Compilation diagnostics */
  diagnostics?: CompileDiagnostic[];

  // ===== Entity Classification (Approvable Core Engine) =====

  /** Entity classification (MASTER/CONTROL/DOCUMENT) */
  entityClass?: EntityClass;

  /** Entity feature flags */
  featureFlags?: EntityFeatureFlags;
};

// ============================================================================
// Compilation Diagnostics (Phase 9.2)
// ============================================================================

/**
 * Compilation diagnostic severity levels
 */
export type DiagnosticSeverity = "ERROR" | "WARN" | "INFO";

/**
 * Compilation diagnostic
 * Similar to TypeScript compiler diagnostics
 */
export type CompileDiagnostic = {
  /** Severity level */
  severity: DiagnosticSeverity;

  /** Diagnostic code (e.g., "missing_mapping", "no_index") */
  code: string;

  /** Human-readable message */
  message: string;

  /** Field or element that triggered the diagnostic */
  field?: string;

  /** Additional context */
  context?: Record<string, unknown>;
};

/**
 * Compilation result with diagnostics
 */
export type CompilationResult = {
  /** Compiled model */
  model: CompiledModel;

  /** Diagnostics collected during compilation */
  diagnostics: CompileDiagnostic[];

  /** Whether compilation succeeded (no ERROR diagnostics) */
  success: boolean;

  /** Input hash for cache key */
  inputHash: string;

  /** Output hash for versioning */
  outputHash: string;

  /** Compilation duration in milliseconds */
  durationMs: number;
};

// ============================================================================
// Request Context
// ============================================================================

/**
 * Request context for tenant isolation and access control
 * Passed to all META Engine operations
 */
export type RequestContext = {
  /** User ID */
  userId: string;

  /** Tenant ID */
  tenantId: string;

  /** Realm ID */
  realmId: string;

  /** User roles */
  roles: string[];

  /** Organization key (optional) */
  orgKey?: string;

  /** Request ID (for tracing) */
  requestId?: string;

  /** Additional context data */
  metadata?: Record<string, unknown>;
};

// ============================================================================
// Audit Events
// ============================================================================

/**
 * Audit event types
 */
export type AuditEventType =
  // Meta entity operations
  | "meta.entity.create"
  | "meta.entity.update"
  | "meta.entity.delete"

  // Meta version operations
  | "meta.version.create"
  | "meta.version.activate"
  | "meta.version.deactivate"

  // Meta field operations
  | "meta.field.add"
  | "meta.field.update"
  | "meta.field.remove"

  // Meta compilation
  | "meta.compile"
  | "meta.compile.error"

  // Policy operations
  | "policy.create"
  | "policy.update"
  | "policy.delete"
  | "policy.evaluate"
  | "policy.allow"
  | "policy.deny"

  // Overlay operations
  | "meta.overlay.create"
  | "meta.overlay.update"
  | "meta.overlay.delete"
  | "meta.overlay.addChange"
  | "meta.overlay.removeChange"
  | "meta.overlay.reorderChanges"

  // Data access operations
  | "data.read"
  | "data.create"
  | "data.update"
  | "data.delete"
  | "data.read.denied"
  | "data.create.denied"
  | "data.update.denied"
  | "data.delete.denied";

/**
 * Audit event
 * Records metadata changes and policy decisions
 */
export type AuditEvent = {
  /** Unique event ID */
  eventId: string;

  /** Event type */
  eventType: AuditEventType;

  /** Event timestamp */
  timestamp: Date;

  // ===== Actor =====

  /** User who triggered the event */
  userId: string;

  /** Tenant context */
  tenantId: string;

  /** Realm context */
  realmId: string;

  // ===== Context =====

  /** Action performed (e.g., "meta.entity.create") */
  action: string;

  /** Resource affected (e.g., entity name) */
  resource: string;

  /** Additional event details (JSON) */
  details?: Record<string, unknown>;

  // ===== Result =====

  /** Event result (success or failure) */
  result: "success" | "failure";

  /** Error message (if failed) */
  errorMessage?: string;
};

// ============================================================================
// Query Options
// ============================================================================

/**
 * List query options
 */
export type ListOptions = {
  /** Page number (1-indexed) */
  page?: number;

  /** Page size (default: 20, max: 100) */
  pageSize?: number;

  /** Sort field */
  orderBy?: string;

  /** Sort direction */
  orderDir?: "asc" | "desc";

  /** Filters (field → value map) */
  filters?: Record<string, unknown>;

  /** Include soft-deleted records */
  includeDeleted?: boolean;

  /** Limit (cursor-based pagination) */
  limit?: number;

  /** Offset (cursor-based pagination) */
  offset?: number;
};

/**
 * Paginated response
 */
export type PaginatedResponse<T> = {
  /** Data records */
  data: T[];

  /** Pagination metadata */
  meta: {
    /** Current page */
    page: number;

    /** Page size */
    pageSize: number;

    /** Total record count */
    total: number;

    /** Total page count */
    totalPages: number;

    /** Has next page */
    hasNext: boolean;

    /** Has previous page */
    hasPrev: boolean;
  };
};

// ============================================================================
// Entity and Version Models (matching Prisma schema)
// ============================================================================

/**
 * Entity record
 * Represents a top-level entity definition (Invoice, Order, etc.)
 */
export type Entity = {
  /** Entity ID */
  id: string;

  /** Entity name (unique) */
  name: string;

  /** Entity description */
  description?: string;

  /** Active version identifier (e.g., "v1") */
  activeVersion?: string;

  /** Entity kind (ref, ent, doc, fin, cfg, int) */
  kind?: string;

  /** Module ID */
  moduleId?: string | null;

  /** Physical table schema (e.g. "ref", "ent", "doc") */
  tableSchema?: string;

  /** Physical table name */
  tableName?: string;

  /** Whether entity is active */
  isActive?: boolean;

  /** Governance level (full, light, audit_only) */
  governanceLevel?: string;

  /** Engine tag for grouping (e.g. "posting-engine") */
  engineTag?: string | null;

  /** Current/latest version summary (populated by list queries) */
  currentVersion?: EntityVersionSummary | null;

  /** Number of fields in current version (populated by list queries) */
  fieldCount?: number;

  /** Number of relations in current version (populated by list queries) */
  relationCount?: number;

  /** Created at timestamp */
  createdAt: Date;

  /** Updated at timestamp */
  updatedAt: Date;

  /** Created by user */
  createdBy: string;
};

/**
 * Lightweight version summary for embedding in entity list responses
 */
export type EntityVersionSummary = {
  id: string;
  versionNo: number;
  status: string;
  label: string | null;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
};

/**
 * Entity version record
 * Represents a specific version of an entity schema
 */
export type EntityVersion = {
  /** Version ID */
  id: string;

  /** Entity name */
  entityName: string;

  /** Version identifier (e.g., "v1", "v2") */
  version: string;

  /** Entity schema (JSON) */
  schema: EntitySchema;

  /** Whether this version is active */
  isActive: boolean;

  /** Created at timestamp */
  createdAt: Date;

  /** Created by user */
  createdBy: string;
};

// ============================================================================
// Validation Result
// ============================================================================

/**
 * Validation result for schema validation
 */
export type ValidationResult = {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors (if any) */
  errors?: ValidationError[];
};

/**
 * Validation error
 */
export type ValidationError = {
  /** Field path (dot-separated) */
  field: string;

  /** Error message */
  message: string;

  /** Error code */
  code: string;

  /** Additional context */
  context?: Record<string, unknown>;
};

// ============================================================================
// Health Check
// ============================================================================

/**
 * Health check result
 */
export type HealthCheckResult = {
  /** Whether service is healthy */
  healthy: boolean;

  /** Service name */
  name?: string;

  /** Status message */
  message?: string;

  /** Error message */
  error?: string;

  /** Additional details */
  details?: Record<string, unknown>;
};

// ============================================================================
// Overlay System (Phase 10)
// ============================================================================

/**
 * Overlay change kind
 * Defines the type of modification an overlay change applies
 */
export type OverlayChangeKind =
  | "addField" // Add a new field to entity
  | "modifyField" // Modify existing field properties
  | "removeField" // Remove a field from entity
  | "tweakPolicy" // Modify policy configuration
  | "addIndex" // Add database index (future)
  | "removeIndex" // Remove database index (future)
  | "tweakRelation"; // Modify relationship (future)

/**
 * Overlay conflict resolution mode
 * Defines how to handle conflicts when applying overlays
 */
export type OverlayConflictMode =
  | "fail" // Throw error if target already exists/conflicts
  | "overwrite" // Replace existing target completely
  | "merge"; // Deep merge with existing target (for objects)

/**
 * Overlay change definition
 * Single atomic change within an overlay
 */
export type OverlayChange = {
  /** Unique change ID */
  id: string;

  /** Overlay ID this change belongs to */
  overlayId: string;

  /** Target entity version ID */
  targetEntityVersionId: string;

  /** Type of change */
  changeKind: OverlayChangeKind;

  /** Change payload (JSON) - structure depends on changeKind */
  changeJson: Record<string, unknown>;

  /** Sort order (changes applied in ascending order) */
  sortOrder: number;

  /** Conflict resolution mode */
  conflictMode: OverlayConflictMode;

  /** Created at timestamp */
  createdAt: Date;

  /** Created by user */
  createdBy: string;
};

/**
 * Overlay container
 * Groups related changes that should be applied together
 */
export type Overlay = {
  /** Unique overlay ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Overlay name */
  name: string;

  /** Overlay description */
  description?: string;

  /** Overlay status */
  status: "draft" | "published" | "archived";

  /** Changes in this overlay */
  changes?: OverlayChange[];

  /** Created at timestamp */
  createdAt: Date;

  /** Created by user */
  createdBy: string;

  /** Updated at timestamp */
  updatedAt?: Date;

  /** Updated by user */
  updatedBy?: string;
};

/**
 * Overlay set for compilation
 * Ordered list of overlay IDs to apply during compilation
 * Only published overlays are included
 */
export type OverlaySet = string[]; // Array of overlay IDs in application order

/**
 * Compiled model with overlays
 * Result of compiling base entity version + overlay set
 */
export type CompiledModelWithOverlays = {
  /** Base compiled model */
  model: CompiledModel;

  /** Overlay set that was applied */
  overlaySet: OverlaySet;

  /** Unique hash of compiled result with overlays */
  compiledHash: string;

  /** Entity version ID */
  entityVersionId: string;

  /** Generated at timestamp */
  generatedAt: Date;
};

// ============================================================================
// Policy Engine (Phase 11)
// ============================================================================

/**
 * Policy rule scope type
 * Defines the level at which a rule applies
 */
export type PolicyRuleScopeType =
  | "global" // Applies to all resources
  | "module" // Applies to a specific module
  | "entity" // Applies to a specific entity type
  | "entity_version" // Applies to a specific entity version
  | "record"; // Applies to specific records

/**
 * Policy rule subject type
 * Defines who the rule applies to
 */
export type PolicyRuleSubjectType =
  | "kc_role" // Keycloak role
  | "kc_group" // Keycloak group
  | "user" // Specific user
  | "service"; // Service account

/**
 * Policy condition type
 * Different types of conditions that can be evaluated
 */
export type PolicyConditionType =
  | "ou_check" // Organizational unit check
  | "numeric_threshold" // Numeric comparison (e.g., amount < 1000)
  | "attribute_match" // Principal attribute match
  | "record_field" // Record field check
  | "expression"; // Custom expression (future)

/**
 * OU (Organizational Unit) check mode
 */
export type OUCheckMode =
  | "single" // Must be exactly this OU
  | "subtree" // This OU or any descendant
  | "multi"; // Any of the specified OUs

/**
 * Policy condition definition
 * JSON-defined conditions that are normalized at compile time
 */
export type PolicyConditionDefinition = {
  /** Condition type */
  type: PolicyConditionType;

  /** Condition configuration (varies by type) */
  config: Record<string, unknown>;

  /** Optional description */
  description?: string;
};

/**
 * Compiled policy condition
 * Normalized and optimized for fast evaluation
 */
export type CompiledPolicyCondition = {
  /** Condition type */
  type: PolicyConditionType;

  /** Compiled evaluator function */
  evaluate: (ctx: RequestContext, record?: unknown) => boolean;

  /** Original configuration (for debugging) */
  originalConfig: Record<string, unknown>;
};

/**
 * Policy rule definition
 * Single rule within a policy
 */
export type PolicyRuleDefinition = {
  /** Rule ID */
  id: string;

  /** Policy version ID */
  policyVersionId: string;

  /** Scope */
  scopeType: PolicyRuleScopeType;
  scopeKey?: string;

  /** Subject (who the rule applies to) */
  subjectType: PolicyRuleSubjectType;
  subjectKey: string;

  /** Effect */
  effect: "allow" | "deny";

  /** Conditions */
  conditions?: PolicyConditionDefinition[];

  /** Priority (higher = evaluated first) */
  priority: number;

  /** Operations this rule grants/denies */
  operations: string[]; // Array of operation codes

  /** Optional comment */
  comment?: string;

  /** Active flag */
  isActive: boolean;
};

/**
 * Compiled policy rule
 * Optimized for fast evaluation
 */
export type CompiledPolicyRule = {
  /** Rule ID */
  id: string;

  /** Policy version ID */
  policyVersionId: string;

  /** Scope */
  scopeType: PolicyRuleScopeType;
  scopeKey?: string;

  /** Subject */
  subjectType: PolicyRuleSubjectType;
  subjectKey: string;

  /** Effect */
  effect: "allow" | "deny";

  /** Compiled conditions */
  conditions: CompiledPolicyCondition[];

  /** Priority */
  priority: number;

  /** Operations */
  operations: Set<string>; // Set for O(1) lookup

  /** Comment */
  comment?: string;
};

/**
 * Indexed policy structure
 * Organized for O(1) rule lookup by scope, operation, and subject
 */
export type IndexedPolicy = {
  /** Index by scope type + scope key */
  byScopeIndex: Map<string, CompiledPolicyRule[]>;

  /** Index by operation code */
  byOperationIndex: Map<string, CompiledPolicyRule[]>;

  /** Index by subject type + subject key */
  bySubjectIndex: Map<string, CompiledPolicyRule[]>;

  /** All rules sorted by priority (highest first) */
  allRulesByPriority: CompiledPolicyRule[];

  /** Compiled at timestamp */
  compiledAt: Date;

  /** Compiled hash (for cache invalidation) */
  compiledHash: string;
};

/**
 * Policy decision result
 * Includes decision and explanation for auditability
 */
export type PolicyDecision = {
  /** Whether action is allowed */
  allowed: boolean;

  /** Effect that determined the decision (allow/deny) */
  effect: "allow" | "deny";

  /** Rule ID that matched (if any) */
  matchedRuleId?: string;

  /** Policy version ID */
  matchedPolicyVersionId?: string;

  /** Human-readable reason */
  reason: string;

  /** All rules that were evaluated */
  evaluatedRules: Array<{
    ruleId: string;
    effect: "allow" | "deny";
    matched: boolean;
    reason?: string;
  }>;

  /** Decision timestamp */
  timestamp: Date;
};

/**
 * Permission decision log entry
 * Stored in core.permission_decision_log
 */
export type PermissionDecisionLog = {
  /** Log entry ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Timestamp */
  occurredAt: Date;

  /** Actor (user making the request) */
  actorPrincipalId?: string;
  subjectSnapshot?: Record<string, unknown>; // Roles/groups/scopes

  /** Resource being accessed */
  entityName?: string;
  entityId?: string;
  entityVersionId?: string;

  /** Operation being performed */
  operationCode: string;

  /** Decision */
  effect: "allow" | "deny";

  /** Matched rule */
  matchedRuleId?: string;
  matchedPolicyVersionId?: string;

  /** Reason */
  reason?: string;

  /** Request correlation ID */
  correlationId?: string;
};

// ============================================================================
// Phase 12: Workflow Runtime — Lifecycles
// ============================================================================

/**
 * Lifecycle Definition
 *
 * Represents a state machine for entity lifecycle management.
 * Example: Draft → Pending → Approved → Published
 */
export type Lifecycle = {
  /** Unique lifecycle ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Lifecycle code (stable identifier) */
  code: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Version number */
  versionNo: number;

  /** Active status */
  isActive: boolean;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle State
 *
 * Represents a state within a lifecycle (e.g., DRAFT, PENDING, APPROVED).
 */
export type LifecycleState = {
  /** Unique state ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent lifecycle ID */
  lifecycleId: string;

  /** State code (DRAFT/PENDING/APPROVED/etc.) */
  code: string;

  /** Display name */
  name: string;

  /** Terminal state (no further transitions allowed) */
  isTerminal: boolean;

  /** Sort order for UI display */
  sortOrder: number;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle Transition
 *
 * Represents an allowed state transition with an operation code.
 * Example: DRAFT → PENDING via SUBMIT operation
 */
export type LifecycleTransition = {
  /** Unique transition ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent lifecycle ID */
  lifecycleId: string;

  /** Source state ID */
  fromStateId: string;

  /** Target state ID */
  toStateId: string;

  /** Operation code (SUBMIT/APPROVE/REJECT/CANCEL/etc.) */
  operationCode: string;

  /** Active status */
  isActive: boolean;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle Transition Gate
 *
 * Represents authorization and approval requirements for a transition.
 * Gates must pass before transition is allowed.
 */
export type LifecycleTransitionGate = {
  /** Unique gate ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent transition ID */
  transitionId: string;

  /** Required permission operation codes */
  requiredOperations?: string[];

  /** Approval template ID (if approval required) */
  approvalTemplateId?: string;

  /** Condition rules (JSON) */
  conditions?: Record<string, unknown>;

  /** Threshold rules (e.g., amount limits) */
  thresholdRules?: Record<string, unknown>;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Template
 *
 * Defines a multi-stage approval workflow.
 */
export type ApprovalTemplate = {
  /** Unique template ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Template code (stable identifier) */
  code: string;

  /** Display name */
  name: string;

  /** Behaviors (JSON) */
  behaviors?: Record<string, unknown>;

  /** Escalation style */
  escalationStyle?: string;

  /** Version number (1-indexed) */
  versionNo: number;

  /** Is this the active version? */
  isActive: boolean;

  /** Compiled template artifact (JSON) */
  compiledJson?: Record<string, unknown>;

  /** SHA-256 hash of compiled artifact */
  compiledHash?: string;

  /** Last updated timestamp */
  updatedAt?: Date;

  /** User who last updated */
  updatedBy?: string;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Template Stage
 *
 * Represents a stage in a multi-stage approval workflow.
 */
export type ApprovalTemplateStage = {
  /** Unique stage ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent template ID */
  approvalTemplateId: string;

  /** Stage number (1-indexed) */
  stageNo: number;

  /** Display name */
  name?: string;

  /** Execution mode */
  mode: "serial" | "parallel";

  /** Quorum rules (JSON) */
  quorum?: Record<string, unknown>;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Template Rule
 *
 * Defines how to assign approvers based on conditions.
 */
export type ApprovalTemplateRule = {
  /** Unique rule ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent template ID */
  approvalTemplateId: string;

  /** Priority (lower = higher priority) */
  priority: number;

  /** Condition rules (OU/amount/etc.) */
  conditions: Record<string, unknown>;

  /** Assignment mapping (role/group/principal) */
  assignTo: Record<string, unknown>;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

// ============================================================================
// Phase 12.1: Entity Lifecycle Routing
// ============================================================================

/**
 * Entity Lifecycle
 *
 * Maps an entity to a lifecycle with optional conditions and priority.
 * Used by the lifecycle route compiler to resolve which lifecycle applies.
 */
export type EntityLifecycle = {
  /** Unique mapping ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name (e.g., "PurchaseOrder") */
  entityName: string;

  /** Lifecycle ID */
  lifecycleId: string;

  /** Condition rules (JSON) */
  conditions?: Record<string, unknown>;

  /** Priority (lower = higher priority) */
  priority: number;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Compiled Lifecycle Route
 *
 * Result of lifecycle route compilation for an entity.
 * Contains indexed structure for fast runtime resolution.
 */
export type CompiledLifecycleRoute = {
  /** Entity name */
  entityName: string;

  /** Ordered list of lifecycle rules by priority */
  rules: Array<{
    lifecycleId: string;
    conditions?: Record<string, unknown>;
    priority: number;
  }>;

  /** Default lifecycle (if no conditions match) */
  defaultLifecycleId?: string;

  /** Compilation metadata */
  compiledHash: string;
  generatedAt: Date;
};

/**
 * Entity Lifecycle Route Compiled (Database Record)
 *
 * Stored compiled lifecycle route for fast runtime lookup.
 */
export type EntityLifecycleRouteCompiled = {
  /** Unique record ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Compiled route (JSON) */
  compiledJson: CompiledLifecycleRoute;

  /** Compiled hash (for caching) */
  compiledHash: string;

  /** Generation timestamp */
  generatedAt: Date;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

// ============================================================================
// Phase 12.2: Lifecycle Runtime Instances
// ============================================================================

/**
 * Entity Lifecycle Instance
 *
 * Tracks the current lifecycle state for an entity record.
 * One instance per entity record.
 */
export type EntityLifecycleInstance = {
  /** Unique instance ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Current lifecycle ID */
  lifecycleId: string;

  /** Current state ID */
  stateId: string;

  /** Last update timestamp */
  updatedAt: Date;

  /** Last update actor */
  updatedBy: string;
};

/**
 * Entity Lifecycle Event
 *
 * Audit trail for lifecycle state transitions.
 * Append-only log of all transitions.
 */
export type EntityLifecycleEvent = {
  /** Unique event ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Lifecycle ID */
  lifecycleId: string;

  /** Previous state ID (null for initial state) */
  fromStateId?: string;

  /** New state ID */
  toStateId: string;

  /** Operation code (SUBMIT/APPROVE/REJECT/etc.) */
  operationCode: string;

  /** Event timestamp */
  occurredAt: Date;

  /** Actor (user who initiated transition) */
  actorId?: string;

  /** Additional payload data */
  payload?: Record<string, unknown>;

  /** Request correlation ID */
  correlationId?: string;
};

/**
 * Lifecycle Transition Request
 *
 * Request to transition an entity to a new state.
 */
export type LifecycleTransitionRequest = {
  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Operation code (SUBMIT/APPROVE/REJECT/etc.) */
  operationCode: string;

  /** Additional payload data */
  payload?: Record<string, unknown>;

  /** Request context */
  ctx: RequestContext;
};

/**
 * Lifecycle Transition Result
 *
 * Result of a lifecycle transition attempt.
 */
export type LifecycleTransitionResult = {
  /** Success flag */
  success: boolean;

  /** New state ID (if successful) */
  newStateId?: string;

  /** New state code */
  newStateCode?: string;

  /** Error message (if failed) */
  error?: string;

  /** Reason for failure */
  reason?: string;

  /** Lifecycle event ID (if successful) */
  eventId?: string;
};

// ============================================================================
// Lifecycle Timer Types (Auto-Transitions)
// ============================================================================

/**
 * Lifecycle Timer Type
 *
 * Type of automated lifecycle timer action.
 */
export type LifecycleTimerType =
  | "auto_close" // Automatically close/complete entity after period
  | "auto_cancel" // Automatically cancel entity after period
  | "reminder" // Send reminder notification
  | "auto_transition"; // Generic auto-transition to target state

/**
 * Lifecycle Timer Policy
 *
 * Defines timer rules for automatic state transitions.
 * Stored in meta.lifecycle_timer_policy table.
 */
export type LifecycleTimerPolicy = {
  /** Unique policy ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Policy code (unique within tenant) */
  code: string;

  /** Human-readable policy name */
  name: string;

  /** Timer rules configuration */
  rules: LifecycleTimerRules;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle Timer Rules
 *
 * Configuration for timer scheduling and execution.
 */
export type LifecycleTimerRules = {
  /** Type of timer */
  timerType: LifecycleTimerType;

  /** Trigger conditions - state codes that trigger this timer */
  triggerOnStateEntry?: string[];

  /** Trigger conditions - transition operation codes that trigger this timer */
  triggerOnTransition?: string[];

  /** Delay calculation type */
  delayType: "fixed" | "field_relative" | "sla";

  /** Fixed delay in milliseconds (for delayType: "fixed") */
  delayMs?: number;

  /** Field to calculate delay from (for delayType: "field_relative") */
  delayFromField?: string;

  /** Offset to add/subtract from field value in ms (for delayType: "field_relative") */
  delayOffsetMs?: number;

  /** Target transition ID to execute when timer fires */
  targetTransitionId?: string;

  /** Target operation code to execute (alternative to transition ID) */
  targetOperationCode?: string;

  /** Conditions that must be met when timer fires (evaluated at fire time) */
  conditions?: ConditionGroup;

  /** Cancel timer if entity transitions to any state */
  cancelOnAnyTransition?: boolean;

  /** Cancel timer if entity enters these states */
  cancelOnStates?: string[];
};

/**
 * Lifecycle Timer Schedule
 *
 * Represents an active scheduled timer for an entity instance.
 * Stored in core.lifecycle_timer_schedule table.
 */
export type LifecycleTimerSchedule = {
  /** Unique schedule ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Lifecycle ID */
  lifecycleId: string;

  /** State ID when timer was scheduled */
  stateId: string;

  /** Timer type */
  timerType: LifecycleTimerType;

  /** Transition ID to execute (optional) */
  transitionId?: string;

  /** When timer was scheduled */
  scheduledAt: Date;

  /** When timer should fire */
  fireAt: Date;

  /** BullMQ job ID (for cancellation) */
  jobId: string;

  /** Policy ID that created this timer (optional - may be null if policy deleted) */
  policyId?: string;

  /** Immutable snapshot of policy rules at scheduling time */
  policySnapshot: LifecycleTimerRules;

  /** Timer status */
  status: "scheduled" | "fired" | "canceled";

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Lifecycle Timer Payload
 *
 * BullMQ job payload for timer execution.
 */
export type LifecycleTimerPayload = {
  /** Schedule ID */
  scheduleId: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Timer type */
  timerType: LifecycleTimerType;

  /** Policy snapshot */
  policySnapshot: LifecycleTimerRules;
};

// ============================================================================
// Phase 13: Approval Runtime (Multi-Stage Approvals with BullMQ)
// ============================================================================

/**
 * Approval Instance
 *
 * Represents an approval workflow instance for a lifecycle transition.
 * Tracks overall approval status and links to entity and transition.
 */
export type ApprovalInstance = {
  /** Unique instance ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Transition ID that triggered this approval */
  transitionId?: string;

  /** Approval template ID */
  approvalTemplateId?: string;

  /** Overall status (uses spec-locked union; "rejected" maps from DB "canceled" + reason) */
  status: ApprovalInstanceStatus;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Stage
 *
 * Represents a stage in a multi-stage approval workflow.
 * Stages can be serial (one at a time) or parallel (all at once).
 */
export type ApprovalStage = {
  /** Unique stage ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent approval instance ID */
  approvalInstanceId: string;

  /** Stage number (1-indexed) */
  stageNo: number;

  /** Execution mode */
  mode: "serial" | "parallel";

  /** Stage status */
  status: "open" | "completed" | "canceled";

  /** Audit fields */
  createdAt: Date;
};

/**
 * Approval Task
 *
 * Represents an individual approval task assigned to a principal or group.
 */
export type ApprovalTask = {
  /** Unique task ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Parent approval instance ID */
  approvalInstanceId: string;

  /** Parent approval stage ID */
  approvalStageId: string;

  /** Assignee principal ID (if assigned to user) */
  assigneePrincipalId?: string;

  /** Assignee group ID (if assigned to group) */
  assigneeGroupId?: string;

  /** Task type */
  taskType: "approver" | "reviewer" | "watcher";

  /** Task status */
  status: "pending" | "approved" | "rejected" | "canceled" | "expired";

  /** Due date */
  dueAt?: Date;

  /** Decision timestamp */
  decidedAt?: Date;

  /** Decision made by */
  decidedBy?: string;

  /** Decision note */
  decisionNote?: string;

  /** Audit fields */
  createdAt: Date;
};

/**
 * Approval Assignment Snapshot
 *
 * Captures the resolved assignment details when task is created.
 * Immutable record of why/how the task was assigned.
 */
export type ApprovalAssignmentSnapshot = {
  /** Unique snapshot ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Approval task ID */
  approvalTaskId: string;

  /** Resolved assignment details (JSON) */
  resolvedAssignment: Record<string, unknown>;

  /** Rule ID that matched */
  resolvedFromRuleId?: string;

  /** Template version used */
  resolvedFromVersionId?: string;

  /** Audit fields */
  createdAt: Date;
  createdBy: string;
};

/**
 * Approval Escalation
 *
 * Tracks escalation events (reminders, escalations, reassignments).
 */
export type ApprovalEscalation = {
  /** Unique escalation ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Approval instance ID */
  approvalInstanceId: string;

  /** Escalation kind */
  kind: "reminder" | "escalation" | "reassign";

  /** Escalation payload (JSON) */
  payload?: Record<string, unknown>;

  /** Occurred timestamp */
  occurredAt: Date;
};

/**
 * Approval Event
 *
 * Audit trail for approval-related events.
 */
export type ApprovalEvent = {
  /** Unique event ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Approval instance ID */
  approvalInstanceId?: string;

  /** Approval task ID */
  approvalTaskId?: string;

  /** Event type */
  eventType: string;

  /** Event payload (JSON) */
  payload?: Record<string, unknown>;

  /** Occurred timestamp */
  occurredAt: Date;

  /** Actor ID */
  actorId?: string;

  /** Correlation ID */
  correlationId?: string;
};

/**
 * Approval Decision Request
 *
 * Request to make an approval decision on a task.
 */
export type ApprovalDecisionRequest = {
  /** Approval task ID */
  taskId: string;

  /** Decision (approve or reject) */
  decision: "approve" | "reject";

  /** Optional decision note */
  note?: string;

  /** Request context */
  ctx: RequestContext;
};

/**
 * Approval Decision Result
 *
 * Result of an approval decision.
 */
export type ApprovalDecisionResult = {
  /** Success flag */
  success: boolean;

  /** Task ID */
  taskId: string;

  /** New task status */
  taskStatus?: string;

  /** Stage status (if stage completed) */
  stageStatus?: string;

  /** Instance status (if instance completed) — uses finalized spec union */
  instanceStatus?: ApprovalInstanceStatus;

  /** Whether lifecycle transition was triggered */
  transitionTriggered?: boolean;

  /** Error message (if failed) */
  error?: string;

  /** Reason */
  reason?: string;
};

/**
 * Approval Creation Request
 *
 * Request to create an approval instance for a lifecycle transition.
 */
export type ApprovalCreationRequest = {
  /** Entity name */
  entityName: string;

  /** Entity record ID */
  entityId: string;

  /** Transition ID */
  transitionId: string;

  /** Approval template ID */
  approvalTemplateId: string;

  /** Request context */
  ctx: RequestContext;

  /** Additional context for assignment resolution */
  assignmentContext?: Record<string, unknown>;
};

/**
 * Approval Creation Result
 *
 * Result of creating an approval instance.
 */
export type ApprovalCreationResult = {
  /** Success flag */
  success: boolean;

  /** Approval instance ID */
  instanceId?: string;

  /** Number of stages created */
  stageCount?: number;

  /** Number of tasks created */
  taskCount?: number;

  /** Error message (if failed) */
  error?: string;
};

// ============================================================================
// Approvable Core Engine — Entity Classification
// ============================================================================

/**
 * Entity classification determines system header columns and behaviors.
 * Maps to meta.entity.kind in DB: ref/mdm -> MASTER, ent -> CONTROL, doc -> DOCUMENT
 */
export type EntityClass = "MASTER" | "CONTROL" | "DOCUMENT";

/**
 * Feature flags resolved per entity classification and metadata config.
 * Stored in meta.entity.feature_flags JSONB column.
 */
export type EntityFeatureFlags = {
  /** Entity class (resolved from meta.entity.kind) */
  entity_class?: EntityClass;

  /** Whether approval workflow is required for lifecycle transitions */
  approval_required?: boolean;

  /** Whether automatic numbering is enabled (DOCUMENT class) */
  numbering_enabled?: boolean;

  /** Whether effective dating columns are active (flag-driven for all classes) */
  effective_dating_enabled?: boolean;

  /** Versioning mode */
  versioning_mode?: "none" | "sequential" | "major_minor";
};

/**
 * Default feature flags when none are configured.
 */
export const DEFAULT_ENTITY_FEATURE_FLAGS: Required<EntityFeatureFlags> = {
  entity_class: undefined as unknown as EntityClass,
  approval_required: false,
  numbering_enabled: false,
  effective_dating_enabled: false,
  versioning_mode: "none",
};

// ============================================================================
// Approvable Core Engine — Approval Status Types (Spec-Locked)
// ============================================================================

/**
 * Approval instance status (spec-locked).
 * Canonical spelling: "canceled" (US, matches DB CHECK constraint).
 * "rejected" maps to DB "canceled" + context.reason = "rejected".
 */
export type ApprovalInstanceStatus =
  | "open"
  | "completed"
  | "rejected"
  | "canceled";

/**
 * Approval task status (spec-locked).
 */
export type ApprovalTaskStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "skipped";

// ============================================================================
// Approvable Core Engine — Numbering Engine
// ============================================================================

/**
 * Reset policy for numbering sequences.
 */
export type NumberingResetPolicy = "none" | "yearly" | "monthly" | "daily";

/**
 * Numbering rule definition stored in meta.entity.naming_policy JSONB.
 * Defines pattern, reset behavior, and sequence parameters.
 */
export type NumberingRule = {
  /** Unique rule code */
  code: string;

  /** Pattern with placeholders: {YYYY}, {MM}, {DD}, {SEQ:N} (N = zero-pad width) */
  pattern: string;

  /** When to reset the sequence counter */
  reset_policy: NumberingResetPolicy;

  /** Starting sequence number */
  seq_start: number;

  /** Sequence increment */
  seq_increment: number;

  /** Whether this rule is active */
  is_active: boolean;
};

/**
 * Numbering sequence counter (DB row in meta.numbering_sequence).
 */
export type NumberingSequence = {
  id: string;
  tenant_id: string;
  entity_name: string;
  period_key: string; // "__global__" | "YYYY" | "YYYY-MM" | "YYYY-MM-DD"
  current_value: number;
  updated_at: Date;
};

// ============================================================================
// Approvable Core Engine — Effective Dating
// ============================================================================

/**
 * Extended list options with effective dating support.
 */
export type EffectiveDatedListOptions = ListOptions & {
  /** Point-in-time date for effective dating filter */
  asOfDate?: Date;
};

// ============================================================================
// EPIC G — Approval Template Authoring
// ============================================================================

/**
 * Input for creating an approval template with stages and rules.
 */
export type ApprovalTemplateCreateInput = {
  /** Stable template code */
  code: string;

  /** Display name */
  name: string;

  /** Behavioral flags (JSON) */
  behaviors?: Record<string, unknown>;

  /** Escalation style */
  escalationStyle?: string;

  /** Stages to create with the template */
  stages: Array<{
    stageNo: number;
    name?: string;
    mode: "serial" | "parallel";
    quorum?: Record<string, unknown>;
  }>;

  /** Routing rules to create with the template */
  rules: Array<{
    priority: number;
    conditions: Record<string, unknown>;
    assignTo: Record<string, unknown>;
  }>;
};

/**
 * Input for updating an approval template.
 */
export type ApprovalTemplateUpdateInput = Partial<
  Omit<ApprovalTemplateCreateInput, "code">
>;

/**
 * Result of template structural validation.
 */
export type TemplateValidationResult = {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
};

/**
 * Compiled approval template artifact.
 */
export type CompiledApprovalTemplate = {
  templateId: string;
  code: string;
  version: number;
  stages: ApprovalTemplateStage[];
  rules: ApprovalTemplateRule[];
  compiledHash: string;
  compiledAt: Date;
};

// ============================================================================
// EPIC H — Lifecycle Gate Evaluation
// ============================================================================

/**
 * Threshold rule for gate evaluation.
 * Defines a numeric condition on an entity field that must pass for a transition.
 */
export type ThresholdRule = {
  /** Entity field path (e.g., "amount", "risk_score") */
  field: string;

  /** Comparison operator */
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "ne" | "between";

  /** Threshold value or range (for "between") */
  value: number | [number, number];

  /** Action when threshold is NOT met */
  action: "block" | "require_approval";

  /** Human-readable reason for the block */
  reason?: string;
};

/**
 * Gate decision result with detailed evaluation trace.
 */
export type GateDecision = {
  allowed: boolean;
  reason?: string;
  reasonCodes: string[];
  thresholdResults?: Array<{
    rule: ThresholdRule;
    passed: boolean;
    actualValue: unknown;
  }>;
  conditionResults?: Array<{
    passed: boolean;
    reason?: string;
  }>;
};

// Note: All types are already exported inline above
// No need for duplicate exports here
