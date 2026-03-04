/**
 * Validation Rules Engine
 *
 * Dynamic rule execution engine for the META Engine.
 * Compiles validation rules per entity version, caches the compiled graph,
 * and evaluates rules at runtime against record data.
 *
 * Supports:
 * - 10 rule types (required, min_max, length, regex, enum, cross_field,
 *   conditional, date_range, referential, unique)
 * - L1 (in-memory LRU) + L2 (Redis) compiled rule cache
 * - Trigger filtering (create/update/transition/all)
 * - Phase filtering (beforePersist/beforeTransition)
 * - Severity levels (error blocks save, warning is advisory)
 */

import {
  evaluateConditionGroup,
  resolveFieldValue,
  type EvaluationContext,
} from "../../shared/condition-evaluator.js";
import { META_SPANS, withSpan } from "../observability/tracing.js";

import type { MetaMetrics } from "../observability/metrics.js";
import type { DB } from "@athyper/adapter-db";
import type {
  CompiledModel,
  MetaCompiler,
  MetaRegistry,
  RequestContext,
  ValidationRule,
  ValidationRuleSet,
  ValidationTrigger,
  ValidationPhase,
  RuleValidationError,
  RuleValidationResult,
  ConditionalRule,
} from "@athyper/core/meta";
import type { Redis } from "ioredis";
import type { Kysely } from "kysely";

// ============================================================================
// LRU Cache (simple in-memory)
// ============================================================================

class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest entry
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

// ============================================================================
// Compiled Rule Graph
// ============================================================================

export type CompiledRuleGraph = {
  entityName: string;
  version: string;
  rules: ValidationRule[];
  compiledAt: Date;
};

// ============================================================================
// Validation Engine Service
// ============================================================================

export class ValidationEngineService {
  private l1Cache: LRUCache<string, CompiledRuleGraph>;
  private metrics?: MetaMetrics;

  private static readonly L2_PREFIX = "meta:vrules:";
  private static readonly L2_TTL = 3600; // 1 hour

  constructor(
    private readonly compiler: MetaCompiler,
    private readonly registry: MetaRegistry,
    private readonly cache: Redis,
    private readonly db: Kysely<DB>,
  ) {
    this.l1Cache = new LRUCache(128);
  }

  /** Set metrics collector for observability (late binding). */
  setMetrics(metrics: MetaMetrics): void {
    this.metrics = metrics;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Validate record data against entity validation rules.
   *
   * @param entityName - Entity name
   * @param data - Record data to validate
   * @param trigger - Operation trigger (create/update/transition)
   * @param ctx - Request context for tenant isolation
   * @param existingRecord - Previous record state (for update comparisons)
   */
  async validate(
    entityName: string,
    data: Record<string, unknown>,
    trigger: ValidationTrigger,
    ctx: RequestContext,
    existingRecord?: Record<string, unknown>,
  ): Promise<RuleValidationResult> {
    return withSpan(
      META_SPANS.VALIDATE,
      {
        "meta.entity": entityName,
        "meta.trigger": trigger,
        "meta.tenant_id": ctx.tenantId,
      },
      async (span) => {
        const start = Date.now();
        const graph = await this.compileRules(entityName, "v1");
        span.setAttribute("meta.rule_count", graph.rules.length);

        const result = await this.executeRules(
          graph.rules,
          data,
          trigger,
          "beforePersist",
          ctx,
          entityName,
          existingRecord,
        );

        const durationMs = Date.now() - start;
        span.setAttribute("meta.error_count", result.errors.length);
        span.setAttribute("meta.warning_count", result.warnings.length);
        this.metrics?.ruleExecutionTime(durationMs, { entity: entityName });

        for (const err of result.errors) {
          this.metrics?.validationFailure({
            entity: entityName,
            rule_kind: (err as any).ruleKind ?? "unknown",
            severity: "error",
          });
        }
        for (const warn of result.warnings) {
          this.metrics?.validationFailure({
            entity: entityName,
            rule_kind: (warn as any).ruleKind ?? "unknown",
            severity: "warning",
          });
        }

        return result;
      },
    );
  }

  /**
   * Validate data before a lifecycle transition.
   */
  async validateForTransition(
    entityName: string,
    data: Record<string, unknown>,
    ctx: RequestContext,
  ): Promise<RuleValidationResult> {
    const graph = await this.compileRules(entityName, "v1");
    return this.executeRules(
      graph.rules,
      data,
      "transition",
      "beforeTransition",
      ctx,
      entityName,
    );
  }

  /**
   * Test validation rules against a payload without persisting.
   * Used by the rule builder preview / test panel.
   *
   * @param entityName - Entity name (for referential/unique rule DB lookups)
   * @param payload - Test payload
   * @param rules - Override rules (if provided, uses these instead of stored rules)
   * @param trigger - Test trigger mode
   */
  async testRules(
    entityName: string,
    payload: Record<string, unknown>,
    rules?: ValidationRule[],
    trigger: ValidationTrigger = "create",
  ): Promise<RuleValidationResult> {
    const effectiveRules =
      rules ?? (await this.compileRules(entityName, "v1")).rules;
    const ctx: RequestContext = {
      userId: "test",
      tenantId: "test",
      realmId: "test",
      roles: [],
    };
    return this.executeRules(
      effectiveRules,
      payload,
      trigger,
      "beforePersist",
      ctx,
      entityName,
    );
  }

  /**
   * Compile and cache validation rules for an entity.
   */
  async compileRules(
    entityName: string,
    version: string,
  ): Promise<CompiledRuleGraph> {
    const cacheKey = `${entityName}:${version}`;

    // L1 check
    const l1 = this.l1Cache.get(cacheKey);
    if (l1) return l1;

    // L2 check
    const l2Key = `${ValidationEngineService.L2_PREFIX}${cacheKey}`;
    try {
      const l2Raw = await this.cache.get(l2Key);
      if (l2Raw) {
        const graph = JSON.parse(l2Raw) as CompiledRuleGraph;
        graph.compiledAt = new Date(graph.compiledAt);
        this.l1Cache.set(cacheKey, graph);
        return graph;
      }
    } catch {
      // Redis unavailable — continue to compile
    }

    // Compile from model
    const model = await this.compiler.compile(entityName, version);
    const rules = this.extractRulesFromModel(model);

    const graph: CompiledRuleGraph = {
      entityName,
      version,
      rules,
      compiledAt: new Date(),
    };

    // Store in L1 + L2
    this.l1Cache.set(cacheKey, graph);
    try {
      await this.cache.set(
        l2Key,
        JSON.stringify(graph),
        "EX",
        ValidationEngineService.L2_TTL,
      );
    } catch {
      // Best-effort L2 cache
    }

    return graph;
  }

  /**
   * Invalidate cached rules for an entity.
   */
  async invalidateRuleCache(entityName: string): Promise<void> {
    // Clear L1 entries for all versions of this entity
    this.l1Cache.delete(`${entityName}:v1`);

    // Clear L2
    try {
      const pattern = `${ValidationEngineService.L2_PREFIX}${entityName}:*`;
      const keys = await this.cache.keys(pattern);
      if (keys.length > 0) {
        await this.cache.del(...keys);
      }
    } catch {
      // Best-effort
    }
  }

  // ==========================================================================
  // Rule Extraction
  // ==========================================================================

  /**
   * Extract validation rules from a compiled model.
   * Rules are stored as ValidationRuleSet JSON in the field's validation column.
   */
  private extractRulesFromModel(model: CompiledModel): ValidationRule[] {
    const allRules: ValidationRule[] = [];

    for (const field of model.fields) {
      // The compiled model may carry per-field validation rules
      // stored in the source metadata. We look at the raw field definition.
      const fieldRules = (field as unknown as Record<string, unknown>)
        .validationRules;
      if (!fieldRules) continue;

      const ruleSet = fieldRules as ValidationRuleSet;
      if (ruleSet.rules && Array.isArray(ruleSet.rules)) {
        allRules.push(...ruleSet.rules);
      }
    }

    return allRules;
  }

  // ==========================================================================
  // Rule Execution
  // ==========================================================================

  private async executeRules(
    rules: ValidationRule[],
    data: Record<string, unknown>,
    trigger: ValidationTrigger,
    phase: ValidationPhase,
    ctx: RequestContext,
    entityName: string,
    existingRecord?: Record<string, unknown>,
  ): Promise<RuleValidationResult> {
    const errors: RuleValidationError[] = [];
    const warnings: RuleValidationError[] = [];

    // Build evaluation context: flat record data with optional existing record
    const evalContext: EvaluationContext = {
      ...data,
      _existing: existingRecord ?? {},
      _ctx: ctx,
    };

    // Filter rules by trigger and phase
    const applicableRules = rules.filter((rule) => {
      if (
        !rule.appliesOn.includes(trigger) &&
        !rule.appliesOn.includes("all")
      ) {
        return false;
      }
      return rule.phase === phase;
    });

    for (const rule of applicableRules) {
      const result = await this.evaluateRule(
        rule,
        data,
        evalContext,
        ctx,
        entityName,
      );
      if (result) {
        if (result.severity === "error") {
          errors.push(result);
        } else {
          warnings.push(result);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Evaluate a single validation rule.
   * Returns a RuleValidationError if the rule fails, null if it passes.
   */
  private async evaluateRule(
    rule: ValidationRule,
    data: Record<string, unknown>,
    evalContext: EvaluationContext,
    ctx: RequestContext,
    entityName: string,
  ): Promise<RuleValidationError | null> {
    const value = resolveFieldValue(rule.fieldPath, data as EvaluationContext);

    switch (rule.kind) {
      case "required":
        return this.evalRequired(rule, value);

      case "min_max":
        return this.evalMinMax(rule, value);

      case "length":
        return this.evalLength(rule, value);

      case "regex":
        return this.evalRegex(rule, value);

      case "enum":
        return this.evalEnum(rule, value);

      case "cross_field":
        return this.evalCrossField(rule, value, data);

      case "conditional":
        return await this.evalConditional(
          rule,
          data,
          evalContext,
          ctx,
          entityName,
        );

      case "date_range":
        return this.evalDateRange(rule, value, data);

      case "referential":
        return await this.evalReferential(rule, value, ctx);

      case "unique":
        return await this.evalUnique(rule, value, data, ctx, entityName);

      default:
        return null;
    }
  }

  // ==========================================================================
  // Rule Type Evaluators
  // ==========================================================================

  private evalRequired(
    rule: ValidationRule,
    value: unknown,
  ): RuleValidationError | null {
    if (value === undefined || value === null || value === "") {
      return this.makeError(rule, value, `${rule.fieldPath} is required`);
    }
    return null;
  }

  private evalMinMax(
    rule: ValidationRule & { kind: "min_max" },
    value: unknown,
  ): RuleValidationError | null {
    if (value === undefined || value === null) return null; // Skip nulls (use required rule for that)
    const num = typeof value === "number" ? value : Number(value);
    if (isNaN(num))
      return this.makeError(rule, value, `${rule.fieldPath} must be a number`);

    if (rule.min !== undefined && num < rule.min) {
      return this.makeError(
        rule,
        value,
        `${rule.fieldPath} must be at least ${rule.min}`,
      );
    }
    if (rule.max !== undefined && num > rule.max) {
      return this.makeError(
        rule,
        value,
        `${rule.fieldPath} must be at most ${rule.max}`,
      );
    }
    return null;
  }

  private evalLength(
    rule: ValidationRule & { kind: "length" },
    value: unknown,
  ): RuleValidationError | null {
    if (value === undefined || value === null) return null;
    const str = String(value);

    if (rule.minLength !== undefined && str.length < rule.minLength) {
      return this.makeError(
        rule,
        value,
        `${rule.fieldPath} must be at least ${rule.minLength} characters`,
      );
    }
    if (rule.maxLength !== undefined && str.length > rule.maxLength) {
      return this.makeError(
        rule,
        value,
        `${rule.fieldPath} must be at most ${rule.maxLength} characters`,
      );
    }
    return null;
  }

  private evalRegex(
    rule: ValidationRule & { kind: "regex" },
    value: unknown,
  ): RuleValidationError | null {
    if (value === undefined || value === null) return null;
    const str = String(value);

    try {
      const regex = new RegExp(rule.pattern, rule.flags);
      if (!regex.test(str)) {
        return this.makeError(
          rule,
          value,
          rule.message ??
            `${rule.fieldPath} does not match the required pattern`,
        );
      }
    } catch {
      return this.makeError(
        rule,
        value,
        `Invalid regex pattern: ${rule.pattern}`,
      );
    }
    return null;
  }

  private evalEnum(
    rule: ValidationRule & { kind: "enum" },
    value: unknown,
  ): RuleValidationError | null {
    if (value === undefined || value === null) return null;
    const str = String(value);

    if (!rule.allowedValues.includes(str)) {
      return this.makeError(
        rule,
        value,
        `${rule.fieldPath} must be one of: ${rule.allowedValues.join(", ")}`,
      );
    }
    return null;
  }

  private evalCrossField(
    rule: ValidationRule & { kind: "cross_field" },
    value: unknown,
    data: Record<string, unknown>,
  ): RuleValidationError | null {
    if (value === undefined || value === null) return null;

    const compareValue = resolveFieldValue(
      rule.compareField,
      data as EvaluationContext,
    );
    if (compareValue === undefined || compareValue === null) return null;

    // Use the shared condition evaluator for the comparison
    const conditionResult = evaluateConditionGroup(
      {
        operator: "and",
        conditions: [
          {
            field: rule.fieldPath,
            operator: rule.operator,
            value: compareValue,
          },
        ],
      },
      data as EvaluationContext,
    );

    if (!conditionResult) {
      return this.makeError(
        rule,
        value,
        rule.message ??
          `${rule.fieldPath} must be ${rule.operator} ${rule.compareField}`,
      );
    }
    return null;
  }

  private async evalConditional(
    rule: ConditionalRule,
    data: Record<string, unknown>,
    evalContext: EvaluationContext,
    ctx: RequestContext,
    entityName: string,
  ): Promise<RuleValidationError | null> {
    // Check if the "when" condition is met
    const conditionMet = evaluateConditionGroup(rule.when, evalContext);
    if (!conditionMet) return null; // Condition not met — skip nested rules

    // Evaluate nested "then" rules
    for (const nestedRule of rule.then) {
      const value = resolveFieldValue(
        nestedRule.fieldPath,
        data as EvaluationContext,
      );
      const result = await this.evaluateRule(
        nestedRule,
        data,
        evalContext,
        ctx,
        entityName,
      );
      if (result) {
        // Override severity with parent rule severity if parent is "error"
        return {
          ...result,
          severity: rule.severity === "error" ? "error" : result.severity,
        };
      }
    }
    return null;
  }

  private evalDateRange(
    rule: ValidationRule & { kind: "date_range" },
    value: unknown,
    data: Record<string, unknown>,
  ): RuleValidationError | null {
    if (value === undefined || value === null) return null;

    const dateValue = toDate(value);
    if (!dateValue) {
      return this.makeError(
        rule,
        value,
        `${rule.fieldPath} must be a valid date`,
      );
    }

    if (rule.afterField) {
      const afterValue = resolveFieldValue(
        rule.afterField,
        data as EvaluationContext,
      );
      const afterDate = toDate(afterValue);
      if (afterDate && dateValue <= afterDate) {
        return this.makeError(
          rule,
          value,
          rule.message ?? `${rule.fieldPath} must be after ${rule.afterField}`,
        );
      }
    }

    if (rule.beforeField) {
      const beforeValue = resolveFieldValue(
        rule.beforeField,
        data as EvaluationContext,
      );
      const beforeDate = toDate(beforeValue);
      if (beforeDate && dateValue >= beforeDate) {
        return this.makeError(
          rule,
          value,
          rule.message ??
            `${rule.fieldPath} must be before ${rule.beforeField}`,
        );
      }
    }

    if (rule.minDate) {
      const minDate = new Date(rule.minDate);
      if (!isNaN(minDate.getTime()) && dateValue < minDate) {
        return this.makeError(
          rule,
          value,
          rule.message ??
            `${rule.fieldPath} must be on or after ${rule.minDate}`,
        );
      }
    }

    if (rule.maxDate) {
      const maxDate = new Date(rule.maxDate);
      if (!isNaN(maxDate.getTime()) && dateValue > maxDate) {
        return this.makeError(
          rule,
          value,
          rule.message ??
            `${rule.fieldPath} must be on or before ${rule.maxDate}`,
        );
      }
    }

    return null;
  }

  private async evalReferential(
    rule: ValidationRule & { kind: "referential" },
    value: unknown,
    ctx: RequestContext,
  ): Promise<RuleValidationError | null> {
    if (value === undefined || value === null) return null;

    const targetField = rule.targetField ?? "id";
    const strValue = String(value);

    try {
      // Compile target entity to get table name
      const model = await this.compiler.compile(rule.targetEntity, "v1");
      const result = await this.db
        .selectFrom(model.tableName as any)
        .select(this.db.fn.count<number>("id").as("cnt"))
        .where(targetField as any, "=", strValue)
        .where("tenant_id" as any, "=", ctx.tenantId)
        .executeTakeFirst();

      const count = Number(result?.cnt ?? 0);
      if (count === 0) {
        return this.makeError(
          rule,
          value,
          rule.message ??
            `${rule.fieldPath} references a non-existent ${rule.targetEntity} record`,
        );
      }
    } catch {
      // If we can't check referential integrity (e.g., target entity doesn't exist),
      // log warning but don't block
      return null;
    }
    return null;
  }

  private async evalUnique(
    rule: ValidationRule & { kind: "unique" },
    value: unknown,
    data: Record<string, unknown>,
    ctx: RequestContext,
    entityName: string,
  ): Promise<RuleValidationError | null> {
    if (value === undefined || value === null) return null;

    try {
      const model = await this.compiler.compile(entityName, "v1");

      // Build uniqueness query
      let query = this.db
        .selectFrom(model.tableName as any)
        .select(this.db.fn.count<number>("id").as("cnt"))
        .where(rule.fieldPath as any, "=", value)
        .where("tenant_id" as any, "=", ctx.tenantId)
        .where("deleted_at" as any, "is", null);

      // Add scope fields to the uniqueness check
      if (rule.scope) {
        for (const scopeField of rule.scope) {
          const scopeValue = resolveFieldValue(
            scopeField,
            data as EvaluationContext,
          );
          if (scopeValue !== undefined && scopeValue !== null) {
            query = query.where(scopeField as any, "=", scopeValue);
          }
        }
      }

      // Exclude current record if updating
      const recordId = data.id;
      if (recordId) {
        query = query.where("id" as any, "!=", recordId);
      }

      const result = await query.executeTakeFirst();
      const count = Number(result?.cnt ?? 0);

      if (count > 0) {
        return this.makeError(
          rule,
          value,
          rule.message ?? `${rule.fieldPath} must be unique`,
        );
      }
    } catch {
      return null;
    }
    return null;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private makeError(
    rule: ValidationRule,
    value: unknown,
    defaultMessage: string,
  ): RuleValidationError {
    const message = rule.message
      ? rule.message
          .replace("{field}", rule.fieldPath)
          .replace("{value}", String(value ?? ""))
      : defaultMessage;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      fieldPath: rule.fieldPath,
      message,
      severity: rule.severity,
      value,
    };
  }
}

// ============================================================================
// Utility
// ============================================================================

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
