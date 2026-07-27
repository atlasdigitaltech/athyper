// Mesh plane resolver.
//
// Mesh authorization is fundamentally different from neon/admin: the partner
// principal is NOT a tenant employee, has no persona, no group membership,
// and no subscription. They act *inside* an inviting tenant's namespace via
// a `mesh.account_grant` row that bridges:
//
//   mesh.principal  →  mesh.account_grant  →  mesh.network_account
//
// The grant carries a role_code (`account_owner` | `account_admin` |
// `account_user`) and a stable `fingerprint` (SHA256 of principal_id +
// account_id + role_code, computed by trigger in Phase 1).
//
// Permission resolution then runs against the **inviting tenant**'s
// `master.access_grant` rows: the inviting tenant decides exactly which
// records / actions the partner can touch, by inserting grant rows that
// reference the partner principal id. The mesh resolver therefore:
//
//   1. Locate the active mesh.account_grant for the principal+tenant pair.
//   2. Read its fingerprint (cache-key input).
//   3. Pull master.access_grant rows where principal_id = mesh principal.
//   4. Intersect with plane_eligibility @> ARRAY['mesh'].
//
// Things that explicitly do NOT apply here:
//   - persona_permission (mesh principals don't have personas).
//   - auth_group_role (mesh principals don't join tenant groups).
//   - plan_permission_access (the inviting tenant's plan implicitly bounds
//     what the partner can be granted; there's nothing to gate at this
//     layer).

import { sql, type Kysely } from "kysely";

import type {
  EffectivePermissionContext,
  EffectivePermissionEntry,
  PermissionResolver,
  ResolverInput,
} from "../types.js";
import {
  computeProfileHash,
  computeSchemaHash,
  loadPlaneEligiblePermissions,
} from "./base.js";

type AnyDb = Kysely<Record<string, unknown>>;

/**
 * Mesh resolvers need access to both DBs: the inviting tenant's main DB (for
 * shared.permission, master.access_grant, control.entity*) AND the partner
 * tenant's mesh DB (for mesh.account_grant). In single-DB local dev these
 * point at the same client.
 */
export interface MeshResolverDeps {
  db: AnyDb;
  /** Optional: dedicated client for mesh.* tables when split DB topology. */
  meshDb?: AnyDb;
}

interface BindingRow {
  grant_id: string;
  account_id: string;
  role_code: string;
  fingerprint: string;
  status: string;
}

interface AccessGrantRow {
  code: string;
  effect: "allow" | "deny";
}

export function createMeshResolver(deps: MeshResolverDeps): PermissionResolver {
  const { db, meshDb } = deps;
  const grantDb = meshDb ?? db;

  return {
    planeKey: "mesh" as const,
    async build(input: ResolverInput): Promise<EffectivePermissionContext> {
      const { tenantId, principalId, accountGrantId } = input;

      const binding = await loadActiveBinding(grantDb, principalId, accountGrantId);
      if (!binding) {
        throw new Error(
          `mesh resolver: no active account_grant for principal ${principalId}` +
            (accountGrantId ? ` (requested grant ${accountGrantId})` : ""),
        );
      }

      const [planeEligible, accessGrants] = await Promise.all([
        loadPlaneEligiblePermissions(db, "mesh"),
        loadMeshAccessGrants(db, tenantId, principalId),
      ]);

      const denied = new Set<string>();
      const allowed = new Set<string>();
      const planeExcluded = new Set<string>();
      const entries = new Map<string, EffectivePermissionEntry>();

      // Pass 1: explicit denies (always win).
      for (const row of accessGrants) {
        if (row.effect === "deny") denied.add(row.code);
      }

      // Pass 2: allows that aren't denied and that apply to the mesh plane.
      for (const row of accessGrants) {
        if (row.effect !== "allow") continue;
        if (denied.has(row.code)) continue;
        if (!planeEligible.has(row.code)) {
          planeExcluded.add(row.code);
          entries.set(row.code, { code: row.code, status: "missing", reason: "plane_excluded" });
          continue;
        }
        allowed.add(row.code);
        entries.set(row.code, { code: row.code, status: "allow", reason: "allowed" });
      }

      // Pass 3: record explicit denies in entries.
      for (const code of denied) {
        entries.set(code, { code, status: "deny", reason: "denied_by_grant" });
      }

      // Pass 4: every mesh-eligible permission that wasn't granted is missing.
      for (const code of planeEligible.keys()) {
        if (!entries.has(code)) {
          entries.set(code, { code, status: "missing", reason: "missing_permission" });
        }
      }

      const profileHash = computeProfileHash({
        principalFingerprint: binding.fingerprint,
        allowedCodes: allowed,
        // Mesh inherits the inviting tenant's plan implicitly via the binding;
        // we do not include planVersionId in the fingerprint here.
        planVersionId: undefined,
      });

      return Object.freeze({
        planeKey: "mesh",
        tenantId,
        principalId,
        accountGrantId: binding.grant_id,
        networkAccountId: binding.account_id,
        principalFingerprint: binding.fingerprint,
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

async function loadActiveBinding(
  db: AnyDb,
  principalId: string,
  accountGrantId?: string,
): Promise<BindingRow | null> {
  // When the request explicitly nominates a binding (e.g. multi-tenant partner
  // with several active accounts), require that grant_id to match. Otherwise
  // return the most recently granted active row.
  const result = await sql<BindingRow>`
    SELECT
        ag.id::text          AS grant_id,
        ag.account_id::text  AS account_id,
        ag.role_code,
        ag.fingerprint,
        ag.status
      FROM mesh.account_grant ag
     WHERE ag.principal_id = ${principalId}::uuid
       AND ag.status       = 'active'
       ${
         accountGrantId
           ? sql`AND ag.id = ${accountGrantId}::uuid`
           : sql``
       }
     ORDER BY ag.granted_at DESC
     LIMIT 1
  `.execute(db);

  return result.rows[0] ?? null;
}

async function loadMeshAccessGrants(
  db: AnyDb,
  tenantId: string,
  principalId: string,
): Promise<readonly AccessGrantRow[]> {
  const result = await sql<AccessGrantRow>`
    SELECT
        p.code,
        ag.effect
      FROM master.access_grant ag
      JOIN shared.permission p ON p.id = ag.permission_id
     WHERE ag.tenant_id    = ${tenantId}::uuid
       AND ag.principal_id = ${principalId}::uuid
       AND ag.status       = 'active'
       AND (ag.expires_at IS NULL OR ag.expires_at > now())
       AND p.status        = 'active'
  `.execute(db);

  return result.rows.filter((r): r is AccessGrantRow =>
    r.effect === "allow" || r.effect === "deny",
  );
}
