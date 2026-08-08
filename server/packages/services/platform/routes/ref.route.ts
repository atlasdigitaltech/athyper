/**
 * Platform Reference Data Routes
 *
 * Exposes shared.* ISO/code-list reference tables as read-only REST endpoints.
 *
 * Auth tiers
 * ──────────
 *   general — any valid bearer:
 *     currencies, countries, state-regions, languages, locales, timezones, uom
 *   admin   — bearer + "platform-admin" Keycloak realm role:
 *     workspaces, modules, permission-categories, permissions, roles
 *
 * Final URLs (apiRouter mounted at /api):
 *   GET /api/platform/ref/currencies
 *   GET /api/platform/ref/countries
 *   GET /api/platform/ref/state-regions
 *   GET /api/platform/ref/languages
 *   GET /api/platform/ref/locales
 *   GET /api/platform/ref/timezones
 *   GET /api/platform/ref/uom
 *   GET /api/platform/ref/workspaces            [admin]
 *   GET /api/platform/ref/modules               [admin]
 *   GET /api/platform/ref/permission-categories [admin]
 *   GET /api/platform/ref/permissions           [admin]
 *   GET /api/platform/ref/roles                 [admin]
 *
 * Common query params (all endpoints):
 *   ?search=<term>            case-insensitive partial match on key columns
 *   ?status=<value>           explicit status filter (table-specific valid values)
 *   ?active=true|false        convenience alias; ?active=true ≡ ?status=active
 *   ?page=<n>&limit=<n>       pagination; defaults page=1, limit=50, max limit=200
 *
 * Response envelope:
 *   { data: T[], meta: { total: number, page: number, limit: number, pages: number } }
 *
 * Deferred (not in this file):
 *   shared.commodity_code / shared.industry_code — hierarchical trees, need dedicated API
 *   shared.enterprise_feature / shared.subscription_plan / shared.plan_*_access — control-plane
 */

import { createHash } from "node:crypto";
import type { Request, RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import busboy from "busboy";
import { appendPlatformAuditEvent } from "@athyper/svc-audit";
import {
  verifyBearer,
  extractOrgHeaders,
  parsePagination,
  parseSearch,
  resolveTenantId,
  setCachePrivate,
} from "@athyper/svc-shared";
import {
  requirePlatformPermission,
  requireCatalogWritable,
} from "../platform-guard.js";

// ─── Deps ──────────────────────────────────────────────────────────────────────

export interface RefRoutesDeps {
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

/** Returns true when the bearer claims include the platform-admin KC realm role. */
function isPlatformAdmin(claims: Record<string, unknown>): boolean {
  const ra = claims["realm_access"] as Record<string, unknown> | undefined;
  const roles = ra?.["roles"];
  return Array.isArray(roles) && (roles as string[]).includes("platform-admin");
}

type StatusFilter =
  | { mode: "eq";  value: string }
  | { mode: "neq"; value: string };

/**
 * Resolves the effective status filter from ?status= and ?active=.
 *   ?active=false            → status != 'active'  (returns deprecated / suspended rows)
 *   ?status=<value>          → status = <value>
 *   (nothing)                → status = 'active'   (picker default)
 */
function resolveStatusFilter(query: Record<string, unknown>): StatusFilter {
  const active = typeof query["active"] === "string" ? query["active"] : undefined;
  const status = typeof query["status"] === "string" ? query["status"] : undefined;
  if (active === "false")  return { mode: "neq", value: "active" };
  if (status)              return { mode: "eq",  value: status };
  return                          { mode: "eq",  value: "active" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyStatus<T extends { where: (...args: any[]) => any }>(
  query: T,
  sf: StatusFilter,
  col: string,
): T {
  return (sf.mode === "eq"
    ? query.where(col, "=",  sf.value)
    : query.where(col, "!=", sf.value)) as T;
}

/** Standard paginated response. */
function refResponse<T>(
  res: Parameters<RequestHandler>[1],
  rows: T[],
  total: number,
  page: number,
  limit: number,
): void {
  setCachePrivate(res);
  res.json({
    data: rows,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function registerRefRoutes(router: Router, deps: RefRoutesDeps): Router {
  const { db, auth, logger } = deps;

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL TIER — any valid bearer
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /platform/ref/currencies ────────────────────────────────────────────
  // shared.currency — ISO 4217; ?search= (name, code)

  const listCurrenciesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);

      let base = db.selectFrom("shared.currency as c");
      if (search) {
        base = base.where((eb) => eb.or([
          eb("c.name" as never, "ilike", `%${search}%` as never),
          eb("c.code" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "c.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["c.id", "c.code", "c.name", "c.symbol", "c.minor_units", "c.numeric3", "c.status"] as never[])
          .orderBy("c.code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_currencies_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/currencies", listCurrenciesHandler);

  // ── GET /platform/ref/countries ─────────────────────────────────────────────
  // shared.country — ISO 3166-1; ?search= (name, code, code3)

  const listCountriesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);

      let base = db.selectFrom("shared.country as c");
      if (search) {
        base = base.where((eb) => eb.or([
          eb("c.name"  as never, "ilike", `%${search}%` as never),
          eb("c.code"  as never, "ilike", `%${search}%` as never),
          eb("c.code3" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "c.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select([
            "c.id", "c.code", "c.name", "c.code3",
            "c.region", "c.subregion",
            "c.calling_code", "c.has_postal_codes",
            "c.postal_code_label", "c.postal_code_example",
            "c.region_label", "c.address_format",
            "c.status",
          ] as never[])
          .orderBy("c.name" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_countries_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/countries", listCountriesHandler);

  // ── GET /platform/ref/state-regions ─────────────────────────────────────────
  // shared.state_region — ISO 3166-2; ?country= (required), ?search= (name, code)

  const listStateRegionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);
      const countryCode = typeof q["country"] === "string" ? q["country"].toUpperCase() : "";

      // Safe empty response when country not provided — picker may not be initialised yet
      if (!countryCode) {
        setCachePrivate(res);
        res.json({ data: [], meta: { total: 0, page: 1, limit, pages: 0 } });
        return;
      }

      let base = db
        .selectFrom("shared.state_region as sr")
        .where("sr.country_code" as never, "=", countryCode as never);

      if (search) {
        base = base.where((eb) => eb.or([
          eb("sr.name" as never, "ilike", `%${search}%` as never),
          eb("sr.code" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "sr.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["sr.id", "sr.code", "sr.name", "sr.country_code", "sr.category", "sr.parent_code", "sr.status"] as never[])
          .orderBy("sr.name" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_state_regions_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/state-regions", listStateRegionsHandler);

  // ── GET /platform/ref/languages ─────────────────────────────────────────────
  // shared.language — ISO 639; ?search= (name, code, native_name)

  const listLanguagesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);

      let base = db.selectFrom("shared.language as l");
      if (search) {
        base = base.where((eb) => eb.or([
          eb("l.name"        as never, "ilike", `%${search}%` as never),
          eb("l.code"        as never, "ilike", `%${search}%` as never),
          eb("l.native_name" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "l.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["l.id", "l.code", "l.name", "l.native_name", "l.iso639_2", "l.direction", "l.status"] as never[])
          .orderBy("l.name" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_languages_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/languages", listLanguagesHandler);

  // ── GET /platform/ref/locales ────────────────────────────────────────────────
  // shared.locale — BCP 47; ?search= (name, code), ?language= (language_code)

  const listLocalesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);
      const languageCode = typeof q["language"] === "string" ? q["language"].trim() : "";

      let base = db.selectFrom("shared.locale as l");
      if (languageCode) {
        base = base.where("l.language_code" as never, "=", languageCode as never) as typeof base;
      }
      if (search) {
        base = base.where((eb) => eb.or([
          eb("l.name" as never, "ilike", `%${search}%` as never),
          eb("l.code" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "l.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["l.id", "l.code", "l.name", "l.language_code", "l.country_code", "l.script", "l.direction", "l.status"] as never[])
          .orderBy("l.code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_locales_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/locales", listLocalesHandler);

  // ── GET /platform/ref/timezones ──────────────────────────────────────────────
  // shared.timezone — IANA; ?search= (code, name), ?canonical_only=true

  const listTimezonesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);
      const canonicalOnly = q["canonical_only"] === "true";

      let base = db.selectFrom("shared.timezone as tz");
      if (canonicalOnly) {
        base = base.where("tz.is_alias" as never, "=", false as never) as typeof base;
      }
      if (search) {
        base = base.where((eb) => eb.or([
          eb("tz.code" as never, "ilike", `%${search}%` as never),
          eb("tz.name" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "tz.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["tz.id", "tz.code", "tz.name", "tz.utc_offset_minutes", "tz.is_alias", "tz.canonical_code", "tz.status"] as never[])
          .orderBy("tz.code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_timezones_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/timezones", listTimezonesHandler);

  // ── GET /platform/ref/uom ────────────────────────────────────────────────────
  // shared.uom — UN/ECE Rec 20; ?search= (code, name, symbol), ?quantity_type=

  const listUomHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);
      const quantityType = typeof q["quantity_type"] === "string" ? q["quantity_type"].trim() : "";

      let base = db.selectFrom("shared.uom as u");
      if (quantityType) {
        base = base.where("u.quantity_type" as never, "=", quantityType as never) as typeof base;
      }
      if (search) {
        base = base.where((eb) => eb.or([
          eb("u.code"   as never, "ilike", `%${search}%` as never),
          eb("u.name"   as never, "ilike", `%${search}%` as never),
          eb("u.symbol" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "u.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["u.id", "u.code", "u.name", "u.symbol", "u.quantity_type", "u.status"] as never[])
          .orderBy("u.code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_uom_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/uom", listUomHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN TIER — bearer + platform-admin Keycloak realm role
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /platform/ref/workspaces ─────────────────────────────────────────────
  // control.workspace; no search (small, stable set)

  const listWorkspacesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);

      let base = db.selectFrom("control.workspace as w");
      base = applyStatus(base, sf, "w.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["w.id", "w.code", "w.name", "w.description", "w.sort_order", "w.status"] as never[])
          .orderBy("w.sort_order" as never, "asc")
          .orderBy("w.code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_workspaces_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/workspaces", listWorkspacesHandler);

  // ── GET /platform/ref/modules ────────────────────────────────────────────────
  // control.module; ?workspace_id= (UUID filter)

  const listModulesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);
      const workspaceId = typeof q["workspace_id"] === "string" ? q["workspace_id"].trim() : "";

      let base = db.selectFrom("control.module as m");
      if (workspaceId) {
        base = base.where("m.workspace_id" as never, "=", workspaceId as never) as typeof base;
      }
      base = applyStatus(base, sf, "m.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["m.id", "m.code", "m.name", "m.description", "m.workspace_id", "m.status"] as never[])
          .orderBy("m.code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_modules_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/modules", listModulesHandler);

  // ── Canonical role catalog endpoint ───────────────────────────────────────────────
  // Canonical roles; ?search= (code, name)
  // scope_mode, priority, is_system included — structural fields for RBAC introspection

  const obsoleteRoleCatalogHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);

      let base = db.selectFrom("master.auth_role as p");
      if (search) {
        base = base.where((eb) => eb.or([
          eb("p.code" as never, "ilike", `%${search}%` as never),
          eb("p.name" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "p.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["p.id", "p.code", "p.name", "p.description", "p.plane_code", "p.version_no", "p.status"] as never[])
          .orderBy("p.name" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("obsolete_role_catalog_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/obsolete-role-catalog", obsoleteRoleCatalogHandler);

  // ── GET /platform/ref/permission-categories ──────────────────────────────────
  // shared.permission_category; small stable set, no search

  const listPermissionCategoriesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);

      let base = db.selectFrom("shared.auth_permission_category as pc");
      base = applyStatus(base, sf, "pc.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["pc.id", "pc.code", "pc.name", "pc.sort_order", "pc.status"] as never[])
          .orderBy("pc.sort_order" as never, "asc")
          .orderBy("pc.code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_permission_categories_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/permission-categories", listPermissionCategoriesHandler);

  // ── GET /platform/ref/permissions ────────────────────────────────────────────
  // shared.permission; ?search= (code, name), ?category_code=, ?category_id=
  // scope_type, risk_level, is_plan_restricted, sort_order included — structural

  const listPermissionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);
      const categoryCode = typeof q["category_code"] === "string" ? q["category_code"].trim() : "";
      const categoryId   = typeof q["category_id"]   === "string" ? q["category_id"].trim()   : "";

      let base = db.selectFrom("control.auth_permission as p");

      // category_code takes precedence; resolve to category_id via subquery
      if (categoryCode) {
        base = base.where(
          "p.category_id" as never,
          "=",
          (eb: { selectFrom: (t: string) => any }) =>
            eb.selectFrom("shared.auth_permission_category as pc")
              .select("pc.id" as never)
              .where("pc.code" as never, "=", categoryCode as never),
        ) as typeof base;
      } else if (categoryId) {
        base = base.where("p.category_id" as never, "=", categoryId as never) as typeof base;
      }

      if (search) {
        base = base.where((eb) => eb.or([
          eb("p.canonical_code" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "p.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select([
            "p.id", "p.canonical_code as code", "p.category_id",
            "p.risk_tier as risk_level", "p.metadata", "p.status",
          ] as never[])
          .orderBy("p.category_id" as never, "asc")
          .orderBy("p.canonical_code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_permissions_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/permissions", listPermissionsHandler);

  // ── GET /platform/ref/roles ──────────────────────────────────────────────────
  // Canonical platform role catalog
  // ?search= (code, name, kc_role_code), ?module_id=, ?workspace_id=
  // status: active | suspended | deprecated  (3-value — different from ref_status_d)
  // module_id, workspace_id, kc_role_code included — structural RBAC fields

  const listRolesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);
      let base = db.selectFrom("master.auth_role as r");
      if (search) {
        base = base.where((eb) => eb.or([
          eb("r.code"         as never, "ilike", `%${search}%` as never),
          eb("r.name"         as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      // shared.role.status is text IN ('active','suspended','deprecated') — not ref_status_d
      base = applyStatus(base, sf, "r.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["r.id", "r.code", "r.name", "r.description", "r.plane_code", "r.version_no", "r.status"] as never[])
          .orderBy("r.code" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_roles_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/roles", listRolesHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMODITY CODES — shared.commodity_code (hierarchical, domain-scoped)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /platform/ref/commodity-codes ───────────────────────────────────────
  // Returns root nodes (level_no = 1) for the given ?domain= (e.g. unspsc, hs).
  // ?domain= is required; without it returns empty.

  const listCommodityRootsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q      = req.query as Record<string, unknown>;
      const domain = typeof q["domain"] === "string" ? q["domain"].trim().toLowerCase() : "";
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);

      if (!domain) {
        setCachePrivate(res);
        res.json({ data: [], meta: { total: 0, page: 1, limit, pages: 0 } });
        return;
      }

      let base = db
        .selectFrom("shared.commodity_code as c")
        .where("c.domain_code" as never, "=", domain as never)
        .where("c.level_no"    as never, "=", 1 as never);
      base = applyStatus(base, sf, "c.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["c.id", "c.code", "c.name", "c.domain_code", "c.parent_code", "c.level_no", "c.is_leaf", "c.status"] as never[])
          .orderBy("c.code" as never, "asc")
          .limit(limit).offset(offset).execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_commodity_roots_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/commodity-codes", listCommodityRootsHandler);

  // ── GET /platform/ref/commodity-codes/:code/children ────────────────────────
  // Returns direct children of a node within the same ?domain=.

  const listCommodityChildrenHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q          = req.query as Record<string, unknown>;
      const parentCode = (req.params["code"] as string ?? "").trim();
      const domain     = typeof q["domain"] === "string" ? q["domain"].trim().toLowerCase() : "";
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);

      if (!domain || !parentCode) {
        setCachePrivate(res);
        res.json({ data: [], meta: { total: 0, page: 1, limit, pages: 0 } });
        return;
      }

      let base = db
        .selectFrom("shared.commodity_code as c")
        .where("c.domain_code"  as never, "=", domain as never)
        .where("c.parent_code"  as never, "=", parentCode as never);
      base = applyStatus(base, sf, "c.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["c.id", "c.code", "c.name", "c.domain_code", "c.parent_code", "c.level_no", "c.is_leaf", "c.status"] as never[])
          .orderBy("c.code" as never, "asc")
          .limit(limit).offset(offset).execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_commodity_children_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/commodity-codes/:code/children", listCommodityChildrenHandler);

  // ── GET /platform/ref/commodity-codes/search ────────────────────────────────
  // Full-text search across code, name, description, and keywords[].
  // ?q= required; ?domain= optional (restricts to one classification system).
  // Each result includes parent_code and level_no so UI can build breadcrumbs.

  const searchCommodityCodesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q      = req.query as Record<string, unknown>;
      const term   = typeof q["q"] === "string" ? q["q"].trim() : "";
      const domain = typeof q["domain"] === "string" ? q["domain"].trim().toLowerCase() : "";
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);

      if (!term) {
        setCachePrivate(res);
        res.json({ data: [], meta: { total: 0, page: 1, limit, pages: 0 } });
        return;
      }

      let base = db.selectFrom("shared.commodity_code as c");
      if (domain) {
        base = base.where("c.domain_code" as never, "=", domain as never) as typeof base;
      }
      base = base.where((eb) => eb.or([
        eb("c.code"        as never, "ilike", `${term}%` as never),
        eb("c.name"        as never, "ilike", `%${term}%` as never),
        eb("c.description" as never, "ilike", `%${term}%` as never),
        sql<boolean>`array_to_string(${sql.ref("c.keywords")}, ' ') ilike ${"%" + term + "%"}` as never,
      ])) as typeof base;
      base = applyStatus(base, sf, "c.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["c.id", "c.code", "c.name", "c.domain_code", "c.parent_code", "c.level_no", "c.is_leaf", "c.status"] as never[])
          .orderBy("c.level_no" as never, "asc")
          .orderBy("c.code"     as never, "asc")
          .limit(limit).offset(offset).execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_commodity_search_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/commodity-codes/search", searchCommodityCodesHandler);

  // Commodity crosswalk reads moved to /api/platform/taxonomy/:family/crosswalks/*
  // (taxonomy.route.ts) which uses the correct DDL column names:
  // source_domain_code / source_code / target_domain_code / target_code.

  // ═══════════════════════════════════════════════════════════════════════════
  // INDUSTRY CODES — shared.industry_code (hierarchical, domain-scoped)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /platform/ref/industry-codes ────────────────────────────────────────

  const listIndustryRootsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q      = req.query as Record<string, unknown>;
      const domain = typeof q["domain"] === "string" ? q["domain"].trim().toLowerCase() : "";
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);

      if (!domain) {
        setCachePrivate(res);
        res.json({ data: [], meta: { total: 0, page: 1, limit, pages: 0 } });
        return;
      }

      let base = db
        .selectFrom("shared.industry_code as i")
        .where("i.domain_code" as never, "=", domain as never)
        .where("i.level_no"    as never, "=", 1 as never);
      base = applyStatus(base, sf, "i.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["i.id", "i.code", "i.name", "i.domain_code", "i.parent_code", "i.level_no", "i.is_leaf", "i.status"] as never[])
          .orderBy("i.code" as never, "asc")
          .limit(limit).offset(offset).execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_industry_roots_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/industry-codes", listIndustryRootsHandler);

  // ── GET /platform/ref/industry-codes/:code/children ─────────────────────────

  const listIndustryChildrenHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q          = req.query as Record<string, unknown>;
      const parentCode = (req.params["code"] as string ?? "").trim();
      const domain     = typeof q["domain"] === "string" ? q["domain"].trim().toLowerCase() : "";
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);

      if (!domain || !parentCode) {
        setCachePrivate(res);
        res.json({ data: [], meta: { total: 0, page: 1, limit, pages: 0 } });
        return;
      }

      let base = db
        .selectFrom("shared.industry_code as i")
        .where("i.domain_code" as never, "=", domain as never)
        .where("i.parent_code" as never, "=", parentCode as never);
      base = applyStatus(base, sf, "i.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["i.id", "i.code", "i.name", "i.domain_code", "i.parent_code", "i.level_no", "i.is_leaf", "i.status"] as never[])
          .orderBy("i.code" as never, "asc")
          .limit(limit).offset(offset).execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_industry_children_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/industry-codes/:code/children", listIndustryChildrenHandler);

  // ── GET /platform/ref/industry-codes/search ─────────────────────────────────

  const searchIndustryCodesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q      = req.query as Record<string, unknown>;
      const term   = typeof q["q"] === "string" ? q["q"].trim() : "";
      const domain = typeof q["domain"] === "string" ? q["domain"].trim().toLowerCase() : "";
      const { page, limit, offset } = parsePagination(q);
      const sf = resolveStatusFilter(q);

      if (!term) {
        setCachePrivate(res);
        res.json({ data: [], meta: { total: 0, page: 1, limit, pages: 0 } });
        return;
      }

      let base = db.selectFrom("shared.industry_code as i");
      if (domain) {
        base = base.where("i.domain_code" as never, "=", domain as never) as typeof base;
      }
      base = base.where((eb) => eb.or([
        eb("i.code"        as never, "ilike", `${term}%` as never),
        eb("i.name"        as never, "ilike", `%${term}%` as never),
        eb("i.description" as never, "ilike", `%${term}%` as never),
        sql<boolean>`array_to_string(${sql.ref("i.keywords")}, ' ') ilike ${"%" + term + "%"}` as never,
      ])) as typeof base;
      base = applyStatus(base, sf, "i.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select(["i.id", "i.code", "i.name", "i.domain_code", "i.parent_code", "i.level_no", "i.is_leaf", "i.status"] as never[])
          .orderBy("i.level_no" as never, "asc")
          .orderBy("i.code"     as never, "asc")
          .limit(limit).offset(offset).execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_industry_search_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/industry-codes/search", searchIndustryCodesHandler);

  // Industry crosswalk reads moved to /api/platform/taxonomy/:family/crosswalks/*
  // (taxonomy.route.ts) which uses the correct DDL column names:
  // source_domain_code / source_code / target_domain_code / target_code.

  // ═══════════════════════════════════════════════════════════════════════════
  // FX RATES — master.fx_rate (tenant-scoped; read via general bearer)
  // ═══════════════════════════════════════════════════════════════════════════
  // Write endpoints (POST/PATCH/DELETE) live in platform.route.ts under /platform/admin/.

  // ── GET /platform/ref/fx-rates ──────────────────────────────────────────────
  // Returns the latest active rate per pair+type.
  // ?base=, ?quote=, ?rate_type=, ?date= (YYYY-MM-DD, defaults to today)

  const listCertificationTypesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const search = parseSearch(q);
      const sf = resolveStatusFilter(q);
      const id = typeof q["id"] === "string" && q["id"].trim() ? q["id"].trim() : null;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;

      let base = db.selectFrom("master.certification_type as ct");
      if (tenantId) {
        base = base.where((eb) => eb.or([
          eb("ct.tenant_id" as never, "is", null as never),
          eb("ct.tenant_id" as never, "=", tenantId as never),
        ])) as typeof base;
      } else {
        base = base.where("ct.tenant_id" as never, "is", null as never) as typeof base;
      }
      if (id) {
        base = base.where("ct.id" as never, "=", id as never) as typeof base;
      }
      if (search) {
        base = base.where((eb) => eb.or([
          eb("ct.name" as never, "ilike", `%${search}%` as never),
          eb("ct.code" as never, "ilike", `%${search}%` as never),
          eb("ct.issuing_body" as never, "ilike", `%${search}%` as never),
          eb("ct.category" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }
      base = applyStatus(base, sf, "ct.status");

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select([
            "ct.id", "ct.code", "ct.name", "ct.issuing_body",
            "ct.category", "ct.description", "ct.is_custom", "ct.status",
          ] as never[])
          .orderBy("ct.is_custom" as never, "asc")
          .orderBy("ct.category" as never, "asc")
          .orderBy("ct.name" as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_certification_types_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/certification-types", listCertificationTypesHandler);

  const listFxRatesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tenantId = claims["tenant_id"] as string | undefined;
      if (!tenantId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      const q        = req.query as Record<string, unknown>;
      const base_    = typeof q["base"]      === "string" ? q["base"].trim().toUpperCase()      : "";
      const quote    = typeof q["quote"]     === "string" ? q["quote"].trim().toUpperCase()     : "";
      const rateType = typeof q["rate_type"] === "string" ? q["rate_type"].trim().toUpperCase() : "";
      const dateStr  = typeof q["date"]      === "string" ? q["date"].trim()                    : "";
      const { page, limit, offset } = parsePagination(q);

      let qb = db
        .selectFrom("master.fx_rate as r")
        .where("r.tenant_id" as never, "=", tenantId as never)
        .where("r.is_active"  as never, "=", true as never);

      if (base_)    { qb = qb.where("r.from_currency" as never, "=", base_ as never)    as typeof qb; }
      if (quote)    { qb = qb.where("r.to_currency"   as never, "=", quote as never)    as typeof qb; }
      if (rateType) { qb = qb.where("r.rate_type"     as never, "=", rateType as never) as typeof qb; }
      if (dateStr)  { qb = qb.where("r.effective_date" as never, "<=", dateStr as never) as typeof qb; }

      const [countRow, rows] = await Promise.all([
        qb.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        qb
          .select([
            "r.id", "r.from_currency", "r.to_currency", "r.rate", "r.inverse_rate",
            "r.rate_type", "r.effective_date", "r.effective_time",
            "r.source", "r.source_reference", "r.status",
          ] as never[])
          .orderBy("r.from_currency" as never, "asc")
          .orderBy("r.to_currency"   as never, "asc")
          .orderBy("r.effective_date" as never, "desc")
          .limit(limit).offset(offset).execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_fx_rates_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/fx-rates", listFxRatesHandler);

  // ── GET /platform/ref/fx-rates/lookup ───────────────────────────────────────
  // Calls master.get_fx_rate() — direct → inverse → triangulation.
  // ?base= &quote= required; ?pivot= optional and never defaulted; ?date= optional.

  const fxRateLookupHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tenantId = claims["tenant_id"] as string | undefined;
      if (!tenantId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      const q     = req.query as Record<string, unknown>;
      const from  = typeof q["base"]  === "string" ? q["base"].trim().toUpperCase()  : "";
      const to    = typeof q["quote"] === "string" ? q["quote"].trim().toUpperCase() : "";
      const rateType = typeof q["rate_type"] === "string"
        ? q["rate_type"].trim().toUpperCase()
        : typeof q["rateType"] === "string"
          ? q["rateType"].trim().toUpperCase()
          : "SPOT";
      const asOf = typeof q["date"] === "string"
        ? q["date"].trim()
        : typeof q["as_of"] === "string"
          ? q["as_of"].trim()
          : typeof q["asOf"] === "string"
            ? q["asOf"].trim()
            : new Date().toISOString().slice(0, 10);
      const pivot = typeof q["pivot"] === "string" && q["pivot"].trim()
        ? q["pivot"].trim().toUpperCase()
        : null;

      if (!from || !to) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "?base= and ?quote= are required" });
        return;
      }

      const result = await sql<{ fx: Record<string, unknown> | null }>`
        SELECT master.get_fx_rate(
          ${tenantId}::uuid,
          ${from}::char(3),
          ${to}::char(3),
          ${rateType},
          ${asOf}::date,
          ${pivot}::char(3)
        ) AS fx
      `.execute(db);

      setCachePrivate(res);
      res.json({ data: result.rows[0]?.fx ?? null });
    } catch (err) {
      logger?.error("ref_fx_lookup_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/fx-rates/lookup", fxRateLookupHandler);

  // ── GET /platform/ref/fx-rates/history ──────────────────────────────────────
  // Time series for a pair+type between two dates.
  // ?base= &quote= required; ?rate_type= optional; ?from_date= &to_date= (YYYY-MM-DD).

  const fxRateHistoryHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tenantId = claims["tenant_id"] as string | undefined;
      if (!tenantId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      const q         = req.query as Record<string, unknown>;
      const from      = typeof q["base"]       === "string" ? q["base"].trim().toUpperCase()       : "";
      const to        = typeof q["quote"]      === "string" ? q["quote"].trim().toUpperCase()      : "";
      const rateType  = typeof q["rate_type"]  === "string" ? q["rate_type"].trim().toUpperCase()  : "";
      const fromDate  = typeof q["from_date"]  === "string" ? q["from_date"].trim()                : "";
      const toDate    = typeof q["to_date"]    === "string" ? q["to_date"].trim()                  : "";
      const { page, limit, offset } = parsePagination(q);

      if (!from || !to) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "?base= and ?quote= are required" });
        return;
      }

      let qb = db
        .selectFrom("master.fx_rate as r")
        .where("r.tenant_id"    as never, "=", tenantId as never)
        .where("r.from_currency" as never, "=", from as never)
        .where("r.to_currency"   as never, "=", to as never)
        .where("r.is_active"    as never, "=", true as never);

      if (rateType) { qb = qb.where("r.rate_type"      as never, "=",  rateType as never) as typeof qb; }
      if (fromDate) { qb = qb.where("r.effective_date"  as never, ">=", fromDate as never) as typeof qb; }
      if (toDate)   { qb = qb.where("r.effective_date"  as never, "<=", toDate as never)   as typeof qb; }

      const [countRow, rows] = await Promise.all([
        qb.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        qb
          .select([
            "r.id", "r.from_currency", "r.to_currency", "r.rate", "r.inverse_rate",
            "r.rate_type", "r.effective_date", "r.effective_time", "r.source", "r.source_reference",
          ] as never[])
          .orderBy("r.effective_date" as never, "desc")
          .orderBy("r.effective_time" as never, "desc")
          .limit(limit).offset(offset).execute(),
      ]);

      refResponse(res, rows, Number(countRow?.n ?? 0), page, limit);
    } catch (err) {
      logger?.error("ref_fx_history_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/ref/fx-rates/history", fxRateHistoryHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERENCE IMPORT — POST /platform/ref/:family/import
  // Idempotent upsert for Tier 1 shared reference tables.
  // Requires PLATFORM.REFERENCE.IMPORT permission + PLATFORM_CATALOG_WRITABLE env.
  // ═══════════════════════════════════════════════════════════════════════════

  const ALLOWED_REF_FAMILIES = new Set([
    "country", "currency", "language", "locale", "timezone", "uom", "state_region",
  ]);

  // Columns allowed per family (verified against shared/01_tables.sql DDL).
  const REF_ALLOWED_COLUMNS: Record<string, Set<string>> = {
    country:      new Set(["code", "name", "code3", "numeric3", "official_name", "region", "subregion", "calling_code", "has_postal_codes", "region_label"]),
    currency:     new Set(["code", "name", "symbol", "minor_units", "numeric3"]),
    language:     new Set(["code", "name", "native_name", "iso639_2", "direction"]),
    locale:       new Set(["code", "name", "language_code", "country_code", "script", "direction"]),
    timezone:     new Set(["code", "name", "utc_offset_minutes", "is_alias", "canonical_code"]),
    uom:          new Set(["code", "name", "symbol", "quantity_type"]),
    state_region: new Set(["code", "name", "country_code", "category", "parent_code"]),
  };
  const REF_REQUIRED_COLUMNS: Record<string, string[]> = {
    country:      ["code", "name"],
    currency:     ["code", "name"],
    language:     ["code", "name"],
    locale:       ["code", "name", "language_code"],
    timezone:     ["code"],
    uom:          ["code", "name"],
    state_region: ["code", "name", "country_code"],
  };

  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

  function sha256hex(buf: Buffer): string {
    return createHash("sha256").update(buf).digest("hex");
  }

  function parseCsvBuffer(buf: Buffer): Record<string, string>[] {
    const text   = buf.toString("utf-8");
    const lines  = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    });
  }

  function validateRefRows(
    family: string,
    rows: Record<string, string>[],
  ): { row: number; field: string; message: string }[] {
    const allowed  = REF_ALLOWED_COLUMNS[family] ?? new Set<string>();
    const required = REF_REQUIRED_COLUMNS[family] ?? [];
    const errors: { row: number; field: string; message: string }[] = [];

    // Check column allowlist from header (row 0 keys)
    if (rows.length > 0) {
      for (const col of Object.keys(rows[0]!)) {
        if (!allowed.has(col)) {
          errors.push({ row: 0, field: col, message: `Unknown column '${col}' for family '${family}'` });
        }
      }
    }
    if (errors.length > 0) return errors; // short-circuit on unknown columns

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      for (const req of required) {
        if (!row[req]?.trim()) {
          errors.push({ row: i + 1, field: req, message: `Required field '${req}' is empty` });
        }
      }
    }
    return errors;
  }

  function readRefUpload(req: Request): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_UPLOAD_BYTES } });
      let fileSeen = false;
      let limitExceeded = false;
      let sizeBytes = 0;
      const chunks: Buffer[] = [];
      let settled = false;
      const rejectOnce = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      bb.on("file", (_field, stream, _info) => {
        if (fileSeen) { stream.resume(); return; }
        fileSeen = true;
        stream.on("data", (chunk: Buffer) => {
          if (limitExceeded) return;
          sizeBytes += chunk.length;
          if (sizeBytes > MAX_UPLOAD_BYTES) { limitExceeded = true; chunks.length = 0; stream.resume(); return; }
          chunks.push(Buffer.from(chunk));
        });
        stream.on("limit", () => { limitExceeded = true; chunks.length = 0; });
        stream.on("error", rejectOnce);
      });
      bb.on("finish", () => {
        if (settled) return;
        if (limitExceeded) { rejectOnce(Object.assign(new Error("FILE_TOO_LARGE"), { statusCode: 413 })); return; }
        if (!fileSeen)     { rejectOnce(Object.assign(new Error("MISSING_FILE"),    { statusCode: 400 })); return; }
        const buffer = Buffer.concat(chunks, sizeBytes);
        if (buffer.byteLength === 0) { rejectOnce(Object.assign(new Error("EMPTY_FILE"), { statusCode: 400 })); return; }
        settled = true;
        resolve(buffer);
      });
      bb.on("error", rejectOnce);
      req.pipe(bb);
    });
  }

  const refImportHandler: RequestHandler = async (req, res, next) => {
    try {
      const family = (req.params["family"] as string ?? "").trim();
      if (!ALLOWED_REF_FAMILIES.has(family)) {
        res.status(400).json({ error: "UNSUPPORTED_REF_FAMILY", supported: [...ALLOWED_REF_FAMILIES] });
        return;
      }
      if (!requireCatalogWritable(res)) return;

      const g = await requirePlatformPermission(req, res, auth, db, "PLATFORM.REFERENCE.IMPORT");
      if (!g) return;

      let fileBuffer: Buffer;
      try {
        fileBuffer = await readRefUpload(req);
      } catch (uploadErr: unknown) {
        const err = uploadErr as { statusCode?: number; message?: string };
        res.status(err.statusCode ?? 400).json({ error: err.message ?? "UPLOAD_ERROR" });
        return;
      }

      const checksum = sha256hex(fileBuffer);
      const rows     = parseCsvBuffer(fileBuffer);

      // Full-file validation — all rows, not just preview
      const errors = validateRefRows(family, rows);
      if (errors.length > 0) {
        res.status(422).json({ error: "VALIDATION_FAILED", errors });
        return;
      }

      // Dry-run: return summary without writing
      if (req.query["preview"] === "true") {
        res.json({ checksum, row_count: rows.length, preview: rows.slice(0, 5), errors: [] });
        return;
      }

      // Upsert via COPY-safe pattern: batch INSERT … ON CONFLICT DO UPDATE
      const table = `shared.${family}`;
      const now   = new Date().toISOString();
      let inserted = 0;
      let updated  = 0;

      await (db as Kysely<any>).transaction().execute(async (trx) => {
        for (const row of rows) {
          const existing = await trx
            .selectFrom(table as never)
            .select("id" as never)
            .where("code" as never, "=", row["code"] as never)
            .executeTakeFirst() as { id: string } | undefined;

          if (existing) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updatePayload: Record<string, any> = { updated_at: now, updated_by: g.principalId };
            for (const [k, v] of Object.entries(row)) {
              if (k !== "code") updatePayload[k] = v || null;
            }
            await trx.updateTable(table as never).set(updatePayload as never).where("id" as never, "=", existing.id as never).execute();
            updated++;
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const insertPayload: Record<string, any> = { ...row, created_at: now, created_by: g.principalId };
            await trx.insertInto(table as never).values(insertPayload as never).execute();
            inserted++;
          }
        }
      });

      void appendPlatformAuditEvent(db, {
        event_code:  "platform.ref.import",
        operation:   "import",
        entity_type: `shared.${family}`,
        scope_id:    g.principalId,
        context:     { checksum, inserted, updated, row_count: inserted + updated },
      });

      // Cache invalidation happens in the caller (BFF relay layer) via ref-cache.ts
      // after this route responds. The versioned key pattern ensures stale reads
      // expire naturally if invalidation is skipped.

      res.json({ checksum, inserted, updated, row_count: inserted + updated });
    } catch (err) {
      logger?.error("ref_import_error", { err: String(err) });
      next(err);
    }
  };
  router.post("/platform/ref/:family/import", refImportHandler);

  return router;
}
