/**
 * Policy Evaluation Types
 *
 * A: Runtime Policy Evaluation Contract
 * Defines PolicyInput, PolicyDecision, PolicyEvaluationOptions, and determinism rules
 */

import type { ConditionGroup, Effect, ScopeType, SubjectType } from "../types.js";

// ============================================================================
// Policy Input (What goes into evaluation)
// ============================================================================

/**
 * Subject information for evaluation
 */
export type PolicySubject = {
  /** Principal ID */
  principalId: string;

  /** Principal type */
  principalType: "user" | "service" | "external";

  /** Roles (from IAM) */
  roles: string[];

  /** Groups (from IAM) */
  groups: string[];

  /** OU membership */
  ouMembership?: {
    nodeId: string;
    path: string;
    code: string;
    depth: number;
  };

  /** ABAC attributes */
  attributes: Record<string, unknown>;
};

/**
 * Resource information for evaluation
 */
export type PolicyResource = {
  /** Resource type (entity code) */
  type: string;

  /** Resource ID (record ID if applicable) */
  id?: string;

  /** Entity version ID */
  versionId?: string;

  /** Module code */
  module?: string;

  /** Owner principal ID (for ownership checks) */
  ownerId?: string;

  /** Cost center (for financial rules) */
  costCenter?: string;

  /** Resource attributes (record fields) */
  attributes: Record<string, unknown>;
};

/**
 * Action being performed
 */
export type PolicyAction = {
  /** Operation namespace */
  namespace: "ENTITY" | "WORKFLOW" | "UTIL" | "DELEGATION" | "COLLAB";

  /** Operation code */
  code: string;

  /** Full operation code (namespace.code) */
  fullCode: string;
};

/**
 * Request context (environment)
 */
export type PolicyContext = {
  /** Tenant ID */
  tenantId: string;

  /** Realm ID (Keycloak realm) */
  realmId?: string;

  /** Request timestamp */
  timestamp: Date;

  /** Client IP address */
  ipAddress?: string;

  /** User agent */
  userAgent?: string;

  /** Channel (web, mobile, api, batch) */
  channel?: "web" | "mobile" | "api" | "batch" | "internal";

  /** Device type */
  deviceType?: "desktop" | "tablet" | "mobile" | "unknown";

  /** Geographic location */
  geo?: {
    country?: string;
    region?: string;
    city?: string;
  };

  /** Correlation ID for tracing */
  correlationId?: string;

  /** Additional context attributes */
  attributes: Record<string, unknown>;
};

/**
 * Complete policy evaluation input
 */
export type PolicyInput = {
  /** Subject (who) */
  subject: PolicySubject;

  /** Resource (what) */
  resource: PolicyResource;

  /** Action (operation) */
  action: PolicyAction;

  /** Context (when/where/how) */
  context: PolicyContext;
};

// ============================================================================
// Policy Decision (What comes out of evaluation)
// ============================================================================

/**
 * Matched rule information for debugging
 */
export type MatchedRule = {
  /** Rule ID */
  ruleId: string;

  /** Policy ID */
  policyId: string;

  /** Policy version ID */
  policyVersionId: string;

  /** Policy name */
  policyName: string;

  /** Rule effect */
  effect: Effect;

  /** Rule priority */
  priority: number;

  /** Scope type */
  scopeType: ScopeType;

  /** Subject type that matched */
  subjectType: SubjectType;

  /** Subject key that matched */
  subjectKey: string;

  /** Conditions evaluated (if any) */
  conditions?: {
    expression: ConditionGroup;
    result: boolean;
  };
};

/**
 * Obligation to be enforced
 */
export type PolicyObligation = {
  /** Obligation type */
  type:
    | "mask_fields"
    | "require_approval"
    | "add_audit_tag"
    | "notify"
    | "rate_limit"
    | "time_restrict"
    | "require_mfa"
    | "custom";

  /** Obligation parameters */
  params: Record<string, unknown>;

  /** Obligation ID (for tracking) */
  obligationId?: string;

  /** Description */
  description?: string;
};

/**
 * Evaluation trace step (for debugging)
 */
export type TraceStep = {
  /** Step name */
  step: string;

  /** Step type */
  type: "scope_filter" | "condition_eval" | "effect_resolution" | "obligation" | "short_circuit";

  /** Input to this step */
  input?: unknown;

  /** Output from this step */
  output?: unknown;

  /** Duration in microseconds */
  durationUs: number;

  /** Additional details */
  details?: Record<string, unknown>;
};

/**
 * Complete policy decision
 */
export type PolicyDecision = {
  /** Final effect */
  effect: Effect;

  /** Is the action allowed */
  allowed: boolean;

  /** List of obligations to enforce */
  obligations: PolicyObligation[];

  /** Reasons for the decision */
  reasons: string[];

  /** Matched rules (sorted by priority) */
  matchedRules: MatchedRule[];

  /** The winning rule that determined the decision */
  decidingRule?: MatchedRule;

  /** Debug information (if explain=true) */
  debug?: {
    /** Total rules scanned */
    rulesScanned: number;

    /** Rules that matched subject */
    rulesMatched: number;

    /** Policies evaluated */
    policiesEvaluated: number;

    /** Evaluation trace (if trace=true) */
    trace?: TraceStep[];

    /** Facts used in evaluation */
    factsUsed?: Record<string, unknown>;

    /** Cache hits */
    cacheHits?: {
      subject: boolean;
      policies: boolean;
      facts: boolean;
    };
  };

  /** Evaluation metadata */
  metadata: {
    /** Evaluation duration in milliseconds */
    durationMs: number;

    /** Evaluation timestamp */
    evaluatedAt: Date;

    /** Evaluator version */
    evaluatorVersion: string;

    /** Correlation ID */
    correlationId?: string;
  };
};

// ============================================================================
// Policy Evaluation Options
// ============================================================================

/**
 * Conflict resolution strategy
 */
export type ConflictResolution =
  | "deny_overrides"     // Deny wins if any deny matches (most secure)
  | "allow_overrides"    // Allow wins if any allow matches (most permissive)
  | "priority_order"     // Highest priority rule wins
  | "first_match";       // First matching rule wins (order-dependent)

/**
 * Policy evaluation options
 */
export type PolicyEvaluationOptions = {
  /** Include explanation in decision (default: false) */
  explain?: boolean;

  /** Include evaluation trace (default: false) */
  trace?: boolean;

  /** Strict mode - fail on any error (default: true) */
  strict?: boolean;

  /** Conflict resolution strategy (default: deny_overrides) */
  conflictResolution?: ConflictResolution;

  /** Stop evaluation after first decisive match (default: false) */
  stopOnFirstMatch?: boolean;

  /** Limits for safety */
  limits?: {
    /** Max expression depth (default: 10) */
    maxExpressionDepth?: number;

    /** Max rules to scan (default: 1000) */
    maxRulesScanned?: number;

    /** Timeout in milliseconds (default: 100) */
    timeoutMs?: number;

    /** Max matches to return in debug (default: 50) */
    maxMatchesReturned?: number;
  };

  /** Include obligations in decision (default: true) */
  includeObligations?: boolean;

  /** Skip cache (for testing) */
  skipCache?: boolean;

  /** Policy version override (default: active version) */
  policyVersionOverride?: {
    policyId: string;
    versionId: string;
  };
};

/**
 * Default evaluation options
 */
export const DEFAULT_EVALUATION_OPTIONS: Required<PolicyEvaluationOptions> = {
  explain: false,
  trace: false,
  strict: true,
  conflictResolution: "deny_overrides",
  stopOnFirstMatch: false,
  limits: {
    maxExpressionDepth: 10,
    maxRulesScanned: 1000,
    timeoutMs: 100,
    maxMatchesReturned: 50,
  },
  includeObligations: true,
  skipCache: false,
  policyVersionOverride: undefined as unknown as { policyId: string; versionId: string },
};

// ============================================================================
// Determinism Rules
// ============================================================================

/**
 * Rule ordering for deterministic evaluation
 *
 * Rules are evaluated in this order:
 * 1. Scope specificity (record > entity_version > entity > module > global)
 * 2. Subject specificity (user > service > kc_role > kc_group)
 * 3. Priority (lower number = higher priority)
 * 4. Creation order (older rules first)
 *
 * Tie-breakers:
 * - If same scope, subject, and priority: deny wins over allow
 * - If still tied: rule with lower ID wins (deterministic)
 */
export const SCOPE_SPECIFICITY_ORDER: Record<ScopeType, number> = {
  record: 5,
  entity_version: 4,
  entity: 3,
  module: 2,
  global: 1,
};

export const SUBJECT_SPECIFICITY_ORDER: Record<SubjectType, number> = {
  user: 4,
  service: 3,
  kc_role: 2,
  kc_group: 1,
};

/**
 * Compare two rules for ordering
 * Returns negative if a should come before b
 */
export function compareRules(
  a: { scopeType: ScopeType; subjectType: SubjectType; priority: number; effect: Effect; ruleId: string },
  b: { scopeType: ScopeType; subjectType: SubjectType; priority: number; effect: Effect; ruleId: string }
): number {
  // 1. Scope specificity (higher = more specific)
  const scopeDiff = SCOPE_SPECIFICITY_ORDER[b.scopeType] - SCOPE_SPECIFICITY_ORDER[a.scopeType];
  if (scopeDiff !== 0) return scopeDiff;

  // 2. Subject specificity (higher = more specific)
  const subjectDiff = SUBJECT_SPECIFICITY_ORDER[b.subjectType] - SUBJECT_SPECIFICITY_ORDER[a.subjectType];
  if (subjectDiff !== 0) return subjectDiff;

  // 3. Priority (lower = higher priority)
  const priorityDiff = a.priority - b.priority;
  if (priorityDiff !== 0) return priorityDiff;

  // 4. Effect (deny before allow for tie-breaking)
  if (a.effect === "deny" && b.effect === "allow") return -1;
  if (a.effect === "allow" && b.effect === "deny") return 1;

  // 5. Rule ID (deterministic ordering)
  return a.ruleId.localeCompare(b.ruleId);
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Policy evaluation error codes
 */
export const PolicyErrorCodes = {
  POLICY_EVAL_TIMEOUT: "POLICY_EVAL_TIMEOUT",
  POLICY_INVALID_EXPR: "POLICY_INVALID_EXPR",
  POLICY_EXPR_TOO_DEEP: "POLICY_EXPR_TOO_DEEP",
  POLICY_TOO_MANY_RULES: "POLICY_TOO_MANY_RULES",
  POLICY_NOT_FOUND: "POLICY_NOT_FOUND",
  POLICY_VERSION_NOT_FOUND: "POLICY_VERSION_NOT_FOUND",
  POLICY_COMPILE_ERROR: "POLICY_COMPILE_ERROR",
  FACTS_RESOLUTION_ERROR: "FACTS_RESOLUTION_ERROR",
  SUBJECT_NOT_FOUND: "SUBJECT_NOT_FOUND",
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type PolicyErrorCode = typeof PolicyErrorCodes[keyof typeof PolicyErrorCodes];

/**
 * Policy evaluation error
 */
export class PolicyEvaluationError extends Error {
  constructor(
    public readonly code: PolicyErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PolicyEvaluationError";
  }
}

// ============================================================================
// Evaluator Interface
// ============================================================================

/**
 * Policy evaluator interface
 */
export interface IPolicyEvaluator {
  /**
   * Evaluate a policy decision
   */
  evaluate(input: PolicyInput, options?: PolicyEvaluationOptions): Promise<PolicyDecision>;

  /**
   * Check if action is allowed (convenience method)
   */
  isAllowed(input: PolicyInput, options?: PolicyEvaluationOptions): Promise<boolean>;

  /**
   * Enforce policy (throws if denied)
   */
  enforce(input: PolicyInput, options?: PolicyEvaluationOptions): Promise<void>;

  /**
   * Get all permissions for a subject on a resource
   */
  getPermissions(
    subject: PolicySubject,
    resource: PolicyResource,
    context: PolicyContext,
    options?: PolicyEvaluationOptions
  ): Promise<Map<string, PolicyDecision>>;
}
