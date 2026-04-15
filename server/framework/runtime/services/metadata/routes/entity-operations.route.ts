/**
 * Metadata Routes — GET /api/metadata/entities/:entity/operations
 *
 * Returns entity operations (action bar buttons) for the given entity.
 * Queries control.entity_operation for the entity, filtered by:
 *   - entity_name = entityCode
 *   - is_enabled = true
 *   - tenant_id IS NULL (global) OR tenant_id = tenantId (tenant override)
 *
 * Tenant operations (same permission_code, non-null tenant_id) override
 * global operations when both exist, via sort on tenant_id IS NULL (globals last).
 *
 * Response: EntityOperation[]  (api-contracts/metadata shape)
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface EntityOperationsRoutesDeps {
  db: AnyDb;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

export function createEntityOperationsRoute(router: Router, deps: EntityOperationsRoutesDeps): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");

      // Resolve optional tenant for tenant-specific operation overrides
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      // Query global + tenant-specific operations for this entity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = db
        .selectFrom("control.entity_operation as eo")
        .select([
          "eo.id",
          "eo.entity_name",
          "eo.permission_code",
          "eo.surface",
          "eo.placement",
          "eo.handler_type",
          "eo.handler_target",
          "eo.is_record_required",
          "eo.sort_order",
          "eo.label_override",
          "eo.icon_override",
          "eo.is_enabled",
          "eo.tenant_id",
        ] as never[])
        .where("eo.entity_name" as never, "=", entityCode as never)
        .where("eo.is_enabled" as never, "=", true as never);

      if (tenantId) {
        // Include global ops AND tenant-specific overrides
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = query.where((eb: any) =>
          eb.or([
            eb("eo.tenant_id" as never, "is", null),
            eb("eo.tenant_id" as never, "=", tenantId as never),
          ]),
        );
      } else {
        // No tenant resolved — only global operations
        query = query.where("eo.tenant_id" as never, "is", null);
      }

      const rows = await query
        .orderBy("eo.sort_order" as never, "asc")
        .execute() as Array<{
          id: string;
          entity_name: string;
          permission_code: string;
          surface: string;
          placement: string;
          handler_type: string;
          handler_target: string | null;
          is_record_required: boolean;
          sort_order: number;
          label_override: string | null;
          icon_override: string | null;
          is_enabled: boolean;
          tenant_id: string | null;
        }>;

      // Deduplicate: if both global and tenant override exist for same
      // permission_code, prefer the tenant-specific one.
      const seen = new Map<string, typeof rows[0]>();
      for (const row of rows) {
        const existing = seen.get(row.permission_code);
        if (!existing || (row.tenant_id !== null && existing.tenant_id === null)) {
          seen.set(row.permission_code, row);
        }
      }

      // Map to EntityOperation contract (strip internal tenant_id field)
      const operations = [...seen.values()]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ tenant_id: _t, ...op }) => op);

      res.json(operations);
    } catch (err) {
      logger?.error("entity_operations_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/operations", handler);
  return router;
}
