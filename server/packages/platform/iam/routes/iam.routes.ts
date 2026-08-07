import type { RequestHandler, Router } from "express";

import { setCachePrivate } from "@athyper/svc-shared";
import {
  requireVerifiedContext,
} from "../permission-context/verified-request-context.js";
import {
  resolveCompanyCodeScope,
} from "../permission/company-code-scope.service.js";

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

export function createIamRoutes(
  router: Router,
  deps: IamRoutesDepsExtra,
): Router {
  const { db, logger } = deps;

  const getMyCompanyCodes: RequestHandler = async (req, res, next) => {
    try {
      const context = requireVerifiedContext(req, res);
      const permissionCode = typeof req.query["permission"] === "string"
        ? req.query["permission"].trim()
        : "";
      if (!permissionCode) {
        res.status(400).json({
          error: "MISSING_PARAM",
          message: "An exact canonical permission is required.",
        });
        return;
      }
      const scope = resolveCompanyCodeScope(
        context.permissions,
        permissionCode,
      );
      if (
        !scope.isUnrestricted
        && scope.companyCodeIds.length === 0
      ) {
        res.json({ items: [] });
        return;
      }
      let query = db
        .selectFrom("master.company_code as company")
        .select(["company.id", "company.code", "company.name"])
        .where("company.tenant_id", "=", context.tenantId)
        .where("company.status", "=", "active")
        .orderBy("company.code");
      if (!scope.isUnrestricted) {
        query = query.where(
          "company.id",
          "in",
          [...scope.companyCodeIds],
        );
      }
      setCachePrivate(res, 60);
      res.json({ items: await query.execute() });
    } catch (error) {
      logger?.error("iam_my_company_codes_error", { error: String(error) });
      next(error);
    }
  };

  const listRoles: RequestHandler = async (req, res, next) => {
    try {
      const context = requireVerifiedContext(req, res);
      if (context.planeKey === "mesh") {
        res.status(404).json({ error: "PLANE_LOCAL_CATALOG_REQUIRED" });
        return;
      }
      const rows = await db
        .selectFrom("authz.role as role")
        .select([
          "role.id",
          "role.code",
          "role.name",
          "role.description",
          "role.role_kind",
          "role.status",
        ])
        .where("role.tenant_id", "=", context.tenantId)
        .where("role.status", "=", "active")
        .orderBy("role.code")
        .execute();
      setCachePrivate(res, 300);
      res.json({ items: rows });
    } catch (error) {
      logger?.error("iam_list_roles_error", { error: String(error) });
      next(error);
    }
  };

  const listPermissions: RequestHandler = async (req, res, next) => {
    try {
      const context = requireVerifiedContext(req, res);
      if (context.planeKey === "mesh") {
        res.status(404).json({ error: "PLANE_LOCAL_CATALOG_REQUIRED" });
        return;
      }
      const rows = await db
        .selectFrom("authz.permission as permission")
        .select([
          "permission.id",
          "permission.canonical_code as code",
          "permission.risk_tier",
          "permission.requires_mfa",
          "permission.requires_sod",
          "permission.is_shareable",
          "permission.is_delegable",
          "permission.status",
        ])
        .where("permission.status", "=", "published")
        .orderBy("permission.canonical_code")
        .execute();
      setCachePrivate(res, 300);
      res.json({ items: rows });
    } catch (error) {
      logger?.error("iam_list_permissions_error", { error: String(error) });
      next(error);
    }
  };

  router.get("/iam/my-company-codes", getMyCompanyCodes);
  router.get("/iam/roles", listRoles);
  router.get("/iam/permissions", listPermissions);
  return router;
}
