/**
 * IAM Operator Routes — v2.0 (Phase 3)
 *
 * Full operator surface for IAM administration, access reviews, group lifecycle,
 * scoped role assignments, grants, delegations, and principal search.
 *
 * Auth guard pattern for writes:
 *   1. requireStepUp(cache, callerSub, 'iam_admin', res) — 403 STEP_UP_REQUIRED if not elevated
 *   2. checkPermission(db, tenantId, callerPrincipalId, '<PERM>') — 403 PERMISSION_DENIED
 *   3. Proceed with mutation
 *
 * Migration admin (Phase 2 — require iam_admin step-up + IAM.GRANT.MANAGE):
 *   POST   /api/iam/admin/migrate-bindings            — backfill principal_identity_binding from keycloak_*
 *
 * Group management endpoints (Phase 3 — require iam_admin step-up + IAM.GROUP.MANAGE):
 *   GET    /api/iam/groups                            — list groups (tenant-scoped)
 *   POST   /api/iam/groups                            — create group
 *   GET    /api/iam/groups/:id                        — detail with members + roles
 *   PATCH  /api/iam/groups/:id                        — update name/description/status
 *   DELETE /api/iam/groups/:id                        — soft-delete to deprecated
 *   POST   /api/iam/groups/:id/roles                  — add scoped role assignment
 *   PATCH  /api/iam/groups/:id/roles/:rid             — update scope/visibility
 *   DELETE /api/iam/groups/:id/roles/:rid             — remove role assignment
 *
 * Principal search (Phase 3 — read-only, no step-up):
 *   GET    /api/iam/principals                        — principal search for member pickers
 */

import { sql } from "kysely";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";

import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  setCachePrivate,
} from "@athyper/svc-shared";
import { checkPermission, checkPermissionBatch, requireAllow } from "../permission/permission.service.js";
import { requireStepUp } from "../mfa/step-up.service.js";
import type { CacheClient } from "../session/session.service.js";
import { incrementRateLimit } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OperatorRoutesDeps {
  db: Kysely<AnyDb>;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Auth helpers (shared across all operator handlers) ───────────────────────

/** Verify Bearer + resolve tenantId + callerPrincipalId. Returns null on failure (response already sent). */
async function resolveOperatorAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  db: Kysely<AnyDb>,
  auth: OperatorRoutesDeps["auth"],
): Promise<{ claims: Record<string, unknown>; sub: string; tenantId: string; callerPrincipalId: string } | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;

  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) {
    res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
    return null;
  }

  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(db, xOrg, xRealm);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header with a valid tenant is required" });
    return null;
  }

  const callerPrincipalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
  if (!callerPrincipalId) {
    res.status(403).json({ error: "NO_PRINCIPAL", message: "No principal found for this user in the current tenant" });
    return null;
  }

  return { claims, sub, tenantId, callerPrincipalId };
}

/** Resolve a target principalId from a route param, scoped to the caller's tenant. */
async function resolveTargetPrincipal(
  principalId: string,
  tenantId: string,
  db: Kysely<AnyDb>,
  res: Parameters<RequestHandler>[1],
): Promise<string | null> {
  const row = await db
    .selectFrom("master.principal as p")
    .select("p.id")
    .where("p.id", "=", principalId)
    .where("p.tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (!row) {
    res.status(404).json({ error: "PRINCIPAL_NOT_FOUND", message: `Principal '${principalId}' not found in this tenant` });
    return null;
  }
  return row.id as string;
}

// ─── Route factory ────────────────────────────────────────────────────────────

async function enforceIamWriteRateLimit(
  cache: CacheClient,
  res: Parameters<RequestHandler>[1],
  tenantId: string,
  sub: string,
  operation: string,
  limit = 30,
  windowSec = 60,
): Promise<boolean> {
  const key = `ratelimit:iam_admin:${operation}:${tenantId}:${sub}`;
  const count = await incrementRateLimit(cache, key, windowSec).catch(() => 0);
  if (count === 0 || count <= limit) return true;

  res.setHeader("Retry-After", String(windowSec));
  res.status(429).json({
    error: "RATE_LIMITED",
    message: "Too many IAM write attempts. Please wait and try again.",
    retry_after_seconds: windowSec,
  });
  return false;
}

export function createOperatorRoutes(router: Router, deps: OperatorRoutesDeps): Router {
  const { db, cache, auth, logger } = deps;

  // ══════════════════════════════════════════════════════════════════════════
  // READ ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/iam/effective-access/:principalId ────────────────────────────
  // Full permission matrix for a principal. Primary tool for access reviews.
  router.get("/iam/effective-access/:principalId", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId, callerPrincipalId } = auth_;

      const targetId = await resolveTargetPrincipal(req.params.principalId as string, tenantId, db, res);
      if (!targetId) return;

      // Resolve persona for batch evaluation
      const personaRow = await db
        .selectFrom("master.principal_persona as pp")
        .innerJoin("shared.persona as ps", "ps.id", "pp.persona_id")
        .select(["pp.persona_id"])
        .where("pp.tenant_id", "=", tenantId)
        .where("pp.principal_id", "=", targetId)
        .executeTakeFirst();

      const personaId: string = (personaRow?.persona_id as string | undefined)
        ?? "00000000-0000-0000-0000-000000000000";

      const batch = await checkPermissionBatch(db, tenantId, targetId, personaId);

      // Caller audit — don't fail the request if audit write fails
      checkPermission(db, tenantId, callerPrincipalId, "IAM.PRINCIPAL.READ", {
        entity_type: "principal", entity_id: targetId,
      }, logger).catch(() => undefined);

      setCachePrivate(res, 30); // short TTL — permission state volatile
      res.json({ principal_id: targetId, permissions: batch });
    } catch (err) {
      logger?.error("iam_effective_access_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/principals/:principalId/groups ───────────────────────────
  router.get("/iam/principals/:principalId/groups", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const targetId = await resolveTargetPrincipal(req.params.principalId as string, tenantId, db, res);
      if (!targetId) return;

      const rows = await db
        .selectFrom("master.auth_group_member as gm")
        .innerJoin("master.auth_group as g", (join) =>
          join.onRef("g.id", "=", "gm.group_id").on("g.tenant_id", "=", tenantId),
        )
        .leftJoin("master.auth_group_role as gr", (join) =>
          join.onRef("gr.group_id", "=", "g.id").on("gr.tenant_id", "=", tenantId).on("gr.is_active", "=", true),
        )
        .leftJoin("shared.role as r", "r.id", "gr.role_id")
        .select([
          "gm.id as membership_id",
          "gm.joined_at",
          "gm.added_by",
          "g.id as group_id",
          "g.code as group_code",
          "g.name as group_name",
          "g.is_system",
          "gr.id as group_role_id",
          "gr.visibility_scope",
          "gr.assignment_scope_type",
          "gr.assignment_scope_ref_id",
          "gr.include_descendants",
          "gr.expires_at as role_expires_at",
          "r.id as role_id",
          "r.code as role_code",
          "r.name as role_name",
        ])
        .where("gm.principal_id", "=", targetId)
        .where("gm.tenant_id", "=", tenantId)
        .orderBy("g.code")
        .execute();

      setCachePrivate(res, 60);
      res.json({ principal_id: targetId, items: rows });
    } catch (err) {
      logger?.error("iam_principal_groups_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/principals/:principalId/grants ───────────────────────────
  router.get("/iam/principals/:principalId/grants", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const targetId = await resolveTargetPrincipal(req.params.principalId as string, tenantId, db, res);
      if (!targetId) return;

      const rows = await db
        .selectFrom("master.access_grant as ag")
        .leftJoin("shared.permission as p", "p.id", "ag.permission_id")
        .select([
          "ag.id",
          "ag.effect",
          "ag.status",
          "ag.visibility_scope",
          "ag.assignment_scope_type",
          "ag.assignment_scope_ref_id",
          "ag.resource_type",
          "ag.resource_id",
          "ag.expires_at",
          "ag.revoked_at",
          "ag.revoked_by",
          "ag.granted_by",
          "ag.notes",
          "ag.created_at",
          "p.code as permission_code",
          "p.name as permission_name",
        ])
        .where("ag.principal_id", "=", targetId)
        .where("ag.tenant_id", "=", tenantId)
        .orderBy("ag.created_at", "desc")
        .execute();

      setCachePrivate(res, 60);
      res.json({ principal_id: targetId, items: rows });
    } catch (err) {
      logger?.error("iam_principal_grants_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/principals/:principalId/delegations ──────────────────────
  router.get("/iam/principals/:principalId/delegations", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const targetId = await resolveTargetPrincipal(req.params.principalId as string, tenantId, db, res);
      if (!targetId) return;

      const rows = await db
        .selectFrom("master.delegation_grant as dg")
        .leftJoin("master.principal as delegator", "delegator.id", "dg.delegator_id")
        .leftJoin("master.principal as delegate", "delegate.id", "dg.delegate_id")
        .select([
          "dg.id",
          "dg.delegator_id",
          "delegator.name as delegator_name",
          "dg.delegate_id",
          "delegate.name as delegate_name",
          "dg.scope_type",
          "dg.scope_ref",
          "dg.permissions",
          "dg.reason",
          "dg.expires_at",
          "dg.is_revoked",
          "dg.revoked_at",
          "dg.revoked_by",
          "dg.revoke_reason",
          "dg.created_at",
        ])
        .where((eb) =>
          eb.or([
            eb("dg.delegator_id", "=", targetId),
            eb("dg.delegate_id", "=", targetId),
          ]),
        )
        .where("dg.tenant_id", "=", tenantId)
        .orderBy("dg.created_at", "desc")
        .execute();

      setCachePrivate(res, 30);
      res.json({ principal_id: targetId, items: rows });
    } catch (err) {
      logger?.error("iam_principal_delegations_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/principals/:principalId/mfa ──────────────────────────────
  router.get("/iam/principals/:principalId/mfa", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const targetId = await resolveTargetPrincipal(req.params.principalId as string, tenantId, db, res);
      if (!targetId) return;

      const rows = await db
        .selectFrom("control.mfa_config as mc")
        .select([
          "mc.id",
          "mc.method_type",
          "mc.is_enabled",
          "mc.is_verified",
          "mc.is_primary",
          "mc.enrolled_at",
          "mc.verified_at",
          "mc.last_used_at",
          "mc.keycloak_sync_status",
          "mc.updated_at",
        ])
        .where("mc.principal_id", "=", targetId)
        .where("mc.tenant_id", "=", tenantId)
        .orderBy("mc.method_type")
        .execute();

      setCachePrivate(res, 60);
      res.json({ principal_id: targetId, methods: rows });
    } catch (err) {
      logger?.error("iam_principal_mfa_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/principals/:principalId/auth-bindings ───────────────────
  router.get("/iam/principals/:principalId/auth-bindings", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const targetId = await resolveTargetPrincipal(req.params.principalId as string, tenantId, db, res);
      if (!targetId) return;

      const rows = await db
        .selectFrom("master.principal_identity_binding as pib")
        .select([
          "pib.id",
          "pib.provider_code",
          "pib.subject_id",
          "pib.username",
          "pib.idp_enabled",
          "pib.idp_email_verified",
          "pib.sync_status",
          "pib.synced_at",
          "pib.sync_error_message",
          "pib.created_at",
          "pib.updated_at",
        ])
        .where("pib.principal_id", "=", targetId)
        .where("pib.tenant_id", "=", tenantId)
        .orderBy("pib.provider_code")
        .execute();

      // Fetch auth_epoch for health context
      const epochRow = await db
        .selectFrom("master.principal as p")
        .select("p.auth_epoch")
        .where("p.id", "=", targetId)
        .executeTakeFirst();

      setCachePrivate(res, 60);
      res.json({
        principal_id: targetId,
        auth_epoch: (epochRow?.auth_epoch as number | undefined) ?? 0,
        bindings: rows,
      });
    } catch (err) {
      logger?.error("iam_principal_auth_bindings_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE ENDPOINTS — all require iam_admin step-up + IAM.GROUP.MANAGE
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /api/iam/groups/:groupId/members ─────────────────────────────────
  router.post("/iam/groups/:groupId/members", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "group_member_add")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GROUP.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const groupId = req.params.groupId as string;
      const body = req.body as { principal_id?: string; notes?: string };
      if (!body.principal_id) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'principal_id' is required" });
        return;
      }

      // Verify group belongs to this tenant
      const groupRow = await db
        .selectFrom("master.auth_group as g")
        .select("g.id")
        .where("g.id", "=", groupId)
        .where("g.tenant_id", "=", tenantId)
        .where("g.status", "=", "active")
        .executeTakeFirst();
      if (!groupRow) {
        res.status(404).json({ error: "GROUP_NOT_FOUND", message: `Group '${groupId}' not found in this tenant` });
        return;
      }

      // Verify target principal exists in tenant
      const targetPrincipal = await resolveTargetPrincipal(body.principal_id, tenantId, db, res);
      if (!targetPrincipal) return;

      const newMember = await db
        .insertInto("master.auth_group_member")
        .values({
          tenant_id: tenantId,
          principal_id: targetPrincipal,
          group_id: groupId,
          joined_at: sql`now()`,
          added_by: callerPrincipalId,
          created_by: callerPrincipalId,
        })
        .onConflict((oc) => oc.columns(["tenant_id", "principal_id", "group_id"]).doNothing())
        .returning(["id", "joined_at"])
        .executeTakeFirst();

      res.status(201).json({
        membership_id: newMember?.id ?? null,
        group_id: groupId,
        principal_id: targetPrincipal,
        joined_at: newMember?.joined_at ?? null,
      });
    } catch (err) {
      logger?.error("iam_add_group_member_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/iam/groups/:groupId/members/:memberId ─────────────────────
  router.delete("/iam/groups/:groupId/members/:memberId", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "group_member_remove")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GROUP.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const groupId = req.params.groupId as string;
      const memberId = req.params.memberId as string;

      const deleted = await db
        .deleteFrom("master.auth_group_member")
        .where("id", "=", memberId)
        .where("group_id", "=", groupId)
        .where("tenant_id", "=", tenantId)
        .returning(["id", "principal_id"])
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND", message: `Membership '${memberId}' not found` });
        return;
      }

      res.status(204).end();
    } catch (err) {
      logger?.error("iam_remove_group_member_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/grants ──────────────────────────────────────────────────
  // Allow grants only via this endpoint. Deny grants require a separate approval flow.
  router.post("/iam/grants", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "grant_create")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GRANT.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      interface GrantBody {
        principal_id?: string;
        permission_id?: string;
        visibility_scope?: string;
        assignment_scope_type?: string;
        assignment_scope_ref_id?: string;
        expires_at?: string;
        notes?: string;
      }
      const body = req.body as GrantBody;

      if (!body.principal_id) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'principal_id' is required" });
        return;
      }
      if (!body.permission_id) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'permission_id' is required" });
        return;
      }

      const targetPrincipal = await resolveTargetPrincipal(body.principal_id, tenantId, db, res);
      if (!targetPrincipal) return;

      // Verify permission exists
      const permRow = await db
        .selectFrom("shared.permission as p")
        .select("p.id")
        .where("p.id", "=", body.permission_id)
        .where("p.status", "=", "active")
        .executeTakeFirst();
      if (!permRow) {
        res.status(404).json({ error: "PERMISSION_NOT_FOUND", message: `Permission '${body.permission_id}' not found` });
        return;
      }

      const grant = await db
        .insertInto("master.access_grant")
        .values({
          tenant_id: tenantId,
          principal_id: targetPrincipal,
          permission_id: body.permission_id,
          effect: "allow", // enforced server-side — deny requires separate flow
          visibility_scope: body.visibility_scope ?? null,
          assignment_scope_type: body.assignment_scope_type ?? null,
          assignment_scope_ref_id: body.assignment_scope_ref_id ?? null,
          expires_at: body.expires_at ? new Date(body.expires_at) : null,
          granted_by: callerPrincipalId,
          notes: body.notes ?? null,
          status: "active",
          created_by: callerPrincipalId,
        })
        .returning(["id", "created_at"])
        .executeTakeFirstOrThrow();

      res.status(201).json({ grant_id: grant.id, created_at: grant.created_at });
    } catch (err) {
      logger?.error("iam_create_grant_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── PATCH /api/iam/grants/:grantId/revoke ────────────────────────────────
  router.patch("/iam/grants/:grantId/revoke", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "grant_revoke")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GRANT.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const grantId = req.params.grantId as string;
      const body = req.body as { reason?: string };

      const grant = await db
        .selectFrom("master.access_grant as ag")
        .select(["ag.id", "ag.status"])
        .where("ag.id", "=", grantId)
        .where("ag.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!grant) {
        res.status(404).json({ error: "GRANT_NOT_FOUND", message: `Grant '${grantId}' not found` });
        return;
      }
      if (grant.status === "revoked") {
        res.status(409).json({ error: "ALREADY_REVOKED", message: "Grant is already revoked" });
        return;
      }

      await db
        .updateTable("master.access_grant")
        .set({
          status: "revoked",
          revoked_at: sql`now()`,
          revoked_by: callerPrincipalId,
          notes: body.reason ?? null,
          updated_at: sql`now()`,
          updated_by: callerPrincipalId,
        })
        .where("id", "=", grantId)
        .where("tenant_id", "=", tenantId)
        .execute();

      res.status(200).json({ grant_id: grantId, revoked: true });
    } catch (err) {
      logger?.error("iam_revoke_grant_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/delegations ─────────────────────────────────────────────
  router.post("/iam/delegations", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "delegation_create")) return;
      if (!await requireStepUp(cache, sub, tenantId, "delegation_accept", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.DELEGATION.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      interface DelegationBody {
        delegator_id?: string;
        delegate_id?: string;
        scope_type?: string;
        scope_ref?: string;
        permissions?: string[];
        expires_at?: string;
        reason?: string;
      }
      const body = req.body as DelegationBody;

      if (!body.delegator_id) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'delegator_id' is required" });
        return;
      }
      if (!body.delegate_id) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'delegate_id' is required" });
        return;
      }
      if (!body.scope_type) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'scope_type' is required" });
        return;
      }
      if (!body.expires_at) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'expires_at' is required (ISO 8601)" });
        return;
      }
      if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'permissions' must be a non-empty array" });
        return;
      }
      if (body.delegator_id === body.delegate_id) {
        res.status(400).json({ error: "SELF_DELEGATION", message: "delegator_id and delegate_id must be different" });
        return;
      }

      // Verify both principals exist in tenant
      const delegatorExists = await resolveTargetPrincipal(body.delegator_id, tenantId, db, res);
      if (!delegatorExists) return;
      const delegateExists = await resolveTargetPrincipal(body.delegate_id, tenantId, db, res);
      if (!delegateExists) return;

      const delegation = await db
        .insertInto("master.delegation_grant")
        .values({
          tenant_id: tenantId,
          delegator_id: body.delegator_id,
          delegate_id: body.delegate_id,
          scope_type: body.scope_type,
          scope_ref: body.scope_ref ?? null,
          permissions: body.permissions,
          expires_at: new Date(body.expires_at),
          reason: body.reason ?? null,
          is_revoked: false,
          created_by: callerPrincipalId,
        })
        .returning(["id", "created_at"])
        .executeTakeFirstOrThrow();

      res.status(201).json({ delegation_id: delegation.id, created_at: delegation.created_at });
    } catch (err) {
      logger?.error("iam_create_delegation_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── PATCH /api/iam/delegations/:grantId/revoke ───────────────────────────
  router.patch("/iam/delegations/:grantId/revoke", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "delegation_revoke")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.DELEGATION.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const grantId = req.params.grantId as string;
      const body = req.body as { reason?: string };

      const delegation = await db
        .selectFrom("master.delegation_grant as dg")
        .select(["dg.id", "dg.is_revoked"])
        .where("dg.id", "=", grantId)
        .where("dg.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!delegation) {
        res.status(404).json({ error: "DELEGATION_NOT_FOUND", message: `Delegation '${grantId}' not found` });
        return;
      }
      if (delegation.is_revoked) {
        res.status(409).json({ error: "ALREADY_REVOKED", message: "Delegation is already revoked" });
        return;
      }

      await db
        .updateTable("master.delegation_grant")
        .set({
          is_revoked: true,
          revoked_at: sql`now()`,
          revoked_by: callerPrincipalId,
          revoke_reason: body.reason ?? null,
          updated_at: sql`now()`,
          updated_by: callerPrincipalId,
        })
        .where("id", "=", grantId)
        .where("tenant_id", "=", tenantId)
        .execute();

      res.status(200).json({ delegation_id: grantId, revoked: true });
    } catch (err) {
      logger?.error("iam_revoke_delegation_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // MIGRATION ADMIN — Phase 2
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /api/iam/admin/migrate-bindings ──────────────────────────────────
  // Calls master.fn_migrate_principal_identity_bindings(dry_run) to backfill
  // principal_identity_binding rows from principal_profile.keycloak_*.
  //
  // ?dry_run=true  (default) → count-only, no writes
  // ?dry_run=false           → execute migration (idempotent — ON CONFLICT DO NOTHING)
  //
  // Requires iam_admin step-up + IAM.GRANT.MANAGE (highest-privilege operation).
  router.post("/iam/admin/migrate-bindings", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "migrate_bindings", 10)) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GRANT.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const dryRun = req.query["dry_run"] !== "false"; // default: dry run

      const rows = await sql<{
        migrated_count: string;
        skipped_count: string;
        error_count: string;
      }>`SELECT * FROM master.fn_migrate_principal_identity_bindings(${dryRun})`.execute(db);

      const result = rows.rows[0];
      res.json({
        dry_run: dryRun,
        migrated_count: parseInt(result?.migrated_count ?? "0", 10),
        skipped_count: parseInt(result?.skipped_count ?? "0", 10),
        error_count: parseInt(result?.error_count ?? "0", 10),
        message: dryRun
          ? "Dry run complete — rerun with ?dry_run=false to execute migration"
          : "Migration complete",
      });
    } catch (err) {
      logger?.error("iam_migrate_bindings_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP MANAGEMENT — Phase 3
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/iam/groups ───────────────────────────────────────────────────
  // List all groups for the tenant. Supports ?status=active|suspended|deprecated|all
  // and ?q=<search> (matches code or name). Returns member_count + active role_count.
  router.get("/iam/groups", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
      const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : "active";

      let query = db
        .selectFrom("master.auth_group as g")
        .leftJoin("master.auth_group_member as gm", (join) =>
          join.onRef("gm.group_id", "=", "g.id").on("gm.tenant_id", "=", tenantId),
        )
        .leftJoin("master.auth_group_role as gr", (join) =>
          join
            .onRef("gr.group_id", "=", "g.id")
            .on("gr.tenant_id", "=", tenantId)
            .on("gr.is_active", "=", true),
        )
        .select([
          "g.id",
          "g.code",
          "g.name",
          "g.description",
          "g.is_system",
          "g.is_self_service_eligible",
          "g.status",
          "g.created_at",
          sql<number>`COUNT(DISTINCT gm.id)::int`.as("member_count"),
          sql<number>`COUNT(DISTINCT gr.id)::int`.as("role_count"),
        ])
        .where("g.tenant_id", "=", tenantId)
        .groupBy([
          "g.id", "g.code", "g.name", "g.description",
          "g.is_system", "g.is_self_service_eligible", "g.status", "g.created_at",
        ])
        .orderBy("g.code");

      if (statusFilter !== "all") {
        query = query.where("g.status", "=", statusFilter);
      }
      if (q) {
        query = query.where((eb) =>
          eb.or([
            eb("g.code", "ilike", `%${q}%`),
            eb("g.name", "ilike", `%${q}%`),
          ]),
        );
      }

      const rows = await query.execute();
      setCachePrivate(res, 30);
      res.json({ items: rows });
    } catch (err) {
      logger?.error("iam_list_groups_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/groups ──────────────────────────────────────────────────
  // Create a new group. code is uppercased and must be unique within the tenant.
  router.post("/iam/groups", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "group_create")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GROUP.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      interface GroupCreateBody {
        code?: string;
        name?: string;
        description?: string;
        is_self_service_eligible?: boolean;
      }
      const body = req.body as GroupCreateBody;

      if (!body.code?.trim()) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'code' is required" });
        return;
      }
      if (!body.name?.trim()) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'name' is required" });
        return;
      }

      const group = await db
        .insertInto("master.auth_group")
        .values({
          tenant_id: tenantId,
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          description: body.description?.trim() ?? null,
          is_system: false,
          is_self_service_eligible: body.is_self_service_eligible ?? false,
          status: "active",
          created_by: callerPrincipalId,
        })
        .returning(["id", "code", "name", "status", "created_at"])
        .executeTakeFirstOrThrow();

      res.status(201).json(group);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("auth_group_tenant_code_uq")) {
        res.status(409).json({ error: "CODE_CONFLICT", message: "A group with this code already exists in this tenant" });
        return;
      }
      logger?.error("iam_create_group_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/groups/:id ───────────────────────────────────────────────
  // Full group detail: metadata + member list (with principal profile) + role assignments.
  router.get("/iam/groups/:id", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const groupId = req.params.id as string;
      const group = await db
        .selectFrom("master.auth_group as g")
        .select([
          "g.id", "g.code", "g.name", "g.description",
          "g.is_system", "g.is_self_service_eligible", "g.status",
          "g.created_at", "g.updated_at",
        ])
        .where("g.id", "=", groupId)
        .where("g.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!group) {
        res.status(404).json({ error: "GROUP_NOT_FOUND", message: `Group '${groupId}' not found in this tenant` });
        return;
      }

      const [members, roles] = await Promise.all([
        db
          .selectFrom("master.auth_group_member as gm")
          .innerJoin("master.principal as p", (join) =>
            join.onRef("p.id", "=", "gm.principal_id").on("p.tenant_id", "=", tenantId),
          )
          .leftJoin("master.principal_profile as pp", "pp.principal_id", "p.id")
          .select([
            "gm.id as membership_id",
            "gm.principal_id",
            "gm.joined_at",
            "gm.added_by",
            "p.code as principal_code",
            "p.name as principal_name",
            "p.principal_type",
            "p.status as principal_status",
            "pp.display_name",
            "pp.given_name",
            "pp.family_name",
          ])
          .where("gm.group_id", "=", groupId)
          .where("gm.tenant_id", "=", tenantId)
          .orderBy("p.code")
          .execute(),

        db
          .selectFrom("master.auth_group_role as gr")
          .innerJoin("shared.role as r", "r.id", "gr.role_id")
          .select([
            "gr.id as assignment_id",
            "gr.role_id",
            "gr.visibility_scope",
            "gr.assignment_scope_type",
            "gr.assignment_scope_ref_id",
            "gr.include_descendants",
            "gr.expires_at",
            "gr.status",
            "gr.assigned_by",
            "gr.created_at",
            "r.code as role_code",
            "r.name as role_name",
          ])
          .where("gr.group_id", "=", groupId)
          .where("gr.tenant_id", "=", tenantId)
          .orderBy("r.code")
          .execute(),
      ]);

      setCachePrivate(res, 30);
      res.json({ ...group, members, roles });
    } catch (err) {
      logger?.error("iam_get_group_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── PATCH /api/iam/groups/:id ─────────────────────────────────────────────
  // Update group metadata. Cannot modify system groups. code is immutable.
  router.patch("/iam/groups/:id", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "group_update")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GROUP.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const groupId = req.params.id as string;
      const existing = await db
        .selectFrom("master.auth_group as g")
        .select(["g.id", "g.is_system"])
        .where("g.id", "=", groupId)
        .where("g.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ error: "GROUP_NOT_FOUND", message: `Group '${groupId}' not found in this tenant` });
        return;
      }
      if (existing.is_system) {
        res.status(403).json({ error: "SYSTEM_GROUP", message: "System groups cannot be modified" });
        return;
      }

      interface GroupPatchBody {
        name?: string;
        description?: string;
        is_self_service_eligible?: boolean;
        status?: string;
      }
      const body = req.body as GroupPatchBody;
      const updates: Record<string, unknown> = {
        updated_at: sql`now()`,
        updated_by: callerPrincipalId,
      };

      if (body.name !== undefined) updates["name"] = body.name.trim();
      if (body.description !== undefined) updates["description"] = body.description?.trim() ?? null;
      if (body.is_self_service_eligible !== undefined) updates["is_self_service_eligible"] = body.is_self_service_eligible;
      if (body.status !== undefined) {
        if (!["active", "suspended", "deprecated"].includes(body.status)) {
          res.status(400).json({ error: "INVALID_STATUS", message: "status must be one of: active, suspended, deprecated" });
          return;
        }
        updates["status"] = body.status;
        updates["status_changed_at"] = sql`now()`;
        updates["status_changed_by"] = callerPrincipalId;
      }

      // Only updated_at + updated_by means nothing to change
      if (Object.keys(updates).length <= 2) {
        res.status(400).json({ error: "NO_CHANGES", message: "No updatable fields provided" });
        return;
      }

      const updated = await db
        .updateTable("master.auth_group")
        .set(updates)
        .where("id", "=", groupId)
        .where("tenant_id", "=", tenantId)
        .returning(["id", "code", "name", "description", "is_self_service_eligible", "status", "updated_at"])
        .executeTakeFirstOrThrow();

      res.json(updated);
    } catch (err) {
      logger?.error("iam_update_group_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/iam/groups/:id ────────────────────────────────────────────
  // Soft-delete: sets status = 'deprecated'. System groups are protected.
  router.delete("/iam/groups/:id", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "group_delete")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GROUP.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const groupId = req.params.id as string;
      const existing = await db
        .selectFrom("master.auth_group as g")
        .select(["g.id", "g.is_system", "g.status"])
        .where("g.id", "=", groupId)
        .where("g.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ error: "GROUP_NOT_FOUND", message: `Group '${groupId}' not found in this tenant` });
        return;
      }
      if (existing.is_system) {
        res.status(403).json({ error: "SYSTEM_GROUP", message: "System groups cannot be deleted" });
        return;
      }
      if (existing.status === "deprecated") {
        res.status(409).json({ error: "ALREADY_DEPRECATED", message: "Group is already deprecated" });
        return;
      }

      await db
        .updateTable("master.auth_group")
        .set({
          status: "deprecated",
          status_changed_at: sql`now()`,
          status_changed_by: callerPrincipalId,
          updated_at: sql`now()`,
          updated_by: callerPrincipalId,
        })
        .where("id", "=", groupId)
        .where("tenant_id", "=", tenantId)
        .execute();

      res.status(204).end();
    } catch (err) {
      logger?.error("iam_delete_group_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // ROLE ASSIGNMENT — Phase 3
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /api/iam/groups/:id/roles ────────────────────────────────────────
  // Add a scoped role assignment to a group. Scope validation:
  //   - tenant scope: assignment_scope_ref_id must be null
  //   - company_code / legal_entity scope: assignment_scope_ref_id required
  //   - include_descendants: forced true for tenant/company_code; configurable for legal_entity
  // DB constraint trg_validate_assignment_scope validates ref_id existence.
  router.post("/iam/groups/:id/roles", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "group_role_add")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GROUP.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const groupId = req.params.id as string;
      const group = await db
        .selectFrom("master.auth_group as g")
        .select("g.id")
        .where("g.id", "=", groupId)
        .where("g.tenant_id", "=", tenantId)
        .where("g.status", "=", "active")
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ error: "GROUP_NOT_FOUND", message: `Group '${groupId}' not found or not active` });
        return;
      }

      interface RoleAssignBody {
        role_id?: string;
        visibility_scope?: string;
        assignment_scope_type?: string;
        assignment_scope_ref_id?: string;
        include_descendants?: boolean;
        expires_at?: string;
      }
      const body = req.body as RoleAssignBody;

      if (!body.role_id) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'role_id' is required" });
        return;
      }
      if (!body.visibility_scope) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'visibility_scope' is required (all | own | team)" });
        return;
      }
      if (!["all", "own", "team"].includes(body.visibility_scope)) {
        res.status(400).json({ error: "INVALID_VALUE", message: "'visibility_scope' must be one of: all, own, team" });
        return;
      }

      const scopeType = body.assignment_scope_type ?? "tenant";
      if (!["tenant", "company_code", "legal_entity"].includes(scopeType)) {
        res.status(400).json({ error: "INVALID_VALUE", message: "'assignment_scope_type' must be one of: tenant, company_code, legal_entity" });
        return;
      }
      if (scopeType !== "tenant" && !body.assignment_scope_ref_id) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'assignment_scope_ref_id' is required when assignment_scope_type is not 'tenant'" });
        return;
      }
      if (scopeType === "tenant" && body.assignment_scope_ref_id) {
        res.status(400).json({ error: "INVALID_SCOPE", message: "'assignment_scope_ref_id' must be omitted when assignment_scope_type is 'tenant'" });
        return;
      }

      const role = await db
        .selectFrom("shared.role as r")
        .select("r.id")
        .where("r.id", "=", body.role_id)
        .executeTakeFirst();
      if (!role) {
        res.status(404).json({ error: "ROLE_NOT_FOUND", message: `Role '${body.role_id}' not found` });
        return;
      }

      // include_descendants: meaningful only for legal_entity; forced true otherwise
      const includeDescendants = scopeType === "legal_entity"
        ? (body.include_descendants ?? true)
        : true;

      const assignment = await db
        .insertInto("master.auth_group_role")
        .values({
          tenant_id: tenantId,
          group_id: groupId,
          role_id: body.role_id,
          visibility_scope: body.visibility_scope,
          assignment_scope_type: scopeType,
          assignment_scope_ref_id: body.assignment_scope_ref_id ?? null,
          include_descendants: includeDescendants,
          expires_at: body.expires_at ? new Date(body.expires_at) : null,
          assigned_by: callerPrincipalId,
          status: "active",
          created_by: callerPrincipalId,
        })
        .returning(["id", "visibility_scope", "assignment_scope_type", "assignment_scope_ref_id", "created_at"])
        .executeTakeFirstOrThrow();

      res.status(201).json({ assignment_id: assignment.id, ...assignment });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("auth_group_role_uq")) {
        res.status(409).json({ error: "ASSIGNMENT_CONFLICT", message: "This role is already assigned to this group with the same scope" });
        return;
      }
      logger?.error("iam_add_group_role_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── PATCH /api/iam/groups/:id/roles/:rid ─────────────────────────────────
  // Update scope or visibility on an existing role assignment.
  // Partial update: only provided fields are changed.
  router.patch("/iam/groups/:id/roles/:rid", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "group_role_update")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GROUP.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const groupId = req.params.id as string;
      const assignmentId = req.params.rid as string;

      const existing = await db
        .selectFrom("master.auth_group_role as gr")
        .select(["gr.id", "gr.assignment_scope_type"])
        .where("gr.id", "=", assignmentId)
        .where("gr.group_id", "=", groupId)
        .where("gr.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ error: "ASSIGNMENT_NOT_FOUND", message: `Role assignment '${assignmentId}' not found` });
        return;
      }

      interface RolePatchBody {
        visibility_scope?: string;
        assignment_scope_type?: string;
        assignment_scope_ref_id?: string | null;
        include_descendants?: boolean;
        expires_at?: string | null;
      }
      const body = req.body as RolePatchBody;
      const updates: Record<string, unknown> = {
        updated_at: sql`now()`,
        updated_by: callerPrincipalId,
      };

      if (body.visibility_scope !== undefined) {
        if (!["all", "own", "team"].includes(body.visibility_scope)) {
          res.status(400).json({ error: "INVALID_VALUE", message: "'visibility_scope' must be one of: all, own, team" });
          return;
        }
        updates["visibility_scope"] = body.visibility_scope;
      }
      if (body.assignment_scope_type !== undefined) {
        if (!["tenant", "company_code", "legal_entity"].includes(body.assignment_scope_type)) {
          res.status(400).json({ error: "INVALID_VALUE", message: "'assignment_scope_type' must be one of: tenant, company_code, legal_entity" });
          return;
        }
        updates["assignment_scope_type"] = body.assignment_scope_type;
      }
      if (body.assignment_scope_ref_id !== undefined) updates["assignment_scope_ref_id"] = body.assignment_scope_ref_id;
      if (body.include_descendants !== undefined) updates["include_descendants"] = body.include_descendants;
      if (body.expires_at !== undefined) updates["expires_at"] = body.expires_at ? new Date(body.expires_at) : null;

      if (Object.keys(updates).length <= 2) {
        res.status(400).json({ error: "NO_CHANGES", message: "No updatable fields provided" });
        return;
      }

      const updated = await db
        .updateTable("master.auth_group_role")
        .set(updates)
        .where("id", "=", assignmentId)
        .where("tenant_id", "=", tenantId)
        .returning([
          "id",
          "visibility_scope",
          "assignment_scope_type",
          "assignment_scope_ref_id",
          "include_descendants",
          "expires_at",
          "updated_at",
        ])
        .executeTakeFirstOrThrow();

      res.json(updated);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("auth_group_role_uq")) {
        res.status(409).json({ error: "ASSIGNMENT_CONFLICT", message: "This role scope already exists on this group" });
        return;
      }
      if (err instanceof Error && (err.message.includes("agr_scope_chk") || err.message.includes("agr_descendants_chk"))) {
        res.status(400).json({ error: "INVALID_SCOPE", message: "Invalid scope combination — check assignment_scope_type and assignment_scope_ref_id constraints" });
        return;
      }
      logger?.error("iam_update_group_role_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/iam/groups/:id/roles/:rid ────────────────────────────────
  // Remove a role assignment from a group.
  // DB triggers (trg_auth_group_role_iam_outbox) emit topic='iam' outbox event
  // which the iam-outbox-worker picks up to invalidate affected sessions.
  router.delete("/iam/groups/:id/roles/:rid", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "group_role_remove")) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GROUP.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const groupId = req.params.id as string;
      const assignmentId = req.params.rid as string;

      const deleted = await db
        .deleteFrom("master.auth_group_role")
        .where("id", "=", assignmentId)
        .where("group_id", "=", groupId)
        .where("tenant_id", "=", tenantId)
        .returning(["id"])
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ error: "ASSIGNMENT_NOT_FOUND", message: `Role assignment '${assignmentId}' not found` });
        return;
      }

      res.status(204).end();
    } catch (err) {
      logger?.error("iam_remove_group_role_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // PRINCIPAL SEARCH — member picker for group management UI
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/iam/principals ───────────────────────────────────────────────
  // Search principals in the tenant. Supports ?q=<search> (code/name/email),
  // ?type=user|service_account|bot, ?status=active|suspended|terminated|all,
  // ?limit=50 (max 200). Returns principal + profile display fields.
  router.get("/iam/principals", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
      const typeFilter = typeof req.query["type"] === "string" ? req.query["type"].trim() : "";
      const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : "active";
      const limitRaw = parseInt(typeof req.query["limit"] === "string" ? req.query["limit"] : "50", 10);
      const limit = Number.isNaN(limitRaw) || limitRaw < 1 || limitRaw > 200 ? 50 : limitRaw;

      let query = db
        .selectFrom("master.principal as p")
        .leftJoin("master.principal_profile as pp", "pp.principal_id", "p.id")
        .select([
          "p.id",
          "p.code",
          "p.name",
          "p.principal_type",
          "p.status",
          "p.is_locked",
          "p.login_email",
          "pp.given_name",
          "pp.family_name",
          "pp.display_name",
          "pp.avatar_url",
        ])
        .where("p.tenant_id", "=", tenantId)
        .orderBy("p.code")
        .limit(limit);

      if (statusFilter !== "all") {
        query = query.where("p.status", "=", statusFilter);
      }
      if (typeFilter) {
        query = query.where("p.principal_type", "=", typeFilter);
      }
      if (q) {
        query = query.where((eb) =>
          eb.or([
            eb("p.code", "ilike", `%${q}%`),
            eb("p.name", "ilike", `%${q}%`),
            eb("p.login_email", "ilike", `%${q}%`),
          ]),
        );
      }

      const rows = await query.execute();
      setCachePrivate(res, 30);
      res.json({ items: rows, limit });
    } catch (err) {
      logger?.error("iam_list_principals_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION INVALIDATION — Phase 6 Hardening
  // ══════════════════════════════════════════════════════════════════════════

  // ── POST /api/iam/admin/principals/:id/invalidate-sessions ────────────────
  // Force-bumps master.principal.auth_epoch by 1 for the given principal.
  // Any cached session token that was issued with the old epoch is rejected
  // on the next request (session.service.ts performs the epoch guard check).
  //
  // Use cases:
  //   - Admin-initiated logout after suspicious activity
  //   - Post-password-change or post-MFA-reset token purge
  //   - Compliance-required forced re-authentication
  //
  // Requires: iam_admin step-up + IAM.GRANT.MANAGE
  // Returns:  { ok, principalId, newEpoch, invalidatedAt }
  router.post("/iam/admin/principals/:id/invalidate-sessions", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { sub, tenantId, callerPrincipalId } = auth_;

      if (!await enforceIamWriteRateLimit(cache, res, tenantId, sub, "principal_session_invalidate", 10)) return;
      if (!await requireStepUp(cache, sub, tenantId, "iam_admin", res)) return;
      const permDecision = await checkPermission(db, tenantId, callerPrincipalId, "IAM.GRANT.MANAGE");
      if (!requireAllow(permDecision, res)) return;

      const targetId = req.params.id as string;

      // Verify principal exists in tenant
      const principal = await db
        .selectFrom("master.principal as p")
        .select(["p.id", "p.auth_epoch"])
        .where("p.id", "=", targetId)
        .where("p.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!principal) {
        res.status(404).json({ error: "NOT_FOUND", message: `Principal '${targetId}' not found` });
        return;
      }

      // Bump epoch — this invalidates all currently cached sessions for this principal
      const updated = await db
        .updateTable("master.principal")
        .set({
          auth_epoch: sql`auth_epoch + 1`,
          updated_at: sql`now()`,
          updated_by: callerPrincipalId,
        })
        .where("id", "=", targetId)
        .where("tenant_id", "=", tenantId)
        .returning(["id", "auth_epoch"])
        .executeTakeFirst() as { id: string; auth_epoch: number } | undefined;

      const newEpoch = updated?.auth_epoch ?? ((principal.auth_epoch as number) + 1);

      // Write audit outbox event so subscribers can act (e.g. push notification)
      await db
        .insertInto("event.outbox" as never)
        .values({
          tenant_id:   tenantId,
          topic:       "iam",
          event_type:  "auth_epoch_bumped",
          entity_type: "principal",
          entity_id:   targetId,
          payload:     JSON.stringify({
            principal_id:    targetId,
            new_epoch:       newEpoch,
            bumped_by:       callerPrincipalId,
            reason:          "admin_session_invalidation",
          }),
          created_by: callerPrincipalId,
        } as never)
        .execute();

      logger?.warn("iam_session_invalidated", {
        principal_id: targetId,
        new_epoch: newEpoch,
        bumped_by: callerPrincipalId,
        tenant_id: tenantId,
      });

      res.json({
        ok:             true,
        principalId:    targetId,
        newEpoch,
        invalidatedAt:  new Date().toISOString(),
      });
    } catch (err) {
      logger?.error("iam_invalidate_sessions_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/admin/sessions ───────────────────────────────────────────
  // Returns recent security_event_log entries (auth/session events) for the tenant.
  // Used by the /setup/sessions admin page to show active/recent session activity.
  //
  // Query params:
  //   principal_id   — filter by specific principal
  //   event_category — filter by category (e.g. 'authentication', 'session')
  //   outcome        — filter by outcome ('success' | 'failure')
  //   limit          — max rows (default 50, max 200)
  //   offset         — pagination offset (default 0)
  router.get("/iam/admin/sessions", (async (req, res, next) => {
    try {
      const auth_ = await resolveOperatorAuth(req, res, db, auth);
      if (!auth_) return;
      const { tenantId } = auth_;

      const q          = req.query as Record<string, unknown>;
      const limit      = Math.min(200, Math.max(1, parseInt(String(q["limit"]  ?? "50"), 10)));
      const offset     = Math.max(0, parseInt(String(q["offset"] ?? "0"), 10));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = db
        .selectFrom("log.security_event_log as sel")
        .select([
          "sel.id", "sel.event_category", "sel.event_type", "sel.outcome",
          "sel.principal_id", "sel.actor_type", "sel.session_id",
          "sel.ip_address", "sel.user_agent", "sel.country_code",
          "sel.mfa_method", "sel.risk_score", "sel.risk_flags",
          "sel.failure_reason", "sel.created_at",
        ] as never[])
        .where("sel.tenant_id" as never, "=", tenantId as never)
        .orderBy("sel.created_at" as never, "desc");

      if (q["principal_id"])   query = query.where("sel.principal_id" as never, "=", String(q["principal_id"]) as never);
      if (q["event_category"]) query = query.where("sel.event_category" as never, "=", String(q["event_category"]) as never);
      if (q["outcome"])        query = query.where("sel.outcome" as never, "=", String(q["outcome"]) as never);

      const rows = await query.limit(limit).offset(offset).execute() as Record<string, unknown>[];

      // Join principal display name (best-effort — null if principal deleted)
      const principalIds = [...new Set(rows.map((r) => r["principal_id"]).filter(Boolean))] as string[];
      const principals   = principalIds.length > 0
        ? await db
            .selectFrom("master.principal as p")
            .leftJoin("master.persona as pe", "pe.principal_id", "p.id")
            .select(["p.id", "pe.display_name", "pe.email"] as never[])
            .where("p.id" as never, "in", principalIds as never)
            .where("p.tenant_id" as never, "=", tenantId as never)
            .execute() as { id: string; display_name: string | null; email: string | null }[]
        : [];

      const principalMap = new Map(principals.map((p) => [p.id, { displayName: p.display_name, email: p.email }]));

      const enriched = rows.map((r) => ({
        ...r,
        principal: r["principal_id"] ? (principalMap.get(r["principal_id"] as string) ?? null) : null,
      }));

      res.json({ ok: true, data: enriched, pagination: { limit, offset, count: enriched.length } });
    } catch (err) {
      logger?.error("iam_admin_sessions_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}
