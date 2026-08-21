// Admin plane resolver.
//
// Platform staff is plan-free: plan_permission_access, plan_module_access,
// plan_feature_access, tenant_module_subscription and tenant_feature_entitlement
// all play no role in admin-plane authorization. The decision space collapses
// to:
//
//   persona × persona_permission   +   access_grant (allow/deny)
//
// Mechanics:
//   1. Resolve the staff persona (master.principal_persona, tenant_id NULL by
//      convention for platform staff — but in practice many staff principals
//      get the persona on their home admin tenant, so we accept either).
//   2. Walk persona_permission for direct grants.
//   3. Apply admin-scope access_grant overrides (deny wins).
//   4. Intersect with plane_eligibility @> ARRAY['admin'].
//
// Admin grants are scoped via `master.access_grant.principal_id`. Group/role
// fan-out is supported but rarely used at the platform-admin layer; the query
// below joins through auth_group_member so when ops teams need it, it Just
// Works.

import { sql, type Kysely } from "kysely";

import type {
  EffectivePermissionContext,
  EffectivePermissionEntry,
  PermissionResolver,
  ResolverInput,
} from "../types.js";
import {
  computePersonaFingerprint,
  computeProfileHash,
  computeSchemaHash,
  loadPlaneEligiblePermissions,
} from "./base.js";

type AnyDb = Kysely<Record<string, unknown>>;

export interface AdminResolverDeps {
  db: AnyDb;
}

interface AdminScopeRow {
  persona_id: string | null;
  role_ids: string[];
  group_ids: string[];
  allowed_codes: string[];
  denied_codes: string[];
}

export function createAdminResolver(deps: AdminResolverDeps): PermissionResolver {
  const { db } = deps;

  return {
    planeKey: "admin" as const,
    async build(input: ResolverInput): Promise<EffectivePermissionContext> {
      const { tenantId, principalId } = input;

      const [planeEligible, scope] = await Promise.all([
        loadPlaneEligiblePermissions(db, "admin"),
        loadAdminScope(db, tenantId, principalId),
      ]);

      const personaFingerprint = computePersonaFingerprint({
        personaId: scope.persona_id,
        roleIds: scope.role_ids,
        groupIds: scope.group_ids,
      });

      const allowed = new Set<string>();
      const denied = new Set<string>(scope.denied_codes);
      const planeExcluded = new Set<string>();
      const entries = new Map<string, EffectivePermissionEntry>();

      for (const code of scope.allowed_codes) {
        if (denied.has(code)) continue;
        if (!planeEligible.has(code)) {
          planeExcluded.add(code);
          entries.set(code, { code, status: "missing", reason: "plane_excluded" });
          continue;
        }
        allowed.add(code);
        entries.set(code, { code, status: "allow", reason: "allowed" });
      }

      for (const code of denied) {
        entries.set(code, { code, status: "deny", reason: "denied_by_grant" });
      }

      // Catalog-wide rows that were neither granted nor denied land here so
      // disabledReason can render "missing_permission" for them. We do this
      // for plane-eligible rows only — non-admin permissions are recorded as
      // plane_excluded already.
      for (const code of planeEligible.keys()) {
        if (!entries.has(code)) {
          entries.set(code, { code, status: "missing", reason: "missing_permission" });
        }
      }

      const profileHash = computeProfileHash({
        principalFingerprint: personaFingerprint,
        allowedCodes: allowed,
        // Admin is plan-free: omit planVersionId from the hash so plan
        // changes do not bust admin descriptors unnecessarily.
        planVersionId: undefined,
      });

      return Object.freeze({
        planeKey: "admin",
        tenantId,
        principalId,
        personaId: scope.persona_id ?? undefined,
        principalFingerprint: personaFingerprint,
        // planVersionId intentionally undefined for admin.
        allowed,
        denied,
        planLocked: new Set<string>(),
        planeExcluded,
        entries,
        authorizationScopes: new Map(),
        profileHash,
        schemaHash: input.schemaHash ?? computeSchemaHash(),
        resolvedAt: Date.now(),
      });
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function loadAdminScope(
  db: AnyDb,
  tenantId: string,
  principalId: string,
): Promise<AdminScopeRow> {
  const result = await sql<AdminScopeRow>`
    WITH persona AS (
      SELECT pp.persona_id
        FROM master.principal_persona pp
       WHERE pp.principal_id = ${principalId}::uuid
         AND (pp.tenant_id   = ${tenantId}::uuid OR pp.tenant_id IS NULL)
       ORDER BY pp.tenant_id NULLS LAST
       LIMIT 1
    ),
    group_roles AS (
      SELECT DISTINCT gm.group_id, gr.role_id
        FROM master.auth_group_member gm
        JOIN master.auth_group_role gr
          ON gr.group_id  = gm.group_id
         AND gr.tenant_id = gm.tenant_id
         AND gr.is_active = true
         AND (gr.expires_at IS NULL OR gr.expires_at > now())
       WHERE gm.principal_id = ${principalId}::uuid
         AND gm.tenant_id    = ${tenantId}::uuid
    ),
    persona_allows AS (
      SELECT p.code
        FROM shared.persona_permission pp
        JOIN shared.permission p ON p.id = pp.permission_id
       WHERE pp.persona_id = (SELECT persona_id FROM persona)
         AND pp.is_granted = true
         AND p.status      = 'active'
    ),
    grant_allows AS (
      SELECT DISTINCT p.code
        FROM master.access_grant ag
        JOIN shared.permission p ON p.id = ag.permission_id
       WHERE ag.effect     = 'allow'
         AND ag.status     = 'active'
         AND (ag.expires_at IS NULL OR ag.expires_at > now())
         AND (
              ag.principal_id = ${principalId}::uuid
           OR ag.role_id  IN (SELECT role_id  FROM group_roles)
           OR ag.group_id IN (SELECT group_id FROM group_roles)
         )
    ),
    grant_denies AS (
      SELECT DISTINCT p.code
        FROM master.access_grant ag
        JOIN shared.permission p ON p.id = ag.permission_id
       WHERE ag.effect        = 'deny'
         AND ag.status        = 'active'
         AND ag.principal_id  = ${principalId}::uuid
         AND (ag.expires_at IS NULL OR ag.expires_at > now())
    )
    SELECT
      (SELECT persona_id FROM persona)                                  AS persona_id,
      COALESCE((SELECT array_agg(DISTINCT role_id::text)   FROM group_roles),   ARRAY[]::text[]) AS role_ids,
      COALESCE((SELECT array_agg(DISTINCT group_id::text)  FROM group_roles),   ARRAY[]::text[]) AS group_ids,
      COALESCE((SELECT array_agg(DISTINCT code)            FROM persona_allows
                UNION
                SELECT array_agg(DISTINCT code)            FROM grant_allows),  ARRAY[]::text[]) AS allowed_codes,
      COALESCE((SELECT array_agg(DISTINCT code) FROM grant_denies),             ARRAY[]::text[]) AS denied_codes
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    return {
      persona_id: null,
      role_ids: [],
      group_ids: [],
      allowed_codes: [],
      denied_codes: [],
    };
  }
  return {
    persona_id: row.persona_id,
    role_ids: row.role_ids ?? [],
    group_ids: row.group_ids ?? [],
    allowed_codes: row.allowed_codes ?? [],
    denied_codes: row.denied_codes ?? [],
  };
}
