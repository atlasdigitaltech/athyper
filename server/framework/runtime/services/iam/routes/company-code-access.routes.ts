/**
 * Company-Code Access Admin Routes — v1.0
 *
 * Admin API surface for managing master.company_code_access grants.
 * These grants control which principals / groups may access records
 * scoped to a given company code.
 *
 * GET  /api/iam/admin/company-codes
 *   List all active company codes for this tenant (filter-picker helper).
 *
 * GET  /api/iam/admin/company-code-access
 *   List all CCA grants (paginated).
 *   Query params:
 *     company_code_id  — filter by company code UUID
 *     entity_type      — filter: principal | auth_group | auth_group_role | team
 *     limit            — default 50, max 200
 *     offset           — default 0
 *
 * POST /api/iam/admin/company-code-access
 *   Grant access. Body: { entity_type, entity_id, company_code_id, inherit_subtree? }
 *   Requires: iam_admin step-up + IAM.GRANT.MANAGE
 *
 * DELETE /api/iam/admin/company-code-access/:id
 *   Revoke a grant by row ID.
 *   Requires: iam_admin step-up + IAM.GRANT.MANAGE
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
import { checkPermission, requireAllow } from "../permission/permission.service.js";
import { requireStepUp } from "../mfa/step-up.service.js";
import type { CacheClient } from "../session/session.service.js";
import { incrementRateLimit } from "../../shared/cache-utils.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

export interface CcaRoutesDeps {
  db: Kysely<AnyDb>;
  cache: CacheClient;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  db: Kysely<AnyDb>,
  auth: CcaRoutesDeps["auth"],
): Promise<{ sub: string; tenantId: string; principalId: string } | null> {
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

  const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
  if (!principalId) {
    res.status(403).json({ error: "NO_PRINCIPAL", message: "No principal found for this user in the current tenant" });
    return null;
  }

  return { sub, tenantId, principalId };
}

async function enforceCcaWriteRateLimit(
  cache: CacheClient,
  res: Parameters<RequestHandler>[1],
  tenantId: string,
  sub: string,
  operation: string,
): Promise<boolean> {
  const key = `ratelimit:iam_admin:${operation}:${tenantId}:${sub}`;
  const count = await incrementRateLimit(cache, key, 60).catch(() => 0);
  if (count === 0 || count <= 30) return true;

  res.setHeader("Retry-After", "60");
  res.status(429).json({
    error: "RATE_LIMITED",
    message: "Too many IAM write attempts. Please wait and try again.",
    retry_after_seconds: 60,
  });
  return false;
}

// ─── CCA row shape ────────────────────────────────────────────────────────────

interface CcaRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  entity_code: string | null;
  company_code_id: string;
  company_code: string;
  company_name: string;
  inherit_subtree: boolean;
  granted_by: string | null;
  granted_by_code: string | null;
  created_at: string;
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createCcaRoutes(router: Router, deps: CcaRoutesDeps): Router {
  const { db, cache, auth, logger } = deps;

  // ── GET /api/iam/admin/company-codes ─────────────────────────────────────────
  // Returns all active company codes for the tenant (for filter dropdowns).
  router.get("/iam/admin/company-codes", (async (req, res, next) => {
    try {
      const a = await resolveAuth(req, res, db, auth);
      if (!a) return;

      const rows = await db
        .selectFrom("master.company_code as cc")
        .select(["cc.id", "cc.code", "cc.name", "cc.is_active"])
        .where("cc.tenant_id", "=", a.tenantId)
        .where("cc.is_active", "=", true)
        .orderBy("cc.code")
        .execute();

      setCachePrivate(res, 120);
      res.json({ items: rows });
    } catch (err) {
      logger?.error("iam_admin_company_codes_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/iam/admin/company-code-access ────────────────────────────────────
  router.get("/iam/admin/company-code-access", (async (req, res, next) => {
    try {
      const a = await resolveAuth(req, res, db, auth);
      if (!a) return;

      const companyCodeId = typeof req.query["company_code_id"] === "string"
        ? req.query["company_code_id"].trim() : "";
      const entityType = typeof req.query["entity_type"] === "string"
        ? req.query["entity_type"].trim() : "";
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10) || 50));
      const offset = Math.max(0, parseInt(String(req.query["offset"] ?? "0"), 10) || 0);

      const ccFilter    = companyCodeId ? sql`AND cca.company_code_id = ${companyCodeId}::uuid` : sql``;
      const etFilter    = entityType    ? sql`AND cca.entity_type = ${entityType}` : sql``;
      const tenantParam = a.tenantId;

      const result = await sql<CcaRow>`
        SELECT
          cca.id,
          cca.entity_type,
          cca.entity_id,
          CASE cca.entity_type
            WHEN 'principal'  THEN COALESCE(pp.display_name, pr.name, pr.code)
            WHEN 'auth_group' THEN ag.name
            ELSE NULL
          END AS entity_name,
          CASE cca.entity_type
            WHEN 'principal'  THEN pr.code
            WHEN 'auth_group' THEN ag.code
            ELSE NULL
          END AS entity_code,
          cca.company_code_id,
          cc.code AS company_code,
          cc.name AS company_name,
          cca.inherit_subtree,
          cca.granted_by,
          gbp.code AS granted_by_code,
          cca.created_at
        FROM master.company_code_access cca
        JOIN  master.company_code cc
           ON cc.id = cca.company_code_id
        LEFT JOIN master.principal pr
           ON pr.id = cca.entity_id AND cca.entity_type = 'principal'
        LEFT JOIN master.principal_profile pp
           ON pp.principal_id = cca.entity_id AND cca.entity_type = 'principal'
        LEFT JOIN master.auth_group ag
           ON ag.id = cca.entity_id AND cca.entity_type = 'auth_group'
        LEFT JOIN master.principal gbp
           ON gbp.id = cca.granted_by
        WHERE cca.tenant_id = ${tenantParam}::uuid
        ${ccFilter}
        ${etFilter}
        ORDER BY cca.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `.execute(db);

      // Total count
      const countResult = await sql<{ total: string }>`
        SELECT COUNT(*)::text AS total
        FROM master.company_code_access cca
        WHERE cca.tenant_id = ${tenantParam}::uuid
        ${ccFilter}
        ${etFilter}
      `.execute(db);

      const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

      setCachePrivate(res, 30);
      res.json({ items: result.rows, total, limit, offset });
    } catch (err) {
      logger?.error("iam_admin_cca_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/iam/admin/company-code-access ───────────────────────────────────
  router.post("/iam/admin/company-code-access", (async (req, res, next) => {
    try {
      const a = await resolveAuth(req, res, db, auth);
      if (!a) return;

      if (!await enforceCcaWriteRateLimit(cache, res, a.tenantId, a.sub, "company_code_access_grant")) return;

      // Require step-up
      const stepUpOk = await requireStepUp(cache, a.sub, a.tenantId, "iam_admin", res);
      if (!stepUpOk) return;

      // Permission check
      const allowed = await checkPermission(db, a.tenantId, a.principalId, "IAM.GRANT.MANAGE", {}, logger);
      requireAllow(allowed, res);
      if (res.headersSent) return;

      const { entity_type, entity_id, company_code_id, inherit_subtree = true } = req.body as {
        entity_type?: string;
        entity_id?: string;
        company_code_id?: string;
        inherit_subtree?: boolean;
      };

      if (!entity_type || !entity_id || !company_code_id) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_type, entity_id, and company_code_id are required" });
        return;
      }

      const validTypes = ["principal", "auth_group", "auth_group_role", "team"];
      if (!validTypes.includes(entity_type)) {
        res.status(400).json({ error: "INVALID_ENTITY_TYPE", message: `entity_type must be one of: ${validTypes.join(", ")}` });
        return;
      }

      // Verify the company code belongs to this tenant
      const cc = await db
        .selectFrom("master.company_code as cc")
        .select(["cc.id", "cc.code", "cc.name"])
        .where("cc.id", "=", company_code_id)
        .where("cc.tenant_id", "=", a.tenantId)
        .executeTakeFirst();

      if (!cc) {
        res.status(404).json({ error: "COMPANY_CODE_NOT_FOUND", message: `Company code '${company_code_id}' not found in this tenant` });
        return;
      }

      // Upsert (delete + insert for idempotency)
      await db
        .deleteFrom("master.company_code_access" as never)
        .where("tenant_id" as never, "=", a.tenantId as never)
        .where("entity_type" as never, "=", entity_type as never)
        .where("entity_id" as never, "=", entity_id as never)
        .where("company_code_id" as never, "=", company_code_id as never)
        .execute()
        .catch(() => undefined);

      const row = await db
        .insertInto("master.company_code_access" as never)
        .values({
          tenant_id:       a.tenantId,
          entity_type,
          entity_id,
          company_code_id,
          inherit_subtree: Boolean(inherit_subtree),
          granted_by:      a.principalId,
          created_by:      a.principalId,
        } as never)
        .returning("id" as never)
        .executeTakeFirstOrThrow() as { id: string };

      res.status(201).json({ id: row.id, company_code: (cc as { code: string }).code, company_name: (cc as { name: string }).name });
    } catch (err) {
      logger?.error("iam_admin_cca_grant_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/iam/admin/company-code-access/:id ─────────────────────────────
  router.delete("/iam/admin/company-code-access/:id", (async (req, res, next) => {
    try {
      const a = await resolveAuth(req, res, db, auth);
      if (!a) return;

      if (!await enforceCcaWriteRateLimit(cache, res, a.tenantId, a.sub, "company_code_access_revoke")) return;

      // Require step-up
      const stepUpOk = await requireStepUp(cache, a.sub, a.tenantId, "iam_admin", res);
      if (!stepUpOk) return;

      // Permission check
      const allowed = await checkPermission(db, a.tenantId, a.principalId, "IAM.GRANT.MANAGE", {}, logger);
      requireAllow(allowed, res);
      if (res.headersSent) return;

      const { id } = req.params as { id: string };

      const deleted = await db
        .deleteFrom("master.company_code_access" as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", a.tenantId as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!deleted) {
        res.status(404).json({ error: "NOT_FOUND", message: "Grant not found or already revoked" });
        return;
      }

      res.status(204).send();
    } catch (err) {
      logger?.error("iam_admin_cca_revoke_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}
