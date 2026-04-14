/**
 * IAM Operator Routes — v1.0
 *
 * 12-endpoint operator surface for IAM administration, access reviews,
 * and support diagnostics. Deliberately narrow scope — see plan §6.
 *
 * Read endpoints (no step-up required, require Bearer + X-Org):
 *   GET  /api/iam/effective-access/:principalId
 *   GET  /api/iam/principals/:principalId/groups
 *   GET  /api/iam/principals/:principalId/grants
 *   GET  /api/iam/principals/:principalId/delegations
 *   GET  /api/iam/principals/:principalId/mfa
 *   GET  /api/iam/principals/:principalId/auth-bindings
 *
 * Write endpoints (require iam_admin step-up + IAM.GROUP.MANAGE permission):
 *   POST   /api/iam/groups/:groupId/members
 *   DELETE /api/iam/groups/:groupId/members/:memberId
 *   POST   /api/iam/grants            (allow only — deny requires separate approval flow)
 *   PATCH  /api/iam/grants/:grantId/revoke
 *   POST   /api/iam/delegations
 *   PATCH  /api/iam/delegations/:grantId/revoke
 *
 * Auth guard pattern for writes:
 *   1. requireStepUp(cache, callerSub, 'iam_admin', res) → 403 STEP_UP_REQUIRED if not elevated
 *   2. checkPermission(db, tenantId, callerPrincipalId, 'IAM.GROUP.MANAGE') → 403 PERMISSION_DENIED
 *   3. Proceed with mutation
 *
 * Scope boundary (Phase 3): These 12 endpoints are the complete write surface.
 * No additional endpoints (full group CRUD, persona management, bulk ops) until
 * these are stable and tested.
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
} from "../../shared/route-helpers.js";
import { checkPermission, checkPermissionBatch, requireAllow } from "../permission/permission.service.js";
import { requireStepUp } from "../mfa/step-up.service.js";
import type { CacheClient } from "../session/session.service.js";

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
          "pib.idp_username",
          "pib.idp_email",
          "pib.idp_email_verified",
          "pib.keycloak_sync_status",
          "pib.keycloak_synced_at",
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

      if (!await requireStepUp(cache, sub, "iam_admin", res)) return;
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

      if (!await requireStepUp(cache, sub, "iam_admin", res)) return;
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

      if (!await requireStepUp(cache, sub, "iam_admin", res)) return;
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

      if (!await requireStepUp(cache, sub, "iam_admin", res)) return;
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

      if (!await requireStepUp(cache, sub, "delegation_accept", res)) return;
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

      if (!await requireStepUp(cache, sub, "iam_admin", res)) return;
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

  return router;
}
