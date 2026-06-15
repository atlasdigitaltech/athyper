/**
 * IAM Permission Service — v1.0
 *
 * TypeScript wrapper around master.check_permission() (5-step SQL evaluation).
 *
 * Binding rule: Every runtime permission check goes through checkPermission() or
 * checkPermissionBatch(). No service may query master.check_permission(),
 * shared.persona_permission, or master.access_grant directly for access decisions.
 *
 * checkPermission():
 *   1. Calls master.check_permission()  → allow | deny | not_found | not_in_plan
 *   2. If allow: calls master.get_effective_visibility_scope() + master.resolve_allowed_companies()
 *   3. Writes one row to log.permission_decision_log (audit trail)
 *   4. Returns PermissionDecisionResult
 *
 * checkPermissionBatch():
 *   Evaluates all active permissions in a single DB round-trip using a CTE that
 *   mirrors the 5-step logic. Used by GET /api/iam/effective-access/:principalId.
 *   Does NOT write to permission_decision_log (batch audit would be too noisy).
 *
 * requireAllow():
 *   Inline guard helper for route handlers. Returns true if decision=allow,
 *   otherwise sends 403 and returns false.
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Response } from "express";

import type {
  PermissionDecisionOutcome,
  PermissionDecisionReason,
  PermissionDecisionResult,
  PermissionBatchResult,
  ResolvedScope,
  PermissionContext,
} from "./permission.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

// ─── Logger interface ─────────────────────────────────────────────────────────

interface PermissionLogger {
  error(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
}

// ─── checkPermission ──────────────────────────────────────────────────────────

/**
 * Evaluate a single permission for a principal.
 *
 * @param db         Kysely DB instance
 * @param tenantId   UUID of the resolved tenant
 * @param principalId UUID of the resolved principal
 * @param permissionCode  e.g. "FIN.JOURNALS.CREATE"
 * @param context    Optional request/resource context (for audit trail only)
 * @param logger     Optional logger for audit write failures
 */
export async function checkPermission(
  db: Kysely<AnyDb>,
  tenantId: string,
  principalId: string,
  permissionCode: string,
  context?: PermissionContext,
  logger?: PermissionLogger,
): Promise<PermissionDecisionResult> {
  const startMs = Date.now();

  // ── Resolve permission ID ────────────────────────────────────────────────
  const permRow = await db
    .selectFrom("shared.permission as p")
    .select(["p.id"])
    .where("p.code", "=", permissionCode)
    .where("p.status", "=", "active")
    .executeTakeFirst();

  if (!permRow) {
    return {
      decision: "not_found",
      reason: "no_grant_found",
      scope: { visibility: "own", company_code_ids: [] },
      evaluation_ms: Date.now() - startMs,
    };
  }
  const permissionId: string = permRow.id as string;

  // ── Step 1-5: call master.check_permission() ──────────────────────────
  const checkResult = await sql<{ check_permission: string }>`
    SELECT master.check_permission(
      ${tenantId}::uuid,
      ${principalId}::uuid,
      ${permissionId}::uuid
    ) AS check_permission
  `.execute(db);

  const rawDecision = (checkResult.rows[0]?.check_permission ?? "not_found") as string;
  const evaluation_ms = Date.now() - startMs;

  // Map DB outcome to typed decision
  const decision = mapDecision(rawDecision);
  let match_source: string | undefined;

  // ── Scope resolution (allow only) ─────────────────────────────────────
  let scope: ResolvedScope = { visibility: "own", company_code_ids: [] };
  let matched_grant_id: string | undefined;
  let matched_role_id: string | undefined;
  let matched_group_id: string | undefined;

  if (decision === "allow") {
    const source = await resolvePermissionMatchSource(
      db,
      tenantId,
      principalId,
      permissionId,
    );
    if (source) {
      match_source = source.source;
      matched_grant_id = source.matched_grant_id;
      matched_role_id = source.matched_role_id;
      matched_group_id = source.matched_group_id;
    }

    // Visibility scope (widest row-level filter)
    const visResult = await sql<{ visibility_scope: string }>`
      SELECT master.get_effective_visibility_scope(
        ${tenantId}::uuid,
        ${principalId}::uuid,
        ${permissionId}::uuid
      ) AS visibility_scope
    `.execute(db);

    const vis = visResult.rows[0]?.visibility_scope ?? "own";

    // Company code boundary (empty = tenant-wide)
    const ccResult = await sql<{ company_code_id: string }>`
      SELECT rac.company_code_id::text
      FROM master.resolve_allowed_companies(
        ${tenantId}::uuid,
        ${principalId}::uuid,
        ${permissionId}::uuid
      ) rac
    `.execute(db);

    scope = {
      visibility: (vis as "all" | "team" | "own"),
      company_code_ids: ccResult.rows.map((r) => r.company_code_id),
    };

    // Delegation override: if caller is acting under a delegation that explicitly
    // covers this permission code, upgrade reason to delegation_granted.
    // (The DB check_permission doesn't know about the delegation context — the
    // session layer already merged delegation permissions before calling here.)
  }

  const reason = mapReason(rawDecision, decision, match_source);

  // ── Audit: write to log.permission_decision_log ───────────────────────
  // Fire-and-forget — never let audit failure fail the permission check.
  writeDecisionLog(db, {
    tenantId,
    principalId,
    permissionId,
    permissionCode,
    decision,
    reason,
    scope,
    evaluation_ms,
    matched_grant_id,
    matched_role_id,
    matched_group_id,
    context,
  }).catch((err) => {
    logger?.warn("permission_decision_log_write_failed", {
      permissionCode,
      err: err instanceof Error ? err.message : String(err),
    });
  });

  return {
    decision,
    reason,
    scope,
    evaluation_ms,
    matched_grant_id,
    matched_role_id,
    matched_group_id,
  };
}

// ─── checkPermissionBatch ─────────────────────────────────────────────────────

/**
 * Evaluate ALL active permissions for a principal in a single DB round-trip.
 *
 * Uses an inline CTE that mirrors the 5-step logic:
 *   Step 1: plan gate (plan_module_access + plan_permission_access)
 *   Step 2: derive group roles
 *   Step 3: persona base grants (persona_permission.is_granted = true)
 *   Step 4: access_grant allow (effect = 'allow')
 *   Step 5: access_grant deny (always wins, effect = 'deny')
 *
 * Returns one row per permission. Does NOT write to permission_decision_log
 * (batch audit would insert hundreds of rows on every effective-access request).
 */
export async function checkPermissionBatch(
  db: Kysely<AnyDb>,
  tenantId: string,
  principalId: string,
  personaId: string,
): Promise<PermissionBatchResult> {
  const startMs = Date.now();

  // Single CTE mirrors check_permission() logic for all permissions at once.
  const rows = await sql<{
    permission_code: string;
    decision: string;
    visibility_scope: string | null;
    company_code_ids: string[] | null;
    match_source: string | null;
  }>`
    WITH all_perms AS (
      SELECT id, code, is_plan_restricted
      FROM shared.permission
      WHERE status = 'active'
    ),
    -- Step 2: derive group roles for this principal
    principal_group_roles AS (
      SELECT gr.role_id, gr.id AS group_role_id, gm.group_id
      FROM master.auth_group_member gm
      JOIN master.auth_group_role gr
        ON  gr.group_id  = gm.group_id
        AND gr.tenant_id = gm.tenant_id
        AND gr.is_active = true
      WHERE gm.principal_id = ${principalId}
        AND gm.tenant_id    = ${tenantId}
    ),
    -- Step 3: persona grants
    persona_allows AS (
      SELECT pp.permission_id
      FROM shared.persona_permission pp
      WHERE pp.persona_id  = ${personaId}::uuid
        AND pp.is_granted  = true
    ),
    -- Step 3b: inherited persona grants via group -> role -> persona
    role_persona_allows AS (
      SELECT pp.permission_id
      FROM principal_group_roles pgr
      JOIN shared.role r ON r.id = pgr.role_id AND r.status = 'active'
      JOIN shared.persona_permission pp
        ON pp.persona_id = r.persona_id
       AND pp.is_granted = true
       AND pp.permission_id IS NOT NULL
    ),
    -- Step 4: access_grant allows (direct principal + via group/role)
    grant_allows AS (
      SELECT ag.permission_id
      FROM master.access_grant ag
      WHERE ag.tenant_id = ${tenantId}
        AND ag.effect     = 'allow'
        AND ag.status     = 'active'
        AND (ag.expires_at IS NULL OR ag.expires_at > now())
        AND (
          ag.principal_id = ${principalId}
          OR ag.role_id IN (SELECT role_id FROM principal_group_roles)
          OR ag.group_id IN (SELECT group_id FROM principal_group_roles)
        )
    ),
    -- Step 5: access_grant denies (principal-targeted only per schema rule)
    grant_denies AS (
      SELECT ag.permission_id
      FROM master.access_grant ag
      WHERE ag.tenant_id    = ${tenantId}
        AND ag.effect        = 'deny'
        AND ag.status        = 'active'
        AND ag.principal_id  = ${principalId}
        AND (ag.expires_at IS NULL OR ag.expires_at > now())
    ),
    -- Step 1: plan gate (tenant_permission_override or included plan permission)
    plan_denies AS (
      SELECT ap.id AS permission_id
      FROM all_perms ap
      WHERE ap.is_plan_restricted = true
        AND NOT EXISTS (
          SELECT 1
          FROM master.tenant_permission_override tpo
          WHERE tpo.tenant_id = ${tenantId}
            AND tpo.permission_id = ap.id
            AND tpo.is_granted = true
            AND (tpo.expires_at IS NULL OR tpo.expires_at > now())
        )
        AND NOT EXISTS (
          SELECT 1
          FROM master.tenant t
          JOIN shared.subscription_plan sp
            ON sp.code = t.subscription
          JOIN shared.subscription_plan_version spv
            ON spv.plan_id = sp.id
           AND spv.valid_to IS NULL
           AND spv.status = 'active'
          JOIN shared.plan_permission_access ppa
            ON ppa.plan_version_id = spv.id
          WHERE t.id = ${tenantId}
            AND ppa.permission_id = ap.id
            AND ppa.is_included = true
        )
    ),
    evaluated AS (
      SELECT
        ap.id   AS permission_id,
        ap.code AS permission_code,
        CASE
          WHEN ap.id IN (SELECT permission_id FROM grant_denies)  THEN 'deny'
          WHEN ap.id IN (SELECT permission_id FROM plan_denies)   THEN 'not_in_plan'
          WHEN ap.id IN (SELECT permission_id FROM persona_allows) THEN 'allow'
          WHEN ap.id IN (SELECT permission_id FROM role_persona_allows) THEN 'allow'
          WHEN ap.id IN (SELECT permission_id FROM grant_allows)  THEN 'allow'
          ELSE 'not_found'
        END AS decision,
        CASE
          WHEN ap.id IN (SELECT permission_id FROM grant_denies)  THEN 'deny'
          WHEN ap.id IN (SELECT permission_id FROM plan_denies)   THEN 'plan'
          WHEN ap.id IN (SELECT permission_id FROM persona_allows) THEN 'persona'
          WHEN ap.id IN (SELECT permission_id FROM role_persona_allows) THEN 'role_persona'
          WHEN ap.id IN (SELECT permission_id FROM grant_allows)  THEN 'grant'
          ELSE NULL
        END AS match_source
      FROM all_perms ap
    )
    SELECT
      e.permission_code,
      e.decision,
      e.match_source,
      -- Only compute scope for allowed permissions
      CASE WHEN e.decision = 'allow' THEN
        master.get_effective_visibility_scope(${tenantId}::uuid, ${principalId}::uuid, e.permission_id)
      END AS visibility_scope,
      CASE WHEN e.decision = 'allow' THEN
        (SELECT array_agg(rac.company_code_id::text)
         FROM master.resolve_allowed_companies(${tenantId}::uuid, ${principalId}::uuid, e.permission_id) rac)
      END AS company_code_ids
    FROM evaluated e
    ORDER BY e.permission_code
  `.execute(db);

  const evaluation_ms = Date.now() - startMs;
  const result: PermissionBatchResult = {};

  for (const row of rows.rows) {
    const decision = mapDecision(row.decision);
    const reason = mapReason(row.decision, decision, row.match_source ?? undefined);
    result[row.permission_code] = {
      decision,
      reason,
      scope: {
        visibility: ((row.visibility_scope ?? "own") as "all" | "team" | "own"),
        company_code_ids: row.company_code_ids ?? [],
      },
      evaluation_ms,
    };
  }

  return result;
}

type PermissionMatchSource = {
  source: "persona" | "role_persona" | "grant" | "deny" | "plan";
  matched_grant_id?: string;
  matched_role_id?: string;
  matched_group_id?: string;
};

async function resolvePermissionMatchSource(
  db: Kysely<AnyDb>,
  tenantId: string,
  principalId: string,
  permissionId: string,
): Promise<PermissionMatchSource | null> {
  const row = await sql<{
    source: "persona" | "role_persona" | "grant" | "deny" | "plan" | null;
    matched_grant_id: string | null;
    matched_role_id: string | null;
    matched_group_id: string | null;
  }>`
    WITH active_group_roles AS (
      SELECT DISTINCT gr.role_id, gr.group_id
      FROM master.auth_group_member gm
      JOIN master.auth_group_role gr
        ON gr.group_id = gm.group_id
       AND gr.tenant_id = gm.tenant_id
       AND gr.status = 'active'
       AND (gr.expires_at IS NULL OR gr.expires_at > now())
      WHERE gm.tenant_id = ${tenantId}
        AND gm.principal_id = ${principalId}
    ),
    direct_persona_allow AS (
      SELECT TRUE AS is_match
      FROM master.principal_persona pp_a
      JOIN shared.persona_permission pp
        ON pp.persona_id = pp_a.persona_id
      WHERE pp_a.tenant_id = ${tenantId}
        AND pp_a.principal_id = ${principalId}
        AND (pp_a.expires_at IS NULL OR pp_a.expires_at > now())
        AND pp.permission_id = ${permissionId}::uuid
        AND pp.is_granted = true
    ),
    role_persona_allow AS (
      SELECT DISTINCT
        pgr.role_id,
        pgr.group_id
      FROM active_group_roles pgr
      JOIN shared.role r
        ON r.id = pgr.role_id
       AND r.status = 'active'
      JOIN shared.persona_permission pp
        ON pp.persona_id = r.persona_id
       AND pp.permission_id = ${permissionId}::uuid
       AND pp.is_granted = true
    ),
    grant_allow AS (
      SELECT
        ag.id,
        ag.role_id,
        ag.group_id
      FROM master.access_grant ag
      WHERE ag.tenant_id = ${tenantId}
        AND ag.effect = 'allow'
        AND ag.status = 'active'
        AND (ag.expires_at IS NULL OR ag.expires_at > now())
        AND ag.permission_id = ${permissionId}::uuid
        AND (
          ag.principal_id = ${principalId}
          OR ag.role_id IN (SELECT role_id FROM active_group_roles)
          OR ag.group_id IN (SELECT group_id FROM active_group_roles)
        )
    )
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM direct_persona_allow) THEN 'persona'
        WHEN EXISTS (SELECT 1 FROM role_persona_allow) THEN 'role_persona'
        WHEN EXISTS (SELECT 1 FROM grant_allow) THEN 'grant'
        ELSE NULL
      END AS source,
      (SELECT ag.id::text FROM grant_allow ag LIMIT 1) AS matched_grant_id,
      (SELECT rp.role_id::text FROM role_persona_allow rp LIMIT 1) AS matched_role_id,
      (SELECT rp.group_id::text FROM role_persona_allow rp LIMIT 1) AS matched_group_id
  `.execute(db);

  const match = row.rows[0];
  if (!match || !match.source) {
    return null;
  }

  return {
    source: match.source,
    matched_grant_id: match.matched_grant_id ?? undefined,
    matched_role_id: match.matched_role_id ?? undefined,
    matched_group_id: match.matched_group_id ?? undefined,
  };
}

// ─── requireAllow ─────────────────────────────────────────────────────────────

/**
 * Inline route guard. Returns true if decision=allow, otherwise sends a 403
 * response and returns false. Use as:
 *
 *   const result = await checkPermission(db, tenantId, principalId, 'FIN.JOURNALS.CREATE');
 *   if (!requireAllow(result, res)) return;
 *   // ... proceed
 */
export function requireAllow(
  result: PermissionDecisionResult,
  res: Response,
): boolean {
  if (result.decision === "allow") return true;

  const statusCode = result.decision === "not_in_plan" || result.decision === "addon_required"
    ? 402
    : 403;

  res.status(statusCode).json({
    error: "PERMISSION_DENIED",
    decision: result.decision,
    reason: result.reason,
    message: decisionMessage(result.decision, result.reason),
  });
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapDecision(raw: string): PermissionDecisionOutcome {
  switch (raw) {
    case "allow":          return "allow";
    case "deny":           return "deny";
    case "not_in_plan":    return "not_in_plan";
    case "addon_required": return "addon_required";
    case "not_granted":    return "not_granted";
    default:               return "not_found";
  }
}

function mapReason(
  raw: string,
  decision: PermissionDecisionOutcome,
  source?: string,
): PermissionDecisionReason {
  if (raw === "not_in_plan" || raw === "addon_required") return "plan_gate_denied";
  if (decision === "deny") return "explicit_deny";
  if (decision === "allow") {
    if (source === "role_persona") return "role_granted";
    if (source === "grant") return "grant_granted";
    return "persona_granted";
  }
  return "no_grant_found";
}

function decisionMessage(decision: PermissionDecisionOutcome, reason: PermissionDecisionReason): string {
  if (decision === "not_in_plan") return "This permission is not included in the current subscription plan";
  if (decision === "addon_required") return "An add-on subscription is required for this permission";
  if (reason === "explicit_deny") return "Access explicitly denied";
  return "Permission not granted";
}

// ─── Audit log writer ─────────────────────────────────────────────────────────

async function writeDecisionLog(
  db: Kysely<AnyDb>,
  fields: {
    tenantId: string;
    principalId: string;
    permissionId: string;
    permissionCode: string;
    decision: PermissionDecisionOutcome;
    reason: PermissionDecisionReason;
    scope: ResolvedScope;
    evaluation_ms: number;
    matched_grant_id?: string;
    matched_role_id?: string;
    matched_group_id?: string;
    context?: PermissionContext;
  },
): Promise<void> {
  await db
    .insertInto("log.permission_decision_log")
    .values({
      tenant_id: fields.tenantId,
      principal_id: fields.principalId,
      permission_id: fields.permissionId,
      permission_code: fields.permissionCode,
      entity_type: fields.context?.entity_type ?? null,
      entity_id: fields.context?.entity_id ?? null,
      company_code_id: fields.context?.company_code_id ?? null,
      decision: fields.decision,
      decision_reason: fields.reason,
      scope_applied: fields.scope.visibility,
      matched_grant_id: fields.matched_grant_id ?? null,
      matched_role_id: fields.matched_role_id ?? null,
      matched_group_id: fields.matched_group_id ?? null,
      evaluation_ms: fields.evaluation_ms,
      request_id: fields.context?.request_id ?? null,
      correlation_id: fields.context?.correlation_id ?? null,
      created_by: fields.principalId, // audit: actor = requesting principal
    })
    .execute();
}
