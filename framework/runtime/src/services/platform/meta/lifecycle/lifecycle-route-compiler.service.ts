/**
 * Lifecycle Route Compiler Service
 *
 * Compiles entity lifecycle routing rules into optimized lookup structures.
 * Resolves which lifecycle applies to an entity based on conditions and priority.
 *
 * Phase 12.1: Lifecycle route compiler
 * - Compile meta.entity_lifecycle → meta.entity_lifecycle_route_compiled
 * - Runtime resolution: entity_name + context → lifecycle_id
 */

import { createHash } from "node:crypto";

import { uuid } from "../data/db-helpers.js";

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type {
  CompiledLifecycleRoute,
  EntityLifecycle,
  HealthCheckResult,
  LifecycleRouteCompiler,
  RequestContext,
} from "@athyper/core/meta";

export class LifecycleRouteCompilerService implements LifecycleRouteCompiler {
  private cache = new Map<string, CompiledLifecycleRoute>();

  constructor(
    private readonly db: LifecycleDB_Type,
  ) {}

  /**
   * Compile lifecycle routes for an entity
   * Builds indexed structure from meta.entity_lifecycle rules
   */
  async compile(
    entityName: string,
    tenantId: string
  ): Promise<CompiledLifecycleRoute> {
    const cacheKey = `${tenantId}:${entityName}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(JSON.stringify({
        msg: "lifecycle_route_cache_hit",
        entityName,
        tenantId,
      }));
      return cached;
    }

    return this.compileAndCache(entityName, tenantId);
  }

  /**
   * Force recompilation (bypass cache)
   */
  async recompile(
    entityName: string,
    tenantId: string
  ): Promise<CompiledLifecycleRoute> {
    const cacheKey = `${tenantId}:${entityName}`;
    this.cache.delete(cacheKey);

    console.log(JSON.stringify({
      msg: "lifecycle_route_recompile",
      entityName,
      tenantId,
    }));

    return this.compileAndCache(entityName, tenantId);
  }

  /**
   * Resolve which lifecycle applies to an entity
   * Evaluates conditions against context and record data
   * Returns lifecycle ID or undefined if no match
   */
  async resolveLifecycle(
    entityName: string,
    ctx: RequestContext,
    record?: unknown
  ): Promise<string | undefined> {
    const route = await this.compile(entityName, ctx.tenantId);

    // Evaluate rules in priority order
    for (const rule of route.rules) {
      if (this.evaluateConditions(rule.conditions, ctx, record)) {
        console.log(JSON.stringify({
          msg: "lifecycle_resolved",
          entityName,
          tenantId: ctx.tenantId,
          lifecycleId: rule.lifecycleId,
          priority: rule.priority,
        }));
        return rule.lifecycleId;
      }
    }

    // Fall back to default lifecycle (if configured)
    if (route.defaultLifecycleId) {
      console.log(JSON.stringify({
        msg: "lifecycle_resolved_default",
        entityName,
        tenantId: ctx.tenantId,
        lifecycleId: route.defaultLifecycleId,
      }));
      return route.defaultLifecycleId;
    }

    console.log(JSON.stringify({
      msg: "lifecycle_not_resolved",
      entityName,
      tenantId: ctx.tenantId,
    }));

    return undefined;
  }

  /**
   * Get compiled route from cache (if exists)
   */
  async getCached(
    entityName: string,
    tenantId: string
  ): Promise<CompiledLifecycleRoute | undefined> {
    const cacheKey = `${tenantId}:${entityName}`;
    return this.cache.get(cacheKey);
  }

  /**
   * Invalidate cache for entity
   */
  async invalidateCache(entityName: string, tenantId: string): Promise<void> {
    const cacheKey = `${tenantId}:${entityName}`;
    this.cache.delete(cacheKey);

    console.log(JSON.stringify({
      msg: "lifecycle_route_cache_invalidated",
      entityName,
      tenantId,
    }));
  }

  /**
   * Precompile all entity lifecycle routes
   * Useful for warming cache on startup
   */
  async precompileAll(tenantId: string): Promise<CompiledLifecycleRoute[]> {
    // Get distinct entity names from meta.entity_lifecycle
    const rows = await this.db
      .selectFrom("meta.entity_lifecycle")
      .select("entity_name")
      .distinct()
      .where("tenant_id", "=", tenantId)
      .orderBy("entity_name")
      .execute();

    const compiled: CompiledLifecycleRoute[] = [];

    for (const row of rows) {
      try {
        const route = await this.compile(row.entity_name, tenantId);
        compiled.push(route);
      } catch (error) {
        console.error(JSON.stringify({
          msg: "lifecycle_route_precompile_error",
          entityName: row.entity_name,
          tenantId,
          error: String(error),
        }));
      }
    }

    console.log(JSON.stringify({
      msg: "lifecycle_routes_precompiled",
      tenantId,
      count: compiled.length,
    }));

    return compiled;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Check database connectivity
      await this.db.selectFrom("core.entity_lifecycle_instance").select("id").limit(1).execute();

      return {
        healthy: true,
        message: "LifecycleRouteCompiler is healthy",
      };
    } catch (error) {
      return {
        healthy: false,
        message: `LifecycleRouteCompiler health check failed: ${String(error)}`,
      };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Compile and cache lifecycle routes for an entity
   */
  private async compileAndCache(
    entityName: string,
    tenantId: string
  ): Promise<CompiledLifecycleRoute> {
    const startTime = performance.now();

    try {
      // Load entity lifecycle rules from database
      const rules = await this.loadEntityLifecycleRules(entityName, tenantId);

      // Sort by priority (lower = higher priority)
      rules.sort((a, b) => a.priority - b.priority);

      // Build compiled route
      const compiled: CompiledLifecycleRoute = {
        entityName,
        rules: rules.map((rule) => ({
          lifecycleId: rule.lifecycleId,
          conditions: rule.conditions,
          priority: rule.priority,
        })),
        defaultLifecycleId: this.findDefaultLifecycle(rules),
        compiledHash: this.computeHash(entityName, tenantId, rules),
        generatedAt: new Date(),
      };

      // Store in database
      await this.storeCompiledRoute(entityName, tenantId, compiled);

      // Cache in memory
      const cacheKey = `${tenantId}:${entityName}`;
      this.cache.set(cacheKey, compiled);

      const duration = performance.now() - startTime;

      console.log(JSON.stringify({
        msg: "lifecycle_route_compiled",
        entityName,
        tenantId,
        ruleCount: rules.length,
        compiledHash: compiled.compiledHash,
        durationMs: duration,
      }));

      return compiled;
    } catch (error) {
      console.error(JSON.stringify({
        msg: "lifecycle_route_compile_error",
        entityName,
        tenantId,
        error: String(error),
        durationMs: performance.now() - startTime,
      }));
      throw error;
    }
  }

  /**
   * Load entity lifecycle rules from database
   */
  private async loadEntityLifecycleRules(
    entityName: string,
    tenantId: string
  ): Promise<EntityLifecycle[]> {
    const rows = await this.db
      .selectFrom("meta.entity_lifecycle")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_name", "=", entityName)
      .orderBy("priority", "asc")
      .execute();

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      entityName: row.entity_name,
      lifecycleId: row.lifecycle_id,
      conditions: row.conditions as Record<string, unknown> | undefined,
      priority: row.priority,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  }

  /**
   * Find default lifecycle (rule with no conditions and lowest priority)
   */
  private findDefaultLifecycle(rules: EntityLifecycle[]): string | undefined {
    // Find rule with no conditions (unconditional fallback)
    const defaultRule = rules.find(
      (rule) => !rule.conditions || Object.keys(rule.conditions).length === 0
    );

    return defaultRule?.lifecycleId;
  }

  /**
   * Compute hash for compiled route (for caching and versioning)
   */
  private computeHash(
    entityName: string,
    tenantId: string,
    rules: EntityLifecycle[]
  ): string {
    const input = {
      entityName,
      tenantId,
      rules: rules.map((rule) => ({
        lifecycleId: rule.lifecycleId,
        conditions: rule.conditions,
        priority: rule.priority,
      })),
    };

    const canonical = this.canonicalizeJSON(input);
    const hash = createHash("sha256");
    hash.update(canonical);
    return hash.digest("hex");
  }

  /**
   * Canonicalize JSON for deterministic hashing
   * (same as used in compiler.service.ts)
   */
  private canonicalizeJSON(obj: unknown): string {
    if (obj === null || obj === undefined) {
      return JSON.stringify(obj);
    }

    if (typeof obj !== "object") {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return `[${obj.map((item) => this.canonicalizeJSON(item)).join(",")}]`;
    }

    // Sort object keys for deterministic ordering
    const sorted = Object.keys(obj)
      .sort()
      .map((key) => {
        const value = (obj as Record<string, unknown>)[key];
        return `${JSON.stringify(key)}:${this.canonicalizeJSON(value)}`;
      })
      .join(",");

    return `{${sorted}}`;
  }

  /**
   * Store compiled route in database
   */
  private async storeCompiledRoute(
    entityName: string,
    tenantId: string,
    compiled: CompiledLifecycleRoute
  ): Promise<void> {
    await this.db
      .insertInto("meta.entity_lifecycle_route_compiled")
      .values({
        id: uuid(),
        tenant_id: tenantId,
        entity_name: entityName,
        compiled_json: JSON.stringify(compiled),
        compiled_hash: compiled.compiledHash,
        generated_at: compiled.generatedAt,
        created_at: new Date(),
        created_by: "system",
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "entity_name", "compiled_hash"]).doUpdateSet({
          generated_at: (eb) => eb.ref("excluded.generated_at"),
        })
      )
      .execute();
  }

  /**
   * Evaluate condition rules against context and record
   *
   * MVP: Simple attribute matching
   * Future: Support more complex expressions
   */
  private evaluateConditions(
    conditions: Record<string, unknown> | undefined,
    ctx: RequestContext,
    record?: unknown
  ): boolean {
    // No conditions = always match
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }

    // Evaluate each condition
    for (const [key, expectedValue] of Object.entries(conditions)) {
      const actualValue = this.resolveConditionValue(key, ctx, record);

      // Simple equality check (MVP)
      if (actualValue !== expectedValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Resolve condition value from context or record
   *
   * Supports paths like:
   * - "ctx.userId" → ctx.userId
   * - "ctx.ouPath" → ctx.ouPath
   * - "record.amount" → record.amount
   * - "record.status" → record.status
   */
  private resolveConditionValue(
    path: string,
    ctx: RequestContext,
    record?: unknown
  ): unknown {
    if (path.startsWith("ctx.")) {
      const key = path.substring(4);
      return (ctx as unknown as Record<string, unknown>)[key];
    }

    if (path.startsWith("record.") && record) {
      const key = path.substring(7);
      return (record as Record<string, unknown>)[key];
    }

    return undefined;
  }
}
