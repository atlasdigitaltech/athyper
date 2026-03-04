/**
 * Policy Testing Types
 *
 * A: Simulator Feature Definition
 * - Dry-run mode (no side effects, no writes)
 * - Explain output (matched rules, condition results)
 * - Various input types (manual JSON, tenant data, audit replay)
 */

import type {
  PolicyAction,
  PolicyContext,
  PolicyDecision,
  PolicyInput,
  PolicyObligation,
  PolicyResource,
  PolicySubject,
} from "../evaluation/types.js";
import type { Effect } from "../types.js";

// ============================================================================
// Simulator Input Types
// ============================================================================

/**
 * Input source type
 */
export type SimulatorInputSource =
  | "manual"           // Manual JSON input
  | "tenant_data"      // Pick from existing tenant data
  | "audit_replay";    // Replay from audit log (phase-2)

/**
 * Manual input specification
 */
export type ManualSimulatorInput = {
  source: "manual";
  subject: PolicySubject;
  resource: PolicyResource;
  action: PolicyAction;
  context: Partial<PolicyContext>;
};

/**
 * Tenant data picker input
 */
export type TenantDataInput = {
  source: "tenant_data";
  /** Principal ID to use */
  principalId: string;
  /** Resource type (entity code) */
  resourceType: string;
  /** Resource ID (optional - picks random if not specified) */
  resourceId?: string;
  /** Action to simulate */
  action: PolicyAction;
  /** Additional context overrides */
  contextOverrides?: Partial<PolicyContext>;
};

/**
 * Audit log replay input (phase-2)
 */
export type AuditReplayInput = {
  source: "audit_replay";
  /** Audit event ID to replay */
  auditEventId: string;
  /** Whether to use current policies (true) or policies at time of audit (false) */
  useCurrentPolicies: boolean;
};

/**
 * Unified simulator input
 */
export type SimulatorInput = ManualSimulatorInput | TenantDataInput | AuditReplayInput;

// ============================================================================
// Simulator Output Types
// ============================================================================

/**
 * Condition evaluation result in explain tree
 */
export type ConditionEvalResult = {
  /** Condition field path */
  field: string;
  /** Operator used */
  operator: string;
  /** Expected value */
  expectedValue: unknown;
  /** Actual value from input */
  actualValue: unknown;
  /** Whether condition passed */
  passed: boolean;
};

/**
 * Rule evaluation result in explain tree
 */
export type RuleEvalResult = {
  /** Rule ID */
  ruleId: string;
  /** Policy ID */
  policyId: string;
  /** Policy name */
  policyName: string;
  /** Rule effect */
  effect: Effect;
  /** Rule priority */
  priority: number;
  /** Whether rule matched (subject, scope, operation all matched) */
  matched: boolean;
  /** Why rule didn't match (if not matched) */
  nonMatchReason?: "subject_mismatch" | "scope_mismatch" | "operation_mismatch" | "condition_failed";
  /** Condition evaluation results (if conditions exist) */
  conditionResults?: ConditionEvalResult[];
  /** Whether this rule was the deciding rule */
  isDecidingRule: boolean;
};

/**
 * Policy evaluation result in explain tree
 */
export type PolicyEvalResult = {
  /** Policy ID */
  policyId: string;
  /** Policy version ID */
  versionId: string;
  /** Policy name */
  policyName: string;
  /** Scope type */
  scopeType: string;
  /** Rules evaluated from this policy */
  rules: RuleEvalResult[];
  /** Total rules in policy */
  totalRules: number;
  /** Rules that matched */
  matchedRules: number;
};

/**
 * Explain tree for simulation result
 */
export type SimulatorExplainTree = {
  /** Resolved input used for evaluation */
  resolvedInput: PolicyInput;
  /** Subject resolution trace */
  subjectResolution: {
    /** How subject was resolved */
    method: "manual" | "database" | "cache";
    /** Subject keys built for matching */
    subjectKeys: Array<{ type: string; key: string }>;
    /** Time to resolve (ms) */
    resolutionTimeMs: number;
  };
  /** Resource resolution trace */
  resourceResolution: {
    /** How resource was resolved */
    method: "manual" | "database" | "cache";
    /** Scope key built for matching */
    scopeKey: string;
    /** Time to resolve (ms) */
    resolutionTimeMs: number;
  };
  /** Policies evaluated */
  policies: PolicyEvalResult[];
  /** Conflict resolution applied */
  conflictResolution: {
    /** Strategy used */
    strategy: string;
    /** Rules considered in resolution */
    rulesConsidered: number;
    /** Winning rule (if any) */
    winningRule?: {
      ruleId: string;
      policyId: string;
      effect: Effect;
      priority: number;
    };
  };
  /** Performance metrics */
  performance: {
    totalTimeMs: number;
    subjectResolutionMs: number;
    resourceResolutionMs: number;
    policyEvaluationMs: number;
    effectResolutionMs: number;
  };
};

/**
 * Simulator result
 */
export type SimulatorResult = {
  /** Whether simulation succeeded */
  success: boolean;
  /** Final decision */
  decision: PolicyDecision;
  /** Explain tree (detailed breakdown) */
  explain: SimulatorExplainTree;
  /** Warnings (non-fatal issues) */
  warnings: string[];
  /** Simulation metadata */
  metadata: {
    /** Simulation timestamp */
    simulatedAt: Date;
    /** Simulator version */
    simulatorVersion: string;
    /** Tenant ID */
    tenantId: string;
    /** Correlation ID */
    correlationId: string;
    /** Whether this was a dry-run (always true for simulator) */
    dryRun: true;
  };
};

// ============================================================================
// Policy Validation Types
// ============================================================================

/**
 * Validation error
 */
export type ValidationError = {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Path to error (e.g., "rules[0].conditions.conditions[1].field") */
  path?: string;
  /** Severity */
  severity: "error" | "warning";
};

/**
 * Policy validation result
 */
export type PolicyValidationResult = {
  /** Whether policy is valid */
  valid: boolean;
  /** Validation errors */
  errors: ValidationError[];
  /** Validation warnings */
  warnings: ValidationError[];
  /** Schema validation passed */
  schemaValid: boolean;
  /** Expression validation passed (conditions are evaluable) */
  expressionsValid: boolean;
  /** Metadata */
  metadata: {
    validatedAt: Date;
    policyId?: string;
    versionId?: string;
  };
};

// ============================================================================
// Test Case Types
// ============================================================================

/**
 * Expected decision for test case
 */
export type ExpectedDecision = {
  /** Expected effect */
  effect: Effect;
  /** Expected to be allowed (convenience) */
  allowed: boolean;
  /** Expected obligations (optional - check if present) */
  obligations?: Array<{
    type: PolicyObligation["type"];
    paramsMatch?: Record<string, unknown>;
  }>;
  /** Expected deciding rule (optional) */
  decidingRule?: {
    ruleId?: string;
    policyId?: string;
  };
};

/**
 * Test case assertion
 */
export type TestCaseAssertion =
  | { type: "effect_equals"; value: Effect }
  | { type: "allowed_equals"; value: boolean }
  | { type: "has_obligation"; obligationType: PolicyObligation["type"] }
  | { type: "no_obligations" }
  | { type: "matched_rules_count"; operator: "eq" | "gt" | "lt" | "gte" | "lte"; value: number }
  | { type: "deciding_rule_is"; ruleId: string }
  | { type: "deciding_policy_is"; policyId: string }
  | { type: "eval_time_under"; maxMs: number }
  | { type: "custom"; fn: (result: SimulatorResult) => boolean; description: string };

/**
 * Test case definition
 */
export type PolicyTestCase = {
  /** Test case ID */
  id: string;
  /** Test case name */
  name: string;
  /** Description */
  description?: string;
  /** Policy ID this test is for (optional - can test across policies) */
  policyId?: string;
  /** Input for simulation */
  input: SimulatorInput;
  /** Expected decision */
  expected: ExpectedDecision;
  /** Additional assertions */
  assertions?: TestCaseAssertion[];
  /** Tags for categorization */
  tags: string[];
  /** Whether test is enabled */
  enabled: boolean;
  /** Created timestamp */
  createdAt: Date;
  /** Created by */
  createdBy: string;
  /** Last modified */
  updatedAt?: Date;
  /** Updated by */
  updatedBy?: string;
};

/**
 * Test case stored in database
 */
export type StoredTestCase = PolicyTestCase & {
  /** Tenant ID */
  tenantId: string;
  /** Last run timestamp */
  lastRunAt?: Date;
  /** Last run result */
  lastRunResult?: "passed" | "failed" | "error";
  /** Last run duration (ms) */
  lastRunDurationMs?: number;
  /** Last run error message (if failed/error) */
  lastRunError?: string;
};

/**
 * Test run result
 */
export type TestCaseRunResult = {
  /** Test case ID */
  testCaseId: string;
  /** Test case name */
  testCaseName: string;
  /** Whether test passed */
  passed: boolean;
  /** Failure reason (if failed) */
  failureReason?: string;
  /** Assertion results */
  assertionResults: Array<{
    assertion: string;
    passed: boolean;
    actual?: unknown;
    expected?: unknown;
  }>;
  /** Simulation result */
  simulatorResult: SimulatorResult;
  /** Run duration (ms) */
  durationMs: number;
  /** Run timestamp */
  runAt: Date;
};

/**
 * Test suite run result
 */
export type TestSuiteResult = {
  /** Suite name */
  suiteName: string;
  /** Total tests */
  totalTests: number;
  /** Passed tests */
  passedTests: number;
  /** Failed tests */
  failedTests: number;
  /** Skipped tests */
  skippedTests: number;
  /** Error tests (couldn't run) */
  errorTests: number;
  /** Individual test results */
  testResults: TestCaseRunResult[];
  /** Total duration (ms) */
  durationMs: number;
  /** Suite run timestamp */
  runAt: Date;
  /** Pass rate percentage */
  passRate: number;
};

// ============================================================================
// Simulator Service Interface
// ============================================================================

/**
 * Policy simulator service interface
 */
export interface IPolicySimulator {
  /**
   * Run policy simulation (dry-run)
   */
  simulate(
    tenantId: string,
    input: SimulatorInput,
    options?: SimulatorOptions
  ): Promise<SimulatorResult>;

  /**
   * Validate policy definition
   */
  validatePolicy(
    policyDefinition: unknown,
    options?: ValidationOptions
  ): Promise<PolicyValidationResult>;

  /**
   * Run a single test case
   */
  runTestCase(
    tenantId: string,
    testCase: PolicyTestCase
  ): Promise<TestCaseRunResult>;

  /**
   * Run multiple test cases
   */
  runTestSuite(
    tenantId: string,
    testCases: PolicyTestCase[],
    suiteName?: string
  ): Promise<TestSuiteResult>;
}

/**
 * Simulator options
 */
export type SimulatorOptions = {
  /** Include full explain tree (default: true) */
  includeExplain?: boolean;
  /** Include condition evaluation details (default: true) */
  includeConditionDetails?: boolean;
  /** Maximum trace depth (default: 10) */
  maxTraceDepth?: number;
  /** Timeout for simulation (ms, default: 5000) */
  timeoutMs?: number;
  /** Policy version override */
  policyVersionOverride?: {
    policyId: string;
    versionId: string;
  };
  /** Conflict resolution override */
  conflictResolutionOverride?: "deny_overrides" | "allow_overrides" | "priority_order" | "first_match";
};

/**
 * Validation options
 */
export type ValidationOptions = {
  /** Validate schema structure (default: true) */
  validateSchema?: boolean;
  /** Validate expressions are parseable (default: true) */
  validateExpressions?: boolean;
  /** Validate field references exist (default: false - requires entity metadata) */
  validateFieldReferences?: boolean;
  /** Strict mode - treat warnings as errors (default: false) */
  strict?: boolean;
};

// ============================================================================
// Test Case Repository Interface
// ============================================================================

/**
 * Test case repository interface
 */
export interface ITestCaseRepository {
  /**
   * Get test case by ID
   */
  getById(tenantId: string, testCaseId: string): Promise<StoredTestCase | undefined>;

  /**
   * List test cases for a tenant
   */
  list(
    tenantId: string,
    options?: {
      policyId?: string;
      tags?: string[];
      enabled?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<StoredTestCase[]>;

  /**
   * Create a test case
   */
  create(
    tenantId: string,
    testCase: Omit<PolicyTestCase, "id" | "createdAt">,
    createdBy: string
  ): Promise<StoredTestCase>;

  /**
   * Update a test case
   */
  update(
    tenantId: string,
    testCaseId: string,
    updates: Partial<PolicyTestCase>,
    updatedBy: string
  ): Promise<StoredTestCase>;

  /**
   * Delete a test case
   */
  delete(tenantId: string, testCaseId: string): Promise<void>;

  /**
   * Update test case run result
   */
  updateRunResult(
    tenantId: string,
    testCaseId: string,
    result: TestCaseRunResult
  ): Promise<void>;

  /**
   * Get test cases by policy
   */
  getByPolicy(tenantId: string, policyId: string): Promise<StoredTestCase[]>;

  /**
   * Get test cases by tags
   */
  getByTags(tenantId: string, tags: string[]): Promise<StoredTestCase[]>;
}
