/**
 * CompanyCodeScopeService — Phase 6.3
 *
 * Resolves which company codes an entity (principal, group, role) may access.
 *
 * Design:
 *   - master.company_code_access is a polymorphic ACL table:
 *       entity_type: 'principal' | 'auth_group' | 'auth_group_role' | ...
 *       entity_id:   UUID of the entity
 *       company_code_id: UUID of master.company_code
 *       inherit_subtree: when true, access extends to all subsidiaries
 *
 *   - Scope resolution strategy:
 *       1. Direct principal grants (entity_type='principal', entity_id=principalId)
 *       2. Group grants: principal's group memberships → group-level grants
 *       3. If inherit_subtree=true, expand to all descendant company codes
 *          (traverses master.company_code parent_company_code_id hierarchy)
 *
 *   - Multi-company scenario (16-subsidiary tenant):
 *       A principal with access to the root holding company (inherit_subtree=true)
 *       will automatically have access to all 16 subsidiaries without explicit grants.
 *
 * Fallback (no ACL rows): when master.company_code_access is empty for the tenant,
 * scope is resolved via RBAC group-role assignments (same model as session.service.ts).
 * Users with tenant-wide roles are unrestricted; users with company-specific roles are
 * scoped to those companies; users with no assignments are unrestricted (backward compat).
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScopeEntityType =
  | "principal"
  | "auth_group"
  | "auth_group_role"
  | "team";

export interface CompanyCodeAccess {
  id:            string;
  companyCodeId: string;
  companyCode:   string;
  companyName:   string;
  entityType:    ScopeEntityType;
  entityId:      string;
  inheritSubtree: boolean;
  grantedBy:     string | null;
}

export interface ScopeResolutionResult {
  principalId:      string;
  tenantId:         string;
  companyCodeIds:   string[];
  /** Human-readable codes for logging/UI */
  companyCodes:     { id: string; code: string; name: string }[];
  /** true = principal has access to ALL company codes (no restrictions) */
  isUnrestricted:   boolean;
}

// ── CompanyCodeScopeService ───────────────────────────────────────────────────

export class CompanyCodeScopeService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  // ── ACL management ───────────────────────────────────────────────────────────

  /**
   * Grant access to a company code for an entity.
   * Idempotent — repeated grants for the same (entityType, entityId, companyCodeId) are ignored.
   */
  async grantAccess(
    entityType:    ScopeEntityType,
    entityId:      string,
    companyCodeId: string,
    tenantId:      string,
    grantedBy:     string,
    inheritSubtree = true,
  ): Promise<CompanyCodeAccess> {
    // Verify company code exists in this tenant
    const cc = await this.db
      .selectFrom("master.company_code as cc" as never)
      .select(["cc.id", "cc.code", "cc.name"] as never[])
      .where("cc.id" as never, "=", companyCodeId as never)
      .where("cc.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { id: string; code: string; name: string } | undefined;

    if (!cc) {
      throw new Error(`Company code ${companyCodeId} not found in tenant ${tenantId}`);
    }

    // Upsert wrapped in a transaction: if the insert fails after the delete the
    // grant is not silently lost.  Swallowing the delete error was unsafe here.
    const row = await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("master.company_code_access" as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("entity_type" as never, "=", entityType as never)
        .where("entity_id" as never, "=", entityId as never)
        .where("company_code_id" as never, "=", companyCodeId as never)
        .execute();

      return trx
        .insertInto("master.company_code_access" as never)
        .values({
          tenant_id:       tenantId,
          entity_type:     entityType,
          entity_id:       entityId,
          company_code_id: companyCodeId,
          inherit_subtree: inheritSubtree,
          granted_by:      grantedBy,
          created_by:      grantedBy,
        } as never)
        .returning("id" as never)
        .executeTakeFirstOrThrow() as Promise<{ id: string }>;
    });

    return {
      id:             row.id,
      companyCodeId,
      companyCode:    cc.code,
      companyName:    cc.name,
      entityType,
      entityId,
      inheritSubtree,
      grantedBy,
    };
  }

  /**
   * Revoke access to a company code for an entity.
   */
  async revokeAccess(
    entityType:    ScopeEntityType,
    entityId:      string,
    companyCodeId: string,
    tenantId:      string,
  ): Promise<void> {
    await this.db
      .deleteFrom("master.company_code_access" as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("entity_type" as never, "=", entityType as never)
      .where("entity_id" as never, "=", entityId as never)
      .where("company_code_id" as never, "=", companyCodeId as never)
      .execute();
  }

  /**
   * Check if an entity has a direct (non-expanded) access grant.
   */
  async hasDirectAccess(
    entityType:    ScopeEntityType,
    entityId:      string,
    companyCodeId: string,
    tenantId:      string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom("master.company_code_access as cca" as never)
      .select("cca.id" as never)
      .where("cca.tenant_id" as never, "=", tenantId as never)
      .where("cca.entity_type" as never, "=", entityType as never)
      .where("cca.entity_id" as never, "=", entityId as never)
      .where("cca.company_code_id" as never, "=", companyCodeId as never)
      .limit(1)
      .executeTakeFirst() as { id: string } | undefined;

    return !!row;
  }

  /**
   * List all direct access grants for an entity.
   */
  async listAccessGrants(
    entityType: ScopeEntityType,
    entityId:   string,
    tenantId:   string,
  ): Promise<CompanyCodeAccess[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.db as any)
      .selectFrom("master.company_code_access as cca")
      .innerJoin("master.company_code as cc", "cc.id", "cca.company_code_id")
      .select([
        "cca.id", "cca.company_code_id", "cca.entity_type", "cca.entity_id",
        "cca.inherit_subtree", "cca.granted_by",
        "cc.code as company_code", "cc.name as company_name",
      ])
      .where("cca.tenant_id", "=", tenantId)
      .where("cca.entity_type", "=", entityType)
      .where("cca.entity_id", "=", entityId)
      .execute() as Array<{
        id: string; company_code_id: string; entity_type: string; entity_id: string;
        inherit_subtree: boolean; granted_by: string | null;
        company_code: string; company_name: string;
      }>;

    return rows.map((r) => ({
      id:             r.id,
      companyCodeId:  r.company_code_id,
      companyCode:    r.company_code,
      companyName:    r.company_name,
      entityType:     r.entity_type as ScopeEntityType,
      entityId:       r.entity_id,
      inheritSubtree: r.inherit_subtree,
      grantedBy:      r.granted_by,
    }));
  }

  // ── Scope resolution ─────────────────────────────────────────────────────────

  /**
   * Resolve the full set of company codes accessible to a principal.
   *
   * Algorithm:
   *   1. Collect direct grants (entity_type='principal', entity_id=principalId)
   *   2. Collect group grants via master.auth_group_member
   *   3. For each grant with inherit_subtree=true, expand to descendants
   *   4. Deduplicate and return the union
   *
   * When master.company_code_access has no rows, falls back to RBAC group-role
   * scope (resolveRbacScope): users with tenant-wide roles are unrestricted,
   * users with company-specific roles see only those companies, and users with
   * no assignments are unrestricted (backward compat for new users / service accounts).
   */
  async resolveScope(
    principalId: string,
    tenantId:    string,
  ): Promise<ScopeResolutionResult> {
    // Check if tenant has any grants configured at all
    const anyGrant = await this.db
      .selectFrom("master.company_code_access as cca" as never)
      .select("cca.id" as never)
      .where("cca.tenant_id" as never, "=", tenantId as never)
      .limit(1)
      .executeTakeFirst() as { id: string } | undefined;

    if (!anyGrant) {
      // No explicit ACL rows configured — fall back to RBAC group-role scope.
      // This correctly handles multi-company tenants where users are assigned to
      // company-specific group roles without requiring explicit ACL grants.
      return this.resolveRbacScope(principalId, tenantId);
    }

    // Step 1: direct principal grants
    const directGrants = await this.db
      .selectFrom("master.company_code_access as cca" as never)
      .select(["cca.company_code_id", "cca.inherit_subtree"] as never[])
      .where("cca.tenant_id" as never, "=", tenantId as never)
      .where("cca.entity_type" as never, "=", "principal" as never)
      .where("cca.entity_id" as never, "=", principalId as never)
      .execute() as Array<{ company_code_id: string; inherit_subtree: boolean }>;

    // Step 2: group grants via group membership
    const groupIds = await this.getGroupMemberships(principalId, tenantId);
    let groupGrants: Array<{ company_code_id: string; inherit_subtree: boolean }> = [];

    if (groupIds.length > 0) {
      groupGrants = await this.db
        .selectFrom("master.company_code_access as cca" as never)
        .select(["cca.company_code_id", "cca.inherit_subtree"] as never[])
        .where("cca.tenant_id" as never, "=", tenantId as never)
        .where("cca.entity_type" as never, "=", "auth_group" as never)
        .where("cca.entity_id" as never, "in" as never, groupIds as never)
        .execute() as Array<{ company_code_id: string; inherit_subtree: boolean }>;
    }

    const allGrants = [...directGrants, ...groupGrants];

    if (allGrants.length === 0) {
      return {
        principalId,
        tenantId,
        companyCodeIds: [],
        companyCodes:   [],
        isUnrestricted: false,
      };
    }

    // Step 3: expand subtrees
    const baseIds = allGrants.map((g) => g.company_code_id);
    const inheritIds = allGrants.filter((g) => g.inherit_subtree).map((g) => g.company_code_id);

    const expanded = inheritIds.length > 0
      ? await this.expandSubtrees(inheritIds, tenantId)
      : [];

    const allIds = Array.from(new Set([...baseIds, ...expanded]));

    // Fetch company code details for the resolved IDs
    const codes = await this.db
      .selectFrom("master.company_code as cc" as never)
      .select(["cc.id", "cc.code", "cc.name"] as never[])
      .where("cc.tenant_id" as never, "=", tenantId as never)
      .where("cc.id" as never, "in" as never, allIds as never)
      .where("cc.status" as never, "=", "active" as never)
      .execute() as Array<{ id: string; code: string; name: string }>;

    return {
      principalId,
      tenantId,
      companyCodeIds: codes.map((c) => c.id),
      companyCodes:   codes,
      isUnrestricted: false,
    };
  }

  /**
   * Check if a principal has access to a specific company code
   * (after full scope resolution including subtree expansion).
   */
  async hasAccess(
    principalId:   string,
    companyCodeId: string,
    tenantId:      string,
  ): Promise<boolean> {
    const scope = await this.resolveScope(principalId, tenantId);
    if (scope.isUnrestricted) return true;
    return scope.companyCodeIds.includes(companyCodeId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Resolve company code scope from RBAC group-role assignments.
   *
   * Used as the fallback when master.company_code_access has no rows.
   * Mirrors the scope CTE in session.service.ts — three assignment_scope_type cases:
   *   'tenant'       → unrestricted (principal has tenant-wide role)
   *   'company_code' → scoped to the specific company codes
   *   'legal_entity' → scoped to company codes linked to those legal entities
   *                    (subtree expansion via fn_resolve_le_subtree_companies)
   *
   * If the principal has no group role assignments at all, falls back to
   * unrestricted to preserve backward compatibility for new users / service accounts.
   */
  private async resolveRbacScope(
    principalId: string,
    tenantId:    string,
  ): Promise<ScopeResolutionResult> {
    const result = await sql<{
      has_tenant_scope: boolean;
      cc_ids:           string[] | null;
    }>`
      WITH effective_roles AS (
        SELECT gr.assignment_scope_type,
               gr.assignment_scope_ref_id,
               gr.include_descendants
        FROM master.auth_group_member gm
        JOIN master.auth_group_role   gr
          ON  gr.group_id  = gm.group_id
          AND gr.tenant_id = gm.tenant_id
          AND gr.is_active = true
        WHERE gm.principal_id = ${principalId}::uuid
          AND gm.tenant_id    = ${tenantId}::uuid
      ),
      cc_scope AS (
        -- Direct company_code scope
        SELECT cc.id
        FROM   effective_roles er
        JOIN   master.company_code cc
          ON   cc.id        = er.assignment_scope_ref_id
          AND  cc.tenant_id = ${tenantId}::uuid
          AND  cc.status    = 'active'
        WHERE  er.assignment_scope_type = 'company_code'

        UNION

        -- Legal entity — direct CCs only (no subtree expansion)
        SELECT cc.id
        FROM   effective_roles er
        JOIN   master.company_code cc
          ON   cc.legal_entity_id = er.assignment_scope_ref_id
          AND  cc.tenant_id       = ${tenantId}::uuid
          AND  cc.status          = 'active'
        WHERE  er.assignment_scope_type = 'legal_entity'
          AND  er.include_descendants   = false

        UNION

        -- Legal entity — full descendant subtree
        SELECT cc.id
        FROM   effective_roles er
        CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(${tenantId}::uuid, er.assignment_scope_ref_id) sub
        JOIN   master.company_code cc
          ON   cc.id     = sub.company_code_id
          AND  cc.status = 'active'
        WHERE  er.assignment_scope_type = 'legal_entity'
          AND  er.include_descendants   = true
      )
      SELECT
        coalesce(
          (SELECT bool_or(assignment_scope_type = 'tenant') FROM effective_roles),
          false
        ) AS has_tenant_scope,
        array(SELECT id FROM cc_scope) AS cc_ids
    `.execute(this.db);

    const row = result.rows[0];
    const hasTenantScope = row?.has_tenant_scope ?? false;
    const ccIds = (row?.cc_ids ?? []).filter(Boolean) as string[];

    // Tenant-wide role → unrestricted
    if (hasTenantScope) {
      const allCodes = await this.db
        .selectFrom("master.company_code as cc" as never)
        .select(["cc.id", "cc.code", "cc.name"] as never[])
        .where("cc.tenant_id" as never, "=", tenantId as never)
        .where("cc.status"    as never, "=", "active" as never)
        .execute() as Array<{ id: string; code: string; name: string }>;

      return { principalId, tenantId, companyCodeIds: allCodes.map((c) => c.id), companyCodes: allCodes, isUnrestricted: true };
    }

    // Company-specific role assignments
    if (ccIds.length > 0) {
      const codes = await this.db
        .selectFrom("master.company_code as cc" as never)
        .select(["cc.id", "cc.code", "cc.name"] as never[])
        .where("cc.tenant_id" as never, "=", tenantId as never)
        .where("cc.id"        as never, "in" as never, ccIds as never)
        .where("cc.status"    as never, "=", "active" as never)
        .execute() as Array<{ id: string; code: string; name: string }>;

      return { principalId, tenantId, companyCodeIds: codes.map((c) => c.id), companyCodes: codes, isUnrestricted: false };
    }

    // No RBAC assignments — unrestricted fallback (new users, service accounts)
    const allCodes = await this.db
      .selectFrom("master.company_code as cc" as never)
      .select(["cc.id", "cc.code", "cc.name"] as never[])
      .where("cc.tenant_id" as never, "=", tenantId as never)
      .where("cc.status"    as never, "=", "active" as never)
      .execute() as Array<{ id: string; code: string; name: string }>;

    return { principalId, tenantId, companyCodeIds: allCodes.map((c) => c.id), companyCodes: allCodes, isUnrestricted: true };
  }

  /**
   * Get group IDs the principal belongs to (for scope inheritance).
   */
  private async getGroupMemberships(
    principalId: string,
    tenantId:    string,
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom("master.auth_group_member as agm" as never)
      .select("agm.group_id" as never)
      .where("agm.tenant_id" as never, "=", tenantId as never)
      .where("agm.principal_id" as never, "=", principalId as never)
      .execute()
      .catch(() => [] as Array<{ group_id: string }>);

    return (rows as Array<{ group_id: string }>).map((r) => r.group_id);
  }

  /**
   * Expand company code IDs to include all descendants.
   * Uses iterative BFS rather than a recursive CTE to avoid raw SQL.
   *
   * master.company_code has a parent_company_code_id self-reference.
   * BFS depth is capped at 8 levels (more than enough for any real hierarchy).
   */
  private async expandSubtrees(
    rootIds:  string[],
    tenantId: string,
  ): Promise<string[]> {
    if (rootIds.length === 0) return [];

    const visited = new Set<string>(rootIds);
    let frontier = [...rootIds];

    for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
      const children = await this.db
        .selectFrom("master.company_code as cc" as never)
        .select("cc.id" as never)
        .where("cc.tenant_id" as never, "=", tenantId as never)
        .where("cc.parent_company_code_id" as never, "in" as never, frontier as never)
        .execute()
        .catch(() => [] as Array<{ id: string }>);

      frontier = (children as Array<{ id: string }>)
        .map((c) => c.id)
        .filter((id) => !visited.has(id));

      for (const id of frontier) visited.add(id);
    }

    return Array.from(visited);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCompanyCodeScopeService(db: Kysely<any>): CompanyCodeScopeService {
  return new CompanyCodeScopeService(db);
}
