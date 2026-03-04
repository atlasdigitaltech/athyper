/**
 * Rule Evaluation Engine
 *
 * A4: The Real Gate
 * Core policy evaluation engine that:
 * - Matches rules using compiled policy index
 * - Evaluates ABAC conditions
 * - Handles effect precedence (priority-based, deny override)
 * - Returns authorization decision
 */

import {
  evaluateConditionGroup as sharedEvaluateConditionGroup,
  type EvaluationContext,
} from "../shared/condition-evaluator.js";

import type { OperationCatalogService } from "./operation-catalog.service.js";
import type { PolicyCompilerService } from "./policy-compiler.service.js";
import type { PolicyResolutionService } from "./policy-resolution.service.js";
import type { SubjectResolverService } from "./subject-resolver.service.js";
import type {
  AuthorizationDecision,
  AuthorizationRequest,
  CompiledPolicy,
  CompiledRule,
  ScopeType,
  SubjectKey,
  SubjectSnapshot,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Scope specificity order (higher = more specific)
 */
const SCOPE_SPECIFICITY: Record<ScopeType, number> = {
  record: 5,
  entity_version: 4,
  entity: 3,
  module: 2,
  global: 1,
};

/**
 * Rule Evaluation Engine
 */
export class RuleEvaluatorService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly subjectResolver: SubjectResolverService,
    private readonly policyCompiler: PolicyCompilerService,
    private readonly policyResolution: PolicyResolutionService,
    private readonly operationCatalog: OperationCatalogService
  ) {}

  /**
   * Main authorization entry point
   */
  async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const startTime = Date.now();

    try {
      // 1. Resolve subject snapshot
      const subject = await this.subjectResolver.resolveSubject(
        request.principalId,
        request.tenantId
      );

      // 2. Build subject keys for matching
      const subjectKeys = this.subjectResolver.buildSubjectKeys(subject);

      // 3. Get operation ID
      const operation = await this.operationCatalog.getOperation(request.operationCode);
      if (!operation) {
        return this.createDenyDecision(
          request,
          undefined,
          undefined,
          `Unknown operation: ${request.operationCode}`,
          Date.now() - startTime
        );
      }

      // 4. Resolve applicable policies
      const policies = await this.policyResolution.resolvePolicies(
        request.tenantId,
        request.resource
      );

      if (policies.length === 0) {
        // No policies = default deny
        return this.createDenyDecision(
          request,
          undefined,
          undefined,
          "No policies apply to this resource",
          Date.now() - startTime
        );
      }

      // 5. Evaluate each policy in order (most specific first)
      const matchedRules: Array<{
        rule: CompiledRule;
        policyVersionId: string;
        scopeType: ScopeType;
      }> = [];

      for (const policy of policies) {
        // Get or compile policy
        const compiled = await this.policyCompiler.getOrCompile(
          request.tenantId,
          policy.activeVersionId,
          "system"
        );

        if (!compiled) continue;

        // Find matching rules
        const rules = this.findMatchingRules(
          compiled,
          subjectKeys,
          operation.id,
          request.resource,
          policy.scopeType
        );

        for (const rule of rules) {
          // Evaluate conditions
          if (await this.evaluateConditions(rule.conditions, subject, request)) {
            matchedRules.push({
              rule,
              policyVersionId: policy.activeVersionId,
              scopeType: policy.scopeType,
            });
          }
        }
      }

      // 6. Apply effect precedence
      const decision = this.resolveEffectPrecedence(matchedRules, request);

      return {
        ...decision,
        evaluationTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "authorization_error",
          principalId: request.principalId,
          operationCode: request.operationCode,
          error: String(error),
        })
      );

      return this.createDenyDecision(
        request,
        undefined,
        undefined,
        `Authorization error: ${String(error)}`,
        Date.now() - startTime
      );
    }
  }

  /**
   * Quick permission check (returns boolean)
   */
  async hasPermission(
    principalId: string,
    tenantId: string,
    operationCode: string,
    resource: AuthorizationRequest["resource"]
  ): Promise<boolean> {
    const decision = await this.authorize({
      principalId,
      tenantId,
      operationCode: operationCode as AuthorizationRequest["operationCode"],
      resource,
    });

    return decision.effect === "allow";
  }

  /**
   * Find matching rules in compiled policy
   */
  private findMatchingRules(
    compiled: CompiledPolicy,
    subjectKeys: SubjectKey[],
    operationId: string,
    resource: AuthorizationRequest["resource"],
    scopeType: ScopeType
  ): CompiledRule[] {
    const matchedRules: CompiledRule[] = [];

    // Build scope key for lookup
    const scopeKey = this.buildScopeKey(scopeType, resource);

    // Check each subject key
    for (const subjectKey of subjectKeys) {
      const fullSubjectKey = `${subjectKey.type}:${subjectKey.key}`;

      // Look up in index: scope -> subject -> operation
      const scopeIndex = compiled.ruleIndex[scopeKey];
      if (!scopeIndex) continue;

      const subjectIndex = scopeIndex[fullSubjectKey];
      if (!subjectIndex) continue;

      const rules = subjectIndex[operationId];
      if (!rules) continue;

      matchedRules.push(...rules);
    }

    // Also check wildcard subject "*"
    const scopeIndex = compiled.ruleIndex[scopeKey];
    if (scopeIndex) {
      const wildcardIndex = scopeIndex["*"];
      if (wildcardIndex) {
        const rules = wildcardIndex[operationId];
        if (rules) {
          matchedRules.push(...rules);
        }
      }
    }

    return matchedRules;
  }

  /**
   * Build scope key for index lookup
   */
  private buildScopeKey(
    scopeType: ScopeType,
    resource: AuthorizationRequest["resource"]
  ): string {
    switch (scopeType) {
      case "global":
        return "global:*";
      case "module":
        return `module:${resource.moduleCode ?? "*"}`;
      case "entity":
        return `entity:${resource.entityCode}`;
      case "entity_version":
        return `entity_version:${resource.entityCode}:${resource.entityVersionId ?? "*"}`;
      case "record":
        return `record:${resource.entityCode}:${resource.recordId ?? "*"}`;
    }
  }

  /**
   * Evaluate ABAC conditions
   *
   * Delegates to the shared condition evaluator, building a flat context
   * from subject, resource, and environment.
   */
  private async evaluateConditions(
    conditions: CompiledRule["conditions"],
    subject: SubjectSnapshot,
    request: AuthorizationRequest
  ): Promise<boolean> {
    if (!conditions) return true;

    // Build flat evaluation context for the shared evaluator
    const context: EvaluationContext = {
      subject,
      resource: request.resource,
      environment: {
        now: new Date(),
        requestId: crypto.randomUUID(),
      },
      // Spread subject attributes at root level for backward-compatible shorthand paths
      ...subject.attributes,
    };

    return sharedEvaluateConditionGroup(conditions, context);
  }

  /**
   * Resolve effect precedence from matched rules
   *
   * Rules:
   * 1. More specific scope wins (record > entity_version > entity > module > global)
   * 2. Within same scope, lower priority number wins
   * 3. If same scope and priority, deny wins over allow
   */
  private resolveEffectPrecedence(
    matchedRules: Array<{
      rule: CompiledRule;
      policyVersionId: string;
      scopeType: ScopeType;
    }>,
    request: AuthorizationRequest
  ): Omit<AuthorizationDecision, "evaluationTimeMs"> {
    if (matchedRules.length === 0) {
      return {
        effect: "deny",
        principalId: request.principalId,
        operationCode: request.operationCode,
        resourceKey: this.buildResourceKey(request.resource),
        reason: "No matching rules found",
      };
    }

    // Sort by: scope specificity (desc), priority (asc), effect (deny first)
    const sorted = [...matchedRules].sort((a, b) => {
      // 1. Scope specificity (higher = more specific)
      const scopeDiff = SCOPE_SPECIFICITY[b.scopeType] - SCOPE_SPECIFICITY[a.scopeType];
      if (scopeDiff !== 0) return scopeDiff;

      // 2. Priority (lower = higher priority)
      const priorityDiff = a.rule.priority - b.rule.priority;
      if (priorityDiff !== 0) return priorityDiff;

      // 3. Deny wins over allow
      if (a.rule.effect === "deny" && b.rule.effect === "allow") return -1;
      if (a.rule.effect === "allow" && b.rule.effect === "deny") return 1;

      return 0;
    });

    const winner = sorted[0];

    return {
      effect: winner.rule.effect,
      principalId: request.principalId,
      operationCode: request.operationCode,
      resourceKey: this.buildResourceKey(request.resource),
      matchedRuleId: winner.rule.ruleId,
      matchedPolicyVersionId: winner.policyVersionId,
      reason: winner.rule.effect === "allow"
        ? `Allowed by rule ${winner.rule.ruleId} (scope: ${winner.scopeType}, priority: ${winner.rule.priority})`
        : `Denied by rule ${winner.rule.ruleId} (scope: ${winner.scopeType}, priority: ${winner.rule.priority})`,
    };
  }

  /**
   * Build resource key for logging
   */
  private buildResourceKey(resource: AuthorizationRequest["resource"]): string {
    const parts = [resource.entityCode];
    if (resource.moduleCode) parts.unshift(resource.moduleCode);
    if (resource.recordId) parts.push(resource.recordId);
    return parts.join(":");
  }

  /**
   * Create deny decision
   */
  private createDenyDecision(
    request: AuthorizationRequest,
    ruleId: string | undefined,
    policyVersionId: string | undefined,
    reason: string,
    evaluationTimeMs: number
  ): AuthorizationDecision {
    return {
      effect: "deny",
      principalId: request.principalId,
      operationCode: request.operationCode,
      resourceKey: this.buildResourceKey(request.resource),
      matchedRuleId: ruleId,
      matchedPolicyVersionId: policyVersionId,
      reason,
      evaluationTimeMs,
    };
  }
}

// ConditionContext replaced by shared EvaluationContext from ../shared/condition-evaluator
