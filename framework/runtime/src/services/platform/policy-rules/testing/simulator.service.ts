/**
 * Policy Simulator Service
 *
 * A: Simulator Feature Implementation
 * - Dry-run mode (no side effects, no writes)
 * - Explain output (matched rules, condition results)
 * - Various input types (manual JSON, tenant data, audit replay)
 */

import type {
  AuditReplayInput,
  ConditionEvalResult,
  IPolicySimulator,
  ManualSimulatorInput,
  PolicyEvalResult,
  PolicyTestCase,
  PolicyValidationResult,
  SimulatorExplainTree,
  SimulatorInput,
  SimulatorOptions,
  SimulatorResult,
  TenantDataInput,
  TestCaseAssertion,
  TestCaseRunResult,
  TestSuiteResult,
  ValidationError,
  ValidationOptions,
} from "./types.js";
import type { IFactsProvider } from "../evaluation/facts-provider.js";
import type {
  IPolicyEvaluator,
  PolicyAction,
  PolicyDecision,
  PolicyEvaluationOptions,
  PolicyInput,
  PolicyResource,
  PolicySubject,
} from "../evaluation/types.js";
import type { ConditionGroup, Condition } from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Simulator Service Implementation
// ============================================================================

/**
 * Default simulator options
 */
const DEFAULT_SIMULATOR_OPTIONS: SimulatorOptions = {
  includeExplain: true,
  includeConditionDetails: true,
  maxTraceDepth: 10,
  timeoutMs: 5000,
  policyVersionOverride: undefined,
  conflictResolutionOverride: undefined,
};

/**
 * Policy Simulator Service
 */
export class PolicySimulatorService implements IPolicySimulator {
  private readonly version = "1.0.0";

  constructor(
    private readonly db: Kysely<DB>,
    private readonly evaluator: IPolicyEvaluator,
    private readonly factsProvider: IFactsProvider
  ) {}

  /**
   * Run policy simulation (dry-run)
   */
  async simulate(
    tenantId: string,
    input: SimulatorInput,
    options?: SimulatorOptions
  ): Promise<SimulatorResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_SIMULATOR_OPTIONS, ...options };
    const correlationId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const warnings: string[] = [];

    try {
      // 1. Resolve input to PolicyInput
      const resolveStart = Date.now();
      const { policyInput, subjectResolution, resourceResolution } = await this.resolveInput(
        tenantId,
        input,
        correlationId
      );
      const _resolveTime = Date.now() - resolveStart;

      // 2. Build subject keys for explain tree
      const subjectKeys = this.buildSubjectKeys(policyInput.subject);

      // 3. Run evaluation with explain mode
      const evalStart = Date.now();
      const evalOptions: PolicyEvaluationOptions = {
        explain: true,
        trace: opts.includeExplain,
        conflictResolution: opts.conflictResolutionOverride ?? "deny_overrides",
        policyVersionOverride: opts.policyVersionOverride,
        limits: {
          timeoutMs: opts.timeoutMs,
          maxExpressionDepth: opts.maxTraceDepth,
        },
      };

      const decision = await this.evaluator.evaluate(policyInput, evalOptions);
      const evalTime = Date.now() - evalStart;

      // 4. Build explain tree
      const explainTree = this.buildExplainTree(
        policyInput,
        decision,
        {
          method: subjectResolution.method,
          subjectKeys,
          resolutionTimeMs: subjectResolution.timeMs,
        },
        {
          method: resourceResolution.method,
          scopeKey: this.buildScopeKey(policyInput.resource),
          resolutionTimeMs: resourceResolution.timeMs,
        },
        opts,
        evalTime
      );

      // 5. Build result
      return {
        success: true,
        decision,
        explain: explainTree,
        warnings,
        metadata: {
          simulatedAt: new Date(),
          simulatorVersion: this.version,
          tenantId,
          correlationId,
          dryRun: true,
        },
      };
    } catch (error) {
      // Return error result
      return {
        success: false,
        decision: this.createErrorDecision(error, startTime, correlationId),
        explain: this.createEmptyExplainTree(startTime),
        warnings: [...warnings, `Simulation error: ${String(error)}`],
        metadata: {
          simulatedAt: new Date(),
          simulatorVersion: this.version,
          tenantId,
          correlationId,
          dryRun: true,
        },
      };
    }
  }

  /**
   * Validate policy definition
   */
  async validatePolicy(
    policyDefinition: unknown,
    options?: ValidationOptions
  ): Promise<PolicyValidationResult> {
    const opts = {
      validateSchema: true,
      validateExpressions: true,
      validateFieldReferences: false,
      strict: false,
      ...options,
    };

    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // 1. Schema validation
    let schemaValid = true;
    if (opts.validateSchema) {
      const schemaErrors = this.validatePolicySchema(policyDefinition);
      for (const err of schemaErrors) {
        if (err.severity === "error") {
          errors.push(err);
          schemaValid = false;
        } else {
          warnings.push(err);
        }
      }
    }

    // 2. Expression validation
    let expressionsValid = true;
    if (opts.validateExpressions && schemaValid) {
      const exprErrors = this.validatePolicyExpressions(policyDefinition as any);
      for (const err of exprErrors) {
        if (err.severity === "error") {
          errors.push(err);
          expressionsValid = false;
        } else {
          warnings.push(err);
        }
      }
    }

    // 3. Field reference validation (optional)
    if (opts.validateFieldReferences && schemaValid && expressionsValid) {
      // Would require entity metadata to validate field paths
      warnings.push({
        code: "FIELD_VALIDATION_SKIPPED",
        message: "Field reference validation not implemented",
        severity: "warning",
      });
    }

    const valid = schemaValid && expressionsValid && (opts.strict ? warnings.length === 0 : true);

    return {
      valid,
      errors,
      warnings,
      schemaValid,
      expressionsValid,
      metadata: {
        validatedAt: new Date(),
        policyId: (policyDefinition as any)?.id,
        versionId: (policyDefinition as any)?.versionId,
      },
    };
  }

  /**
   * Run a single test case
   */
  async runTestCase(
    tenantId: string,
    testCase: PolicyTestCase
  ): Promise<TestCaseRunResult> {
    const startTime = Date.now();

    try {
      // Run simulation
      const result = await this.simulate(tenantId, testCase.input);

      // Check assertions
      const assertionResults = this.checkAssertions(testCase, result);

      // Determine pass/fail
      const passed = assertionResults.every((r) => r.passed);
      const failedAssertions = assertionResults.filter((r) => !r.passed);

      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        passed,
        failureReason: passed ? undefined : this.buildFailureReason(failedAssertions),
        assertionResults,
        simulatorResult: result,
        durationMs: Date.now() - startTime,
        runAt: new Date(),
      };
    } catch (error) {
      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        passed: false,
        failureReason: `Test execution error: ${String(error)}`,
        assertionResults: [],
        simulatorResult: {
          success: false,
          decision: this.createErrorDecision(error, startTime, testCase.id),
          explain: this.createEmptyExplainTree(startTime),
          warnings: [`Test error: ${String(error)}`],
          metadata: {
            simulatedAt: new Date(),
            simulatorVersion: this.version,
            tenantId,
            correlationId: testCase.id,
            dryRun: true,
          },
        },
        durationMs: Date.now() - startTime,
        runAt: new Date(),
      };
    }
  }

  /**
   * Run multiple test cases
   */
  async runTestSuite(
    tenantId: string,
    testCases: PolicyTestCase[],
    suiteName: string = "Default Suite"
  ): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const testResults: TestCaseRunResult[] = [];
    let passedTests = 0;
    let failedTests = 0;
    let skippedTests = 0;
    let errorTests = 0;

    for (const testCase of testCases) {
      if (!testCase.enabled) {
        skippedTests++;
        continue;
      }

      try {
        const result = await this.runTestCase(tenantId, testCase);
        testResults.push(result);

        if (result.passed) {
          passedTests++;
        } else if (result.simulatorResult.success) {
          failedTests++;
        } else {
          errorTests++;
        }
      } catch (error) {
        errorTests++;
        testResults.push({
          testCaseId: testCase.id,
          testCaseName: testCase.name,
          passed: false,
          failureReason: `Execution error: ${String(error)}`,
          assertionResults: [],
          simulatorResult: {
            success: false,
            decision: this.createErrorDecision(error, Date.now(), testCase.id),
            explain: this.createEmptyExplainTree(Date.now()),
            warnings: [],
            metadata: {
              simulatedAt: new Date(),
              simulatorVersion: this.version,
              tenantId,
              correlationId: testCase.id,
              dryRun: true,
            },
          },
          durationMs: 0,
          runAt: new Date(),
        });
      }
    }

    const totalTests = testCases.length;
    const passRate = totalTests > 0 ? (passedTests / (totalTests - skippedTests)) * 100 : 0;

    return {
      suiteName,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      errorTests,
      testResults,
      durationMs: Date.now() - startTime,
      runAt: new Date(),
      passRate: Math.round(passRate * 100) / 100,
    };
  }

  // ============================================================================
  // Private Methods: Input Resolution
  // ============================================================================

  private async resolveInput(
    tenantId: string,
    input: SimulatorInput,
    correlationId: string
  ): Promise<{
    policyInput: PolicyInput;
    subjectResolution: { method: "manual" | "database" | "cache"; timeMs: number };
    resourceResolution: { method: "manual" | "database" | "cache"; timeMs: number };
  }> {
    switch (input.source) {
      case "manual":
        return this.resolveManualInput(tenantId, input, correlationId);
      case "tenant_data":
        return this.resolveTenantDataInput(tenantId, input, correlationId);
      case "audit_replay":
        return this.resolveAuditReplayInput(tenantId, input, correlationId);
      default:
        throw new Error(`Unknown input source: ${(input as any).source}`);
    }
  }

  private async resolveManualInput(
    tenantId: string,
    input: ManualSimulatorInput,
    correlationId: string
  ): Promise<{
    policyInput: PolicyInput;
    subjectResolution: { method: "manual"; timeMs: number };
    resourceResolution: { method: "manual"; timeMs: number };
  }> {
    const policyInput: PolicyInput = {
      subject: input.subject,
      resource: input.resource,
      action: input.action,
      context: {
        tenantId,
        timestamp: new Date(),
        correlationId,
        attributes: {},
        ...input.context,
      },
    };

    return {
      policyInput,
      subjectResolution: { method: "manual", timeMs: 0 },
      resourceResolution: { method: "manual", timeMs: 0 },
    };
  }

  private async resolveTenantDataInput(
    tenantId: string,
    input: TenantDataInput,
    correlationId: string
  ): Promise<{
    policyInput: PolicyInput;
    subjectResolution: { method: "database" | "cache"; timeMs: number };
    resourceResolution: { method: "database" | "cache"; timeMs: number };
  }> {
    // Resolve subject from facts provider
    const subjectStart = Date.now();
    const subject = await this.factsProvider.resolveSubject(input.principalId, tenantId);
    const subjectTimeMs = Date.now() - subjectStart;

    // Resolve resource from facts provider
    const resourceStart = Date.now();
    const resource = await this.factsProvider.resolveResource(
      tenantId,
      input.resourceType,
      input.resourceId
    );
    const resourceTimeMs = Date.now() - resourceStart;

    const policyInput: PolicyInput = {
      subject,
      resource,
      action: input.action,
      context: {
        tenantId,
        timestamp: new Date(),
        correlationId,
        attributes: {},
        ...input.contextOverrides,
      },
    };

    return {
      policyInput,
      subjectResolution: { method: "database", timeMs: subjectTimeMs },
      resourceResolution: { method: "database", timeMs: resourceTimeMs },
    };
  }

  private async resolveAuditReplayInput(
    tenantId: string,
    input: AuditReplayInput,
    correlationId: string
  ): Promise<{
    policyInput: PolicyInput;
    subjectResolution: { method: "database"; timeMs: number };
    resourceResolution: { method: "database"; timeMs: number };
  }> {
    const startTime = Date.now();

    // 1. Load audit event from repository
    const event = await this.loadAuditEvent(tenantId, input.auditEventId);
    const loadTimeMs = Date.now() - startTime;

    // 2. Reconstruct subject from audit event actor data
    const subject: PolicySubject = {
      principalId: event.actor.userId,
      principalType: (event.actor as any).principalType ?? "user",
      roles: (event.actor as any).roles ?? [],
      groups: (event.actor as any).groups ?? [],
      ouMembership: (event.actor as any).ouMembership ?? { path: "/", code: "root" },
      attributes: (event.actor as any).attributes ?? {},
    };

    // 3. Reconstruct resource from audit event entity data
    const resource: PolicyResource = {
      type: event.entity?.type ?? "unknown",
      id: event.entity?.id,
      module: (event.entity as any)?.module ?? "",
      ownerId: (event.entity as any)?.ownerId,
      attributes: (event.entity as any)?.attributes ?? {},
    };

    // 4. Reconstruct action from event action or operation code
    const action = this.resolveActionFromAuditEvent(event);

    // 5. Build policy input
    const policyInput: PolicyInput = {
      subject,
      resource,
      action,
      context: {
        tenantId,
        timestamp: input.useCurrentPolicies ? new Date() : event.timestamp,
        correlationId,
        attributes: {},
      },
    };

    // 6. If replaying with historical policies, set version override
    if (!input.useCurrentPolicies && event.timestamp) {
      // The evaluator's policyVersionOverride will be passed via SimulatorOptions
      // The caller (simulate()) passes opts.policyVersionOverride to the evaluator
      // For audit replay, we record the timestamp so the caller can use it
      (policyInput.context as any)._auditTimestamp = event.timestamp;
    }

    return {
      policyInput,
      subjectResolution: { method: "database", timeMs: loadTimeMs },
      resourceResolution: { method: "database", timeMs: 0 },
    };
  }

  /**
   * Load an audit event by ID with tenant isolation.
   * Queries the audit.workflow_event_log table directly.
   */
  private async loadAuditEvent(
    tenantId: string,
    eventId: string
  ): Promise<{
    actor: { userId: string; [key: string]: unknown };
    entity: { type: string; id: string; [key: string]: unknown } | null;
    action: string | undefined;
    timestamp: Date;
    details: Record<string, unknown> | undefined;
    workflow: { templateCode: string; [key: string]: unknown } | null;
  }> {
    const row = await this.db
      .selectFrom("audit.workflow_event_log" as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", eventId)
      .executeTakeFirst() as any;

    if (!row) {
      throw new Error(
        `Audit event '${eventId}' not found for tenant '${tenantId}'. ` +
        `The event may have been purged or the ID is incorrect.`
      );
    }

    const parseJson = (v: unknown) => {
      if (!v) return null;
      if (typeof v === "object") return v;
      if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
      return null;
    };

    return {
      actor: parseJson(row.actor) ?? { userId: row.actor_user_id ?? "unknown" },
      entity: parseJson(row.entity),
      action: row.action ?? undefined,
      timestamp: row.event_timestamp instanceof Date ? row.event_timestamp : new Date(row.event_timestamp),
      details: parseJson(row.details) ?? undefined,
      workflow: parseJson(row.workflow),
    };
  }

  /**
   * Map audit event action/operation code to PolicyAction.
   */
  private resolveActionFromAuditEvent(event: {
    action: string | undefined;
    details: Record<string, unknown> | undefined;
  }): PolicyAction {
    // Try direct action field first (e.g., "ENTITY.CREATE")
    if (event.action && event.action.includes(".")) {
      const [namespace, code] = event.action.split(".", 2);
      return {
        namespace: namespace as PolicyAction["namespace"],
        code,
        fullCode: event.action,
      };
    }

    // Try operation_code from details
    const opCode = event.details?.operationCode as string | undefined;
    if (opCode && opCode.includes(".")) {
      const [namespace, code] = opCode.split(".", 2);
      return {
        namespace: namespace as PolicyAction["namespace"],
        code,
        fullCode: opCode,
      };
    }

    // Map known event types to actions
    const AUDIT_EVENT_TO_ACTION: Record<string, PolicyAction> = {
      "workflow.submitted": { namespace: "WORKFLOW", code: "SUBMIT", fullCode: "WORKFLOW.SUBMIT" },
      "action.approve": { namespace: "WORKFLOW", code: "APPROVE", fullCode: "WORKFLOW.APPROVE" },
      "action.reject": { namespace: "WORKFLOW", code: "REJECT", fullCode: "WORKFLOW.REJECT" },
      "action.delegate": { namespace: "DELEGATION", code: "DELEGATE", fullCode: "DELEGATION.DELEGATE" },
      "workflow.cancelled": { namespace: "WORKFLOW", code: "CANCEL", fullCode: "WORKFLOW.CANCEL" },
      "step.escalated": { namespace: "WORKFLOW", code: "ESCALATE", fullCode: "WORKFLOW.ESCALATE" },
    };

    const eventAction = event.action ?? "";
    const mapped = AUDIT_EVENT_TO_ACTION[eventAction];
    if (mapped) return mapped;

    // Fallback: use the raw action string
    throw new Error(
      `Cannot resolve PolicyAction from audit event action '${eventAction}'. ` +
      `Known mappings: ${Object.keys(AUDIT_EVENT_TO_ACTION).join(", ")}. ` +
      `Ensure the audit event has a valid action field (e.g., "ENTITY.CREATE") or is a known event type.`
    );
  }

  // ============================================================================
  // Private Methods: Explain Tree Building
  // ============================================================================

  private buildExplainTree(
    input: PolicyInput,
    decision: PolicyDecision,
    subjectResolution: SimulatorExplainTree["subjectResolution"],
    resourceResolution: SimulatorExplainTree["resourceResolution"],
    options: SimulatorOptions,
    evalTimeMs: number
  ): SimulatorExplainTree {
    // Build policy evaluation results from matched rules
    const policiesMap = new Map<string, PolicyEvalResult>();

    for (const rule of decision.matchedRules) {
      let policyResult = policiesMap.get(rule.policyId);
      if (!policyResult) {
        policyResult = {
          policyId: rule.policyId,
          versionId: rule.policyVersionId,
          policyName: rule.policyName,
          scopeType: rule.scopeType,
          rules: [],
          totalRules: 0,
          matchedRules: 0,
        };
        policiesMap.set(rule.policyId, policyResult);
      }

      policyResult.rules.push({
        ruleId: rule.ruleId,
        policyId: rule.policyId,
        policyName: rule.policyName,
        effect: rule.effect,
        priority: rule.priority,
        matched: true,
        conditionResults: rule.conditions
          ? this.buildConditionResults(rule.conditions.expression)
          : undefined,
        isDecidingRule: decision.decidingRule?.ruleId === rule.ruleId,
      });

      policyResult.matchedRules++;
      policyResult.totalRules++;
    }

    return {
      resolvedInput: input,
      subjectResolution,
      resourceResolution,
      policies: Array.from(policiesMap.values()),
      conflictResolution: {
        strategy: options.conflictResolutionOverride ?? "deny_overrides",
        rulesConsidered: decision.matchedRules.length,
        winningRule: decision.decidingRule
          ? {
              ruleId: decision.decidingRule.ruleId,
              policyId: decision.decidingRule.policyId,
              effect: decision.decidingRule.effect,
              priority: decision.decidingRule.priority,
            }
          : undefined,
      },
      performance: {
        totalTimeMs: decision.metadata.durationMs,
        subjectResolutionMs: subjectResolution.resolutionTimeMs,
        resourceResolutionMs: resourceResolution.resolutionTimeMs,
        policyEvaluationMs: evalTimeMs,
        effectResolutionMs: 0,
      },
    };
  }

  private buildConditionResults(conditions: ConditionGroup): ConditionEvalResult[] {
    const results: ConditionEvalResult[] = [];

    for (const condition of conditions.conditions) {
      if ("conditions" in condition) {
        results.push(...this.buildConditionResults(condition as ConditionGroup));
      } else {
        const c = condition as Condition;
        results.push({
          field: c.field,
          operator: c.operator,
          expectedValue: c.value,
          actualValue: undefined, // Would need input to resolve
          passed: true, // If it matched, conditions passed
        });
      }
    }

    return results;
  }

  private buildSubjectKeys(subject: PolicySubject): Array<{ type: string; key: string }> {
    const keys: Array<{ type: string; key: string }> = [];

    keys.push({ type: "user", key: subject.principalId });

    if (subject.principalType === "service") {
      keys.push({ type: "service", key: subject.principalId });
    }

    for (const role of subject.roles) {
      keys.push({ type: "kc_role", key: role });
    }

    for (const group of subject.groups) {
      keys.push({ type: "kc_group", key: group });
    }

    return keys;
  }

  private buildScopeKey(resource: PolicyResource): string {
    return `entity:${resource.type}`;
  }

  // ============================================================================
  // Private Methods: Policy Validation
  // ============================================================================

  private validatePolicySchema(policy: unknown): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!policy || typeof policy !== "object") {
      errors.push({
        code: "INVALID_POLICY",
        message: "Policy must be an object",
        severity: "error",
      });
      return errors;
    }

    const p = policy as Record<string, unknown>;

    // Check required fields
    if (!p.name || typeof p.name !== "string") {
      errors.push({
        code: "MISSING_NAME",
        message: "Policy must have a name",
        path: "name",
        severity: "error",
      });
    }

    if (!p.scopeType || typeof p.scopeType !== "string") {
      errors.push({
        code: "MISSING_SCOPE_TYPE",
        message: "Policy must have a scopeType",
        path: "scopeType",
        severity: "error",
      });
    } else {
      const validScopeTypes = ["global", "module", "entity", "entity_version", "record"];
      if (!validScopeTypes.includes(p.scopeType as string)) {
        errors.push({
          code: "INVALID_SCOPE_TYPE",
          message: `scopeType must be one of: ${validScopeTypes.join(", ")}`,
          path: "scopeType",
          severity: "error",
        });
      }
    }

    // Validate rules if present
    if (p.rules) {
      if (!Array.isArray(p.rules)) {
        errors.push({
          code: "INVALID_RULES",
          message: "rules must be an array",
          path: "rules",
          severity: "error",
        });
      } else {
        for (let i = 0; i < p.rules.length; i++) {
          const ruleErrors = this.validateRuleSchema(p.rules[i], `rules[${i}]`);
          errors.push(...ruleErrors);
        }
      }
    }

    return errors;
  }

  private validateRuleSchema(rule: unknown, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!rule || typeof rule !== "object") {
      errors.push({
        code: "INVALID_RULE",
        message: "Rule must be an object",
        path,
        severity: "error",
      });
      return errors;
    }

    const r = rule as Record<string, unknown>;

    // Check effect
    if (!r.effect || !["allow", "deny"].includes(r.effect as string)) {
      errors.push({
        code: "INVALID_EFFECT",
        message: "Rule effect must be 'allow' or 'deny'",
        path: `${path}.effect`,
        severity: "error",
      });
    }

    // Check priority
    if (r.priority !== undefined && typeof r.priority !== "number") {
      errors.push({
        code: "INVALID_PRIORITY",
        message: "Rule priority must be a number",
        path: `${path}.priority`,
        severity: "error",
      });
    }

    // Validate conditions if present
    if (r.conditions) {
      const conditionErrors = this.validateConditionsSchema(r.conditions, `${path}.conditions`);
      errors.push(...conditionErrors);
    }

    return errors;
  }

  private validateConditionsSchema(conditions: unknown, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!conditions || typeof conditions !== "object") {
      errors.push({
        code: "INVALID_CONDITIONS",
        message: "Conditions must be an object",
        path,
        severity: "error",
      });
      return errors;
    }

    const c = conditions as Record<string, unknown>;

    // Check operator
    if (c.operator && !["and", "or"].includes(c.operator as string)) {
      errors.push({
        code: "INVALID_CONDITION_OPERATOR",
        message: "Condition group operator must be 'and' or 'or'",
        path: `${path}.operator`,
        severity: "error",
      });
    }

    // Check conditions array
    if (!Array.isArray(c.conditions)) {
      errors.push({
        code: "MISSING_CONDITIONS_ARRAY",
        message: "Condition group must have conditions array",
        path: `${path}.conditions`,
        severity: "error",
      });
    } else {
      for (let i = 0; i < c.conditions.length; i++) {
        const item = c.conditions[i] as Record<string, unknown>;
        if (item.conditions) {
          // Nested group
          const nestedErrors = this.validateConditionsSchema(item, `${path}.conditions[${i}]`);
          errors.push(...nestedErrors);
        } else {
          // Single condition
          const condErrors = this.validateSingleConditionSchema(item, `${path}.conditions[${i}]`);
          errors.push(...condErrors);
        }
      }
    }

    return errors;
  }

  private validateSingleConditionSchema(condition: Record<string, unknown>, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!condition.field || typeof condition.field !== "string") {
      errors.push({
        code: "MISSING_FIELD",
        message: "Condition must have a field",
        path: `${path}.field`,
        severity: "error",
      });
    }

    if (!condition.operator || typeof condition.operator !== "string") {
      errors.push({
        code: "MISSING_OPERATOR",
        message: "Condition must have an operator",
        path: `${path}.operator`,
        severity: "error",
      });
    } else {
      const validOperators = [
        "eq", "ne", "gt", "gte", "lt", "lte",
        "in", "not_in", "contains", "starts_with", "ends_with",
        "matches", "exists", "not_exists",
      ];
      if (!validOperators.includes(condition.operator as string)) {
        errors.push({
          code: "INVALID_OPERATOR",
          message: `Operator must be one of: ${validOperators.join(", ")}`,
          path: `${path}.operator`,
          severity: "error",
        });
      }
    }

    // Value is required for most operators
    const noValueOperators = ["exists", "not_exists"];
    if (!noValueOperators.includes(condition.operator as string) && condition.value === undefined) {
      errors.push({
        code: "MISSING_VALUE",
        message: "Condition must have a value",
        path: `${path}.value`,
        severity: "error",
      });
    }

    return errors;
  }

  private validatePolicyExpressions(policy: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check if expressions are parseable/evaluable
    if (policy.rules && Array.isArray(policy.rules)) {
      for (let i = 0; i < policy.rules.length; i++) {
        const rule = policy.rules[i];
        if (rule.conditions) {
          try {
            this.validateConditionExpressions(rule.conditions, `rules[${i}].conditions`);
          } catch (e) {
            errors.push({
              code: "INVALID_EXPRESSION",
              message: `Expression error: ${String(e)}`,
              path: `rules[${i}].conditions`,
              severity: "error",
            });
          }
        }
      }
    }

    return errors;
  }

  private validateConditionExpressions(conditions: any, path: string): void {
    if (conditions.conditions && Array.isArray(conditions.conditions)) {
      for (const cond of conditions.conditions) {
        if (cond.conditions) {
          this.validateConditionExpressions(cond, path);
        } else {
          // Validate field path format
          if (cond.field && typeof cond.field === "string") {
            const validPrefixes = ["subject.", "resource.", "action.", "context."];
            const hasValidPrefix = validPrefixes.some((p) => cond.field.startsWith(p));
            // Allow shorthand fields (no prefix)
            if (cond.field.includes(".") && !hasValidPrefix) {
              throw new Error(`Invalid field path: ${cond.field}`);
            }
          }

          // Validate regex for matches operator
          if (cond.operator === "matches" && cond.value) {
            try {
              new RegExp(cond.value);
            } catch {
              throw new Error(`Invalid regex pattern: ${cond.value}`);
            }
          }
        }
      }
    }
  }

  // ============================================================================
  // Private Methods: Test Case Assertions
  // ============================================================================

  private checkAssertions(
    testCase: PolicyTestCase,
    result: SimulatorResult
  ): Array<{
    assertion: string;
    passed: boolean;
    actual?: unknown;
    expected?: unknown;
  }> {
    const assertionResults: Array<{
      assertion: string;
      passed: boolean;
      actual?: unknown;
      expected?: unknown;
    }> = [];

    // Check expected effect
    assertionResults.push({
      assertion: "effect_equals",
      passed: result.decision.effect === testCase.expected.effect,
      actual: result.decision.effect,
      expected: testCase.expected.effect,
    });

    // Check expected allowed
    assertionResults.push({
      assertion: "allowed_equals",
      passed: result.decision.allowed === testCase.expected.allowed,
      actual: result.decision.allowed,
      expected: testCase.expected.allowed,
    });

    // Check expected obligations
    if (testCase.expected.obligations) {
      for (const expectedOb of testCase.expected.obligations) {
        const found = result.decision.obligations.find(
          (ob) => ob.type === expectedOb.type
        );
        assertionResults.push({
          assertion: `has_obligation:${expectedOb.type}`,
          passed: !!found,
          actual: found ? "present" : "absent",
          expected: "present",
        });
      }
    }

    // Check expected deciding rule
    if (testCase.expected.decidingRule) {
      if (testCase.expected.decidingRule.ruleId) {
        assertionResults.push({
          assertion: "deciding_rule_is",
          passed: result.decision.decidingRule?.ruleId === testCase.expected.decidingRule.ruleId,
          actual: result.decision.decidingRule?.ruleId,
          expected: testCase.expected.decidingRule.ruleId,
        });
      }
      if (testCase.expected.decidingRule.policyId) {
        assertionResults.push({
          assertion: "deciding_policy_is",
          passed: result.decision.decidingRule?.policyId === testCase.expected.decidingRule.policyId,
          actual: result.decision.decidingRule?.policyId,
          expected: testCase.expected.decidingRule.policyId,
        });
      }
    }

    // Check additional assertions
    if (testCase.assertions) {
      for (const assertion of testCase.assertions) {
        const assertionResult = this.checkSingleAssertion(assertion, result);
        assertionResults.push(assertionResult);
      }
    }

    return assertionResults;
  }

  private checkSingleAssertion(
    assertion: TestCaseAssertion,
    result: SimulatorResult
  ): { assertion: string; passed: boolean; actual?: unknown; expected?: unknown } {
    switch (assertion.type) {
      case "effect_equals":
        return {
          assertion: "effect_equals",
          passed: result.decision.effect === assertion.value,
          actual: result.decision.effect,
          expected: assertion.value,
        };

      case "allowed_equals":
        return {
          assertion: "allowed_equals",
          passed: result.decision.allowed === assertion.value,
          actual: result.decision.allowed,
          expected: assertion.value,
        };

      case "has_obligation": {
        const hasObligation = result.decision.obligations.some(
          (ob) => ob.type === assertion.obligationType
        );
        return {
          assertion: `has_obligation:${assertion.obligationType}`,
          passed: hasObligation,
          actual: hasObligation ? "present" : "absent",
          expected: "present",
        };
      }

      case "no_obligations":
        return {
          assertion: "no_obligations",
          passed: result.decision.obligations.length === 0,
          actual: result.decision.obligations.length,
          expected: 0,
        };

      case "matched_rules_count": {
        const count = result.decision.matchedRules.length;
        let countPassed = false;
        switch (assertion.operator) {
          case "eq":
            countPassed = count === assertion.value;
            break;
          case "gt":
            countPassed = count > assertion.value;
            break;
          case "lt":
            countPassed = count < assertion.value;
            break;
          case "gte":
            countPassed = count >= assertion.value;
            break;
          case "lte":
            countPassed = count <= assertion.value;
            break;
        }
        return {
          assertion: `matched_rules_count_${assertion.operator}`,
          passed: countPassed,
          actual: count,
          expected: assertion.value,
        };
      }

      case "deciding_rule_is":
        return {
          assertion: "deciding_rule_is",
          passed: result.decision.decidingRule?.ruleId === assertion.ruleId,
          actual: result.decision.decidingRule?.ruleId,
          expected: assertion.ruleId,
        };

      case "deciding_policy_is":
        return {
          assertion: "deciding_policy_is",
          passed: result.decision.decidingRule?.policyId === assertion.policyId,
          actual: result.decision.decidingRule?.policyId,
          expected: assertion.policyId,
        };

      case "eval_time_under":
        return {
          assertion: `eval_time_under_${assertion.maxMs}ms`,
          passed: result.decision.metadata.durationMs <= assertion.maxMs,
          actual: result.decision.metadata.durationMs,
          expected: assertion.maxMs,
        };

      case "custom":
        try {
          const passed = assertion.fn(result);
          return {
            assertion: `custom:${assertion.description}`,
            passed,
            actual: passed ? "passed" : "failed",
            expected: "passed",
          };
        } catch (e) {
          return {
            assertion: `custom:${assertion.description}`,
            passed: false,
            actual: `error: ${String(e)}`,
            expected: "passed",
          };
        }

      default:
        return {
          assertion: "unknown",
          passed: false,
          actual: undefined,
          expected: undefined,
        };
    }
  }

  private buildFailureReason(
    failedAssertions: Array<{ assertion: string; actual?: unknown; expected?: unknown }>
  ): string {
    return failedAssertions
      .map(
        (a) =>
          `${a.assertion}: expected ${JSON.stringify(a.expected)}, got ${JSON.stringify(a.actual)}`
      )
      .join("; ");
  }

  // ============================================================================
  // Private Methods: Utility
  // ============================================================================

  private createErrorDecision(
    error: unknown,
    startTime: number,
    correlationId: string
  ): PolicyDecision {
    return {
      effect: "deny",
      allowed: false,
      obligations: [],
      reasons: [`Error: ${String(error)}`],
      matchedRules: [],
      metadata: {
        durationMs: Date.now() - startTime,
        evaluatedAt: new Date(),
        evaluatorVersion: this.version,
        correlationId,
      },
    };
  }

  private createEmptyExplainTree(startTime: number): SimulatorExplainTree {
    return {
      resolvedInput: {
        subject: {
          principalId: "",
          principalType: "user",
          roles: [],
          groups: [],
          attributes: {},
        },
        resource: {
          type: "",
          attributes: {},
        },
        action: {
          namespace: "ENTITY",
          code: "",
          fullCode: "",
        },
        context: {
          tenantId: "",
          timestamp: new Date(),
          attributes: {},
        },
      },
      subjectResolution: {
        method: "manual",
        subjectKeys: [],
        resolutionTimeMs: 0,
      },
      resourceResolution: {
        method: "manual",
        scopeKey: "",
        resolutionTimeMs: 0,
      },
      policies: [],
      conflictResolution: {
        strategy: "deny_overrides",
        rulesConsidered: 0,
      },
      performance: {
        totalTimeMs: Date.now() - startTime,
        subjectResolutionMs: 0,
        resourceResolutionMs: 0,
        policyEvaluationMs: 0,
        effectResolutionMs: 0,
      },
    };
  }
}

/**
 * Create policy simulator service
 */
export function createPolicySimulator(
  db: Kysely<DB>,
  evaluator: IPolicyEvaluator,
  factsProvider: IFactsProvider
): PolicySimulatorService {
  return new PolicySimulatorService(db, evaluator, factsProvider);
}
