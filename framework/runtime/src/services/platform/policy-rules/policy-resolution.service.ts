/**
 * Policy Resolution Service
 *
 * A1: Policy Resolution
 * Determines which policies apply to a given resource
 *
 * Resolution order (most specific wins):
 * 1. entity_version (scope_type='entity_version', scope_key=entity_version_id)
 * 2. entity (scope_type='entity', scope_key=entity_name)
 * 3. module (scope_type='module', scope_key=module_name)
 * 4. global (scope_type='global', scope_key=null)
 */

import type { ResourceDescriptor, ScopeType } from "./types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Policy info
 */
export type PolicyInfo = {
  id: string;
  name: string;
  description: string | null;
  scopeType: ScopeType;
  scopeKey: string | null;
  isActive: boolean;
};

/**
 * Policy version info
 */
export type PolicyVersionInfo = {
  id: string;
  policyId: string;
  versionNo: number;
  status: "draft" | "published" | "archived";
  publishedAt: Date | null;
};

/**
 * Resolved policy with version
 */
export type ResolvedPolicy = {
  policy: PolicyInfo;
  version: PolicyVersionInfo;
  /** Active version ID for quick access */
  activeVersionId: string;
  /** Scope type for quick access */
  scopeType: ScopeType;
  /** Priority based on scope specificity (lower = more specific) */
  priority: number;
};

/**
 * Policy Resolution Service
 */
export class PolicyResolutionService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Resolve all applicable policies for a resource
   *
   * Returns policies ordered by specificity (most specific first)
   */
  async resolvePolicies(
    tenantId: string,
    resource: ResourceDescriptor
  ): Promise<ResolvedPolicy[]> {
    const candidates: ResolvedPolicy[] = [];

    // 1. Check entity_version scope (most specific)
    if (resource.entityVersionId) {
      const policies = await this.getPoliciesForScope(
        tenantId,
        "entity_version",
        resource.entityVersionId
      );
      candidates.push(
        ...policies.map((p) => ({
          ...p,
          activeVersionId: p.version.id,
          scopeType: p.policy.scopeType,
          priority: 1,
        }))
      );
    }

    // 2. Check entity scope
    if (resource.entityCode) {
      const policies = await this.getPoliciesForScope(
        tenantId,
        "entity",
        resource.entityCode
      );
      candidates.push(
        ...policies.map((p) => ({
          ...p,
          activeVersionId: p.version.id,
          scopeType: p.policy.scopeType,
          priority: 2,
        }))
      );
    }

    // 3. Check module scope
    if (resource.moduleCode) {
      const policies = await this.getPoliciesForScope(
        tenantId,
        "module",
        resource.moduleCode
      );
      candidates.push(
        ...policies.map((p) => ({
          ...p,
          activeVersionId: p.version.id,
          scopeType: p.policy.scopeType,
          priority: 3,
        }))
      );
    }

    // 4. Check global scope (least specific)
    const globalPolicies = await this.getPoliciesForScope(
      tenantId,
      "global",
      null
    );
    candidates.push(
      ...globalPolicies.map((p) => ({
        ...p,
        activeVersionId: p.version.id,
        scopeType: p.policy.scopeType,
        priority: 4,
      }))
    );

    // Sort by priority (most specific first), then by policy name
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.policy.name.localeCompare(b.policy.name);
    });

    return candidates;
  }

  /**
   * Get policies for a specific scope
   */
  private async getPoliciesForScope(
    tenantId: string,
    scopeType: ScopeType,
    scopeKey: string | null
  ): Promise<Array<{ policy: PolicyInfo; version: PolicyVersionInfo }>> {
    // Build query for policies with published versions
    let query = this.db
      .selectFrom("meta.permission_policy as p")
      .innerJoin(
        "meta.permission_policy_version as v",
        "v.permission_policy_id",
        "p.id"
      )
      .select([
        "p.id as policy_id",
        "p.name as policy_name",
        "p.description as policy_description",
        "p.scope_type",
        "p.scope_key",
        "p.is_active as policy_is_active",
        "v.id as version_id",
        "v.version_no",
        "v.status",
        "v.published_at",
      ])
      .where("p.tenant_id", "=", tenantId)
      .where("p.is_active", "=", true)
      .where("p.scope_type", "=", scopeType)
      .where("v.tenant_id", "=", tenantId)
      .where("v.status", "=", "published");

    // Handle scope_key (null for global)
    if (scopeKey === null) {
      query = query.where("p.scope_key", "is", null);
    } else {
      query = query.where("p.scope_key", "=", scopeKey);
    }

    const results = await query.execute();

    return results.map((row) => ({
      policy: {
        id: row.policy_id,
        name: row.policy_name,
        description: row.policy_description,
        scopeType: row.scope_type as ScopeType,
        scopeKey: row.scope_key,
        isActive: row.policy_is_active,
      },
      version: {
        id: row.version_id,
        policyId: row.policy_id,
        versionNo: row.version_no,
        status: row.status as "draft" | "published" | "archived",
        publishedAt: row.published_at,
      },
    }));
  }

  /**
   * Get the active (published) version for a policy
   */
  async getActiveVersion(
    tenantId: string,
    policyId: string
  ): Promise<PolicyVersionInfo | undefined> {
    const result = await this.db
      .selectFrom("meta.permission_policy_version")
      .select(["id", "permission_policy_id", "version_no", "status", "published_at"])
      .where("tenant_id", "=", tenantId)
      .where("permission_policy_id", "=", policyId)
      .where("status", "=", "published")
      .orderBy("version_no", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      policyId: result.permission_policy_id,
      versionNo: result.version_no,
      status: result.status as "draft" | "published" | "archived",
      publishedAt: result.published_at,
    };
  }

  /**
   * Get policy by ID
   */
  async getPolicy(policyId: string): Promise<PolicyInfo | undefined> {
    const result = await this.db
      .selectFrom("meta.permission_policy")
      .select(["id", "name", "description", "scope_type", "scope_key", "is_active"])
      .where("id", "=", policyId)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      name: result.name,
      description: result.description,
      scopeType: result.scope_type as ScopeType,
      scopeKey: result.scope_key,
      isActive: result.is_active,
    };
  }

  /**
   * Create a new policy
   */
  async createPolicy(request: {
    tenantId: string;
    name: string;
    description?: string;
    scopeType: ScopeType;
    scopeKey?: string;
    createdBy: string;
  }): Promise<PolicyInfo> {
    const id = crypto.randomUUID();

    await this.db
      .insertInto("meta.permission_policy")
      .values({
        id,
        tenant_id: request.tenantId,
        name: request.name,
        description: request.description,
        scope_type: request.scopeType,
        scope_key: request.scopeKey ?? null,
        source_type: "custom",
        is_active: true,
        created_by: request.createdBy,
      })
      .execute();

    return {
      id,
      name: request.name,
      description: request.description ?? null,
      scopeType: request.scopeType,
      scopeKey: request.scopeKey ?? null,
      isActive: true,
    };
  }

  /**
   * Create a new policy version (draft)
   */
  async createPolicyVersion(request: {
    tenantId: string;
    policyId: string;
    createdBy: string;
  }): Promise<PolicyVersionInfo> {
    // Get next version number
    const lastVersion = await this.db
      .selectFrom("meta.permission_policy_version")
      .select("version_no")
      .where("tenant_id", "=", request.tenantId)
      .where("permission_policy_id", "=", request.policyId)
      .orderBy("version_no", "desc")
      .limit(1)
      .executeTakeFirst();

    const versionNo = (lastVersion?.version_no ?? 0) + 1;
    const id = crypto.randomUUID();

    await this.db
      .insertInto("meta.permission_policy_version")
      .values({
        id,
        tenant_id: request.tenantId,
        permission_policy_id: request.policyId,
        version_no: versionNo,
        status: "draft",
        created_by: request.createdBy,
      })
      .execute();

    return {
      id,
      policyId: request.policyId,
      versionNo,
      status: "draft",
      publishedAt: null,
    };
  }

  /**
   * Publish a policy version
   */
  async publishPolicyVersion(
    tenantId: string,
    versionId: string,
    publishedBy: string
  ): Promise<void> {
    // Archive any existing published version
    const version = await this.db
      .selectFrom("meta.permission_policy_version")
      .select(["permission_policy_id", "status"])
      .where("id", "=", versionId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!version) {
      throw new Error(`Policy version not found: ${versionId}`);
    }

    if (version.status !== "draft") {
      throw new Error(`Cannot publish version with status: ${version.status}`);
    }

    // Archive existing published versions
    await this.db
      .updateTable("meta.permission_policy_version")
      .set({ status: "archived" })
      .where("tenant_id", "=", tenantId)
      .where("permission_policy_id", "=", version.permission_policy_id)
      .where("status", "=", "published")
      .execute();

    // Publish the new version
    await this.db
      .updateTable("meta.permission_policy_version")
      .set({
        status: "published",
        published_at: new Date(),
        published_by: publishedBy,
      })
      .where("id", "=", versionId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "policy_version_published",
        versionId,
        publishedBy,
      })
    );
  }

  /**
   * List policies by tenant
   */
  async listPolicies(
    tenantId: string,
    filters?: {
      scopeType?: ScopeType;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<PolicyInfo[]> {
    let query = this.db
      .selectFrom("meta.permission_policy")
      .select(["id", "name", "description", "scope_type", "scope_key", "is_active"])
      .where("tenant_id", "=", tenantId);

    if (filters?.scopeType) {
      query = query.where("scope_type", "=", filters.scopeType);
    }

    if (filters?.isActive !== undefined) {
      query = query.where("is_active", "=", filters.isActive);
    }

    const results = await query
      .limit(filters?.limit ?? 100)
      .offset(filters?.offset ?? 0)
      .orderBy("name", "asc")
      .execute();

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      scopeType: r.scope_type as ScopeType,
      scopeKey: r.scope_key,
      isActive: r.is_active,
    }));
  }
}
