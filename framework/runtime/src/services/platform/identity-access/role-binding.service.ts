/**
 * Role Binding Service
 *
 * B4: Roles + Role Bindings
 * Manages role definitions and role-to-principal/group bindings
 *
 * Scoping rules:
 * - scope_kind='tenant' (default) - role applies to entire tenant
 * - scope_kind='ou' - role applies to specific OU (scope_key = ou_node.id)
 * - scope_kind='entity' - role applies to specific entity (scope_key = entity_name or entity_name:entity_id)
 *
 * Tables:
 * - core.role
 * - core.role_binding
 */

import {
  PERSONA_CODES,
  type PersonaCode,
} from "../foundation/iam/persona-model/types.js";
import type { PersonaRegistryService } from "../foundation/iam/persona-model/persona-registry.service.js";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Scope kind for role binding (matches DB constraint)
 */
export type ScopeKind = "tenant" | "ou" | "entity" | "module";

/**
 * Scope mode for role (matches DB constraint)
 * Extended to include "module" for module_admin persona
 */
export type ScopeMode = "tenant" | "ou" | "entity" | "module";

/**
 * Role information
 */
export type RoleInfo = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  scopeMode: ScopeMode;
  isActive: boolean;
  priority?: number;
  description?: string;
};

/**
 * Mapping from legacy role codes to persona codes
 * Used for backward compatibility when IdP sends old role names
 */
const LEGACY_ROLE_MAPPING: Record<string, PersonaCode> = {
  admin: "module_admin", // legacy "admin" maps to module_admin
  user: "requester", // legacy "user" maps to requester
  readonly: "viewer", // legacy "readonly" maps to viewer
};

/**
 * Check if a code is a valid persona code
 */
export function isPersonaCode(code: string): code is PersonaCode {
  return PERSONA_CODES.includes(code as PersonaCode);
}

/**
 * Normalize role code to persona code
 * Handles legacy role codes and returns the canonical persona
 */
export function normalizeToPersonaCode(roleCode: string): PersonaCode | null {
  // Direct match
  if (isPersonaCode(roleCode)) {
    return roleCode;
  }
  // Legacy mapping
  if (roleCode in LEGACY_ROLE_MAPPING) {
    return LEGACY_ROLE_MAPPING[roleCode];
  }
  return null;
}

/**
 * Get standard role definition by code
 */
export function getStandardRoleDef(code: PersonaCode) {
  return STANDARD_ROLES.find((r) => r.code === code);
}

/**
 * Role binding information
 */
export type RoleBindingInfo = {
  id: string;
  tenantId: string;
  roleId: string;
  principalId: string | null;
  groupId: string | null;
  scopeKind: ScopeKind;
  scopeKey: string | null;
  priority: number;
  validFrom: Date | null;
  validUntil: Date | null;
};

/**
 * Standard role definitions (7 Personas from Permission Action Model)
 *
 * Priority determines precedence when a subject has multiple roles:
 * - Lower number = higher priority
 * - tenant_admin has highest priority (10)
 * - viewer has lowest priority (70)
 */
const STANDARD_ROLES: Array<{
  code: PersonaCode;
  name: string;
  scopeMode: ScopeMode;
  priority: number;
  description: string;
}> = [
  {
    code: "viewer",
    name: "Viewer",
    scopeMode: "tenant",
    priority: 70,
    description: "Read-only access to records within tenant",
  },
  {
    code: "reporter",
    name: "Reporter",
    scopeMode: "tenant",
    priority: 60,
    description: "Viewer + reporting and export capabilities",
  },
  {
    code: "requester",
    name: "Requester",
    scopeMode: "tenant",
    priority: 50,
    description: "Can create and manage own records",
  },
  {
    code: "agent",
    name: "Agent",
    scopeMode: "ou",
    priority: 40,
    description: "Process and act on records within OU scope",
  },
  {
    code: "manager",
    name: "Manager",
    scopeMode: "ou",
    priority: 30,
    description: "Supervise and manage workflow within OU scope",
  },
  {
    code: "module_admin",
    name: "Module Admin",
    scopeMode: "module",
    priority: 20,
    description: "Administrative access within specific modules",
  },
  {
    code: "tenant_admin",
    name: "Tenant Admin",
    scopeMode: "tenant",
    priority: 10,
    description: "Full administrative access across the entire tenant",
  },
];

/**
 * Role Binding Service
 */
export class RoleBindingService {
  private readonly registry: PersonaRegistryService | null;

  constructor(db: Kysely<DB>, registry?: PersonaRegistryService);
  constructor(private readonly db: Kysely<DB>, registry?: PersonaRegistryService) {
    this.registry = registry ?? null;
  }

  /**
   * Seed standard roles for tenant
   */
  async seedStandardRoles(tenantId: string, createdBy: string): Promise<RoleInfo[]> {
    const roles: RoleInfo[] = [];

    for (const roleDef of STANDARD_ROLES) {
      // Check if already exists
      const existing = await this.getRoleByCode(tenantId, roleDef.code);
      if (existing) {
        roles.push(existing);
        continue;
      }

      // Create role
      const id = crypto.randomUUID();
      await this.db
        .insertInto("core.role")
        .values({
          id,
          tenant_id: tenantId,
          code: roleDef.code,
          name: roleDef.name,
          category: roleDef.scopeMode,
          description: roleDef.description,
          created_by: createdBy,
        })
        .execute();

      roles.push({
        id,
        tenantId,
        code: roleDef.code,
        name: roleDef.name,
        scopeMode: roleDef.scopeMode,
        isActive: true,
      });

      console.log(
        JSON.stringify({
          msg: "standard_role_created",
          id,
          tenantId,
          code: roleDef.code,
        })
      );
    }

    return roles;
  }

  /**
   * Create custom role
   */
  async createRole(
    tenantId: string,
    code: string,
    name: string,
    scopeMode: ScopeMode,
    createdBy: string
  ): Promise<RoleInfo> {
    const id = crypto.randomUUID();
    await this.db
      .insertInto("core.role")
      .values({
        id,
        tenant_id: tenantId,
        code,
        name,
        category: scopeMode,
        created_by: createdBy,
      })
      .execute();

    return {
      id,
      tenantId,
      code,
      name,
      scopeMode,
      isActive: true,
    };
  }

  /**
   * Get role by ID
   */
  async getRole(roleId: string): Promise<RoleInfo | undefined> {
    const result = await this.db
      .selectFrom("core.role")
      .select(["id", "tenant_id", "code", "name", "category"])
      .where("id", "=", roleId)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      tenantId: result.tenant_id,
      code: result.code,
      name: result.name,
      scopeMode: (result.category ?? "tenant") as ScopeMode,
      isActive: true,
    };
  }

  /**
   * Get role by code
   */
  async getRoleByCode(tenantId: string, code: string): Promise<RoleInfo | undefined> {
    const result = await this.db
      .selectFrom("core.role")
      .select(["id", "tenant_id", "code", "name", "category"])
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      tenantId: result.tenant_id,
      code: result.code,
      name: result.name,
      scopeMode: (result.category ?? "tenant") as ScopeMode,
      isActive: true,
    };
  }

  /**
   * Create role binding
   */
  async createBinding(request: {
    tenantId: string;
    roleId: string;
    principalId?: string;
    groupId?: string;
    scopeKind?: ScopeKind;
    scopeKey?: string;
    priority?: number;
    validFrom?: Date;
    validUntil?: Date;
    createdBy: string;
  }): Promise<RoleBindingInfo> {
    // Validate: either principalId or groupId (not both)
    if (request.principalId && request.groupId) {
      throw new Error("Cannot bind to both principal and group");
    }
    if (!request.principalId && !request.groupId) {
      throw new Error("Must specify either principalId or groupId");
    }

    const id = crypto.randomUUID();
    await this.db
      .insertInto("core.principal_role")
      .values({
        id,
        tenant_id: request.tenantId,
        role_id: request.roleId,
        principal_id: request.principalId ?? request.groupId ?? "",
        assigned_by: request.createdBy,
        expires_at: request.validUntil ?? null,
      })
      .execute();

    console.log(
      JSON.stringify({
        msg: "role_binding_created",
        id,
        roleId: request.roleId,
        principalId: request.principalId,
        groupId: request.groupId,
        scopeKind: request.scopeKind ?? "tenant",
      })
    );

    return {
      id,
      tenantId: request.tenantId,
      roleId: request.roleId,
      principalId: request.principalId ?? null,
      groupId: request.groupId ?? null,
      scopeKind: (request.scopeKind ?? "tenant") as ScopeKind,
      scopeKey: request.scopeKey ?? null,
      priority: request.priority ?? 100,
      validFrom: request.validFrom ?? null,
      validUntil: request.validUntil ?? null,
    };
  }

  /**
   * Remove role binding
   */
  async removeBinding(bindingId: string): Promise<void> {
    await this.db
      .deleteFrom("core.principal_role" as any)
      .where("id", "=", bindingId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "role_binding_removed",
        id: bindingId,
      })
    );
  }

  /**
   * Get roles for principal (direct + inherited from groups)
   */
  async getPrincipalRoles(
    principalId: string,
    tenantId: string
  ): Promise<Array<RoleInfo & { binding: RoleBindingInfo }>> {
    const now = new Date();

    // Get direct role bindings
    const directBindings = await this.db
      .selectFrom("core.principal_role as pr")
      .innerJoin("core.role as r", "r.id", "pr.role_id")
      .select([
        "r.id as role_id",
        "r.tenant_id",
        "r.code",
        "r.name",
        "r.category",
        "pr.id as binding_id",
        "pr.principal_id",
        "pr.expires_at",
      ])
      .where("pr.tenant_id", "=", tenantId)
      .where("pr.principal_id", "=", principalId)
      .where((eb) =>
        eb.or([eb("pr.expires_at", "is", null), eb("pr.expires_at", ">", now)])
      )
      .execute();

    // Get group memberships
    const groupMemberships = await this.db
      .selectFrom("core.group_member")
      .select("group_id")
      .where("principal_id", "=", principalId)
      .execute();

    const groupIds = groupMemberships.map((m) => m.group_id);

    // Get group-based bindings (groups share principal_role via principal_id)
    let groupBindings: typeof directBindings = [];
    if (groupIds.length > 0) {
      groupBindings = await this.db
        .selectFrom("core.principal_role as pr")
        .innerJoin("core.role as r", "r.id", "pr.role_id")
        .select([
          "r.id as role_id",
          "r.tenant_id",
          "r.code",
          "r.name",
          "r.category",
          "pr.id as binding_id",
          "pr.principal_id",
          "pr.expires_at",
        ])
        .where("pr.tenant_id", "=", tenantId)
        .where("pr.principal_id", "in", groupIds)
        .where((eb) =>
          eb.or([eb("pr.expires_at", "is", null), eb("pr.expires_at", ">", now)])
        )
        .execute();
    }

    // Combine and deduplicate by role code (prioritize direct bindings)
    const allBindings = [...directBindings, ...groupBindings];
    const seen = new Set<string>();
    const results: Array<RoleInfo & { binding: RoleBindingInfo }> = [];

    for (const row of allBindings) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);

      const roleDef = getStandardRoleDef(row.code as PersonaCode);
      const priority = roleDef?.priority ?? 100;

      results.push({
        id: row.role_id,
        tenantId: row.tenant_id,
        code: row.code,
        name: row.name,
        scopeMode: (row.category ?? "tenant") as ScopeMode,
        isActive: true,
        priority,
        binding: {
          id: row.binding_id,
          tenantId: row.tenant_id,
          roleId: row.role_id,
          principalId: row.principal_id,
          groupId: null,
          scopeKind: (row.category ?? "tenant") as ScopeKind,
          scopeKey: null,
          priority,
          validFrom: null,
          validUntil: row.expires_at,
        },
      });
    }

    // Sort by priority (lower = higher priority)
    results.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    return results;
  }

  /**
   * List roles by tenant
   */
  async listRoles(
    tenantId: string,
    filters?: {
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<RoleInfo[]> {
    const query = this.db
      .selectFrom("core.role")
      .select(["id", "tenant_id", "code", "name", "category"])
      .where("tenant_id", "=", tenantId);

    const results = await query
      .limit(filters?.limit ?? 100)
      .offset(filters?.offset ?? 0)
      .orderBy("name", "asc")
      .execute();

    return results.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      scopeMode: (r.category ?? "tenant") as ScopeMode,
      isActive: true,
    }));
  }

  /**
   * Resolve the effective persona for a principal.
   *
   * When a PersonaRegistryService is provided, delegates to it for
   * DB-driven priority (higher number = more privileged).
   * Otherwise falls back to STANDARD_ROLES (lower number = more privileged).
   *
   * @param principalId - The principal to resolve
   * @param tenantId - The tenant context
   * @returns The effective persona code, or 'viewer' as default
   */
  async resolveEffectivePersona(
    principalId: string,
    tenantId: string
  ): Promise<PersonaCode> {
    const roles = await this.getPrincipalRoles(principalId, tenantId);

    if (roles.length === 0) {
      return "viewer";
    }

    const roleCodes = roles.map((r) => r.code);

    // Prefer DB-driven registry when available
    if (this.registry) {
      return this.registry.resolveEffectivePersona(roleCodes);
    }

    // Legacy fallback: STANDARD_ROLES (lower number = higher precedence)
    let bestPersona: PersonaCode = "viewer";
    let bestPriority = Infinity;

    for (const role of roles) {
      const personaCode = normalizeToPersonaCode(role.code);
      if (!personaCode) continue;

      const roleDef = getStandardRoleDef(personaCode);
      const priority = roleDef?.priority ?? role.priority ?? 100;

      if (priority < bestPriority) {
        bestPriority = priority;
        bestPersona = personaCode;
      }
    }

    return bestPersona;
  }

  /**
   * Get all qualified personas for a principal
   *
   * Returns all personas the principal qualifies for, sorted by priority
   * (most privileged first).
   *
   * @param principalId - The principal to check
   * @param tenantId - The tenant context
   * @returns Array of persona codes the principal qualifies for
   */
  async getQualifiedPersonas(
    principalId: string,
    tenantId: string
  ): Promise<PersonaCode[]> {
    const roles = await this.getPrincipalRoles(principalId, tenantId);
    const roleCodes = roles.map((r) => r.code);

    // Prefer DB-driven registry when available
    if (this.registry) {
      return this.registry.getQualifiedPersonas(roleCodes);
    }

    // Legacy fallback
    const personas = new Set<PersonaCode>();

    for (const role of roles) {
      const personaCode = normalizeToPersonaCode(role.code);
      if (personaCode) {
        personas.add(personaCode);
      }
    }

    // Sort by priority (lowest number first = highest precedence in legacy)
    return Array.from(personas).sort((a, b) => {
      const aDef = getStandardRoleDef(a);
      const bDef = getStandardRoleDef(b);
      return (aDef?.priority ?? 100) - (bDef?.priority ?? 100);
    });
  }

  /**
   * Get persona-scoped bindings for a principal
   *
   * Returns bindings with their effective persona and scope information.
   * Used for authorization decisions that need scope context.
   */
  async getPersonaScopedBindings(
    principalId: string,
    tenantId: string
  ): Promise<
    Array<{
      personaCode: PersonaCode;
      scopeKind: ScopeKind;
      scopeKey: string | null;
      priority: number;
    }>
  > {
    const roles = await this.getPrincipalRoles(principalId, tenantId);

    return roles
      .map((role) => {
        const personaCode = normalizeToPersonaCode(role.code);
        if (!personaCode) return null;

        return {
          personaCode,
          scopeKind: role.binding.scopeKind,
          scopeKey: role.binding.scopeKey,
          priority: role.binding.priority,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }

  /**
   * Check if principal has a specific persona (directly or inherited)
   */
  async hasPersona(
    principalId: string,
    tenantId: string,
    personaCode: PersonaCode
  ): Promise<boolean> {
    const qualified = await this.getQualifiedPersonas(principalId, tenantId);
    return qualified.includes(personaCode);
  }

  /**
   * Get the standard role definitions
   */
  getStandardRoles(): typeof STANDARD_ROLES {
    return STANDARD_ROLES;
  }
}
