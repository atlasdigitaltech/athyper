/**
 * Platform Commercial Control Plane Routes
 *
 * Manages the plan catalog, plan composition, tenant entitlement assignment,
 * and effective entitlement resolution. ALL routes require platform-admin authority.
 *
 * Auth: bearer + "platform-admin" Keycloak realm role on every endpoint.
 * created_by on shared global tables uses SYSTEM_PRINCIPAL_UUID
 * (those tables have no tenant_id; master.principal is tenant-scoped).
 *
 * ── Surface 1 · Plan catalog (shared.subscription_plan + control.lookup_value sync) ──
 *   GET    /api/platform/control/commerce/plans
 *   POST   /api/platform/control/commerce/plans
 *   PATCH  /api/platform/control/commerce/plans/:planCode
 *
 * ── Surface 2 · Feature catalog (shared.enterprise_feature) ──
 *   GET    /api/platform/control/commerce/features
 *   POST   /api/platform/control/commerce/features
 *   PATCH  /api/platform/control/commerce/features/:featureCode
 *
 * ── Surface 3 · Plan composition (plan × module / permission / feature) ──
 *   GET    /api/platform/control/commerce/plans/:planCode/modules
 *   PUT    /api/platform/control/commerce/plans/:planCode/modules/:moduleCode
 *   DELETE /api/platform/control/commerce/plans/:planCode/modules/:moduleCode
 *   GET    /api/platform/control/commerce/plans/:planCode/permissions
 *   PUT    /api/platform/control/commerce/plans/:planCode/permissions/:permissionCode
 *   DELETE /api/platform/control/commerce/plans/:planCode/permissions/:permissionCode
 *   GET    /api/platform/control/commerce/plans/:planCode/features
 *   PUT    /api/platform/control/commerce/plans/:planCode/features/:featureCode
 *   DELETE /api/platform/control/commerce/plans/:planCode/features/:featureCode
 *
 * ── Surface 4 · Tenant assignment ──
 *   GET    /api/platform/control/commerce/tenants/:tenantId/plan
 *   POST   /api/platform/control/commerce/tenants/:tenantId/plan
 *   PUT    /api/platform/control/commerce/tenants/:tenantId/modules/:moduleCode
 *   DELETE /api/platform/control/commerce/tenants/:tenantId/modules/:moduleCode
 *   PUT    /api/platform/control/commerce/tenants/:tenantId/features/:featureCode
 *   DELETE /api/platform/control/commerce/tenants/:tenantId/features/:featureCode
 *   PUT    /api/platform/control/commerce/tenants/:tenantId/permissions/:permissionCode/override
 *   DELETE /api/platform/control/commerce/tenants/:tenantId/permissions/:permissionCode/override
 *
 * ── Surface 5 · Effective entitlement resolution ──
 *   GET    /api/platform/control/commerce/tenants/:tenantId/entitlements/effective
 *   POST   /api/platform/control/commerce/tenants/:tenantId/entitlements/preview
 *
 * Schema notes:
 *   plan_*_access tables have no updated_at/updated_by — upsert overwrites access fields only.
 *   tenant_feature_entitlement and tenant_permission_override also have no updated_at/updated_by.
 *   Plan creation must sync code → control.lookup_value (domain: master.tenant_subscription)
 *   because master.tenant.subscription is validated by trg_tenant_subscription_lookup.
 *   lookup_value_code_fmt enforces codes to match ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";

// ─── Deps ──────────────────────────────────────────────────────────────────────

export interface CommerceRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function isPlatformAdmin(claims: Record<string, unknown>): boolean {
  const ra    = claims["realm_access"] as Record<string, unknown> | undefined;
  const roles = ra?.["roles"];
  return Array.isArray(roles) && (roles as string[]).includes("platform-admin");
}

// lookup_value_code_fmt: ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$
const LOOKUP_CODE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/** Inline admin guard — returns claims or sends 401/403 and returns null. */
async function adminGuard(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  auth: CommerceRoutesDeps["auth"],
): Promise<Record<string, unknown> | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;
  if (!isPlatformAdmin(claims)) {
    res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
    return null;
  }
  return claims;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolvePlanId(db: Kysely<any>, planCode: string): Promise<string | null> {
  const row = await db
    .selectFrom("shared.subscription_plan as sp")
    .select("sp.id" as never)
    .where("sp.code" as never, "=", planCode as never)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveModuleId(db: Kysely<any>, moduleCode: string): Promise<string | null> {
  const row = await db
    .selectFrom("shared.module as m")
    .select("m.id" as never)
    .where("m.code" as never, "=", moduleCode as never)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolvePermissionId(db: Kysely<any>, permCode: string): Promise<string | null> {
  const row = await db
    .selectFrom("shared.permission as p")
    .select("p.id" as never)
    .where("p.code" as never, "=", permCode as never)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveFeatureId(db: Kysely<any>, featureCode: string): Promise<string | null> {
  const row = await db
    .selectFrom("shared.enterprise_feature as ef")
    .select("ef.id" as never)
    .where("ef.code" as never, "=", featureCode as never)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// ─── Route factory ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCommerceRoutes(router: Router, deps: CommerceRoutesDeps): Router {
  const { db, auth, logger } = deps;
  const now = () => new Date();

  // ═══════════════════════════════════════════════════════════════════════════
  // Surface 1 — Plan catalog
  // shared.subscription_plan  +  control.lookup_value sync
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /platform/control/commerce/plans
  const listPlansHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const q      = req.query as Record<string, unknown>;
      const search = typeof q["search"] === "string" ? q["search"].trim() : "";
      const status = typeof q["status"] === "string" ? q["status"] : "active";

      let query = db
        .selectFrom("shared.subscription_plan as sp")
        .select([
          "sp.id"         as never, "sp.code"       as never,
          "sp.name"       as never, "sp.max_users"  as never,
          "sp.sort_order" as never, "sp.status"     as never,
          "sp.metadata"   as never, "sp.created_at" as never,
          "sp.updated_at" as never,
        ])
        .where("sp.status" as never, "=", status as never)
        .orderBy("sp.sort_order" as never, "asc");

      if (search) {
        query = query.where(
          sql`(sp.code ILIKE ${"%" + search + "%"} OR sp.name ILIKE ${"%" + search + "%"})` as never,
        ) as typeof query;
      }

      const rows = await query.execute();
      res.setHeader("Cache-Control", "no-store");
      res.json({ data: rows });
    } catch (err) {
      logger?.error("commerce.plans.list.error", { err: String(err) });
      next(err);
    }
  };

  // POST /platform/control/commerce/plans
  // Creates plan + upserts control.lookup_value in transaction.
  const createPlanHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;

      const body = req.body as Record<string, unknown>;
      const code = typeof body["code"] === "string" ? body["code"].trim() : "";
      const name = typeof body["name"] === "string" ? body["name"].trim() : "";
      if (!code) { res.status(400).json({ error: "MISSING_FIELD", message: "code is required" }); return; }
      if (!name) { res.status(400).json({ error: "MISSING_FIELD", message: "name is required" }); return; }
      if (!LOOKUP_CODE_RE.test(code)) {
        res.status(400).json({ error: "INVALID_CODE", message: "code must match ^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*$" });
        return;
      }

      const maxUsers    = typeof body["max_users"]  === "number" ? body["max_users"]  : null;
      const sortOrder   = typeof body["sort_order"] === "number" ? body["sort_order"] : 0;
      const description = typeof body["description"] === "string" ? body["description"] : null;
      const metadata    = typeof body["metadata"] === "object" && body["metadata"] ? body["metadata"] : {};

      const plan = await db.transaction().execute(async (trx) => {
        // Insert plan
        const row = await trx
          .insertInto("shared.subscription_plan" as never)
          .values({
            code, name,
            max_users:  maxUsers   as never,
            sort_order: sortOrder  as never,
            metadata:   metadata   as never,
            status:     "active"   as never,
            created_by: SYSTEM_PRINCIPAL_UUID as never,
          } as never)
          .returning([
            "id" as never, "code" as never, "name" as never,
            "max_users" as never, "sort_order" as never,
            "status" as never, "created_at" as never,
          ])
          .executeTakeFirstOrThrow() as Record<string, unknown>;

        // Sync to control.lookup_value so trg_tenant_subscription_lookup passes.
        // lookup_value_global_uq is a PARTIAL unique index on (domain_code, code) WHERE tenant_id IS NULL —
        // Kysely cannot reference partial indexes in onConflict, so we use raw SQL.
        await sql`
          INSERT INTO control.lookup_value
            (code, name, domain_code, description, sort_order, is_system, status, created_by)
          VALUES
            (${code}, ${name}, ${'master.tenant_subscription'}, ${description},
             ${sortOrder}, ${true}, ${'active'}, ${SYSTEM_PRINCIPAL_UUID})
          ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO NOTHING
        `.execute(trx);

        return row;
      });

      res.status(201).json({ data: plan });
    } catch (err: unknown) {
      const msg = String((err as Error).message ?? "");
      if (msg.includes("subscription_plan_code_uq")) {
        res.status(409).json({ error: "DUPLICATE_CODE", message: "A plan with this code already exists" });
        return;
      }
      logger?.error("commerce.plans.create.error", { err: msg });
      next(err);
    }
  };

  // PATCH /platform/control/commerce/plans/:planCode
  const patchPlanHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode } = req.params as Record<string, string>;
      const body = req.body as Record<string, unknown>;

      const updates: Record<string, unknown> = { updated_at: now(), updated_by: SYSTEM_PRINCIPAL_UUID };
      if (typeof body["name"]       === "string")  updates["name"]       = body["name"].trim();
      if (typeof body["max_users"]  === "number" || body["max_users"] === null) updates["max_users"] = body["max_users"];
      if (typeof body["sort_order"] === "number")  updates["sort_order"] = body["sort_order"];
      if (typeof body["status"]     === "string") {
        if (!["active", "deprecated"].includes(body["status"] as string)) {
          res.status(400).json({ error: "INVALID_STATUS", message: "status must be: active | deprecated" });
          return;
        }
        updates["status"] = body["status"];
        updates["status_changed_at"] = now();
        updates["status_changed_by"] = SYSTEM_PRINCIPAL_UUID;
      }
      if (typeof body["metadata"] === "object" && body["metadata"]) updates["metadata"] = body["metadata"];

      if (Object.keys(updates).length <= 2) {
        res.status(400).json({ error: "NO_FIELDS", message: "Provide at least one field to update" });
        return;
      }

      const plan = await db.transaction().execute(async (trx) => {
        const row = await trx
          .updateTable("shared.subscription_plan" as never)
          .set(updates as never)
          .where("code" as never, "=", planCode as never)
          .returning([
            "id" as never, "code" as never, "name" as never,
            "max_users" as never, "sort_order" as never,
            "status" as never, "updated_at" as never,
          ])
          .executeTakeFirst() as Record<string, unknown> | undefined;

        if (!row) return null;

        // Keep lookup_value in sync (name + status)
        const lvUpdates: Record<string, unknown> = { updated_at: now(), updated_by: SYSTEM_PRINCIPAL_UUID };
        if (updates["name"])   lvUpdates["name"]   = updates["name"];
        if (updates["status"]) lvUpdates["status"] = updates["status"];
        if (Object.keys(lvUpdates).length > 2) {
          await trx
            .updateTable("control.lookup_value" as never)
            .set(lvUpdates as never)
            .where("domain_code" as never, "=", "master.tenant_subscription" as never)
            .where("code" as never, "=", planCode as never)
            .where(sql`tenant_id IS NULL` as never)
            .execute();
        }

        return row;
      });

      if (!plan) { res.status(404).json({ error: "NOT_FOUND", message: `Plan '${planCode}' not found` }); return; }
      res.json({ data: plan });
    } catch (err) {
      logger?.error("commerce.plans.patch.error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Surface 2 — Feature catalog
  // shared.enterprise_feature
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /platform/control/commerce/features
  const listFeaturesHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const q      = req.query as Record<string, unknown>;
      const search = typeof q["search"] === "string" ? q["search"].trim() : "";
      const status = typeof q["status"] === "string" ? q["status"] : "active";

      let query = db
        .selectFrom("shared.enterprise_feature as ef")
        .select([
          "ef.id"         as never, "ef.code"       as never,
          "ef.name"       as never, "ef.description" as never,
          "ef.view_key"   as never, "ef.edit_key"   as never,
          "ef.sort_order" as never, "ef.status"     as never,
          "ef.metadata"   as never, "ef.created_at" as never,
          "ef.updated_at" as never,
        ])
        .where("ef.status" as never, "=", status as never)
        .orderBy("ef.sort_order" as never, "asc");

      if (search) {
        query = query.where(
          sql`(ef.code ILIKE ${"%" + search + "%"} OR ef.name ILIKE ${"%" + search + "%"})` as never,
        ) as typeof query;
      }

      const rows = await query.execute();
      res.setHeader("Cache-Control", "no-store");
      res.json({ data: rows });
    } catch (err) {
      logger?.error("commerce.features.list.error", { err: String(err) });
      next(err);
    }
  };

  // POST /platform/control/commerce/features
  const createFeatureHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const body     = req.body as Record<string, unknown>;
      const code     = typeof body["code"]      === "string" ? body["code"].trim()      : "";
      const name     = typeof body["name"]      === "string" ? body["name"].trim()      : "";
      const viewKey  = typeof body["view_key"]  === "string" ? body["view_key"].trim()  : "";
      const editKey  = typeof body["edit_key"]  === "string" ? body["edit_key"].trim()  : "";

      if (!code)    { res.status(400).json({ error: "MISSING_FIELD", message: "code is required" }); return; }
      if (!name)    { res.status(400).json({ error: "MISSING_FIELD", message: "name is required" }); return; }
      if (!viewKey) { res.status(400).json({ error: "MISSING_FIELD", message: "view_key is required" }); return; }
      if (!editKey) { res.status(400).json({ error: "MISSING_FIELD", message: "edit_key is required" }); return; }

      const description = typeof body["description"] === "string" ? body["description"] : null;
      const sortOrder   = typeof body["sort_order"]  === "number" ? body["sort_order"]  : 0;
      const metadata    = typeof body["metadata"] === "object" && body["metadata"] ? body["metadata"] : {};

      const row = await db
        .insertInto("shared.enterprise_feature" as never)
        .values({
          code, name, description: description as never,
          view_key: viewKey as never, edit_key: editKey as never,
          sort_order: sortOrder as never, metadata: metadata as never,
          status: "active" as never, created_by: SYSTEM_PRINCIPAL_UUID as never,
        } as never)
        .returning([
          "id" as never, "code" as never, "name" as never,
          "view_key" as never, "edit_key" as never,
          "sort_order" as never, "status" as never, "created_at" as never,
        ])
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: row });
    } catch (err: unknown) {
      const msg = String((err as Error).message ?? "");
      if (msg.includes("enterprise_feature_code_uq")) {
        res.status(409).json({ error: "DUPLICATE_CODE", message: "A feature with this code already exists" });
        return;
      }
      logger?.error("commerce.features.create.error", { err: msg });
      next(err);
    }
  };

  // PATCH /platform/control/commerce/features/:featureCode
  const patchFeatureHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { featureCode } = req.params as Record<string, string>;
      const body = req.body as Record<string, unknown>;

      const updates: Record<string, unknown> = { updated_at: now(), updated_by: SYSTEM_PRINCIPAL_UUID };
      if (typeof body["name"]        === "string") updates["name"]        = body["name"].trim();
      if (typeof body["description"] === "string") updates["description"] = body["description"];
      if (typeof body["view_key"]    === "string") updates["view_key"]    = body["view_key"].trim();
      if (typeof body["edit_key"]    === "string") updates["edit_key"]    = body["edit_key"].trim();
      if (typeof body["sort_order"]  === "number") updates["sort_order"]  = body["sort_order"];
      if (typeof body["metadata"] === "object" && body["metadata"]) updates["metadata"] = body["metadata"];
      if (typeof body["status"] === "string") {
        if (!["active", "deprecated"].includes(body["status"] as string)) {
          res.status(400).json({ error: "INVALID_STATUS", message: "status must be: active | deprecated" });
          return;
        }
        updates["status"] = body["status"];
        updates["status_changed_at"] = now();
        updates["status_changed_by"] = SYSTEM_PRINCIPAL_UUID;
      }

      if (Object.keys(updates).length <= 2) {
        res.status(400).json({ error: "NO_FIELDS", message: "Provide at least one field to update" });
        return;
      }

      const row = await db
        .updateTable("shared.enterprise_feature" as never)
        .set(updates as never)
        .where("code" as never, "=", featureCode as never)
        .returning([
          "id" as never, "code" as never, "name" as never,
          "view_key" as never, "edit_key" as never,
          "sort_order" as never, "status" as never, "updated_at" as never,
        ])
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND", message: `Feature '${featureCode}' not found` }); return; }
      res.json({ data: row });
    } catch (err) {
      logger?.error("commerce.features.patch.error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Surface 3 — Plan composition
  // plan × module  |  plan × permission  |  plan × feature
  // plan_*_access tables have no updated_at/updated_by — upsert overwrites only.
  // Mutex: NOT (is_included AND is_addon) enforced in API before write.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Modules ─────────────────────────────────────────────────────────────────

  // GET /platform/control/commerce/plans/:planCode/modules
  const listPlanModulesHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode } = req.params as Record<string, string>;

      const rows = await db
        .selectFrom("shared.plan_module_access as pma")
        .innerJoin("shared.module as m"            as never, "m.id"  as never, "pma.module_id" as never)
        .innerJoin("shared.subscription_plan as sp" as never, "sp.id" as never, "pma.plan_id"  as never)
        .select([
          "pma.id"                as never,
          "m.code"                as never,
          "m.name"                as never,
          "pma.is_included"       as never,
          "pma.is_addon"          as never,
          "pma.addon_price_monthly" as never,
          "pma.user_limit"        as never,
          "pma.created_at"        as never,
        ])
        .where("sp.code" as never, "=", planCode as never)
        .orderBy("m.code" as never, "asc")
        .execute();

      res.setHeader("Cache-Control", "no-store");
      res.json({ data: rows });
    } catch (err) {
      logger?.error("commerce.plan.modules.list.error", { err: String(err) });
      next(err);
    }
  };

  // PUT /platform/control/commerce/plans/:planCode/modules/:moduleCode
  const upsertPlanModuleHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode, moduleCode } = req.params as Record<string, string>;
      const body = req.body as Record<string, unknown>;

      const isIncluded = Boolean(body["is_included"]);
      const isAddon    = Boolean(body["is_addon"]);
      if (isIncluded && isAddon) {
        res.status(400).json({ error: "MUTEX_VIOLATION", message: "is_included and is_addon cannot both be true" });
        return;
      }

      const [planId, moduleId] = await Promise.all([
        resolvePlanId(db, planCode!),
        resolveModuleId(db, moduleCode!),
      ]);
      if (!planId)   { res.status(404).json({ error: "NOT_FOUND", message: `Plan '${planCode}' not found` }); return; }
      if (!moduleId) { res.status(404).json({ error: "NOT_FOUND", message: `Module '${moduleCode}' not found` }); return; }

      const addonPrice = typeof body["addon_price_monthly"] === "number" ? body["addon_price_monthly"] : null;
      const userLimit  = typeof body["user_limit"]  === "number" ? body["user_limit"]  : null;

      const row = await db
        .insertInto("shared.plan_module_access" as never)
        .values({
          plan_id:             planId     as never,
          module_id:           moduleId   as never,
          is_included:         isIncluded as never,
          is_addon:            isAddon    as never,
          addon_price_monthly: addonPrice as never,
          user_limit:          userLimit  as never,
          created_by:          SYSTEM_PRINCIPAL_UUID as never,
        } as never)
        .onConflict((oc) =>
          oc.constraint("plan_module_access_uq").doUpdateSet({
            is_included:         isIncluded as never,
            is_addon:            isAddon    as never,
            addon_price_monthly: addonPrice as never,
            user_limit:          userLimit  as never,
          } as never),
        )
        .returning([
          "id" as never, "is_included" as never, "is_addon" as never,
          "addon_price_monthly" as never, "user_limit" as never, "created_at" as never,
        ])
        .executeTakeFirstOrThrow();

      res.json({ data: { ...row as object, plan_code: planCode, module_code: moduleCode } });
    } catch (err) {
      logger?.error("commerce.plan.modules.upsert.error", { err: String(err) });
      next(err);
    }
  };

  // DELETE /platform/control/commerce/plans/:planCode/modules/:moduleCode
  const deletePlanModuleHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode, moduleCode } = req.params as Record<string, string>;

      const [planId, moduleId] = await Promise.all([
        resolvePlanId(db, planCode!),
        resolveModuleId(db, moduleCode!),
      ]);
      if (!planId || !moduleId) {
        res.status(404).json({ error: "NOT_FOUND", message: "Plan or module not found" });
        return;
      }

      const result = await db
        .deleteFrom("shared.plan_module_access" as never)
        .where("plan_id"   as never, "=", planId   as never)
        .where("module_id" as never, "=", moduleId as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!result) { res.status(404).json({ error: "NOT_FOUND", message: "No access entry for this plan/module" }); return; }
      res.json({ deleted: true, plan_code: planCode, module_code: moduleCode });
    } catch (err) {
      logger?.error("commerce.plan.modules.delete.error", { err: String(err) });
      next(err);
    }
  };

  // ── Permissions ──────────────────────────────────────────────────────────────

  // GET /platform/control/commerce/plans/:planCode/permissions
  const listPlanPermissionsHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode } = req.params as Record<string, string>;

      const rows = await db
        .selectFrom("shared.plan_permission_access as ppa")
        .innerJoin("shared.permission as p"        as never, "p.id"  as never, "ppa.permission_id" as never)
        .innerJoin("shared.subscription_plan as sp" as never, "sp.id" as never, "ppa.plan_id"       as never)
        .select([
          "ppa.id"                as never,
          "p.code"                as never,
          "p.name"                as never,
          "p.is_plan_restricted"  as never,
          "ppa.is_included"       as never,
          "ppa.is_addon"          as never,
          "ppa.addon_price_monthly" as never,
          "ppa.usage_limit"       as never,
          "ppa.created_at"        as never,
        ])
        .where("sp.code" as never, "=", planCode as never)
        .orderBy("p.sort_order" as never, "asc")
        .execute();

      res.setHeader("Cache-Control", "no-store");
      res.json({ data: rows });
    } catch (err) {
      logger?.error("commerce.plan.permissions.list.error", { err: String(err) });
      next(err);
    }
  };

  // PUT /platform/control/commerce/plans/:planCode/permissions/:permissionCode
  const upsertPlanPermissionHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode, permissionCode } = req.params as Record<string, string>;
      const body = req.body as Record<string, unknown>;

      const isIncluded = Boolean(body["is_included"]);
      const isAddon    = Boolean(body["is_addon"]);
      if (isIncluded && isAddon) {
        res.status(400).json({ error: "MUTEX_VIOLATION", message: "is_included and is_addon cannot both be true" });
        return;
      }

      const [planId, permissionId] = await Promise.all([
        resolvePlanId(db, planCode!),
        resolvePermissionId(db, permissionCode!),
      ]);
      if (!planId)       { res.status(404).json({ error: "NOT_FOUND", message: `Plan '${planCode}' not found` }); return; }
      if (!permissionId) { res.status(404).json({ error: "NOT_FOUND", message: `Permission '${permissionCode}' not found` }); return; }

      const addonPrice = typeof body["addon_price_monthly"] === "number" ? body["addon_price_monthly"] : null;
      const usageLimit = typeof body["usage_limit"] === "number" ? body["usage_limit"] : null;

      const row = await db
        .insertInto("shared.plan_permission_access" as never)
        .values({
          plan_id:             planId       as never,
          permission_id:       permissionId as never,
          is_included:         isIncluded   as never,
          is_addon:            isAddon      as never,
          addon_price_monthly: addonPrice   as never,
          usage_limit:         usageLimit   as never,
          created_by:          SYSTEM_PRINCIPAL_UUID as never,
        } as never)
        .onConflict((oc) =>
          oc.constraint("plan_permission_access_uq").doUpdateSet({
            is_included:         isIncluded as never,
            is_addon:            isAddon    as never,
            addon_price_monthly: addonPrice as never,
            usage_limit:         usageLimit as never,
          } as never),
        )
        .returning([
          "id" as never, "is_included" as never, "is_addon" as never,
          "addon_price_monthly" as never, "usage_limit" as never, "created_at" as never,
        ])
        .executeTakeFirstOrThrow();

      res.json({ data: { ...row as object, plan_code: planCode, permission_code: permissionCode } });
    } catch (err) {
      logger?.error("commerce.plan.permissions.upsert.error", { err: String(err) });
      next(err);
    }
  };

  // DELETE /platform/control/commerce/plans/:planCode/permissions/:permissionCode
  const deletePlanPermissionHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode, permissionCode } = req.params as Record<string, string>;

      const [planId, permissionId] = await Promise.all([
        resolvePlanId(db, planCode!),
        resolvePermissionId(db, permissionCode!),
      ]);
      if (!planId || !permissionId) {
        res.status(404).json({ error: "NOT_FOUND", message: "Plan or permission not found" });
        return;
      }

      const result = await db
        .deleteFrom("shared.plan_permission_access" as never)
        .where("plan_id"       as never, "=", planId       as never)
        .where("permission_id" as never, "=", permissionId as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!result) { res.status(404).json({ error: "NOT_FOUND", message: "No access entry for this plan/permission" }); return; }
      res.json({ deleted: true, plan_code: planCode, permission_code: permissionCode });
    } catch (err) {
      logger?.error("commerce.plan.permissions.delete.error", { err: String(err) });
      next(err);
    }
  };

  // ── Features ─────────────────────────────────────────────────────────────────

  // GET /platform/control/commerce/plans/:planCode/features
  const listPlanFeaturesHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode } = req.params as Record<string, string>;

      const rows = await db
        .selectFrom("shared.plan_feature_access as pfa")
        .innerJoin("shared.enterprise_feature as ef" as never, "ef.id" as never, "pfa.feature_id" as never)
        .innerJoin("shared.subscription_plan as sp"  as never, "sp.id" as never, "pfa.plan_id"    as never)
        .select([
          "pfa.id"                as never,
          "ef.code"               as never,
          "ef.name"               as never,
          "pfa.is_included"       as never,
          "pfa.is_addon"          as never,
          "pfa.addon_price_monthly" as never,
          "pfa.max_users"         as never,
          "pfa.created_at"        as never,
        ])
        .where("sp.code" as never, "=", planCode as never)
        .orderBy("ef.sort_order" as never, "asc")
        .execute();

      res.setHeader("Cache-Control", "no-store");
      res.json({ data: rows });
    } catch (err) {
      logger?.error("commerce.plan.features.list.error", { err: String(err) });
      next(err);
    }
  };

  // PUT /platform/control/commerce/plans/:planCode/features/:featureCode
  const upsertPlanFeatureHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode, featureCode } = req.params as Record<string, string>;
      const body = req.body as Record<string, unknown>;

      const isIncluded = Boolean(body["is_included"]);
      const isAddon    = Boolean(body["is_addon"]);
      if (isIncluded && isAddon) {
        res.status(400).json({ error: "MUTEX_VIOLATION", message: "is_included and is_addon cannot both be true" });
        return;
      }

      const [planId, featureId] = await Promise.all([
        resolvePlanId(db, planCode!),
        resolveFeatureId(db, featureCode!),
      ]);
      if (!planId)    { res.status(404).json({ error: "NOT_FOUND", message: `Plan '${planCode}' not found` }); return; }
      if (!featureId) { res.status(404).json({ error: "NOT_FOUND", message: `Feature '${featureCode}' not found` }); return; }

      const addonPrice = typeof body["addon_price_monthly"] === "number" ? body["addon_price_monthly"] : null;
      const maxUsers   = typeof body["max_users"]   === "number" ? body["max_users"]   : null;

      const row = await db
        .insertInto("shared.plan_feature_access" as never)
        .values({
          plan_id:             planId    as never,
          feature_id:          featureId as never,
          is_included:         isIncluded as never,
          is_addon:            isAddon    as never,
          addon_price_monthly: addonPrice as never,
          max_users:           maxUsers   as never,
          created_by:          SYSTEM_PRINCIPAL_UUID as never,
        } as never)
        .onConflict((oc) =>
          oc.constraint("plan_feature_access_uq").doUpdateSet({
            is_included:         isIncluded as never,
            is_addon:            isAddon    as never,
            addon_price_monthly: addonPrice as never,
            max_users:           maxUsers   as never,
          } as never),
        )
        .returning([
          "id" as never, "is_included" as never, "is_addon" as never,
          "addon_price_monthly" as never, "max_users" as never, "created_at" as never,
        ])
        .executeTakeFirstOrThrow();

      res.json({ data: { ...row as object, plan_code: planCode, feature_code: featureCode } });
    } catch (err) {
      logger?.error("commerce.plan.features.upsert.error", { err: String(err) });
      next(err);
    }
  };

  // DELETE /platform/control/commerce/plans/:planCode/features/:featureCode
  const deletePlanFeatureHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { planCode, featureCode } = req.params as Record<string, string>;

      const [planId, featureId] = await Promise.all([
        resolvePlanId(db, planCode!),
        resolveFeatureId(db, featureCode!),
      ]);
      if (!planId || !featureId) {
        res.status(404).json({ error: "NOT_FOUND", message: "Plan or feature not found" });
        return;
      }

      const result = await db
        .deleteFrom("shared.plan_feature_access" as never)
        .where("plan_id"    as never, "=", planId    as never)
        .where("feature_id" as never, "=", featureId as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!result) { res.status(404).json({ error: "NOT_FOUND", message: "No access entry for this plan/feature" }); return; }
      res.json({ deleted: true, plan_code: planCode, feature_code: featureCode });
    } catch (err) {
      logger?.error("commerce.plan.features.delete.error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Surface 4 — Tenant assignment
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /platform/control/commerce/tenants/:tenantId/plan
  const getTenantPlanHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const row = await db
        .selectFrom("master.tenant as t")
        .leftJoin("shared.subscription_plan as sp" as never, "sp.code" as never, "t.subscription" as never)
        .select([
          "t.id"           as never,
          "t.code"         as never,
          "t.display_name" as never,
          "t.subscription" as never,
          "sp.id"          as never,
          "sp.name"        as never,
          "sp.max_users"   as never,
          "sp.status"      as never,
        ])
        .where("t.id" as never, "=", tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND", message: "Tenant not found" }); return; }
      res.setHeader("Cache-Control", "no-store");
      res.json({ data: row });
    } catch (err) {
      logger?.error("commerce.tenant.plan.get.error", { err: String(err) });
      next(err);
    }
  };

  // POST /platform/control/commerce/tenants/:tenantId/plan
  // body: { plan_code: string }
  // Validates plan exists and is active, then updates master.tenant.subscription.
  // The trg_tenant_subscription_lookup trigger fires and validates against lookup_value —
  // guaranteed to pass because plan POST keeps both tables in sync.
  const assignTenantPlanHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const body     = req.body as Record<string, unknown>;
      const planCode = typeof body["plan_code"] === "string" ? body["plan_code"].trim() : "";
      if (!planCode) { res.status(400).json({ error: "MISSING_FIELD", message: "plan_code is required" }); return; }

      // Verify plan is active before assigning
      const plan = await db
        .selectFrom("shared.subscription_plan as sp")
        .select(["sp.id" as never, "sp.name" as never, "sp.status" as never])
        .where("sp.code"   as never, "=", planCode  as never)
        .where("sp.status" as never, "=", "active"  as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!plan) {
        res.status(404).json({ error: "PLAN_NOT_FOUND", message: `Active plan '${planCode}' not found` });
        return;
      }

      const result = await db
        .updateTable("master.tenant" as never)
        .set({ subscription: planCode as never, updated_at: now() as never, updated_by: SYSTEM_PRINCIPAL_UUID as never })
        .where("id" as never, "=", tenantId as never)
        .returning(["id" as never, "code" as never, "subscription" as never, "updated_at" as never])
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!result) { res.status(404).json({ error: "NOT_FOUND", message: "Tenant not found" }); return; }
      res.json({ data: result });
    } catch (err: unknown) {
      const msg = String((err as Error).message ?? "");
      if (msg.includes("invalid value") && msg.includes("master.tenant_subscription")) {
        // Trigger fired — lookup_value out of sync with subscription_plan
        res.status(422).json({
          error: "LOOKUP_SYNC_ERROR",
          message: "Plan code is not registered in the lookup domain. Ensure plan was created via the API.",
        });
        return;
      }
      logger?.error("commerce.tenant.plan.assign.error", { err: msg });
      next(err);
    }
  };

  // PUT /platform/control/commerce/tenants/:tenantId/modules/:moduleCode
  // body: { status: 'active'|'suspended'|'trial', expires_at?: ISO string }
  const upsertTenantModuleHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId, moduleCode } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const body   = req.body as Record<string, unknown>;
      const status = typeof body["status"] === "string" ? body["status"] : "active";
      if (!["active", "suspended", "trial"].includes(status)) {
        res.status(400).json({ error: "INVALID_STATUS", message: "status must be: active | suspended | trial" });
        return;
      }

      const moduleId = await resolveModuleId(db, moduleCode!);
      if (!moduleId) { res.status(404).json({ error: "NOT_FOUND", message: `Module '${moduleCode}' not found` }); return; }

      const expiresAt = typeof body["expires_at"] === "string" ? new Date(body["expires_at"] as string) : null;
      const metadata  = typeof body["metadata"] === "object" && body["metadata"] ? body["metadata"] : {};
      const t         = now();

      const row = await db
        .insertInto("master.tenant_module_subscription" as never)
        .values({
          tenant_id:     tenantId  as never,
          module_id:     moduleId  as never,
          status:        status    as never,
          status_at:     t         as never,
          subscribed_at: t         as never,
          expires_at:    expiresAt as never,
          metadata:      metadata  as never,
          created_by:    SYSTEM_PRINCIPAL_UUID as never,
        } as never)
        .onConflict((oc) =>
          oc.constraint("tenant_module_subscription_uq").doUpdateSet({
            status:     status    as never,
            status_at:  t         as never,
            expires_at: expiresAt as never,
            metadata:   metadata  as never,
            updated_at: t         as never,
            updated_by: SYSTEM_PRINCIPAL_UUID as never,
          } as never),
        )
        .returning([
          "id" as never, "status" as never,
          "subscribed_at" as never, "expires_at" as never, "updated_at" as never,
        ])
        .executeTakeFirstOrThrow();

      res.json({ data: { ...row as object, tenant_id: tenantId, module_code: moduleCode } });
    } catch (err) {
      logger?.error("commerce.tenant.modules.upsert.error", { err: String(err) });
      next(err);
    }
  };

  // DELETE /platform/control/commerce/tenants/:tenantId/modules/:moduleCode
  const deleteTenantModuleHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId, moduleCode } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const moduleId = await resolveModuleId(db, moduleCode!);
      if (!moduleId) { res.status(404).json({ error: "NOT_FOUND", message: `Module '${moduleCode}' not found` }); return; }

      const result = await db
        .deleteFrom("master.tenant_module_subscription" as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("module_id" as never, "=", moduleId as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!result) { res.status(404).json({ error: "NOT_FOUND", message: "Module subscription not found for this tenant" }); return; }
      res.json({ deleted: true, tenant_id: tenantId, module_code: moduleCode });
    } catch (err) {
      logger?.error("commerce.tenant.modules.delete.error", { err: String(err) });
      next(err);
    }
  };

  // PUT /platform/control/commerce/tenants/:tenantId/features/:featureCode
  // tenant_feature_entitlement has no updated_at/updated_by — upsert on UNIQUE (tenant_id, feature_id).
  const upsertTenantFeatureHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId, featureCode } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const body   = req.body as Record<string, unknown>;
      const status = typeof body["status"] === "string" ? body["status"] : "active";
      if (!["active", "suspended", "trial"].includes(status)) {
        res.status(400).json({ error: "INVALID_STATUS", message: "status must be: active | suspended | trial" });
        return;
      }

      const featureId = await resolveFeatureId(db, featureCode!);
      if (!featureId) { res.status(404).json({ error: "NOT_FOUND", message: `Feature '${featureCode}' not found` }); return; }

      const expiresAt   = typeof body["expires_at"] === "string" ? new Date(body["expires_at"] as string) : null;
      const metadata    = typeof body["metadata"] === "object" && body["metadata"] ? body["metadata"] : {};
      const t           = now();

      const row = await db
        .insertInto("master.tenant_feature_entitlement" as never)
        .values({
          tenant_id:    tenantId  as never,
          feature_id:   featureId as never,
          status:       status    as never,
          activated_at: t         as never,
          expires_at:   expiresAt as never,
          activated_by: SYSTEM_PRINCIPAL_UUID as never,
          metadata:     metadata  as never,
          created_by:   SYSTEM_PRINCIPAL_UUID as never,
        } as never)
        .onConflict((oc) =>
          oc.constraint("tenant_feature_entitlement_uq").doUpdateSet({
            status:       status    as never,
            expires_at:   expiresAt as never,
            activated_by: SYSTEM_PRINCIPAL_UUID as never,
            metadata:     metadata  as never,
          } as never),
        )
        .returning([
          "id" as never, "status" as never,
          "activated_at" as never, "expires_at" as never,
        ])
        .executeTakeFirstOrThrow();

      res.json({ data: { ...row as object, tenant_id: tenantId, feature_code: featureCode } });
    } catch (err) {
      logger?.error("commerce.tenant.features.upsert.error", { err: String(err) });
      next(err);
    }
  };

  // DELETE /platform/control/commerce/tenants/:tenantId/features/:featureCode
  const deleteTenantFeatureHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId, featureCode } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const featureId = await resolveFeatureId(db, featureCode!);
      if (!featureId) { res.status(404).json({ error: "NOT_FOUND", message: `Feature '${featureCode}' not found` }); return; }

      const result = await db
        .deleteFrom("master.tenant_feature_entitlement" as never)
        .where("tenant_id"  as never, "=", tenantId  as never)
        .where("feature_id" as never, "=", featureId as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!result) { res.status(404).json({ error: "NOT_FOUND", message: "Feature entitlement not found for this tenant" }); return; }
      res.json({ deleted: true, tenant_id: tenantId, feature_code: featureCode });
    } catch (err) {
      logger?.error("commerce.tenant.features.delete.error", { err: String(err) });
      next(err);
    }
  };

  // PUT /platform/control/commerce/tenants/:tenantId/permissions/:permissionCode/override
  // tenant_permission_override has no updated_at/updated_by.
  // Only plan-restricted permissions need overrides, but the API accepts any permission.
  const upsertPermissionOverrideHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId, permissionCode } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const body        = req.body as Record<string, unknown>;
      const isGranted   = typeof body["is_granted"] === "boolean" ? body["is_granted"] : true;
      const reason      = typeof body["reason"]     === "string"  ? body["reason"]     : null;
      const expiresAt   = typeof body["expires_at"] === "string"  ? new Date(body["expires_at"] as string) : null;
      const metadata    = typeof body["metadata"] === "object" && body["metadata"] ? body["metadata"] : {};

      const permissionId = await resolvePermissionId(db, permissionCode!);
      if (!permissionId) { res.status(404).json({ error: "NOT_FOUND", message: `Permission '${permissionCode}' not found` }); return; }

      const row = await db
        .insertInto("master.tenant_permission_override" as never)
        .values({
          tenant_id:     tenantId     as never,
          permission_id: permissionId as never,
          is_granted:    isGranted    as never,
          reason:        reason       as never,
          expires_at:    expiresAt    as never,
          granted_by:    SYSTEM_PRINCIPAL_UUID as never,
          metadata:      metadata     as never,
          created_by:    SYSTEM_PRINCIPAL_UUID as never,
        } as never)
        .onConflict((oc) =>
          oc.constraint("tenant_permission_override_uq").doUpdateSet({
            is_granted: isGranted  as never,
            reason:     reason     as never,
            expires_at: expiresAt  as never,
            granted_by: SYSTEM_PRINCIPAL_UUID as never,
            metadata:   metadata   as never,
          } as never),
        )
        .returning([
          "id" as never, "is_granted" as never,
          "reason" as never, "expires_at" as never, "created_at" as never,
        ])
        .executeTakeFirstOrThrow();

      res.json({ data: { ...row as object, tenant_id: tenantId, permission_code: permissionCode } });
    } catch (err) {
      logger?.error("commerce.tenant.permissions.upsert.error", { err: String(err) });
      next(err);
    }
  };

  // DELETE /platform/control/commerce/tenants/:tenantId/permissions/:permissionCode/override
  const deletePermissionOverrideHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId, permissionCode } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const permissionId = await resolvePermissionId(db, permissionCode!);
      if (!permissionId) { res.status(404).json({ error: "NOT_FOUND", message: `Permission '${permissionCode}' not found` }); return; }

      const result = await db
        .deleteFrom("master.tenant_permission_override" as never)
        .where("tenant_id"     as never, "=", tenantId     as never)
        .where("permission_id" as never, "=", permissionId as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!result) { res.status(404).json({ error: "NOT_FOUND", message: "Permission override not found for this tenant" }); return; }
      res.json({ deleted: true, tenant_id: tenantId, permission_code: permissionCode });
    } catch (err) {
      logger?.error("commerce.tenant.permissions.delete.error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Surface 5 — Effective entitlement resolution
  //
  // Effective rules (derived from table contracts + check_permission() function):
  //
  //   Module   : plan includes it  OR  tenant has active subscription
  //   Feature  : (plan includes it AND tenant has no suspension)
  //              OR (plan offers as addon AND tenant has active entitlement)
  //   Permission (plan-restricted only):
  //              plan_permission_access.is_included = true
  //              OR tenant_permission_override.is_granted = true (not expired)
  // ═══════════════════════════════════════════════════════════════════════════

  async function resolveEntitlements(
    tenantId: string,
    planCode: string,
  ): Promise<{
    plan:        Record<string, unknown> | null;
    modules:     unknown[];
    features:    unknown[];
    permissions: unknown[];
  }> {
    // Resolve plan id
    const planRow = await db
      .selectFrom("shared.subscription_plan as sp")
      .select(["sp.id" as never, "sp.code" as never, "sp.name" as never, "sp.max_users" as never])
      .where("sp.code" as never, "=", planCode as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!planRow) return { plan: null, modules: [], features: [], permissions: [] };
    const planId = planRow["id"] as string;

    const [modules, features, permissions] = await Promise.all([
      // Modules: all modules with LEFT JOIN to plan access and tenant subscription
      db
        .selectFrom("shared.module as m")
        .leftJoin("shared.plan_module_access as pma" as never, (join: never) =>
          (join as any)
            .onRef("pma.module_id", "=", "m.id")
            .on("pma.plan_id" as never, "=", planId as never),
        )
        .leftJoin("master.tenant_module_subscription as tms" as never, (join: never) =>
          (join as any)
            .onRef("tms.module_id", "=", "m.id")
            .on("tms.tenant_id" as never, "=", tenantId as never),
        )
        .select([
          "m.id"                    as never,
          "m.code"                  as never,
          "m.name"                  as never,
          "pma.is_included"         as never,
          "pma.is_addon"            as never,
          "pma.addon_price_monthly" as never,
          "pma.user_limit"          as never,
          "tms.status"              as never,
          "tms.expires_at"          as never,
          sql<boolean>`(
            COALESCE(pma.is_included, false) = true
            OR tms.status = 'active'
          )`.as("is_effective"),
        ])
        .where("m.status" as never, "=", "active" as never)
        .orderBy("m.code" as never, "asc")
        .execute(),

      // Features: active features with plan access and tenant entitlement
      db
        .selectFrom("shared.enterprise_feature as ef")
        .leftJoin("shared.plan_feature_access as pfa" as never, (join: never) =>
          (join as any)
            .onRef("pfa.feature_id", "=", "ef.id")
            .on("pfa.plan_id" as never, "=", planId as never),
        )
        .leftJoin("master.tenant_feature_entitlement as tfe" as never, (join: never) =>
          (join as any)
            .onRef("tfe.feature_id", "=", "ef.id")
            .on("tfe.tenant_id" as never, "=", tenantId as never),
        )
        .select([
          "ef.id"                   as never,
          "ef.code"                 as never,
          "ef.name"                 as never,
          "pfa.is_included"         as never,
          "pfa.is_addon"            as never,
          "pfa.addon_price_monthly" as never,
          "pfa.max_users"           as never,
          "tfe.status"              as never,
          "tfe.expires_at"          as never,
          sql<boolean>`(
            (COALESCE(pfa.is_included, false) = true
              AND (tfe.id IS NULL OR tfe.status = 'active'))
            OR
            (COALESCE(pfa.is_addon, false) = true
              AND tfe.status = 'active'
              AND (tfe.expires_at IS NULL OR tfe.expires_at > now()))
          )`.as("is_effective"),
        ])
        .where("ef.is_active" as never, "=", true as never)
        .orderBy("ef.sort_order" as never, "asc")
        .execute(),

      // Plan-restricted permissions only
      db
        .selectFrom("shared.permission as p")
        .leftJoin("shared.plan_permission_access as ppa" as never, (join: never) =>
          (join as any)
            .onRef("ppa.permission_id", "=", "p.id")
            .on("ppa.plan_id" as never, "=", planId as never),
        )
        .leftJoin("master.tenant_permission_override as tpo" as never, (join: never) =>
          (join as any)
            .onRef("tpo.permission_id", "=", "p.id")
            .on("tpo.tenant_id" as never, "=", tenantId as never),
        )
        .select([
          "p.id"                    as never,
          "p.code"                  as never,
          "p.name"                  as never,
          "ppa.is_included"         as never,
          "ppa.is_addon"            as never,
          "ppa.addon_price_monthly" as never,
          "ppa.usage_limit"         as never,
          "tpo.is_granted"          as never,
          "tpo.reason"              as never,
          "tpo.expires_at"          as never,
          sql<boolean>`(
            COALESCE(ppa.is_included, false) = true
            OR (
              tpo.is_granted = true
              AND (tpo.expires_at IS NULL OR tpo.expires_at > now())
            )
          )`.as("is_effective"),
        ])
        .where("p.is_plan_restricted" as never, "=", true as never)
        .where("p.is_active"          as never, "=", true as never)
        .orderBy("p.sort_order" as never, "asc")
        .execute(),
    ]);

    return { plan: planRow, modules, features, permissions };
  }

  // GET /platform/control/commerce/tenants/:tenantId/entitlements/effective
  const effectiveEntitlementsHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      // Read tenant's current plan code
      const tenant = await db
        .selectFrom("master.tenant as t")
        .select(["t.id" as never, "t.code" as never, "t.subscription" as never])
        .where("t.id" as never, "=", tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!tenant) { res.status(404).json({ error: "NOT_FOUND", message: "Tenant not found" }); return; }

      const result = await resolveEntitlements(tenantId, tenant["subscription"] as string);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        data: {
          tenant_id:   tenantId,
          plan_code:   tenant["subscription"],
          plan:        result.plan,
          modules:     result.modules,
          features:    result.features,
          permissions: result.permissions,
        },
      });
    } catch (err) {
      logger?.error("commerce.entitlements.effective.error", { err: String(err) });
      next(err);
    }
  };

  // POST /platform/control/commerce/tenants/:tenantId/entitlements/preview
  // body: { plan_code: string }
  // Computes effective entitlements as-if the tenant were on the given plan.
  // Does NOT modify master.tenant — read-only preview.
  const previewEntitlementsHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await adminGuard(req, res, auth)) return;
      const { tenantId } = req.params as Record<string, string>;
      if (!isUuid(tenantId!)) { res.status(400).json({ error: "INVALID_TENANT_ID", message: "tenantId must be a UUID" }); return; }

      const body     = req.body as Record<string, unknown>;
      const planCode = typeof body["plan_code"] === "string" ? body["plan_code"].trim() : "";
      if (!planCode) { res.status(400).json({ error: "MISSING_FIELD", message: "plan_code is required" }); return; }

      // Verify tenant exists
      const tenant = await db
        .selectFrom("master.tenant as t")
        .select(["t.id" as never, "t.subscription" as never])
        .where("t.id" as never, "=", tenantId as never)
        .executeTakeFirst() as { id: string; subscription: string } | undefined;

      if (!tenant) { res.status(404).json({ error: "NOT_FOUND", message: "Tenant not found" }); return; }

      const result = await resolveEntitlements(tenantId, planCode);
      if (!result.plan) {
        res.status(404).json({ error: "PLAN_NOT_FOUND", message: `Plan '${planCode}' not found` });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({
        data: {
          tenant_id:        tenantId,
          current_plan:     tenant.subscription,
          preview_plan:     planCode,
          plan:             result.plan,
          modules:          result.modules,
          features:         result.features,
          permissions:      result.permissions,
        },
      });
    } catch (err) {
      logger?.error("commerce.entitlements.preview.error", { err: String(err) });
      next(err);
    }
  };

  // ── Route registrations ────────────────────────────────────────────────────

  // Surface 1: Plan catalog
  router.get(   "/platform/control/commerce/plans",                  listPlansHandler);
  router.post(  "/platform/control/commerce/plans",                  createPlanHandler);
  router.patch( "/platform/control/commerce/plans/:planCode",        patchPlanHandler);

  // Surface 2: Feature catalog
  router.get(   "/platform/control/commerce/features",               listFeaturesHandler);
  router.post(  "/platform/control/commerce/features",               createFeatureHandler);
  router.patch( "/platform/control/commerce/features/:featureCode",  patchFeatureHandler);

  // Surface 3: Plan composition
  router.get(   "/platform/control/commerce/plans/:planCode/modules",                              listPlanModulesHandler);
  router.put(   "/platform/control/commerce/plans/:planCode/modules/:moduleCode",                  upsertPlanModuleHandler);
  router.delete("/platform/control/commerce/plans/:planCode/modules/:moduleCode",                  deletePlanModuleHandler);
  router.get(   "/platform/control/commerce/plans/:planCode/permissions",                          listPlanPermissionsHandler);
  router.put(   "/platform/control/commerce/plans/:planCode/permissions/:permissionCode",          upsertPlanPermissionHandler);
  router.delete("/platform/control/commerce/plans/:planCode/permissions/:permissionCode",          deletePlanPermissionHandler);
  router.get(   "/platform/control/commerce/plans/:planCode/features",                             listPlanFeaturesHandler);
  router.put(   "/platform/control/commerce/plans/:planCode/features/:featureCode",               upsertPlanFeatureHandler);
  router.delete("/platform/control/commerce/plans/:planCode/features/:featureCode",               deletePlanFeatureHandler);

  // Surface 4: Tenant assignment
  router.get(   "/platform/control/commerce/tenants/:tenantId/plan",                               getTenantPlanHandler);
  router.post(  "/platform/control/commerce/tenants/:tenantId/plan",                               assignTenantPlanHandler);
  router.put(   "/platform/control/commerce/tenants/:tenantId/modules/:moduleCode",                upsertTenantModuleHandler);
  router.delete("/platform/control/commerce/tenants/:tenantId/modules/:moduleCode",                deleteTenantModuleHandler);
  router.put(   "/platform/control/commerce/tenants/:tenantId/features/:featureCode",              upsertTenantFeatureHandler);
  router.delete("/platform/control/commerce/tenants/:tenantId/features/:featureCode",              deleteTenantFeatureHandler);
  router.put(   "/platform/control/commerce/tenants/:tenantId/permissions/:permissionCode/override", upsertPermissionOverrideHandler);
  router.delete("/platform/control/commerce/tenants/:tenantId/permissions/:permissionCode/override", deletePermissionOverrideHandler);

  // Surface 5: Effective entitlement resolution
  router.get(  "/platform/control/commerce/tenants/:tenantId/entitlements/effective", effectiveEntitlementsHandler);
  router.post( "/platform/control/commerce/tenants/:tenantId/entitlements/preview",  previewEntitlementsHandler);

  return router;
}
