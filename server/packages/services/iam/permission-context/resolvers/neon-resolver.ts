// Neon plane resolver.
//
// Full RBAC: persona × group/role × access_grant × plan/feature gates.
//
// Implementation strategy: delegate the heavy SQL to the existing
// `checkPermissionBatch()` in iam/permission/permission.service.ts. That
// function already mirrors the 5-step master.check_permission() logic for
// every active permission in one query. The Neon resolver then layers in:
//
//   - plane filtering via shared.permission.plane_eligibility @> ARRAY['neon']
//   - persona+role+group fingerprint (computed here so the cache key v4 has
//     a stable component when persona doesn't change between requests)
//   - active subscription_plan_version_id for the cache key (so plan upgrades
//     bust the cache automatically)
//
// What this resolver does NOT do:
//   - record-level scope (visibility_scope, company_code_ids) — the runtime
//     route resolves those per-row when serving data.
//   - delegation grant merging — checkPermissionBatch handles those already.

import { sql, type Kysely } from "kysely";

import { checkPermissionBatch } from "../../permission/permission.service.js";
import type { PermissionBatchResult } from "../../permission/permission.types.js";
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
  type PlanePermissionRow,
} from "./base.js";

type AnyDb = Kysely<Record<string, unknown>>;

export interface NeonResolverDeps {
  db: AnyDb;
}

interface PrincipalScopeRow {
  persona_id: string | null;
  role_ids: string[];
  group_ids: string[];
  plan_version_id: string | null;
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export function createNeonResolver(deps: NeonResolverDeps): PermissionResolver {
  const { db } = deps;

  return {
    planeKey: "neon" as const,
    async build(input: ResolverInput): Promise<EffectivePermissionContext> {
      const { tenantId, principalId } = input;

      const [planeEligible, principalScope] = await Promise.all([
        loadPlaneEligiblePermissions(db, "neon"),
        loadPrincipalScope(db, tenantId, principalId),
      ]);

      const personaFingerprint = computePersonaFingerprint({
        personaId: principalScope.persona_id,
        roleIds: principalScope.role_ids,
        groupIds: principalScope.group_ids,
      });

      // Reuse the existing batch evaluator for the heavy SQL. It returns one
      // row per active permission, regardless of plane; we filter to the
      // plane-eligible subset below.
      const decisions: PermissionBatchResult = await checkPermissionBatch(
        db,
        tenantId,
        principalId,
        principalScope.persona_id ?? ZERO_UUID,
      );

      const { allowed, denied, planLocked, planeExcluded, entries } =
        partitionDecisions(decisions, planeEligible);

      const profileHash = computeProfileHash({
        principalFingerprint: personaFingerprint,
        allowedCodes: allowed,
        planVersionId: principalScope.plan_version_id ?? undefined,
      });

      return Object.freeze({
        planeKey: "neon",
        tenantId,
        principalId,
        personaId: principalScope.persona_id ?? undefined,
        principalFingerprint: personaFingerprint,
        planVersionId: principalScope.plan_version_id ?? undefined,
        allowed,
        denied,
        planLocked,
        planeExcluded,
        entries,
        profileHash,
        schemaHash: input.schemaHash ?? computeSchemaHash(),
        resolvedAt: Date.now(),
      });
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function loadPrincipalScope(
  db: AnyDb,
  tenantId: string,
  principalId: string,
): Promise<PrincipalScopeRow> {
  const result = await sql<PrincipalScopeRow>`
    WITH persona AS (
      SELECT pp.persona_id
        FROM master.principal_persona pp
       WHERE pp.tenant_id    = ${tenantId}::uuid
         AND pp.principal_id = ${principalId}::uuid
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
    plan AS (
      SELECT spv.id AS plan_version_id
        FROM master.tenant t
        JOIN shared.subscription_plan      sp  ON sp.code    = t.subscription
        JOIN shared.subscription_plan_version spv ON spv.plan_id = sp.id
       WHERE t.id            = ${tenantId}::uuid
         AND spv.valid_to    IS NULL
         AND spv.status      = 'active'
       LIMIT 1
    )
    SELECT
      (SELECT persona_id FROM persona)                                  AS persona_id,
      COALESCE((SELECT array_agg(DISTINCT role_id::text)   FROM group_roles), ARRAY[]::text[]) AS role_ids,
      COALESCE((SELECT array_agg(DISTINCT group_id::text)  FROM group_roles), ARRAY[]::text[]) AS group_ids,
      (SELECT plan_version_id::text FROM plan)                          AS plan_version_id
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    return {
      persona_id: null,
      role_ids: [],
      group_ids: [],
      plan_version_id: null,
    };
  }
  return {
    persona_id: row.persona_id,
    role_ids: row.role_ids ?? [],
    group_ids: row.group_ids ?? [],
    plan_version_id: row.plan_version_id,
  };
}

// Exported for unit testing; pure partition of checkPermissionBatch output
// against the plane-eligible catalog.
export function partitionDecisions(
  decisions: PermissionBatchResult,
  planeEligible: Map<string, PlanePermissionRow>,
): {
  allowed: ReadonlySet<string>;
  denied: ReadonlySet<string>;
  planLocked: ReadonlySet<string>;
  planeExcluded: ReadonlySet<string>;
  entries: ReadonlyMap<string, EffectivePermissionEntry>;
} {
  const allowed = new Set<string>();
  const denied = new Set<string>();
  const planLocked = new Set<string>();
  const planeExcluded = new Set<string>();
  const entries = new Map<string, EffectivePermissionEntry>();

  for (const [code, raw] of Object.entries(decisions)) {
    const decision = raw as { decision: string };
    if (!planeEligible.has(code)) {
      planeExcluded.add(code);
      entries.set(code, { code, status: "missing", reason: "plane_excluded" });
      continue;
    }

    switch (decision.decision) {
      case "allow":
        allowed.add(code);
        entries.set(code, { code, status: "allow", reason: "allowed" });
        break;
      case "deny":
        denied.add(code);
        entries.set(code, { code, status: "deny", reason: "denied_by_grant" });
        break;
      case "not_in_plan":
      case "addon_required":
        planLocked.add(code);
        entries.set(code, { code, status: "not_in_plan", reason: "plan_locked" });
        break;
      case "not_found":
      case "not_granted":
      default:
        entries.set(code, { code, status: "missing", reason: "missing_permission" });
    }
  }

  return { allowed, denied, planLocked, planeExcluded, entries };
}
