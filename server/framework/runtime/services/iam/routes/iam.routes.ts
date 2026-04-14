/**
 * IAM utility routes — v1.0
 *
 * GET /api/iam/my-company-codes?permission={code}
 *   Returns all company codes the authenticated principal is allowed for a given
 *   permission. Calls master.resolve_allowed_companies() which evaluates:
 *     - persona (tenant-wide) + auth_group_role (scoped) + access_grant (scoped)
 *     - deny checked first
 *
 * Used by the company code picker UI component so users only see entities they
 * can actually access for a specific action. Also useful for building scoped
 * dropdown lists in forms.
 *
 * Required headers:
 *   Authorization: Bearer <kc_access_token>
 *   X-Org:   {tenantCode}--{entityCode}   (used to resolve tenantId)
 *   X-Realm: {realmKey}                   (defaults to "athyper")
 */

import { sql } from "kysely";
import type { RequestHandler, Router } from "express";
import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  setCachePrivate,
} from "../../shared/route-helpers.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IamRoutesDepsExtra {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createIamRoutes(router: Router, deps: IamRoutesDepsExtra): Router {
  const { db, auth, logger } = deps;

  /**
   * GET /api/iam/my-company-codes?permission=<permission_code>
   *
   * Returns the set of company_codes the caller is allowed to access for the
   * given permission. Shape: { items: [{ code, name }] }
   */
  const getMyCompanyCodes: RequestHandler = async (req, res, next) => {
    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const sub = typeof claims.sub === "string" ? claims.sub : null;
      if (!sub) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
        return;
      }

      // ── Tenant resolution ─────────────────────────────────────────────────
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header with a valid tenant is required" });
        return;
      }

      // ── Principal resolution ──────────────────────────────────────────────
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) {
        res.status(403).json({ error: "NO_PRINCIPAL", message: "No principal found for this user in the current tenant" });
        return;
      }

      // ── Permission param ──────────────────────────────────────────────────
      const permissionCode = typeof req.query["permission"] === "string" ? req.query["permission"].trim() : "";
      if (!permissionCode) {
        res.status(400).json({ error: "MISSING_PARAM", message: "'permission' query param is required (e.g. ?permission=FIN.JOURNALS.CREATE)" });
        return;
      }

      // ── Look up permission id ─────────────────────────────────────────────
      const permRow = await db
        .selectFrom("shared.permission as p")
        .select("p.id")
        .where("p.code", "=", permissionCode)
        .executeTakeFirst();

      if (!permRow) {
        res.status(404).json({ error: "PERMISSION_NOT_FOUND", message: `Permission '${permissionCode}' does not exist` });
        return;
      }
      const permissionId: string = permRow.id as string;

      // ── Resolve allowed company codes ─────────────────────────────────────
      // master.resolve_allowed_companies evaluates all sources:
      //   persona (tenant-wide) + auth_group_role (scoped) + access_grant (scoped)
      //   Deny checked first.
      const result = await sql<{ code: string; name: string }>`
        SELECT DISTINCT cc.code, cc.name
        FROM master.resolve_allowed_companies(
          ${tenantId}::uuid,
          ${principalId}::uuid,
          ${permissionId}::uuid
        ) rac
        JOIN master.company_code cc
          ON  cc.id        = rac.company_code_id
          AND cc.is_active = true
        ORDER BY cc.code
      `.execute(db);

      setCachePrivate(res, 60); // short TTL — scope changes on group updates
      res.json({ items: result.rows });
    } catch (err) {
      logger?.error("iam_my_company_codes_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/iam/my-company-codes", getMyCompanyCodes);
  return router;
}
