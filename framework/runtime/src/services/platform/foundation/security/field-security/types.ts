/**
 * Field-Level Security Types
 *
 * Types for Column Level Security (Field-level access control).
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Masking strategy for read access
 */
export type MaskStrategy = "null" | "redact" | "hash" | "partial" | "remove";

/**
 * Policy type (what access is being controlled)
 */
export type PolicyType = "read" | "write" | "both";

/**
 * Policy scope (hierarchy level)
 * record > entity_version > entity > module > global
 */
export type PolicyScope = "global" | "module" | "entity" | "entity_version" | "record";

/**
 * Subject type (who is accessing)
 */
export type SubjectType = "user" | "service" | "system";

// ============================================================================
// ABAC Condition Types
// ============================================================================

/**
 * ABAC comparison operators
 */
export type AbacComparison =
  | "eq"       // Equal
  | "neq"      // Not equal
  | "in"       // In array
  | "nin"      // Not in array
  | "gt"       // Greater than
  | "gte"      // Greater than or equal
  | "lt"       // Less than
  | "lte"      // Less than or equal
  | "contains" // String contains
  | "starts"   // String starts with
  | "ends"     // String ends with
  | "matches"; // Regex match

/**
 * ABAC logical operators
 */
export type AbacOperator = "and" | "or" | "not";

/**
 * ABAC condition for attribute-based access control
 */
export interface AbacCondition {
  /** Logical operator for combining conditions */
  operator?: AbacOperator;

  /** Nested conditions (for and/or/not operators) */
  conditions?: AbacCondition[];

  /** Attribute path on subject (e.g., "roles", "attributes.department") */
  attribute?: string;

  /** Comparison operator */
  comparison?: AbacComparison;

  /** Value to compare against */
  value?: unknown;
}

// ============================================================================
// Masking Configuration
// ============================================================================

/**
 * Configuration for masking strategies
 */
export interface MaskConfig {
  // For 'partial' strategy
  /** Number of characters to keep visible */
  visibleChars?: number;
  /** Position of visible characters */
  position?: "start" | "end";
  /** Character to use for masking */
  maskChar?: string;

  // For 'hash' strategy
  /** Hash algorithm */
  algorithm?: "sha256" | "md5" | "sha1";
  /** Salt for hashing (if not provided, uses a default) */
  salt?: string;
  /** Length of hash output */
  hashLength?: number;

  // For 'redact' strategy
  /** Replacement string */
  replacement?: string;
}

// ============================================================================
// Policy Types
// ============================================================================

/**
 * Field security policy from database
 */
export interface FieldSecurityPolicy {
  /** Unique policy ID */
  id: string;

  /** Entity ID this policy applies to */
  entityId: string;

  /** Field path (e.g., "ssn", "address.zipCode") */
  fieldPath: string;

  /** Policy type: read, write, or both */
  policyType: PolicyType;

  /** Simple role-based access: array of role codes that have access */
  roleList?: string[];

  /** ABAC expression for fine-grained control */
  abacCondition?: AbacCondition;

  /** Masking strategy for read access */
  maskStrategy?: MaskStrategy;

  /** Masking configuration */
  maskConfig?: MaskConfig;

  /** Policy scope */
  scope: PolicyScope;

  /** Scope reference ID (module_id, version_id, record_id) */
  scopeRef?: string;

  /** Priority (lower = evaluated first) */
  priority: number;

  /** Whether policy is active */
  isActive: boolean;

  /** Tenant ID */
  tenantId: string;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;

  /** Created by user ID */
  createdBy?: string;

  /** Updated by user ID */
  updatedBy?: string;

  /** Version for optimistic locking */
  version: number;
}

// ============================================================================
// Access Decision Types
// ============================================================================

/**
 * Result of checking field access
 */
export interface FieldAccessDecision {
  /** Whether access is allowed */
  allowed: boolean;

  /** Masking strategy to apply (if allowed but masked) */
  maskStrategy?: MaskStrategy;

  /** Masking configuration */
  maskConfig?: MaskConfig;

  /** Policy ID that determined this decision */
  policyId?: string;

  /** Reason for decision */
  reason?: string;
}

/**
 * Result of filtering fields
 */
export interface FieldFilterResult {
  /** Filtered record */
  record: Record<string, unknown>;

  /** Fields that were allowed */
  allowedFields: string[];

  /** Fields that were masked */
  maskedFields: string[];

  /** Fields that were removed */
  removedFields: string[];
}

// ============================================================================
// Audit Types
// ============================================================================

/**
 * Field access audit entry
 */
export interface FieldAccessAuditEntry {
  /** Entity key that was accessed */
  entityKey: string;

  /** Specific record ID (if applicable) */
  recordId?: string;

  /** Subject ID (user/service) that accessed */
  subjectId: string;

  /** Subject type */
  subjectType: SubjectType;

  /** Access action */
  action: "read" | "write";

  /** Field that was accessed */
  fieldPath: string;

  /** Whether access was allowed */
  wasAllowed: boolean;

  /** Masking strategy applied (if any) */
  maskApplied?: MaskStrategy;

  /** Policy that determined the decision */
  policyId?: string;

  /** Request correlation ID */
  requestId?: string;

  /** OpenTelemetry trace ID */
  traceId?: string;

  /** Tenant ID */
  tenantId: string;
}

// ============================================================================
// Input/Query Types
// ============================================================================

/**
 * Input for creating a field security policy
 */
export interface CreateFieldSecurityPolicyInput {
  /** Entity ID */
  entityId: string;

  /** Field path */
  fieldPath: string;

  /** Policy type */
  policyType: PolicyType;

  /** Role list (for simple role-based access) */
  roleList?: string[];

  /** ABAC condition (for attribute-based access) */
  abacCondition?: AbacCondition;

  /** Masking strategy */
  maskStrategy?: MaskStrategy;

  /** Masking configuration */
  maskConfig?: MaskConfig;

  /** Policy scope */
  scope?: PolicyScope;

  /** Scope reference */
  scopeRef?: string;

  /** Priority */
  priority?: number;
}

/**
 * Input for updating a field security policy
 */
export interface UpdateFieldSecurityPolicyInput {
  /** Role list */
  roleList?: string[];

  /** ABAC condition */
  abacCondition?: AbacCondition;

  /** Masking strategy */
  maskStrategy?: MaskStrategy;

  /** Masking configuration */
  maskConfig?: MaskConfig;

  /** Priority */
  priority?: number;

  /** Active status */
  isActive?: boolean;
}

/**
 * Options for listing policies
 */
export interface ListFieldSecurityPoliciesOptions {
  /** Filter by entity ID */
  entityId?: string;

  /** Filter by field path */
  fieldPath?: string;

  /** Filter by policy type */
  policyType?: PolicyType;

  /** Filter by scope */
  scope?: PolicyScope;

  /** Filter by active status */
  isActive?: boolean;

  /** Pagination limit */
  limit?: number;

  /** Pagination offset */
  offset?: number;
}

/**
 * Options for getting access log
 */
export interface GetAccessLogOptions {
  /** Filter by subject ID */
  subjectId?: string;

  /** Filter by record ID */
  recordId?: string;

  /** Filter by action */
  action?: "read" | "write";

  /** Filter by allowed status */
  wasAllowed?: boolean;

  /** Filter by time range (since) */
  since?: Date;

  /** Filter by time range (until) */
  until?: Date;

  /** Pagination limit */
  limit?: number;

  /** Pagination offset */
  offset?: number;
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Context for field access checks
 */
export interface FieldAccessContext {
  /** Tenant ID */
  tenantId: string;

  /** Specific record ID (if applicable) */
  recordId?: string;

  /** Request correlation ID */
  requestId?: string;

  /** OpenTelemetry trace ID */
  traceId?: string;

  /** Additional context attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Subject snapshot (identity picture at time of access)
 */
export interface SubjectSnapshot {
  /** Subject ID */
  id: string;

  /** Subject type */
  type: SubjectType;

  /** Tenant ID */
  tenantId: string;

  /** Assigned roles */
  roles: string[];

  /** Group memberships */
  groups?: string[];

  /** OU membership */
  ouMembership?: {
    nodeId: string;
    path: string;
  };

  /** ABAC attributes */
  attributes?: Record<string, unknown>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when field access is denied
 */
export class FieldAccessDeniedError extends Error {
  constructor(
    public readonly fieldPath: string,
    public readonly action: "read" | "write",
    public readonly reason?: string
  ) {
    super(`Access denied for ${action} on field: ${fieldPath}${reason ? ` (${reason})` : ""}`);
    this.name = "FieldAccessDeniedError";
  }
}

/**
 * Error thrown when policy validation fails
 */
export class PolicyValidationError extends Error {
  constructor(
    public readonly errors: Array<{ field: string; message: string }>,
    message?: string
  ) {
    super(message || `Policy validation failed: ${errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`);
    this.name = "PolicyValidationError";
  }
}
