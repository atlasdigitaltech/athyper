/**
 * Policy Compiler Service
 *
 * A2: Policy Compilation + Caching
 * Compiles policy rules into indexed structure for fast evaluation
 *
 * Compilation:
 * 1. Load all rules for policy version
 * 2. Load rule-operation mappings
 * 3. Build indexed structure by scope -> subject -> operation
 * 4. Store compiled JSON with hash in meta.permission_policy_compiled
 */

import type {
  CompiledPolicy,
  CompiledRule,
  Effect,
  ScopeType,
  SubjectType,
} from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Rule operation from database
 */
type DBRuleOperation = {
  rule_id: string;
  operation_id: string;
  operation_constraints: unknown;
};

/**
 * Policy Compiler Service
 */
export class PolicyCompilerService {
  /** In-memory cache: tenantId:versionId -> CompiledPolicy */
  private cache: Map<string, CompiledPolicy> = new Map();

  /** In-flight compilations (stampede protection) */
  private inFlight: Map<string, Promise<CompiledPolicy>> = new Map();

  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Get compiled policy (from cache, DB, or compile fresh)
   */
  async getCompiledPolicy(
    tenantId: string,
    policyVersionId: string
  ): Promise<CompiledPolicy | undefined> {
    const cacheKey = `${tenantId}:${policyVersionId}`;

    // Check in-memory cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check for in-flight compilation (stampede protection)
    const inFlight = this.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    // Check database for compiled version
    const dbCompiled = await this.db
      .selectFrom("meta.permission_policy_compiled")
      .select(["compiled_json", "compiled_hash", "generated_at"])
      .where("tenant_id", "=", tenantId)
      .where("policy_version_id", "=", policyVersionId)
      .orderBy("generated_at", "desc")
      .limit(1)
      .executeTakeFirst();

    if (dbCompiled) {
      const compiled = dbCompiled.compiled_json as CompiledPolicy;
      this.cache.set(cacheKey, compiled);
      return compiled;
    }

    return undefined;
  }

  /**
   * Compile policy version
   */
  async compile(
    tenantId: string,
    policyVersionId: string,
    createdBy: string = "system"
  ): Promise<CompiledPolicy> {
    const cacheKey = `${tenantId}:${policyVersionId}`;

    // Check for in-flight compilation
    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      return existing;
    }

    // Start compilation
    const compilePromise = this.doCompile(tenantId, policyVersionId, createdBy);
    this.inFlight.set(cacheKey, compilePromise);

    try {
      const result = await compilePromise;
      this.cache.set(cacheKey, result);
      return result;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Actual compilation logic
   */
  private async doCompile(
    tenantId: string,
    policyVersionId: string,
    createdBy: string
  ): Promise<CompiledPolicy> {
    // Get policy info
    const version = await this.db
      .selectFrom("meta.permission_policy_version as v")
      .innerJoin("meta.permission_policy as p", "p.id", "v.permission_policy_id")
      .select([
        "v.id as version_id",
        "v.permission_policy_id as policy_id",
        "p.scope_type",
        "p.scope_key",
      ])
      .where("v.id", "=", policyVersionId)
      .where("v.tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!version) {
      throw new Error(`Policy version not found: ${policyVersionId}`);
    }

    // Load all active rules
    const rules = await this.db
      .selectFrom("meta.permission_rule")
      .select([
        "id",
        "scope_type",
        "scope_key",
        "subject_type",
        "subject_key",
        "effect",
        "conditions",
        "priority",
        "is_active",
      ])
      .where("tenant_id", "=", tenantId)
      .where("policy_version_id", "=", policyVersionId)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute();

    // Load rule-operation mappings
    const ruleIds = rules.map((r) => r.id);
    let ruleOperations: DBRuleOperation[] = [];

    if (ruleIds.length > 0) {
      ruleOperations = await this.db
        .selectFrom("meta.permission_rule_operation")
        .select([
          "permission_rule_id as rule_id",
          "operation_id",
          "operation_constraints",
        ])
        .where("tenant_id", "=", tenantId)
        .where("permission_rule_id", "in", ruleIds)
        .execute();
    }

    // Group operations by rule
    const ruleOpsMap = new Map<string, DBRuleOperation[]>();
    for (const op of ruleOperations) {
      const existing = ruleOpsMap.get(op.rule_id) ?? [];
      existing.push(op);
      ruleOpsMap.set(op.rule_id, existing);
    }

    // Build indexed structure
    const ruleIndex: CompiledPolicy["ruleIndex"] = {};

    for (const rule of rules) {
      const scopeKey = this.buildScopeKey(rule.scope_type as ScopeType, rule.scope_key);
      const subjectKey = this.buildSubjectKey(
        rule.subject_type as SubjectType,
        rule.subject_key
      );

      // Initialize nested structure
      if (!ruleIndex[scopeKey]) {
        ruleIndex[scopeKey] = {};
      }
      if (!ruleIndex[scopeKey][subjectKey]) {
        ruleIndex[scopeKey][subjectKey] = {};
      }

      // Get operations for this rule
      const ops = ruleOpsMap.get(rule.id) ?? [];

      // If no specific operations, rule applies to all (use "*")
      const operationIds = ops.length > 0 ? ops.map((o) => o.operation_id) : ["*"];

      for (const opId of operationIds) {
        if (!ruleIndex[scopeKey][subjectKey][opId]) {
          ruleIndex[scopeKey][subjectKey][opId] = [];
        }

        const compiledRule: CompiledRule = {
          ruleId: rule.id,
          effect: rule.effect as Effect,
          priority: rule.priority,
          conditions: rule.conditions as CompiledRule["conditions"],
        };

        // Add operation constraints if present
        const opConstraints = ops.find((o) => o.operation_id === opId);
        if (opConstraints?.operation_constraints) {
          compiledRule.operationConstraints = opConstraints.operation_constraints as Record<
            string,
            unknown
          >;
        }

        ruleIndex[scopeKey][subjectKey][opId].push(compiledRule);
      }
    }

    // Sort rules by priority within each bucket
    for (const scopeKey of Object.keys(ruleIndex)) {
      for (const subjectKey of Object.keys(ruleIndex[scopeKey])) {
        for (const opId of Object.keys(ruleIndex[scopeKey][subjectKey])) {
          ruleIndex[scopeKey][subjectKey][opId].sort((a, b) => a.priority - b.priority);
        }
      }
    }

    // Compute hash
    const hash = await this.computeHash(ruleIndex);

    const compiled: CompiledPolicy = {
      policyVersionId,
      policyId: version.policy_id,
      tenantId,
      scopeType: version.scope_type as ScopeType,
      scopeKey: version.scope_key,
      compiledAt: new Date(),
      hash,
      ruleIndex,
    };

    // Store in database
    await this.storeCompiled(tenantId, policyVersionId, compiled, createdBy);

    console.log(
      JSON.stringify({
        msg: "policy_compiled",
        tenantId,
        policyVersionId,
        ruleCount: rules.length,
        hash,
      })
    );

    return compiled;
  }

  /**
   * Build scope key for indexing
   */
  private buildScopeKey(scopeType: ScopeType, scopeKey: string | null): string {
    return `${scopeType}:${scopeKey ?? "*"}`;
  }

  /**
   * Build subject key for indexing
   */
  private buildSubjectKey(subjectType: SubjectType, subjectKey: string): string {
    return `${subjectType}:${subjectKey}`;
  }

  /**
   * Compute hash of compiled rules
   */
  private async computeHash(ruleIndex: CompiledPolicy["ruleIndex"]): Promise<string> {
    const content = JSON.stringify(ruleIndex);
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Store compiled policy in database
   */
  private async storeCompiled(
    tenantId: string,
    policyVersionId: string,
    compiled: CompiledPolicy,
    createdBy: string
  ): Promise<void> {
    // Check if same hash already exists
    const existing = await this.db
      .selectFrom("meta.permission_policy_compiled")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("policy_version_id", "=", policyVersionId)
      .where("compiled_hash", "=", compiled.hash)
      .executeTakeFirst();

    if (existing) {
      // Same compiled version exists, skip
      return;
    }

    await this.db
      .insertInto("meta.permission_policy_compiled")
      .values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        policy_version_id: policyVersionId,
        compiled_json: JSON.stringify(compiled),
        compiled_hash: compiled.hash,
        generated_at: compiled.compiledAt,
        created_by: createdBy,
      })
      .execute();
  }

  /**
   * Compile on publish hook
   * Call this when a policy version is published
   */
  async compileOnPublish(
    tenantId: string,
    policyVersionId: string,
    publishedBy: string
  ): Promise<void> {
    // Clear cache for this version
    const cacheKey = `${tenantId}:${policyVersionId}`;
    this.cache.delete(cacheKey);

    // Compile fresh
    await this.compile(tenantId, policyVersionId, publishedBy);
  }

  /**
   * Invalidate cache for a policy version
   */
  invalidateCache(tenantId: string, policyVersionId: string): void {
    const cacheKey = `${tenantId}:${policyVersionId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get or compile policy (convenience method)
   * Returns cached/DB version if available, otherwise compiles
   */
  async getOrCompile(
    tenantId: string,
    policyVersionId: string,
    createdBy: string = "system"
  ): Promise<CompiledPolicy | undefined> {
    // Try to get from cache/DB first
    const existing = await this.getCompiledPolicy(tenantId, policyVersionId);
    if (existing) {
      return existing;
    }

    // Compile fresh
    try {
      return await this.compile(tenantId, policyVersionId, createdBy);
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "policy_compile_failed",
          tenantId,
          policyVersionId,
          error: String(error),
        })
      );
      return undefined;
    }
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: [...this.cache.keys()],
    };
  }
}
