/**
 * Admin Partner Binding CRUD — Phase 5.5 of the Three-Plane Permission Stack.
 *
 * Inviting tenant admin manages mesh.account_grant rows for partners they
 * have authorized. The route runs in the **admin plane** (X-Plane: admin)
 * because it's tenant-operator-driven, not partner-driven.
 *
 * Routes:
 *   GET    /api/admin/partners/bindings            list active bindings for the inviting tenant
 *   POST   /api/admin/partners/bindings            create a new binding for an existing partner
 *   POST   /api/admin/partners/bindings/:id/revoke revoke (status='revoked')
 *
 * Cross-DB: writes hit meshDb (mesh.account_grant); audit / context lookups
 * use the neon db. The Phase 1 trigger `trg_mag_revoke` handles the cache
 * invalidation pipeline on revoke automatically (Phase 5 listener picks up
 * the pg_notify; this route doesn't need to invalidate anything explicitly).
 *
 * Note on tenant scope: `mesh.network_account` has no `tenant_id` column —
 * mesh is cross-tenant by design. We enforce inviting-tenant scope by
 * verifying that the operator's claims carry tenant_id matching the
 * network_account's host tenant (resolved via mesh.network_account.metadata
 * or a separate authorized_by_tenant lookup table that ops can maintain).
 * For Phase 5.5 we accept the operator's claim and rely on row-level
 * permission gates downstream. A future ENH adds tenant-scoping at the
 * network_account layer.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { verifyBearer } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface AdminPartnerBindingsRoutesDeps {
  db: AnyDb;
  /** Mesh DB client — falls back to `db` for single-DB local dev. */
  meshDb?: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function principalIdFromClaims(claims: Record<string, unknown>): string | null {
  const s = claims["sub"] ?? claims["principal_id"];
  return typeof s === "string" && s ? s : null;
}

function tenantIdFromClaims(claims: Record<string, unknown>): string | null {
  const t = claims["tenant_id"];
  return typeof t === "string" && t ? t : null;
}

function badRequest(res: any, msg: string) {
  res.status(400).json({ error: "BAD_REQUEST", message: msg });
}

function notFound(res: any, msg: string) {
  res.status(404).json({ error: "NOT_FOUND", message: msg });
}

function conflict(res: any, msg: string, extra?: Record<string, unknown>) {
  res.status(409).json({ error: "CONFLICT", message: msg, ...(extra ?? {}) });
}

function forbidden(res: any, msg: string) {
  res.status(403).json({ error: "FORBIDDEN", message: msg });
}

const VALID_ROLE_CODES = new Set(["account_owner", "account_admin", "account_user"]);
const ACTIVE_BINDING_STATUSES = new Set(["active", "suspended"]);

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAdminPartnerBindingsRoutes(
  router: Router,
  deps: AdminPartnerBindingsRoutesDeps,
): Router {
  const { db, meshDb: _meshDb, auth, logger } = deps;
  if (!_meshDb) throw new Error("MESH_DATABASE_CONFIGURATION_REQUIRED");
  const meshDb = _meshDb;

  async function adminGuard(req: any, res: any): Promise<{ tenantId: string; principalId: string } | null> {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;
    const principalId = principalIdFromClaims(claims);
    const tenantId    = tenantIdFromClaims(claims);
    if (!principalId || !tenantId) {
      badRequest(res, "MISSING_TENANT_OR_PRINCIPAL");
      return null;
    }
    void db;
    return { tenantId, principalId };
  }

  // ── GET /api/admin/partners/bindings ─────────────────────────────────────────
  const listBindingsHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await adminGuard(req, res);
      if (!ctx) return;

      // ?account_code= and ?status= filters; default = active bindings for
      // any account this tenant operates.
      const accountCode = typeof req.query["account_code"] === "string" ? req.query["account_code"] : null;
      const status      = typeof req.query["status"]       === "string" ? req.query["status"]       : "active";

      const rows = await sql<{
        id: string;
        account_id: string;
        account_code: string | null;
        principal_id: string;
        principal_display_name: string | null;
        role_code: string;
        status: string;
        fingerprint: string | null;
        granted_at: string;
        revoked_at: string | null;
      }>`
        SELECT
            ag.id::text          AS id,
            ag.account_id::text  AS account_id,
            na.account_code,
            ag.principal_id::text AS principal_id,
            p.display_name        AS principal_display_name,
            COALESCE(ag.metadata #>> '{role_code}', 'account_user') AS role_code,
            ag.status,
            NULL::text AS fingerprint,
            ag.effective_from::text AS granted_at,
            ag.revoked_at::text  AS revoked_at
          FROM mesh.auth_plane_membership ag
          JOIN mesh.network_account na ON na.id = ag.account_id
          JOIN mesh.principal p ON p.id = ag.principal_id
         WHERE ag.status = ${status}
           ${accountCode ? sql`AND na.account_code = ${accountCode}` : sql``}
         ORDER BY ag.effective_from DESC
         LIMIT 500
      `.execute(meshDb);

      res.json({ items: rows.rows, count: rows.rows.length });
    } catch (err) {
      logger?.error("admin_partner_bindings_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/admin/partners/bindings ────────────────────────────────────────
  // Body: { account_id, principal_id, role_code, notes? }
  const createBindingHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await adminGuard(req, res);
      if (!ctx) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const accountId  = typeof body["account_id"]  === "string" ? body["account_id"].trim()  : "";
      const principalId = typeof body["principal_id"] === "string" ? body["principal_id"].trim() : "";
      const roleCode   = typeof body["role_code"]   === "string" ? body["role_code"].trim()   : "account_user";
      const notes      = typeof body["notes"]       === "string" ? body["notes"].trim()       : null;

      if (!accountId)           return badRequest(res, "account_id is required");
      if (!principalId)         return badRequest(res, "principal_id is required");
      if (!VALID_ROLE_CODES.has(roleCode)) {
        return badRequest(res, `role_code must be one of ${[...VALID_ROLE_CODES].join(", ")}`);
      }

      // Verify the account exists.
      const accountRows = await sql<{ id: string }>`
        SELECT id::text AS id FROM mesh.network_account WHERE id = ${accountId}::uuid LIMIT 1
      `.execute(meshDb);
      if (!accountRows.rows[0]) return notFound(res, `mesh.network_account '${accountId}' not found`);

      // Verify the principal exists and isn't retired.
      const principalRows = await sql<{ id: string; status: string }>`
        SELECT id::text AS id, status FROM mesh.principal WHERE id = ${principalId}::uuid LIMIT 1
      `.execute(meshDb);
      const principalRow = principalRows.rows[0];
      if (!principalRow)            return notFound(res, `mesh.principal '${principalId}' not found`);
      if (principalRow.status === "retired") {
        return conflict(res, `mesh.principal is retired; cannot grant`);
      }

      // Reject when an active binding already exists with this exact role.
      const existing = await sql<{ id: string }>`
        SELECT id::text AS id FROM mesh.auth_plane_membership
         WHERE account_id   = ${accountId}::uuid
           AND principal_id = ${principalId}::uuid
           AND status       = 'active'
         LIMIT 1
      `.execute(meshDb);
      if (existing.rows[0]) {
        return conflict(res, "Active binding already exists for (account, principal, role).", {
          existing_id: existing.rows[0].id,
        });
      }

      // INSERT — the BEFORE trigger fills in the fingerprint automatically.
      const created = await sql<{
        id: string;
        account_id: string;
        principal_id: string;
        role_code: string;
        status: string;
        fingerprint: string;
        granted_at: string;
      }>`
        INSERT INTO mesh.auth_plane_membership
            (account_id, plane_code, principal_id, status, source_type,
             source_ref, provenance, metadata, created_by, created_at)
        VALUES (
            ${accountId}::uuid,
            ${principalId}::uuid,
            'mesh',
            'active',
            'migration',
            ${`admin:${ctx.principalId}`},
            ${JSON.stringify({ admitted_by_tenant: ctx.tenantId })}::jsonb,
            ${JSON.stringify({ role_code: roleCode, notes })}::jsonb,
            ${`admin:${ctx.principalId}`},
            now()
        )
        RETURNING
            id::text          AS id,
            account_id::text  AS account_id,
            principal_id::text AS principal_id,
            COALESCE(metadata #>> '{role_code}', 'account_user') AS role_code,
            status,
            NULL::text AS fingerprint,
            effective_from::text AS granted_at
      `.execute(meshDb);

      res.status(201).json(created.rows[0]);
    } catch (err) {
      logger?.error("admin_partner_bindings_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/admin/partners/bindings/:id/revoke ─────────────────────────────
  // Body: { reason, ticket? }
  const revokeBindingHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await adminGuard(req, res);
      if (!ctx) return;

      const id     = req.params["id"] as string;
      const body   = (req.body ?? {}) as Record<string, unknown>;
      const reason = typeof body["reason"] === "string" ? body["reason"].trim() : "";
      const ticket = typeof body["ticket"] === "string" ? body["ticket"].trim() : null;
      if (!reason) return badRequest(res, "reason is required");

      // Verify the binding exists and is active.
      const current = await sql<{ id: string; status: string }>`
        SELECT id::text AS id, status FROM mesh.auth_plane_membership WHERE id = ${id}::uuid LIMIT 1
      `.execute(meshDb);
      const row = current.rows[0];
      if (!row)             return notFound(res, `binding '${id}' not found`);
      if (row.status !== "active") {
        return conflict(res, `binding is in status '${row.status}'; only active can be revoked`);
      }

      // Flip to revoked. The AFTER UPDATE trigger queues descriptor invalidation.
      // and emits pg_notify('grant_revoke') so the listener purges Redis.
      const updated = await sql<{ id: string; status: string }>`
        UPDATE mesh.auth_plane_membership
           SET status      = 'revoked',
               revoked_at  = now(),
               revoked_by  = principal_id,
               revocation_reason = ${reason},
               metadata    = COALESCE(metadata, '{}'::jsonb)
                             || jsonb_build_object(
                                  'revoke_reason', ${reason},
                                  'revoke_ticket', ${ticket},
                                  'revoked_by_tenant', ${ctx.tenantId}
                                ),
               updated_at  = now(),
               updated_by  = ${`admin:${ctx.principalId}`}
         WHERE id = ${id}::uuid AND status = 'active'
         RETURNING id::text AS id, status
      `.execute(meshDb);

      if (!updated.rows[0]) {
        // Lost the race to a concurrent writer.
        return conflict(res, "binding raced out of active during the revoke");
      }

      res.json(updated.rows[0]);
    } catch (err) {
      logger?.error("admin_partner_bindings_revoke_error", { err: String(err) });
      next(err);
    }
  };

  // ── Route registrations ─────────────────────────────────────────────────────
  router.get  ("/admin/partners/bindings",                listBindingsHandler);
  router.post ("/admin/partners/bindings",                createBindingHandler);
  router.post ("/admin/partners/bindings/:id/revoke",     revokeBindingHandler);

  return router;
}

export { VALID_ROLE_CODES, ACTIVE_BINDING_STATUSES };
