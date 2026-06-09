/**
 * Metadata Routes - GET /api/metadata/entities/:entity/policy
 *
 * Returns the current tenant's entity_policy row for the effective entity.
 * This is intentionally small: Neon only needs access/audit/scope summaries
 * to compile runtime capabilities.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  extractOrgHeaders,
  resolveTenantId,
  verifyBearer,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface EntityPolicyRouteDeps {
  db: AnyDb;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

export function createEntityPolicyRoute(router: Router, deps: EntityPolicyRouteDeps): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "ENTITY_POLICY_NOT_FOUND", message: "Tenant could not be resolved." });
        return;
      }

      const entity = await db
        .selectFrom("control.entity as e")
        .innerJoin("control.entity_version as ev", "ev.entity_id" as never, "e.id" as never)
        .select([
          "e.id",
          "e.security_tier",
          "e.governance_level",
          "e.mutability",
          "ev.id as version_id",
        ] as never[])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) => eb.or([
          eb("e.name" as never, "=", entityCode as never),
          eb("e.entity_code" as never, "=", entityCode as never),
          eb("e.slug" as never, "=", entityCode.replace(/_/g, "-") as never),
        ]))
        .where("e.tenant_id" as never, "is", null)
        .where("ev.status" as never, "=", "EFFECTIVE" as never)
        .limit(1)
        .executeTakeFirst() as {
          id: string;
          version_id: string;
          security_tier: string;
          governance_level: string;
          mutability: string;
        } | undefined;

      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const rows = await db
        .selectFrom("control.entity_policy as ep")
        .select([
          "ep.id",
          "ep.entity_id",
          "ep.entity_version_id",
          "ep.access_mode",
          "ep.company_scope_mode",
          "ep.audit_mode",
          "ep.default_filters",
          "ep.cache_flags",
          "ep.field_scope_eval_order",
          "ep.extended_scope",
        ] as never[])
        .where("ep.tenant_id" as never, "=" as never, tenantId as never)
        .where("ep.entity_id" as never, "=" as never, entity.id as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) => eb.or([
          eb("ep.entity_version_id" as never, "is", null),
          eb("ep.entity_version_id" as never, "=", entity.version_id as never),
        ]))
        .execute() as Array<{
          id: string;
          entity_id: string;
          entity_version_id: string | null;
          access_mode: string;
          company_scope_mode: string;
          audit_mode: string;
          default_filters: unknown;
          cache_flags: unknown;
          field_scope_eval_order: string | null;
          extended_scope: unknown;
        }>;

      const policy = rows.find((row) => row.entity_version_id === entity.version_id)
        ?? rows.find((row) => row.entity_version_id === null);

      if (!policy) {
        res.status(404).json({ error: "ENTITY_POLICY_NOT_FOUND", message: `Entity '${entityCode}' has no tenant policy.` });
        return;
      }

      res.json({
        id: policy.id,
        entity_id: policy.entity_id,
        entity_version_id: policy.entity_version_id,
        access_mode: policy.access_mode,
        company_scope_mode: policy.company_scope_mode,
        audit_mode: policy.audit_mode,
        default_filters: policy.default_filters ?? {},
        cache_flags: policy.cache_flags ?? {},
        field_scope_eval_order: policy.field_scope_eval_order ?? undefined,
        extended_scope: policy.extended_scope ?? {},
        security_tier: entity.security_tier,
        governance_level: entity.governance_level,
        mutability: entity.mutability,
      });
    } catch (err) {
      logger?.error("entity_policy_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/policy", handler);
  return router;
}
