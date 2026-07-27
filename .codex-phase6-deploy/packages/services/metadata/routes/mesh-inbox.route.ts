/**
 * Mesh Inbox Routes — Phase 5.5 of the Three-Plane Permission Stack.
 *
 * Partner-facing read API: lists documents the authenticated partner has
 * access to via their active mesh.account_grant. The inbox is a runtime
 * projection over the inviting tenant's neon DB (purchase_invoice,
 * purchase_order), filtered by the master.access_grant rows that scope the
 * partner's record-level access.
 *
 * Cross-DB pattern:
 *   1. Token → mesh.principal_identity_binding → mesh.principal.id
 *      (queried against meshDb)
 *   2. mesh.principal + tenantId → mesh.account_grant active row check
 *      (queried against meshDb)
 *   3. master.access_grant + entity rows → document list
 *      (queried against neon db)
 *
 * Steps 1-2 are condensed into a single check via res.locals.effectivePermissionContext
 * which the Phase 5 middleware already populated. We just need to confirm
 * planeKey === 'mesh' and the partner has `MESH.BUYER.VIEW` in allowed.
 *
 * Routes:
 *   GET /api/mesh/inbox                        list shared documents (multi-entity)
 *   GET /api/mesh/bindings                     partner's own active bindings (self)
 *   GET /api/mesh/documents/:entity/:id        single-document detail (scoped)
 *   GET /api/mesh/notifications/preferences    read partner's notification prefs
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { extractOrgHeaders, resolveTenantId, verifyBearer } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface MeshInboxRoutesDeps {
  db: AnyDb;
  /** Mesh DB client. When unset (single-DB local dev) we fall back to `db`. */
  meshDb?: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function forbidden(res: any, msg: string, code = "FORBIDDEN") {
  res.status(403).json({ error: code, message: msg });
}

function notFound(res: any, msg: string) {
  res.status(404).json({ error: "NOT_FOUND", message: msg });
}

interface ResolvedMeshPartner {
  principalId: string;
  tenantId: string;
  /** From res.locals.effectivePermissionContext: lets us decide what's visible. */
  allowed: ReadonlySet<string>;
}

/**
 * Read the EffectivePermissionContext populated by the Phase 5 middleware.
 * Returns null when the request isn't a mesh-plane authenticated session,
 * which lets handlers issue a clean 403.
 */
function resolveMeshPartner(res: any): ResolvedMeshPartner | null {
  const ctx = (res.locals as Record<string, unknown>)["effectivePermissionContext"] as
    | {
        planeKey: string;
        tenantId: string;
        principalId: string;
        allowed: ReadonlySet<string>;
      }
    | undefined;
  if (!ctx) return null;
  if (ctx.planeKey !== "mesh") return null;
  return {
    principalId: ctx.principalId,
    tenantId: ctx.tenantId,
    allowed: ctx.allowed,
  };
}

/**
 * Whitelist of partner-safe columns per entity. Anything not listed here is
 * dropped before serialization so accounting internals (margin, GL postings,
 * cost centers) don't leak into mesh responses. New columns must be added
 * here explicitly — defaults are to hide.
 */
const PARTNER_SAFE_COLUMNS: Record<string, readonly string[]> = {
  purchase_invoice: [
    "id", "code", "supplier_id", "company_code_id",
    "invoice_date", "due_date", "currency_code",
    "amount_net", "amount_tax", "amount_total",
    "status", "notes",
  ],
  purchase_order: [
    "id", "code", "supplier_id", "company_code_id",
    "order_date", "expected_delivery_date", "currency_code",
    "amount_total", "status", "notes",
  ],
  sales_invoice: [
    "id", "code", "customer_id", "company_code_id",
    "invoice_date", "due_date", "currency_code",
    "amount_total", "status",
  ],
  sales_order: [
    "id", "code", "customer_id", "company_code_id",
    "order_date", "expected_delivery_date", "currency_code",
    "amount_total", "status",
  ],
  receipt: [
    "id", "code", "supplier_id", "po_id",
    "receipt_date", "status",
  ],
};

const MESH_ELIGIBLE_ENTITIES = Object.freeze(Object.keys(PARTNER_SAFE_COLUMNS));

function projectPartnerSafe<T extends Record<string, unknown>>(
  rows: T[],
  entity: string,
): Array<Partial<T>> {
  const allowed = PARTNER_SAFE_COLUMNS[entity];
  if (!allowed) return [];
  return rows.map((row) => {
    const out: Partial<T> = {};
    for (const col of allowed) {
      if (col in row) (out as Record<string, unknown>)[col] = row[col];
    }
    return out;
  });
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMeshInboxRoutes(router: Router, deps: MeshInboxRoutesDeps): Router {
  const { db, meshDb: _meshDb, auth, logger } = deps;
  // Resolve once; consumers don't need to know which client is which.
  const meshDb = _meshDb ?? db;

  // ── GET /api/mesh/inbox ─────────────────────────────────────────────────────
  // Returns a flat list of {entity, id, code, status, amount_total} for every
  // mesh-eligible document the partner has access to via master.access_grant.
  const inboxHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const partner = resolveMeshPartner(res);
      if (!partner) return forbidden(res, "Mesh plane context required", "MESH_CONTEXT_REQUIRED");
      if (!partner.allowed.has("MESH.BUYER.VIEW")) {
        return forbidden(res, "Partner lacks MESH.BUYER.VIEW");
      }

      // ?entity=purchase_invoice narrows the scan; ?limit=N caps response size.
      const entityFilter = typeof req.query["entity"] === "string"
        ? req.query["entity"]
        : null;
      const limit = Math.min(
        parseInt(typeof req.query["limit"] === "string" ? req.query["limit"] : "50", 10) || 50,
        200,
      );

      const targetEntities = entityFilter
        ? MESH_ELIGIBLE_ENTITIES.filter((e) => e === entityFilter)
        : MESH_ELIGIBLE_ENTITIES;

      if (targetEntities.length === 0) {
        return res.json({ items: [], total: 0 });
      }

      // For each entity, query the partner's record-level grants then fan out
      // a SELECT against the corresponding table. We bound the per-entity
      // result to `limit` rows so a malicious partner can't fan out the
      // query into a tenant-wide scan.
      const items: Array<{
        entity: string;
        id: string;
        code: string | null;
        status: string | null;
        amount_total: number | null;
      }> = [];

      for (const entity of targetEntities) {
        const rows = await sql<{
          id: string;
          code: string | null;
          status: string | null;
          amount_total: number | null;
        }>`
          SELECT DISTINCT
              t.id::text AS id,
              t.code,
              t.status,
              (CASE WHEN ${entity}::text IN ('purchase_invoice','purchase_order','sales_invoice','sales_order')
                    THEN t.amount_total ELSE NULL END)::numeric AS amount_total
            FROM ${sql.raw(`master.${entity}`)} t
            JOIN master.access_grant ag
              ON ag.tenant_id    = ${partner.tenantId}::uuid
             AND ag.principal_id = ${partner.principalId}::uuid
             AND ag.status       = 'active'
             AND (ag.expires_at IS NULL OR ag.expires_at > now())
             AND ag.effect       = 'allow'
             AND ag.resource_type = ${entity}
             AND ag.resource_id   = t.id::text
           WHERE t.tenant_id = ${partner.tenantId}::uuid
           ORDER BY t.id
           LIMIT ${limit}
        `.execute(db).catch(() => ({ rows: [] }));

        for (const r of rows.rows) items.push({ entity, ...r });
      }

      res.json({ items, total: items.length, limit, entities: targetEntities });
    } catch (err) {
      logger?.error("mesh_inbox_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/mesh/bindings ──────────────────────────────────────────────────
  // Partner self-discovery: which network accounts is the principal active on?
  const bindingsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const partner = resolveMeshPartner(res);
      if (!partner) return forbidden(res, "Mesh plane context required", "MESH_CONTEXT_REQUIRED");

      const bindings = await sql<{
        id: string;
        account_id: string;
        account_code: string | null;
        display_name: string | null;
        role_code: string;
        status: string;
        granted_at: string;
      }>`
        SELECT
            ag.id::text          AS id,
            ag.account_id::text  AS account_id,
            na.account_code,
            na.display_name,
            ag.role_code,
            ag.status,
            ag.granted_at::text  AS granted_at
          FROM mesh.account_grant ag
          JOIN mesh.network_account na ON na.id = ag.account_id
         WHERE ag.principal_id = ${partner.principalId}::uuid
           AND ag.status       = 'active'
         ORDER BY ag.granted_at DESC
      `.execute(meshDb);

      res.json({ items: bindings.rows });
    } catch (err) {
      logger?.error("mesh_bindings_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/mesh/documents/:entity/:id ─────────────────────────────────────
  // Single document detail. We re-check master.access_grant before serving
  // even if the inbox listed it — the partner could have just been revoked.
  const documentDetailHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const partner = resolveMeshPartner(res);
      if (!partner) return forbidden(res, "Mesh plane context required", "MESH_CONTEXT_REQUIRED");
      if (!partner.allowed.has("MESH.BUYER.VIEW")) {
        return forbidden(res, "Partner lacks MESH.BUYER.VIEW");
      }

      const entity = (req.params["entity"] as string ?? "").replace(/-/g, "_");
      const id     = req.params["id"] as string;
      if (!MESH_ELIGIBLE_ENTITIES.includes(entity)) {
        return notFound(res, `Entity '${entity}' is not mesh-visible`);
      }

      // Existence + access check in one query.
      const rows = await sql<Record<string, unknown>>`
        SELECT t.*
          FROM ${sql.raw(`master.${entity}`)} t
          JOIN master.access_grant ag
            ON ag.tenant_id    = ${partner.tenantId}::uuid
           AND ag.principal_id = ${partner.principalId}::uuid
           AND ag.status       = 'active'
           AND ag.effect       = 'allow'
           AND ag.resource_type = ${entity}
           AND ag.resource_id   = t.id::text
         WHERE t.id = ${id}::uuid
           AND t.tenant_id = ${partner.tenantId}::uuid
         LIMIT 1
      `.execute(db).catch(() => ({ rows: [] }));

      const raw = rows.rows[0];
      if (!raw) return notFound(res, `Document '${entity}/${id}' not found or access denied`);

      const [projected] = projectPartnerSafe([raw], entity);
      res.json({ entity, item: projected });
    } catch (err) {
      logger?.error("mesh_document_detail_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/mesh/notifications/preferences ─────────────────────────────────
  const notificationPrefsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const partner = resolveMeshPartner(res);
      if (!partner) return forbidden(res, "Mesh plane context required", "MESH_CONTEXT_REQUIRED");

      // Optional ?account_code= filter; defaults to the partner's active bindings.
      const accountCodeFilter = typeof req.query["account_code"] === "string"
        ? req.query["account_code"]
        : null;

      const prefs = await sql<{
        id: string;
        account_code: string;
        event_code: string;
        channel: string;
        is_enabled: boolean | null;
        frequency_code: string | null;
      }>`
        SELECT
            pnp.id::text AS id,
            pnp.account_code,
            pnp.event_code,
            pnp.channel,
            pnp.is_enabled,
            pnp.frequency_code
          FROM mesh.principal_notification_preference pnp
         WHERE pnp.principal_id = ${partner.principalId}::uuid
           AND pnp.status        = 'active'
           ${accountCodeFilter
             ? sql`AND pnp.account_code = ${accountCodeFilter}`
             : sql``}
         ORDER BY pnp.account_code, pnp.event_code, pnp.channel
      `.execute(meshDb);

      res.json({ items: prefs.rows });
    } catch (err) {
      logger?.error("mesh_notification_prefs_error", { err: String(err) });
      next(err);
    }
  };

  // ── Route registrations ─────────────────────────────────────────────────────
  router.get("/mesh/inbox",                            inboxHandler);
  router.get("/mesh/bindings",                         bindingsHandler);
  router.get("/mesh/documents/:entity/:id",            documentDetailHandler);
  router.get("/mesh/notifications/preferences",        notificationPrefsHandler);

  return router;
}

export const MESH_INBOX_ELIGIBLE_ENTITIES = MESH_ELIGIBLE_ENTITIES;
export const MESH_INBOX_PARTNER_SAFE_COLUMNS = PARTNER_SAFE_COLUMNS;
