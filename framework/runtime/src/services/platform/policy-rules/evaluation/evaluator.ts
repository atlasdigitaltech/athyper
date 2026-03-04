/**
 * Policy Evaluator
 *
 * B: Evaluation Pipeline Implementation
 * Core evaluation engine that:
 * 1. Compiles policies into internal representation
 * 2. Filters by scope (tenant/module/entity/action)
 * 3. Evaluates conditions (facts, comparisons, list ops, regex, date/time)
 * 4. Resolves effects (priority, conflict resolution)
 * 5. Processes obligations
 */

import {
  compareRules,
  DEFAULT_EVALUATION_OPTIONS,
  PolicyErrorCodes,
  PolicyEvaluationError,
} from "./types.js";

import type {
  CompiledPolicy,
  CompiledRule,
  Condition,
  ConditionGroup,
  Effect,
  OperationCode,
  ScopeType,
  SubjectType,
} from "../types.js";
import type { IFactsProvider } from "./facts-provider.js";
import type {
  ConflictResolution,
  IPolicyEvaluator,
  MatchedRule,
  PolicyContext,
  PolicyDecision,
  PolicyEvaluationOptions,
  PolicyInput,
  PolicyObligation,
  PolicyResource,
  PolicySubject,
  TraceStep,
} from "./types.js";
import type { OperationCatalogService } from "../operation-catalog.service.js";
import type { PolicyCompilerService } from "../policy-compiler.service.js";
import type { PolicyResolutionService } from "../policy-resolution.service.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Evaluator Configuration
// ============================================================================

export type PolicyEvaluatorConfig = {
  /** Default fail mode (default: closed) */
  failMode: "closed" | "open";

  /** Enable metrics collection */
  metricsEnabled: boolean;

  /** Enable trace logging */
  traceEnabled: boolean;

  /** Evaluator version */
  version: string;
};

const DEFAULT_CONFIG: PolicyEvaluatorConfig = {
  failMode: "closed",
  metricsEnabled: true,
  traceEnabled: false,
  version: "1.0.0",
};

// ============================================================================
// Policy Evaluator Implementation
// ============================================================================

/**
 * Policy Evaluator Service
 */
export class PolicyEvaluatorService implements IPolicyEvaluator {
  private readonly config: PolicyEvaluatorConfig;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly factsProvider: IFactsProvider,
    private readonly policyCompiler: PolicyCompilerService,
    private readonly policyResolution: PolicyResolutionService,
    private readonly operationCatalog: OperationCatalogService,
    config?: Partial<PolicyEvaluatorConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main evaluation entry point
   */
  async evaluate(
    input: PolicyInput,
    options?: PolicyEvaluationOptions
  ): Promise<PolicyDecision> {
    const startTime = Date.now();
    const opts = this.mergeOptions(options);
    const trace: TraceStep[] = [];

    try {
      // Check timeout budget
      const deadline = startTime + (opts.limits?.timeoutMs ?? 100);

      // 1. Get operation info
      const operation = await this.operationCatalog.getOperation(
        `${input.action.namespace}.${input.action.code}` as OperationCode
      );

      if (!operation) {
        return this.createDenyDecision(
          input,
          [`Unknown operation: ${input.action.fullCode}`],
          [],
          startTime,
          opts
        );
      }

      // 2. Resolve applicable policies
      const scopeFilterStart = Date.now();
      const policies = await this.policyResolution.resolvePolicies(
        input.context.tenantId,
        {
          entityCode: input.resource.type,
          moduleCode: input.resource.module,
          entityVersionId: input.resource.versionId,
          recordId: input.resource.id,
        }
      );

      if (opts.trace) {
        trace.push({
          step: "scope_filter",
          type: "scope_filter",
          input: { tenantId: input.context.tenantId, resource: input.resource.type },
          output: { policiesFound: policies.length },
          durationUs: (Date.now() - scopeFilterStart) * 1000,
        });
      }

      if (policies.length === 0) {
        return this.createDenyDecision(
          input,
          ["No policies apply to this resource"],
          [],
          startTime,
          opts,
          trace
        );
      }

      // 3. Build subject keys for matching
      const subjectKeys = this.buildSubjectKeys(input.subject);

      // 4. Evaluate each policy
      const matchedRules: MatchedRule[] = [];
      let rulesScanned = 0;
      let policiesEvaluated = 0;

      for (const policy of policies) {
        // Check timeout
        if (Date.now() > deadline) {
          throw new PolicyEvaluationError(
            PolicyErrorCodes.POLICY_EVAL_TIMEOUT,
            `Evaluation timed out after ${opts.limits?.timeoutMs}ms`
          );
        }

        // Check rules limit
        if (rulesScanned >= (opts.limits?.maxRulesScanned ?? 1000)) {
          break;
        }

        policiesEvaluated++;

        // Get or compile policy
        const compiled = await this.policyCompiler.getOrCompile(
          input.context.tenantId,
          policy.activeVersionId,
          "system"
        );

        if (!compiled) continue;

        // Find and evaluate matching rules
        const conditionEvalStart = Date.now();
        const rules = await this.findAndEvaluateRules(
          compiled,
          subjectKeys,
          operation.id,
          input,
          policy.scopeType,
          opts
        );

        rulesScanned += rules.scanned;

        if (opts.trace) {
          trace.push({
            step: `evaluate_policy_${policy.policy.name}`,
            type: "condition_eval",
            input: { policyId: policy.policy.id, versionId: policy.activeVersionId },
            output: { rulesMatched: rules.matched.length, rulesScanned: rules.scanned },
            durationUs: (Date.now() - conditionEvalStart) * 1000,
          });
        }

        // Add matched rules with policy info
        for (const rule of rules.matched) {
          matchedRules.push({
            ruleId: rule.ruleId,
            policyId: policy.policy.id,
            policyVersionId: policy.activeVersionId,
            policyName: policy.policy.name,
            effect: rule.effect,
            priority: rule.priority,
            scopeType: policy.scopeType,
            subjectType: rule.subjectType,
            subjectKey: rule.subjectKey,
            conditions: rule.conditions
              ? { expression: rule.conditions, result: true }
              : undefined,
          });
        }

        // Short-circuit if configured
        if (opts.stopOnFirstMatch && matchedRules.length > 0) {
          if (opts.trace) {
            trace.push({
              step: "short_circuit",
              type: "short_circuit",
              output: { reason: "stopOnFirstMatch" },
              durationUs: 0,
            });
          }
          break;
        }
      }

      // 5. Resolve effect based on conflict resolution strategy
      const effectResolutionStart = Date.now();
      const decision = this.resolveEffect(
        matchedRules,
        input,
        opts.conflictResolution ?? "deny_overrides"
      );

      if (opts.trace) {
        trace.push({
          step: "effect_resolution",
          type: "effect_resolution",
          input: { matchedRulesCount: matchedRules.length, strategy: opts.conflictResolution },
          output: { effect: decision.effect },
          durationUs: (Date.now() - effectResolutionStart) * 1000,
        });
      }

      // 6. Process obligations
      const obligations: PolicyObligation[] = [];
      if (opts.includeObligations && decision.decidingRule) {
        const obligationStart = Date.now();
        const ruleObligations = await this.processObligations(
          decision.decidingRule,
          input,
          decision.effect
        );
        obligations.push(...ruleObligations);

        if (opts.trace) {
          trace.push({
            step: "process_obligations",
            type: "obligation",
            output: { obligationsCount: obligations.length },
            durationUs: (Date.now() - obligationStart) * 1000,
          });
        }
      }

      // Build final decision
      const finalDecision: PolicyDecision = {
        effect: decision.effect,
        allowed: decision.effect === "allow",
        obligations,
        reasons: decision.reasons,
        matchedRules: opts.explain
          ? matchedRules.slice(0, opts.limits?.maxMatchesReturned ?? 50)
          : [],
        decidingRule: decision.decidingRule,
        metadata: {
          durationMs: Date.now() - startTime,
          evaluatedAt: new Date(),
          evaluatorVersion: this.config.version,
          correlationId: input.context.correlationId,
        },
      };

      // Add debug info if requested
      if (opts.explain) {
        finalDecision.debug = {
          rulesScanned,
          rulesMatched: matchedRules.length,
          policiesEvaluated,
          trace: opts.trace ? trace : undefined,
        };
      }

      return finalDecision;
    } catch (error) {
      // Handle errors based on fail mode
      if (error instanceof PolicyEvaluationError) {
        throw error;
      }

      console.error(
        JSON.stringify({
          msg: "policy_evaluation_error",
          tenantId: input.context.tenantId,
          principalId: input.subject.principalId,
          action: input.action.fullCode,
          resource: input.resource.type,
          error: String(error),
        })
      );

      if (this.config.failMode === "closed" || opts.strict) {
        return this.createDenyDecision(
          input,
          [`Evaluation error: ${String(error)}`],
          [],
          startTime,
          opts,
          trace
        );
      }

      throw new PolicyEvaluationError(
        PolicyErrorCodes.INTERNAL_ERROR,
        `Evaluation failed: ${String(error)}`
      );
    }
  }

  /**
   * Check if action is allowed
   */
  async isAllowed(
    input: PolicyInput,
    options?: PolicyEvaluationOptions
  ): Promise<boolean> {
    const decision = await this.evaluate(input, {
      ...options,
      explain: false,
      trace: false,
    });
    return decision.allowed;
  }

  /**
   * Enforce policy (throws if denied)
   */
  async enforce(
    input: PolicyInput,
    options?: PolicyEvaluationOptions
  ): Promise<void> {
    const decision = await this.evaluate(input, options);

    if (!decision.allowed) {
      throw new PolicyEvaluationError(
        PolicyErrorCodes.POLICY_EVAL_TIMEOUT, // Could use a specific "access denied" code
        `Access denied: ${input.action.fullCode} on ${input.resource.type}`,
        {
          reasons: decision.reasons,
          matchedRule: decision.decidingRule,
        }
      );
    }
  }

  /**
   * Get all permissions for a subject on a resource
   */
  async getPermissions(
    subject: PolicySubject,
    resource: PolicyResource,
    context: PolicyContext,
    options?: PolicyEvaluationOptions
  ): Promise<Map<string, PolicyDecision>> {
    const permissions = new Map<string, PolicyDecision>();

    // Get all operations
    const operations = await this.operationCatalog.listOperations();

    // Evaluate each operation
    for (const op of operations) {
      const input: PolicyInput = {
        subject,
        resource,
        action: {
          namespace: op.namespace as PolicyInput["action"]["namespace"],
          code: op.code,
          fullCode: `${op.namespace}.${op.code}`,
        },
        context,
      };

      const decision = await this.evaluate(input, {
        ...options,
        explain: false,
        trace: false,
      });

      permissions.set(input.action.fullCode, decision);
    }

    return permissions;
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Merge options with defaults
   */
  private mergeOptions(options?: PolicyEvaluationOptions): Required<PolicyEvaluationOptions> {
    return {
      ...DEFAULT_EVALUATION_OPTIONS,
      ...options,
      limits: {
        ...DEFAULT_EVALUATION_OPTIONS.limits,
        ...options?.limits,
      },
    };
  }

  /**
   * Build subject keys for rule matching
   */
  private buildSubjectKeys(subject: PolicySubject): Array<{ type: SubjectType; key: string }> {
    const keys: Array<{ type: SubjectType; key: string }> = [];

    // User key
    keys.push({ type: "user", key: subject.principalId });

    // Service key
    if (subject.principalType === "service") {
      keys.push({ type: "service", key: subject.principalId });
    }

    // Role keys
    for (const role of subject.roles) {
      keys.push({ type: "kc_role", key: role });
    }

    // Group keys
    for (const group of subject.groups) {
      keys.push({ type: "kc_group", key: group });
    }

    return keys;
  }

  /**
   * Find and evaluate matching rules in a compiled policy
   */
  private async findAndEvaluateRules(
    compiled: CompiledPolicy,
    subjectKeys: Array<{ type: SubjectType; key: string }>,
    operationId: string,
    input: PolicyInput,
    scopeType: ScopeType,
    options: Required<PolicyEvaluationOptions>
  ): Promise<{
    matched: Array<CompiledRule & { subjectType: SubjectType; subjectKey: string }>;
    scanned: number;
  }> {
    const matched: Array<CompiledRule & { subjectType: SubjectType; subjectKey: string }> = [];
    let scanned = 0;

    // Build scope key for lookup
    const scopeKey = this.buildScopeKey(scopeType, input.resource);

    // Check each subject key
    for (const subjectKey of subjectKeys) {
      const fullSubjectKey = `${subjectKey.type}:${subjectKey.key}`;

      const scopeIndex = compiled.ruleIndex[scopeKey];
      if (!scopeIndex) continue;

      const subjectIndex = scopeIndex[fullSubjectKey];
      if (!subjectIndex) continue;

      // Check operation-specific rules
      const opRules = subjectIndex[operationId] ?? [];
      // Check wildcard operation rules
      const wildcardRules = subjectIndex["*"] ?? [];

      const allRules = [...opRules, ...wildcardRules];
      scanned += allRules.length;

      for (const rule of allRules) {
        // Evaluate conditions if present
        if (rule.conditions) {
          const conditionResult = this.evaluateConditions(
            rule.conditions,
            input,
            options.limits?.maxExpressionDepth ?? 10
          );

          if (!conditionResult) continue;
        }

        matched.push({
          ...rule,
          subjectType: subjectKey.type,
          subjectKey: subjectKey.key,
        });
      }
    }

    // Also check wildcard subject "*"
    const scopeIndex = compiled.ruleIndex[scopeKey];
    if (scopeIndex) {
      const wildcardSubjectIndex = scopeIndex["*"];
      if (wildcardSubjectIndex) {
        const opRules = wildcardSubjectIndex[operationId] ?? [];
        const wildcardRules = wildcardSubjectIndex["*"] ?? [];

        const allRules = [...opRules, ...wildcardRules];
        scanned += allRules.length;

        for (const rule of allRules) {
          if (rule.conditions) {
            const conditionResult = this.evaluateConditions(
              rule.conditions,
              input,
              options.limits?.maxExpressionDepth ?? 10
            );

            if (!conditionResult) continue;
          }

          matched.push({
            ...rule,
            subjectType: "user" as SubjectType, // Wildcard matches all
            subjectKey: "*",
          });
        }
      }
    }

    return { matched, scanned };
  }

  /**
   * Build scope key for index lookup
   */
  private buildScopeKey(scopeType: ScopeType, resource: PolicyResource): string {
    switch (scopeType) {
      case "global":
        return "global:*";
      case "module":
        return `module:${resource.module ?? "*"}`;
      case "entity":
        return `entity:${resource.type}`;
      case "entity_version":
        return `entity_version:${resource.type}:${resource.versionId ?? "*"}`;
      case "record":
        return `record:${resource.type}:${resource.id ?? "*"}`;
    }
  }

  /**
   * Evaluate conditions against input
   */
  private evaluateConditions(
    conditions: ConditionGroup,
    input: PolicyInput,
    maxDepth: number,
    currentDepth: number = 0
  ): boolean {
    if (currentDepth > maxDepth) {
      throw new PolicyEvaluationError(
        PolicyErrorCodes.POLICY_EXPR_TOO_DEEP,
        `Expression depth exceeded maximum of ${maxDepth}`
      );
    }

    const operator = conditions.operator ?? "and";

    if (operator === "and") {
      for (const condition of conditions.conditions) {
        if ("conditions" in condition) {
          if (!this.evaluateConditions(condition as ConditionGroup, input, maxDepth, currentDepth + 1)) {
            return false;
          }
        } else {
          if (!this.evaluateSingleCondition(condition as Condition, input)) {
            return false;
          }
        }
      }
      return true;
    } else {
      for (const condition of conditions.conditions) {
        if ("conditions" in condition) {
          if (this.evaluateConditions(condition as ConditionGroup, input, maxDepth, currentDepth + 1)) {
            return true;
          }
        } else {
          if (this.evaluateSingleCondition(condition as Condition, input)) {
            return true;
          }
        }
      }
      return false;
    }
  }

  /**
   * Evaluate a single condition
   */
  private evaluateSingleCondition(condition: Condition, input: PolicyInput): boolean {
    const fieldValue = this.resolveFieldValue(condition.field, input);
    const compareValue = condition.value;

    switch (condition.operator) {
      case "eq":
        return fieldValue === compareValue;

      case "ne":
        return fieldValue !== compareValue;

      case "gt":
        return typeof fieldValue === "number" &&
          typeof compareValue === "number" &&
          fieldValue > compareValue;

      case "gte":
        return typeof fieldValue === "number" &&
          typeof compareValue === "number" &&
          fieldValue >= compareValue;

      case "lt":
        return typeof fieldValue === "number" &&
          typeof compareValue === "number" &&
          fieldValue < compareValue;

      case "lte":
        return typeof fieldValue === "number" &&
          typeof compareValue === "number" &&
          fieldValue <= compareValue;

      case "in":
        return Array.isArray(compareValue) && compareValue.includes(fieldValue);

      case "not_in":
        return Array.isArray(compareValue) && !compareValue.includes(fieldValue);

      case "contains":
        return typeof fieldValue === "string" &&
          typeof compareValue === "string" &&
          fieldValue.includes(compareValue);

      case "starts_with":
        return typeof fieldValue === "string" &&
          typeof compareValue === "string" &&
          fieldValue.startsWith(compareValue);

      case "ends_with":
        return typeof fieldValue === "string" &&
          typeof compareValue === "string" &&
          fieldValue.endsWith(compareValue);

      case "matches":
        try {
          return typeof fieldValue === "string" &&
            typeof compareValue === "string" &&
            new RegExp(compareValue).test(fieldValue);
        } catch {
          return false;
        }

      case "exists":
        return fieldValue !== undefined && fieldValue !== null;

      case "not_exists":
        return fieldValue === undefined || fieldValue === null;

      default:
        return false;
    }
  }

  /**
   * Resolve field value from input
   */
  private resolveFieldValue(field: string, input: PolicyInput): unknown {
    const parts = field.split(".");
    const source = parts[0];
    const path = parts.slice(1);

    let value: unknown;

    switch (source) {
      case "subject":
        value = input.subject;
        break;
      case "resource":
        value = input.resource;
        break;
      case "action":
        value = input.action;
        break;
      case "context":
        value = input.context;
        break;
      default:
        // Try subject attributes as shorthand
        if (input.subject.attributes[field] !== undefined) {
          return input.subject.attributes[field];
        }
        // Try resource attributes as shorthand
        if (input.resource.attributes[field] !== undefined) {
          return input.resource.attributes[field];
        }
        return undefined;
    }

    for (const key of path) {
      if (value === null || value === undefined) return undefined;
      if (typeof value === "object") {
        value = (value as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Resolve effect from matched rules
   */
  private resolveEffect(
    matchedRules: MatchedRule[],
    input: PolicyInput,
    strategy: ConflictResolution
  ): { effect: Effect; reasons: string[]; decidingRule?: MatchedRule } {
    if (matchedRules.length === 0) {
      return {
        effect: "deny",
        reasons: ["No matching rules found (default deny)"],
      };
    }

    // Sort rules by determinism rules
    const sorted = [...matchedRules].sort((a, b) =>
      compareRules(
        { ...a, ruleId: a.ruleId },
        { ...b, ruleId: b.ruleId }
      )
    );

    switch (strategy) {
      case "deny_overrides": {
        // If any deny, result is deny
        const denyRule = sorted.find((r) => r.effect === "deny");
        if (denyRule) {
          return {
            effect: "deny",
            reasons: [
              `Denied by rule ${denyRule.ruleId} in policy ${denyRule.policyName} (deny_overrides)`,
            ],
            decidingRule: denyRule,
          };
        }

        const allowRule = sorted[0];
        return {
          effect: "allow",
          reasons: [
            `Allowed by rule ${allowRule.ruleId} in policy ${allowRule.policyName}`,
          ],
          decidingRule: allowRule,
        };
      }

      case "allow_overrides": {
        // If any allow, result is allow
        const allowRule = sorted.find((r) => r.effect === "allow");
        if (allowRule) {
          return {
            effect: "allow",
            reasons: [
              `Allowed by rule ${allowRule.ruleId} in policy ${allowRule.policyName} (allow_overrides)`,
            ],
            decidingRule: allowRule,
          };
        }

        const denyRule = sorted[0];
        return {
          effect: "deny",
          reasons: [
            `Denied by rule ${denyRule.ruleId} in policy ${denyRule.policyName}`,
          ],
          decidingRule: denyRule,
        };
      }

      case "priority_order":
      case "first_match": {
        // Highest priority (first in sorted list) wins
        const winner = sorted[0];
        return {
          effect: winner.effect,
          reasons: [
            `${winner.effect === "allow" ? "Allowed" : "Denied"} by rule ${winner.ruleId} in policy ${winner.policyName} (priority: ${winner.priority})`,
          ],
          decidingRule: winner,
        };
      }

      default:
        // Default to deny_overrides behavior
        return this.resolveEffect(matchedRules, input, "deny_overrides");
    }
  }

  /**
   * Process obligations from winning rule
   */
  private async processObligations(
    _rule: MatchedRule,
    _input: PolicyInput,
    _effect: Effect
  ): Promise<PolicyObligation[]> {
    // TODO: Load obligations from rule definition
    // For now, return empty - obligations would be stored with rules
    // and processed based on effect (some only apply on allow, some on deny)

    return [];
  }

  /**
   * Create a deny decision
   */
  private createDenyDecision(
    input: PolicyInput,
    reasons: string[],
    matchedRules: MatchedRule[],
    startTime: number,
    options: Required<PolicyEvaluationOptions>,
    trace?: TraceStep[]
  ): PolicyDecision {
    const decision: PolicyDecision = {
      effect: "deny",
      allowed: false,
      obligations: [],
      reasons,
      matchedRules: options.explain ? matchedRules : [],
      metadata: {
        durationMs: Date.now() - startTime,
        evaluatedAt: new Date(),
        evaluatorVersion: this.config.version,
        correlationId: input.context.correlationId,
      },
    };

    if (options.explain) {
      decision.debug = {
        rulesScanned: 0,
        rulesMatched: matchedRules.length,
        policiesEvaluated: 0,
        trace: options.trace ? trace : undefined,
      };
    }

    return decision;
  }
}

/**
 * Create policy evaluator
 */
export function createPolicyEvaluator(
  db: Kysely<DB>,
  factsProvider: IFactsProvider,
  policyCompiler: PolicyCompilerService,
  policyResolution: PolicyResolutionService,
  operationCatalog: OperationCatalogService,
  config?: Partial<PolicyEvaluatorConfig>
): PolicyEvaluatorService {
  return new PolicyEvaluatorService(
    db,
    factsProvider,
    policyCompiler,
    policyResolution,
    operationCatalog,
    config
  );
}
