/**
 * Persona Model Types
 *
 * Defines the Permission Action Model with personas, operations, and capabilities.
 */

// ============================================================================
// Persona Types
// ============================================================================

/**
 * Persona codes (predefined roles with capability sets)
 */
export type PersonaCode =
  | "viewer"
  | "reporter"
  | "requester"
  | "agent"
  | "manager"
  | "module_admin"
  | "tenant_admin";

/**
 * All persona codes as array (for iteration)
 */
export const PERSONA_CODES: PersonaCode[] = [
  "viewer",
  "reporter",
  "requester",
  "agent",
  "manager",
  "module_admin",
  "tenant_admin",
];

/**
 * Scope mode determines how a persona's access is bounded
 */
export type ScopeMode = "tenant" | "ou" | "module";

/**
 * Persona definition
 */
export interface Persona {
  id: string;
  code: PersonaCode;
  name: string;
  description?: string;
  scopeMode: ScopeMode;
  priority: number;
  isSystem: boolean;
}

// ============================================================================
// Operation Types
// ============================================================================

/**
 * Operation category codes
 */
export type OperationCategory =
  | "entity"
  | "workflow"
  | "utilities"
  | "delegation"
  | "collaboration";

/**
 * All operation categories
 */
export const OPERATION_CATEGORIES: OperationCategory[] = [
  "entity",
  "workflow",
  "utilities",
  "delegation",
  "collaboration",
];

/**
 * Operation category definition
 */
export interface OperationCategoryDef {
  id: string;
  code: OperationCategory;
  name: string;
  description?: string;
  sortOrder: number;
}

/**
 * Operation definition
 */
export interface Operation {
  id: string;
  categoryId: string;
  categoryCode: OperationCategory;
  code: string;
  name: string;
  description?: string;
  requiresRecord: boolean;
  requiresOwnership: boolean;
  sortOrder: number;
}

/**
 * Operation codes by category
 */
export const OPERATION_CODES = {
  entity: ["read", "create", "update", "delete_draft", "delete"] as const,
  workflow: [
    "submit",
    "amend",
    "cancel",
    "close",
    "reopen",
    "withdraw",
    "escalate",
    "approve",
    "deny",
  ] as const,
  utilities: [
    "copy",
    "merge",
    "report",
    "print",
    "import",
    "export",
    "bulk_import",
    "bulk_export",
    "bulk_update",
    "bulk_delete",
  ] as const,
  delegation: ["delegate", "share_readonly", "share_editable"] as const,
  collaboration: [
    "comment_add",
    "attachment_add",
    "comment_delete_other",
    "attachment_delete_other",
    "follow",
    "tag",
  ] as const,
};

/**
 * All operation codes flattened
 */
export type OperationCode =
  | (typeof OPERATION_CODES.entity)[number]
  | (typeof OPERATION_CODES.workflow)[number]
  | (typeof OPERATION_CODES.utilities)[number]
  | (typeof OPERATION_CODES.delegation)[number]
  | (typeof OPERATION_CODES.collaboration)[number];

// ============================================================================
// Capability Types
// ============================================================================

/**
 * Constraint type for capability grants
 * - none: No additional constraint (tenant-wide)
 * - own: Restricted to records owned by the subject
 * - ou: Restricted to records within subject's OU scope
 * - module: Restricted to records within subscribed modules
 */
export type ConstraintType = "none" | "own" | "ou" | "module";

/**
 * Persona capability grant
 */
export interface PersonaCapability {
  id: string;
  personaId: string;
  personaCode: PersonaCode;
  operationId: string;
  operationCode: string;
  isGranted: boolean;
  constraintType: ConstraintType;
}

/**
 * Capability check context
 */
export interface CapabilityContext {
  /** Is the subject the owner of the record? */
  isOwner?: boolean;

  /** Record's OU path (for OU-scoped checks) */
  recordOuPath?: string;

  /** Subject's OU path (for OU-scoped checks) */
  subjectOuPath?: string;

  /** Module code (for module-scoped checks) */
  moduleCode?: string;

  /** Entity key (to determine module mapping) */
  entityKey?: string;

  /** Record ID (optional context) */
  recordId?: string;
}

/**
 * Result of capability check
 */
export interface CapabilityCheckResult {
  /** Whether the operation is allowed */
  allowed: boolean;

  /** Persona that was evaluated */
  persona: PersonaCode;

  /** Operation that was checked */
  operation: string;

  /** Constraint type that applies */
  constraintType?: ConstraintType;

  /** Human-readable reason for the decision */
  reason?: string;

  /** The capability grant that matched (if any) */
  matchedCapability?: PersonaCapability;
}

// ============================================================================
// Module Types
// ============================================================================

/**
 * Module definition
 */
export interface Module {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
}

/**
 * Tenant module subscription
 */
export interface TenantModuleSubscription {
  id: string;
  tenantId: string;
  moduleId: string;
  moduleCode?: string;
  isActive: boolean;
  validFrom: Date;
  validUntil?: Date;
}

/**
 * Entity to module mapping
 */
export interface EntityModuleMapping {
  id: string;
  entityKey: string;
  moduleId: string;
  moduleCode?: string;
}

// ============================================================================
// Capability Matrix Types
// ============================================================================

/**
 * Full capability matrix (for UI display)
 */
export interface CapabilityMatrix {
  personas: Persona[];
  categories: OperationCategoryDef[];
  operations: Operation[];
  capabilities: PersonaCapability[];
}

/**
 * Capability matrix row (one operation)
 */
export interface CapabilityMatrixRow {
  category: OperationCategory;
  operation: Operation;
  grants: Record<PersonaCode, { isGranted: boolean; constraintType: ConstraintType }>;
}

// ============================================================================
// Authorization Decision Types
// ============================================================================

/**
 * Full authorization decision (includes capability + additional checks)
 */
export interface AuthorizationDecision {
  /** Final decision */
  allowed: boolean;

  /** Reason for decision */
  reason: string;

  /** Capability check result */
  capability?: CapabilityCheckResult;

  /** Whether OU scope was checked */
  ouScopeChecked?: boolean;

  /** Whether module subscription was checked */
  moduleSubscriptionChecked?: boolean;

  /** Additional context */
  context?: Record<string, unknown>;
}

// ============================================================================
// Subject Snapshot Extension
// ============================================================================

/**
 * Extended subject snapshot with persona information
 */
export interface SubjectWithPersona {
  /** Principal ID */
  id: string;

  /** Principal type */
  type: "user" | "service" | "external";

  /** Tenant ID */
  tenantId: string;

  /** Assigned roles (raw from IdP/bindings) */
  roles: string[];

  /** Effective persona (derived from roles) */
  effectivePersona: PersonaCode;

  /** All personas the subject qualifies for */
  qualifiedPersonas: PersonaCode[];

  /** OU membership */
  ouMembership?: {
    nodeId: string;
    path: string;
  };

  /** Groups */
  groups?: string[];

  /** ABAC attributes */
  attributes?: Record<string, unknown>;
}
