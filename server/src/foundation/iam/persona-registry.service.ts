/**
 * PersonaRegistryService — Phase 6.2
 *
 * Manages shared.persona definitions and master.principal_persona assignments.
 *
 * Design:
 *   - shared.persona: system-wide role templates (immutable structural fields when is_system=true)
 *   - master.principal_persona: one persona per principal per tenant (DB UNIQUE enforced)
 *   - shared.persona_permission: binary grant matrix — persona × permission
 *
 * Persona assignment is a hard-switch (upsert), not an additive stack.
 * Permission derivation: principal → persona → persona_permission → permission.code
 *
 * Persona switching:
 *   - System personas (is_system=true) cannot be deactivated via this service.
 *   - Any active persona may be assigned to any principal.
 *   - Expiring assignments (expires_at) are honoured at read time; expired rows
 *     are treated as if they don't exist and the principal falls back to 'viewer'.
 */

import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PersonaSummary {
  id:          string;
  code:        string;
  name:        string;
  description: string | null;
  scopeMode:   string;
  priority:    number;
  isSystem:    boolean;
  isActive:    boolean;
}

export interface PersonaDetail extends PersonaSummary {
  permissions: { permissionId: string; code: string; isGranted: boolean }[];
}

export interface PrincipalPersonaAssignment {
  id:          string;
  principalId: string;
  tenantId:    string;
  personaId:   string;
  personaCode: string;
  personaName: string;
  assignedBy:  string | null;
  expiresAt:   string | null;
  createdAt:   string;
}

export interface DerivedPermissions {
  personaId:   string;
  personaCode: string;
  permissions: string[];  // permission code strings
  isExpired:   boolean;
}

// ── PersonaRegistryService ────────────────────────────────────────────────────

export class PersonaRegistryService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  // ── Persona catalogue ────────────────────────────────────────────────────────

  /**
   * List all personas. Optionally filter to active-only.
   * shared.persona has no tenant_id — it is a system-wide catalogue.
   */
  async listPersonas(activeOnly = true): Promise<PersonaSummary[]> {
    let query = this.db
      .selectFrom("shared.persona as p" as never)
      .select([
        "p.id", "p.code", "p.name", "p.description",
        "p.scope_mode", "p.priority", "p.is_system", "p.is_active",
      ] as never[])
      .orderBy("p.priority" as never, "asc" as never)
      .orderBy("p.code" as never, "asc" as never);

    if (activeOnly) {
      query = query.where("p.status" as never, "=" as never, "active" as never);
    }

    const rows = await query.execute() as Array<{
      id: string; code: string; name: string; description: string | null;
      scope_mode: string; priority: number; is_system: boolean; is_active: boolean;
    }>;

    return rows.map((r) => ({
      id:          r.id,
      code:        r.code,
      name:        r.name,
      description: r.description,
      scopeMode:   r.scope_mode,
      priority:    r.priority,
      isSystem:    r.is_system,
      isActive:    r.is_active,
    }));
  }

  /**
   * Get a single persona by id, including its permission grants.
   */
  async getPersonaDetail(personaId: string): Promise<PersonaDetail | null> {
    const persona = await this.db
      .selectFrom("shared.persona as p" as never)
      .select([
        "p.id", "p.code", "p.name", "p.description",
        "p.scope_mode", "p.priority", "p.is_system", "p.is_active",
      ] as never[])
      .where("p.id" as never, "=", personaId as never)
      .executeTakeFirst() as {
        id: string; code: string; name: string; description: string | null;
        scope_mode: string; priority: number; is_system: boolean; is_active: boolean;
      } | undefined;

    if (!persona) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perms = await (this.db as any)
      .selectFrom("shared.persona_permission as pp")
      .innerJoin("shared.permission as perm", "perm.id", "pp.permission_id")
      .select(["pp.permission_id", "perm.code", "pp.is_granted"])
      .where("pp.persona_id", "=", personaId)
      .execute() as Array<{ permission_id: string; code: string; is_granted: boolean }>;

    return {
      id:          persona.id,
      code:        persona.code,
      name:        persona.name,
      description: persona.description,
      scopeMode:   persona.scope_mode,
      priority:    persona.priority,
      isSystem:    persona.is_system,
      isActive:    persona.is_active,
      permissions: perms.map((p) => ({
        permissionId: p.permission_id,
        code:         p.code,
        isGranted:    p.is_granted,
      })),
    };
  }

  // ── Assignment ───────────────────────────────────────────────────────────────

  /**
   * Assign (or reassign) a persona to a principal.
   * master.principal_persona has a UNIQUE (tenant_id, principal_id) constraint —
   * this upserts via delete+insert to handle FK relationships cleanly.
   */
  async assignPersona(
    principalId: string,
    tenantId:    string,
    personaId:   string,
    assignedBy:  string,
    expiresAt?:  string,
  ): Promise<PrincipalPersonaAssignment> {
    // Verify persona exists and is active
    const persona = await this.db
      .selectFrom("shared.persona as p" as never)
      .select(["p.id", "p.code", "p.name"] as never[])
      .where("p.id" as never, "=", personaId as never)
      .where("p.status" as never, "=", "active" as never)
      .executeTakeFirst() as { id: string; code: string; name: string } | undefined;

    if (!persona) {
      throw new Error(`Persona ${personaId} not found or not active`);
    }

    // Upsert wrapped in a transaction: if the insert fails after the delete the
    // assignment is not silently lost.  Swallowing the delete error was unsafe here.
    const row = await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("master.principal_persona" as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("principal_id" as never, "=", principalId as never)
        .execute();

      return trx
        .insertInto("master.principal_persona" as never)
        .values({
          tenant_id:    tenantId,
          principal_id: principalId,
          persona_id:   personaId,
          assigned_by:  assignedBy,
          expires_at:   expiresAt ?? null,
          created_by:   assignedBy,
        } as never)
        .returning(["id", "created_at"] as never[])
        .executeTakeFirstOrThrow() as Promise<{ id: string; created_at: string }>;
    });

    return {
      id:          row.id,
      principalId,
      tenantId,
      personaId,
      personaCode: persona.code,
      personaName: persona.name,
      assignedBy,
      expiresAt:   expiresAt ?? null,
      createdAt:   row.created_at,
    };
  }

  /**
   * Get the current persona assignment for a principal.
   * Returns null if the assignment has expired.
   */
  async getPrincipalPersona(
    principalId: string,
    tenantId:    string,
  ): Promise<PrincipalPersonaAssignment | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (this.db as any)
      .selectFrom("master.principal_persona as pp")
      .innerJoin("shared.persona as p", "p.id", "pp.persona_id")
      .select([
        "pp.id", "pp.persona_id", "pp.assigned_by", "pp.expires_at", "pp.created_at",
        "p.code as persona_code", "p.name as persona_name",
      ])
      .where("pp.tenant_id", "=", tenantId)
      .where("pp.principal_id", "=", principalId)
      .executeTakeFirst() as {
        id: string; persona_id: string; assigned_by: string | null;
        expires_at: string | null; created_at: string;
        persona_code: string; persona_name: string;
      } | undefined;

    if (!row) return null;

    // Honour expiry at read time
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return null;
    }

    return {
      id:          row.id,
      principalId,
      tenantId,
      personaId:   row.persona_id,
      personaCode: row.persona_code,
      personaName: row.persona_name,
      assignedBy:  row.assigned_by,
      expiresAt:   row.expires_at,
      createdAt:   row.created_at,
    };
  }

  /**
   * Remove a persona assignment (principal reverts to no persona / viewer fallback).
   */
  async revokePersona(
    principalId: string,
    tenantId:    string,
  ): Promise<void> {
    await this.db
      .deleteFrom("master.principal_persona" as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("principal_id" as never, "=", principalId as never)
      .execute();
  }

  // ── Permission derivation ────────────────────────────────────────────────────

  /**
   * Derive the effective permission set for a principal.
   *
   * Resolution order:
   *   1. Look up master.principal_persona (single row per principal per tenant)
   *   2. Join → shared.persona_permission WHERE is_granted = true
   *   3. Join → shared.permission for the code
   *
   * Falls back to empty permissions (viewer-only) if no assignment or assignment
   * has expired. The caller must apply tenant-level overrides from
   * master.tenant_permission_override separately (out of scope for this service).
   */
  async derivePermissions(
    principalId: string,
    tenantId:    string,
  ): Promise<DerivedPermissions> {
    const assignment = await this.getPrincipalPersona(principalId, tenantId);

    if (!assignment) {
      return {
        personaId:   "",
        personaCode: "viewer",
        permissions: [],
        isExpired:   false,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perms = await (this.db as any)
      .selectFrom("shared.persona_permission as pp")
      .innerJoin("shared.permission as perm", "perm.id", "pp.permission_id")
      .select("perm.code")
      .where("pp.persona_id", "=", assignment.personaId)
      .where("pp.is_granted", "=", true)
      .execute() as Array<{ code: string }>;

    return {
      personaId:   assignment.personaId,
      personaCode: assignment.personaCode,
      permissions: perms.map((p) => p.code),
      isExpired:   false,
    };
  }

  /**
   * Bulk-derive permissions for multiple principals in a single query.
   * Used by session resolution when loading team/group members.
   */
  async bulkDerivePermissions(
    principalIds: string[],
    tenantId:     string,
  ): Promise<Map<string, DerivedPermissions>> {
    if (principalIds.length === 0) return new Map();

    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.db as any)
      .selectFrom("master.principal_persona as mpp")
      .innerJoin("shared.persona as p", "p.id", "mpp.persona_id")
      .innerJoin("shared.persona_permission as pp", "pp.persona_id", "mpp.persona_id")
      .innerJoin("shared.permission as perm", "perm.id", "pp.permission_id")
      .select(["mpp.principal_id", "mpp.persona_id", "mpp.expires_at", "p.code as persona_code", "perm.code as perm_code"])
      .where("mpp.tenant_id", "=", tenantId)
      .where("mpp.principal_id", "in", principalIds)
      .where("pp.is_granted", "=", true)
      .execute() as Array<{
        principal_id: string; persona_id: string; expires_at: string | null;
        persona_code: string; perm_code: string;
      }>;

    const result = new Map<string, DerivedPermissions>();

    for (const row of rows) {
      const isExpired = !!row.expires_at && new Date(row.expires_at) < new Date(now);
      if (isExpired) continue;

      const existing = result.get(row.principal_id);
      if (existing) {
        existing.permissions.push(row.perm_code);
      } else {
        result.set(row.principal_id, {
          personaId:   row.persona_id,
          personaCode: row.persona_code,
          permissions: [row.perm_code],
          isExpired:   false,
        });
      }
    }

    // Principals with no rows → empty permissions
    for (const pid of principalIds) {
      if (!result.has(pid)) {
        result.set(pid, {
          personaId:   "",
          personaCode: "viewer",
          permissions: [],
          isExpired:   false,
        });
      }
    }

    return result;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPersonaRegistryService(db: Kysely<any>): PersonaRegistryService {
  return new PersonaRegistryService(db);
}
