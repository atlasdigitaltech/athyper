/**
 * Policy Gate Types
 *
 * A0: Authorization Contract
 * Defines types for operations, resources, subjects, and decisions
 */

// ============================================================================
// Operation Namespace & Codes
// ============================================================================

/**
 * Operation namespaces (matches DB constraint)
 */
export type OperationNamespace =
  | "ENTITY"
  | "WORKFLOW"
  | "UTIL"
  | "DELEGATION"
  | "COLLAB";

/**
 * Entity operations
 */
export const ENTITY_OPERATIONS = {
  READ: "READ",
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  LIST: "LIST",
  EXPORT: "EXPORT",
  IMPORT: "IMPORT",
} as const;

/**
 * Workflow operations
 */
export const WORKFLOW_OPERATIONS = {
  SUBMIT: "SUBMIT",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  CANCEL: "CANCEL",
  REASSIGN: "REASSIGN",
  ESCALATE: "ESCALATE",
} as const;

/**
 * Utility operations
 */
export const UTIL_OPERATIONS = {
  ADMIN: "ADMIN",
  CONFIG: "CONFIG",
  AUDIT_VIEW: "AUDIT_VIEW",
} as const;

/**
 * Delegation operations
 */
export const DELEGATION_OPERATIONS = {
  DELEGATE: "DELEGATE",
  REVOKE_DELEGATION: "REVOKE_DELEGATION",
} as const;

/**
 * Collaboration operations
 */
export const COLLAB_OPERATIONS = {
  SHARE: "SHARE",
  COMMENT: "COMMENT",
  MENTION: "MENTION",
} as const;

/**
 * Operation code (namespace:code format)
 */
export type OperationCode = `${OperationNamespace}.${string}`;

/**
 * Operation info
 */
export type OperationInfo = {
  id: string;
  namespace: OperationNamespace;
  code: string;
  fullCode: OperationCode;
  name: string;
  description?: string;
  isActive: boolean;
};

// ============================================================================
// Resource Descriptor
// ============================================================================

/**
 * Resource scope types (matches DB constraint)
 */
export type ScopeType =
  | "global"
  | "module"
  | "entity"
  | "entity_version"
  | "record";

/**
 * Resource descriptor - identifies what is being accessed
 */
export type ResourceDescriptor = {
  /** Entity code (required) */
  entityCode: string;

  /** Module code */
  moduleCode?: string;

  /** Entity version ID (for entity_version scope) */
  entityVersionId?: string;

  /** Record ID (for record scope) */
  recordId?: string;

  /** Owner ID (for record-level ABAC) */
  ownerId?: string;

  /** Additional resource attributes for ABAC */
  attributes?: Record<string, unknown>;
};

// ============================================================================
// Subject (Who is requesting)
// ============================================================================

/**
 * Subject types (matches DB constraint)
 */
export type SubjectType = "kc_role" | "kc_group" | "user" | "service";

/**
 * Subject key format
 */
export type SubjectKey = {
  type: SubjectType;
  key: string;
};

/**
 * Subject snapshot - all identities/roles/groups for a principal
 */
export type SubjectSnapshot = {
  /** Principal ID */
  principalId: string;

  /** Principal type */
  principalType: string;

  /** Tenant ID */
  tenantId: string;

  /** User subject key */
  userKey: string;

  /** Service key (if service account) */
  serviceKey?: string;

  /** Role codes */
  roles: string[];

  /** Group codes */
  groups: string[];

  /** OU membership */
  ouMembership?: {
    nodeId: string;
    path: string;
    code: string;
  };

  /** ABAC attributes */
  attributes: Record<string, string>;

  /** Generated at */
  generatedAt: Date;
};

// ============================================================================
// Rule & Policy
// ============================================================================

/**
 * Effect type
 */
export type Effect = "allow" | "deny";

/**
 * Condition operator
 */
export type ConditionOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "matches"
  | "exists"
  | "not_exists";

/**
 * Single condition
 */
export type Condition = {
  /** Field path (e.g., "subject.attributes.department") */
  field: string;

  /** Operator */
  operator: ConditionOperator;

  /** Value to compare */
  value: unknown;
};

/**
 * Condition group (AND/OR)
 */
export type ConditionGroup = {
  /** Logical operator */
  operator: "and" | "or";

  /** Conditions */
  conditions: Array<Condition | ConditionGroup>;
};

/**
 * ABAC conditions (can be single condition, group, or null)
 */
export type ABACConditions = Condition | ConditionGroup | null;

/**
 * Permission rule
 */
export type PermissionRuleInfo = {
  id: string;
  policyVersionId: string;
  scopeType: ScopeType;
  scopeKey: string | null;
  subjectType: SubjectType;
  subjectKey: string;
  effect: Effect;
  conditions: ABACConditions;
  priority: number;
  isActive: boolean;
  operations: string[]; // Operation IDs
};

/**
 * Compiled rule (optimized for evaluation)
 */
export type CompiledRule = {
  ruleId: string;
  effect: Effect;
  priority: number;
  conditions?: ConditionGroup;
  operationConstraints?: Record<string, unknown>;
};

/**
 * Compiled policy (indexed by scope + subject + operation)
 */
export type CompiledPolicy = {
  policyVersionId: string;
  policyId: string;
  tenantId: string;
  scopeType: ScopeType;
  scopeKey: string | null;
  compiledAt: Date;
  hash: string;

  /**
   * Indexed rules by: scopeType:scopeKey -> subjectType:subjectKey -> operationId -> rules[]
   */
  ruleIndex: {
    [scopeKey: string]: {
      [subjectKey: string]: {
        [operationId: string]: CompiledRule[];
      };
    };
  };
};

// ============================================================================
// Authorization Request & Decision
// ============================================================================

/**
 * Authorization request
 */
export type AuthorizationRequest = {
  /** Tenant ID */
  tenantId: string;

  /** Principal ID */
  principalId: string;

  /** Operation code (e.g., "ENTITY.READ") */
  operationCode: OperationCode;

  /** Resource being accessed */
  resource: ResourceDescriptor;

  /** Request context (IP, time, etc.) */
  context?: {
    ipAddress?: string;
    userAgent?: string;
    timestamp?: Date;
    correlationId?: string;
    [key: string]: unknown;
  };
};

/**
 * Authorization decision
 */
export type AuthorizationDecision = {
  /** Effect (allow/deny) */
  effect: Effect;

  /** Principal ID */
  principalId: string;

  /** Operation code */
  operationCode: string;

  /** Resource key (formatted) */
  resourceKey: string;

  /** Matched rule ID (if any) */
  matchedRuleId?: string;

  /** Matched policy version ID (if any) */
  matchedPolicyVersionId?: string;

  /** Reason for decision */
  reason: string;

  /** Evaluation time in milliseconds */
  evaluationTimeMs?: number;

  /** Correlation ID for tracing */
  correlationId?: string;
};

// ============================================================================
// Policy Gate Interface
// ============================================================================

/**
 * Policy Gate interface
 */
export interface IPolicyGate {
  /**
   * Authorize a request
   */
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;

  /**
   * Check if principal has permission (convenience method)
   */
  hasPermission(
    tenantId: string,
    principalId: string,
    operationCode: OperationCode,
    resource: ResourceDescriptor
  ): Promise<boolean>;

  /**
   * Get subject snapshot for principal
   */
  getSubjectSnapshot(principalId: string, tenantId: string): Promise<SubjectSnapshot>;
}
