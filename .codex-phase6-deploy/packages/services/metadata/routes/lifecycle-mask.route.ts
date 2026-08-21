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
  state_name: string | null;
  badge_variant: string | null;
  ui_color: string | null;
  icon_key: string | null;
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
      const requestedPlane = typeof req.headers["x-athyper-plane"] === "string"
        ? req.headers["x-athyper-plane"]
        : "neon";

      // Tenant-preferred lookup: when a (tenant_id, entity_name, record_status) row
      // exists, it wins over the platform default for the same (entity, status).
      //
      // Presentation join (chosen_lifecycle + ls): pulls per-state badge_variant /
      // ui_color / icon_key from control.lifecycle_state.config so the chrome
      // can render the status badge from seeded data instead of inferring intent
      // via string matching. We pick the highest-priority binding (lowest
      // priority value, tenant-preferred) — multiple lifecycles can apply to
      // one entity but presentation reads from the dominant binding only.
      const rows = await sql<LifecycleMaskRow>`
        WITH current_version AS (
          SELECT ev.id
            FROM control.entity_version ev
            JOIN control.entity e ON e.id = ev.entity_id
           WHERE e.entity_code = ${entityCode}
             AND ev.status = 'EFFECTIVE'
             AND ev.tenant_id IS NOT DISTINCT FROM ${tenantId}::uuid
           ORDER BY ev.version_no DESC
           LIMIT 1
        ),
        preferred AS (
          SELECT
            DISTINCT ON (record_status)
              record_status, can_edit, can_delete, can_transition_to, disabled_reason
            FROM control.entity_lifecycle_state_mask
           WHERE entity_name = ${entityCode}
             AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
             AND (
               entity_version_id = (SELECT id FROM current_version)
               OR entity_version_id IS NULL
             )
             AND ${requestedPlane} = ANY(applies_to_planes)
           ORDER BY record_status,
                    (entity_version_id IS NOT NULL) DESC,
                    tenant_id NULLS LAST
        ),
        chosen_lifecycle AS (
          SELECT DISTINCT ON (entity_name)
                 entity_name, lifecycle_id
            FROM control.entity_lifecycle
           WHERE entity_name = ${entityCode}
             AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
             AND (
               entity_version_id = (SELECT id FROM current_version)
               OR entity_version_id IS NULL
             )
           ORDER BY entity_name,
                    (entity_version_id IS NOT NULL) DESC,
                    tenant_id NULLS LAST, priority ASC
        )
        SELECT
          ls.code                       AS record_status,
          COALESCE(p.can_edit, false)   AS can_edit,
          COALESCE(p.can_delete, false) AS can_delete,
          p.can_transition_to,
          COALESCE(p.disabled_reason, 'lifecycle_locked') AS disabled_reason,
          ls.name                       AS state_name,
          ls.config->>'badge_variant'   AS badge_variant,
          ls.config->>'ui_color'        AS ui_color,
          ls.config->>'icon_key'        AS icon_key
        FROM chosen_lifecycle cl
        JOIN control.lifecycle_state ls ON ls.lifecycle_id = cl.lifecycle_id
        LEFT JOIN preferred p ON p.record_status = ls.code
        ORDER BY ls.sort_order, ls.code
      `.execute(db);

      // Project to the descriptor's MetaEntityLifecycleStateMask shape (camelCase).
      // `presentation` is omitted entirely when none of the four DB columns
      // carry a value — keeps the wire payload small for entities whose
      // lifecycle hasn't been seeded with config metadata yet.
      const masks = rows.rows.map((row) => {
        const hasPresentation = row.state_name !== null
          || row.badge_variant !== null
          || row.ui_color !== null
          || row.icon_key !== null;
        return {
          recordStatus: row.record_status,
          canEdit: row.can_edit,
          canDelete: row.can_delete,
          canTransitionTo: row.can_transition_to ?? undefined,
          disabledReason: row.disabled_reason,
          ...(hasPresentation
            ? {
                presentation: {
                  label: row.state_name,
                  badgeVariant: row.badge_variant,
                  color: row.ui_color,
                  icon: row.icon_key,
                },
              }
            : {}),
        };
      });

      res.json(masks);
    } catch (err) {
      logger?.error("lifecycle_mask_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/lifecycle-masks", handler);
  return router;
}
