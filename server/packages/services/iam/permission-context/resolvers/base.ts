// Shared helpers used by all three resolvers (Neon / Admin / Mesh).
//
// Two pieces of logic live here so each resolver doesn't reinvent them:
//
//   1. `computeProfileHash` — deterministic SHA256 over the inputs that the
//      cache key depends on. Sorting + joining must be stable across runs.
//   2. `loadPlaneEligibility` — single query against shared.permission to
//      pull the per-plane allowlist that drives plane filtering.
//
// Both are tested in isolation in resolvers/__tests__/base.test.ts.

import { createHash } from "node:crypto";

import { sql, type Kysely } from "kysely";

import type { PlaneKey } from "../plane-key.js";

// Use a structural type so we don't drag in a specific Kysely schema.
type AnyDb = Kysely<Record<string, unknown>>;

/**
 * Compute the cache-key fingerprint over the inputs that meaningfully change
 * the descriptor for a principal. Order matters; we sort allowed codes so
 * the order in which the resolver discovered them does not affect the hash.
 */
export function computeProfileHash(args: {
  principalFingerprint: string;
  allowedCodes: ReadonlySet<string>;
  planVersionId?: string;
}): string {
  const sortedAllowed = [...args.allowedCodes].sort().join(",");
  const planPart = args.planVersionId ?? "na";
  const material = `${args.principalFingerprint}|${planPart}|${sortedAllowed}`;
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Compute a stable persona fingerprint for the neon / admin resolvers. The
 * mesh resolver uses `mesh.account_grant.fingerprint` (DB-trigger-computed)
 * directly and does not need this helper.
 */
export function computePersonaFingerprint(args: {
  personaId: string | null | undefined;
  roleIds: readonly string[];
  groupIds: readonly string[];
}): string {
  const roleStr = [...args.roleIds].sort().join(",");
  const groupStr = [...args.groupIds].sort().join(",");
  const material = `persona=${args.personaId ?? "none"}|roles=${roleStr}|groups=${groupStr}`;
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Read schema-affecting runtime flags (env-driven feature flags + version pins)
 * so the cache key invalidates when the compiler output could change.
 *
 * Truncated to 12 hex chars — enough entropy for cache disambiguation; the
 * full hash is overkill given the small input space.
 */
export function computeSchemaHash(): string {
  const material = [
    process.env["NODE_ENV"] ?? "unknown",
    process.env["ATHYPER_FEATURE_FLAGS"] ?? "",
    process.env["ATHYPER_RUNTIME_CONTRACTS_VERSION"] ?? "0",
    process.env["ATHYPER_COMPILER_VERSION"] ?? "0",
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 12);
}

// ─── Plane eligibility ──────────────────────────────────────────────────────────

export interface PlanePermissionRow {
  code: string;
  is_plan_restricted: boolean;
}

/**
 * Pull the active permissions whose `plane_eligibility` array includes the
 * requested plane. The result is the candidate set every resolver intersects
 * with role/persona/grant evaluation.
 */
export async function loadPlaneEligiblePermissions(
  db: AnyDb,
  planeKey: PlaneKey,
): Promise<Map<string, PlanePermissionRow>> {
  const result = await sql<{ code: string; is_plan_restricted: boolean }>`
    SELECT code, is_plan_restricted
      FROM shared.permission
     WHERE status = 'active'
       AND plane_eligibility @> ARRAY[${planeKey}]::text[]
  `.execute(db);

  const map = new Map<string, PlanePermissionRow>();
  for (const row of result.rows) {
    map.set(row.code, {
      code: row.code,
      is_plan_restricted: row.is_plan_restricted,
    });
  }
  return map;
}

/**
 * Resolve permission_code aliases through `control.permission_alias`. A caller
 * may supply legacy codes (e.g. 'edit') and the resolver returns the canonical
 * code ('update'). Returns the input unchanged when no alias matches.
 */
export async function loadPermissionAliasMap(
  db: AnyDb,
): Promise<Map<string, string>> {
  const result = await sql<{ alias_code: string; canonical_code: string }>`
    SELECT alias_code, canonical_code
      FROM control.permission_alias
  `.execute(db);

  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(row.alias_code, row.canonical_code);
  }
  return map;
}
