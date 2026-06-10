/**
 * GET /api/metadata/entities/:entity/lifecycle-masks
 *
 * Returns the per-status capability masks (control.entity_lifecycle_state_mask)
 * that apply to this entity for the active tenant. Tenant-scoped rows override
 * platform defaults; both are returned with the tenant row preferred on
 * duplicate (entity_name, record_status).
 *
 * The BFF (apps/{neon,admin,mesh}/lib/server/meta-entity-runtime.ts) calls this
 * endpoint and threads the result into compileMetaEntityRuntimeDescriptor() as
 * `lifecycleStateMasks`. The compiler emits the masks into the descriptor; the
 * runtime canvas (line-items-surface.tsx etc.) consults them to disable
 * Edit/Delete actions for locked record statuses.
 *
 * Phase 4 — Three-Plane Permission Stack.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { RequestHandler, Router } from "express";

import { extractOrgHeaders, resolveTenantId, verifyBearer } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface LifecycleMaskRouteDeps {
  db: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

interface LifecycleMaskRow {
  record_status: string;
  can_edit: boolean;
  can_delete: boolean;
  can_transition_to: string[] | null;
  disabled_reason: string | null;
}

export function createLifecycleMaskRoute(router: Router, deps: LifecycleMaskRouteDeps): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;

      // Tenant-preferred lookup: when a (tenant_id, entity_name, record_status) row
      // exists, it wins over the platform default for the same (entity, status).
      const rows = await sql<LifecycleMaskRow>`
        WITH preferred AS (
          SELECT
            DISTINCT ON (record_status)
              record_status, can_edit, can_delete, can_transition_to, disabled_reason
            FROM control.entity_lifecycle_state_mask
           WHERE entity_name = ${entityCode}
             AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
           ORDER BY record_status, tenant_id NULLS LAST
        )
        SELECT * FROM preferred
        ORDER BY record_status
      `.execute(db);

      // Project to the descriptor's MetaEntityLifecycleStateMask shape (camelCase).
      const masks = rows.rows.map((row) => ({
        recordStatus: row.record_status,
        canEdit: row.can_edit,
        canDelete: row.can_delete,
        canTransitionTo: row.can_transition_to ?? undefined,
        disabledReason: row.disabled_reason,
      }));

      res.json(masks);
    } catch (err) {
      logger?.error("lifecycle_mask_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/lifecycle-masks", handler);
  return router;
}
