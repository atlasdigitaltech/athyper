/**
 * Policy Store Service
 *
 * F: Persisted Policy Retrieval + Versioning Hookup
 * - Read policy definitions from DB (meta schema)
 * - Support version selection: active, effective-from/to, staged/draft
 * - Hot-reload / cache invalidation on policy publish events
 */

import type { CompiledPolicy, ScopeType } from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

/**
 * Policy definition (as stored in DB)
 */
export type PolicyDefinition = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  scopeType: ScopeType;
  scopeKey?: string;
  sourceType: "system" | "custom" | "imported";
  sourceRef?: string;
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
};

/**
 * Policy version (as stored in DB)
 */
export type PolicyVersion = {
  id: string;
  tenantId: string;
  policyId: string;
  versionNo: number;
  status: "draft" | "staged" | "published" | "archived";
  publishedAt?: Date;
  publishedBy?: string;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  createdAt: Date;
  createdBy: string;
};

/**
 * Policy rule (as stored in DB)
 */
export type PolicyRule = {
  id: string;
  tenantId: string;
  policyVersionId: string;
  scopeType: ScopeType;
  scopeKey?: string;
  subjectType: string;
  subjectKey: string;
  effect: "allow" | "deny";
  conditions?: unknown;
  priority: number;
  isActive: boolean;
  comment?: string;
  createdAt: Date;
  createdBy: string;
};

/**
 * Rule operation mapping
 */
export type RuleOperation = {
  id: string;
  tenantId: string;
  ruleId: string;
  operationId: string;
  operationConstraints?: unknown;
  createdAt: Date;
  createdBy: string;
};

/**
 * Version selection options
 */
export type VersionSelection =
  | { type: "active" }
  | { type: "latest_published" }
  | { type: "specific"; versionId: string }
  | { type: "effective_at"; timestamp: Date }
  | { type: "staged" }
  | { type: "draft" };

/**
 * Cache invalidation event
 */
export type CacheInvalidationEvent = {
  type: "policy_published" | "policy_updated" | "policy_deleted" | "rules_changed";
  tenantId: string;
  policyId: string;
  versionId?: string;
  timestamp: Date;
};

// ============================================================================
// Policy Store Interface
// ============================================================================

/**
 * Policy store interface
 */
export interface IPolicyStore {
  /**
   * Get policy definition by ID
   */
  getPolicy(policyId: string): Promise<PolicyDefinition | undefined>;

  /**
   * Get policy version
   */
  getVersion(versionId: string): Promise<PolicyVersion | undefined>;

  /**
   * Get policy version by selection criteria
   */
  selectVersion(
    policyId: string,
    tenantId: string,
    selection: VersionSelection
  ): Promise<PolicyVersion | undefined>;

  /**
   * Get all rules for a policy version
   */
  getRules(tenantId: string, versionId: string): Promise<PolicyRule[]>;

  /**
   * Get rule operations
   */
  getRuleOperations(tenantId: string, ruleIds: string[]): Promise<RuleOperation[]>;

  /**
   * List policies for a tenant
   */
  listPolicies(
    tenantId: string,
    options?: {
      scopeType?: ScopeType;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<PolicyDefinition[]>;

  /**
   * Subscribe to cache invalidation events
   */
  onInvalidation(handler: (event: CacheInvalidationEvent) => void): () => void;

  /**
   * Manually trigger cache invalidation
   */
  invalidate(event: CacheInvalidationEvent): void;
}

// ============================================================================
// Policy Store Implementation
// ============================================================================

/**
 * Policy Store Service
 */
export class PolicyStoreService implements IPolicyStore {
  /** In-memory cache for compiled policies */
  private compiledCache: Map<string, { policy: CompiledPolicy; expiresAt: number }> = new Map();

  /** Cache TTL in ms */
  private cacheTtlMs: number = 5 * 60 * 1000; // 5 minutes

  /** Invalidation handlers */
  private invalidationHandlers: Set<(event: CacheInvalidationEvent) => void> = new Set();

  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Get policy definition by ID
   */
  async getPolicy(policyId: string): Promise<PolicyDefinition | undefined> {
    const result = await this.db
      .selectFrom("meta.permission_policy")
      .select([
        "id",
        "tenant_id",
        "name",
        "description",
        "scope_type",
        "scope_key",
        "source_type",
        "source_ref",
        "is_active",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
      ])
      .where("id", "=", policyId)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      tenantId: result.tenant_id,
      name: result.name,
      description: result.description ?? undefined,
      scopeType: result.scope_type as ScopeType,
      scopeKey: result.scope_key ?? undefined,
      sourceType: result.source_type as PolicyDefinition["sourceType"],
      sourceRef: result.source_ref ?? undefined,
      isActive: result.is_active,
      createdAt: result.created_at,
      createdBy: result.created_by,
      updatedAt: result.updated_at ?? undefined,
      updatedBy: result.updated_by ?? undefined,
    };
  }

  /**
   * Get policy version
   */
  async getVersion(versionId: string): Promise<PolicyVersion | undefined> {
    const result = await this.db
      .selectFrom("meta.permission_policy_version")
      .select([
        "id",
        "tenant_id",
        "permission_policy_id",
        "version_no",
        "status",
        "published_at",
        "published_by",
        "created_at",
        "created_by",
      ])
      .where("id", "=", versionId)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      tenantId: result.tenant_id,
      policyId: result.permission_policy_id,
      versionNo: result.version_no,
      status: result.status as PolicyVersion["status"],
      publishedAt: result.published_at ?? undefined,
      publishedBy: result.published_by ?? undefined,
      createdAt: result.created_at,
      createdBy: result.created_by,
    };
  }

  /**
   * Get policy version by selection criteria
   */
  async selectVersion(
    policyId: string,
    tenantId: string,
    selection: VersionSelection
  ): Promise<PolicyVersion | undefined> {
    let query = this.db
      .selectFrom("meta.permission_policy_version")
      .select([
        "id",
        "tenant_id",
        "permission_policy_id",
        "version_no",
        "status",
        "published_at",
        "published_by",
        "created_at",
        "created_by",
      ])
      .where("tenant_id", "=", tenantId)
      .where("permission_policy_id", "=", policyId);

    switch (selection.type) {
      case "active":
      case "latest_published":
        query = query
          .where("status", "=", "published")
          .orderBy("published_at", "desc")
          .limit(1);
        break;

      case "specific":
        query = query.where("id", "=", selection.versionId);
        break;

      case "effective_at":
        // For time-based selection, we'd need effective_from/effective_to columns
        // Fall back to latest published for now
        query = query
          .where("status", "=", "published")
          .where((eb) =>
            eb.or([
              eb("published_at", "is", null),
              eb("published_at", "<=", selection.timestamp),
            ])
          )
          .orderBy("published_at", "desc")
          .limit(1);
        break;

      case "staged":
        query = query
          .where("status", "=", "staged")
          .orderBy("version_no", "desc")
          .limit(1);
        break;

      case "draft":
        query = query
          .where("status", "=", "draft")
          .orderBy("version_no", "desc")
          .limit(1);
        break;
    }

    const result = await query.executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      tenantId: result.tenant_id,
      policyId: result.permission_policy_id,
      versionNo: result.version_no,
      status: result.status as PolicyVersion["status"],
      publishedAt: result.published_at ?? undefined,
      publishedBy: result.published_by ?? undefined,
      createdAt: result.created_at,
      createdBy: result.created_by,
    };
  }

  /**
   * Get all rules for a policy version
   */
  async getRules(tenantId: string, versionId: string): Promise<PolicyRule[]> {
    const results = await this.db
      .selectFrom("meta.permission_rule")
      .select([
        "id",
        "tenant_id",
        "policy_version_id",
        "scope_type",
        "scope_key",
        "subject_type",
        "subject_key",
        "effect",
        "conditions",
        "priority",
        "is_active",
        "comment",
        "created_at",
        "created_by",
      ])
      .where("tenant_id", "=", tenantId)
      .where("policy_version_id", "=", versionId)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute();

    return results.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      policyVersionId: r.policy_version_id,
      scopeType: r.scope_type as ScopeType,
      scopeKey: r.scope_key ?? undefined,
      subjectType: r.subject_type,
      subjectKey: r.subject_key,
      effect: r.effect as "allow" | "deny",
      conditions: r.conditions,
      priority: r.priority,
      isActive: r.is_active,
      comment: r.comment ?? undefined,
      createdAt: r.created_at,
      createdBy: r.created_by,
    }));
  }

  /**
   * Get rule operations
   */
  async getRuleOperations(tenantId: string, ruleIds: string[]): Promise<RuleOperation[]> {
    if (ruleIds.length === 0) return [];

    const results = await this.db
      .selectFrom("meta.permission_rule_operation")
      .select([
        "id",
        "tenant_id",
        "permission_rule_id",
        "operation_id",
        "operation_constraints",
        "created_at",
        "created_by",
      ])
      .where("tenant_id", "=", tenantId)
      .where("permission_rule_id", "in", ruleIds)
      .execute();

    return results.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      ruleId: r.permission_rule_id,
      operationId: r.operation_id,
      operationConstraints: r.operation_constraints,
      createdAt: r.created_at,
      createdBy: r.created_by,
    }));
  }

  /**
   * List policies for a tenant
   */
  async listPolicies(
    tenantId: string,
    options?: {
      scopeType?: ScopeType;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<PolicyDefinition[]> {
    let query = this.db
      .selectFrom("meta.permission_policy")
      .select([
        "id",
        "tenant_id",
        "name",
        "description",
        "scope_type",
        "scope_key",
        "source_type",
        "source_ref",
        "is_active",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
      ])
      .where("tenant_id", "=", tenantId);

    if (options?.scopeType) {
      query = query.where("scope_type", "=", options.scopeType);
    }

    if (options?.isActive !== undefined) {
      query = query.where("is_active", "=", options.isActive);
    }

    const results = await query
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0)
      .orderBy("name", "asc")
      .execute();

    return results.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      description: r.description ?? undefined,
      scopeType: r.scope_type as ScopeType,
      scopeKey: r.scope_key ?? undefined,
      sourceType: r.source_type as PolicyDefinition["sourceType"],
      sourceRef: r.source_ref ?? undefined,
      isActive: r.is_active,
      createdAt: r.created_at,
      createdBy: r.created_by,
      updatedAt: r.updated_at ?? undefined,
      updatedBy: r.updated_by ?? undefined,
    }));
  }

  /**
   * Subscribe to cache invalidation events
   */
  onInvalidation(handler: (event: CacheInvalidationEvent) => void): () => void {
    this.invalidationHandlers.add(handler);
    return () => {
      this.invalidationHandlers.delete(handler);
    };
  }

  /**
   * Manually trigger cache invalidation
   */
  invalidate(event: CacheInvalidationEvent): void {
    // Clear relevant cache entries
    const prefix = `${event.tenantId}:${event.policyId}`;

    for (const key of this.compiledCache.keys()) {
      if (key.startsWith(prefix)) {
        this.compiledCache.delete(key);
      }
    }

    // Notify handlers
    for (const handler of this.invalidationHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`Invalidation handler error: ${error}`);
      }
    }

    console.log(
      JSON.stringify({
        msg: "policy_cache_invalidated",
        event,
      })
    );
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Get cached compiled policy
   */
  getCachedCompiled(tenantId: string, versionId: string): CompiledPolicy | undefined {
    const key = `${tenantId}:${versionId}`;
    const entry = this.compiledCache.get(key);

    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.compiledCache.delete(key);
      return undefined;
    }

    return entry.policy;
  }

  /**
   * Set cached compiled policy
   */
  setCachedCompiled(tenantId: string, versionId: string, policy: CompiledPolicy): void {
    const key = `${tenantId}:${versionId}`;
    this.compiledCache.set(key, {
      policy,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.compiledCache.clear();
  }

  /**
   * Set cache TTL
   */
  setCacheTtl(ttlMs: number): void {
    this.cacheTtlMs = ttlMs;
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.compiledCache.size,
      keys: [...this.compiledCache.keys()],
    };
  }
}

// ============================================================================
// Hot Reload Support
// ============================================================================

/**
 * Policy hot reload manager
 * Watches for policy changes and invalidates caches
 */
export class PolicyHotReloadManager {
  private unsubscribe?: () => void;

  constructor(
    private readonly policyStore: IPolicyStore,
    private readonly compilerInvalidate: (tenantId: string, versionId: string) => void
  ) {}

  /**
   * Start watching for changes
   */
  start(): void {
    this.unsubscribe = this.policyStore.onInvalidation((event) => {
      this.handleInvalidation(event);
    });

    console.log(
      JSON.stringify({
        msg: "policy_hot_reload_started",
      })
    );
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    console.log(
      JSON.stringify({
        msg: "policy_hot_reload_stopped",
      })
    );
  }

  /**
   * Handle invalidation event
   */
  private handleInvalidation(event: CacheInvalidationEvent): void {
    console.log(
      JSON.stringify({
        msg: "policy_hot_reload_invalidation",
        event,
      })
    );

    // Invalidate compiler cache
    if (event.versionId) {
      this.compilerInvalidate(event.tenantId, event.versionId);
    }
  }
}

/**
 * Create policy store
 */
export function createPolicyStore(db: Kysely<DB>): PolicyStoreService {
  return new PolicyStoreService(db);
}
