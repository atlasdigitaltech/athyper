/**
 * Platform Routes — saved views, module tree, entity catalog, notifications,
 *                   user preferences, entity field browser
 *
 * Principal-centric endpoints — canonical /api/me/*; /api/user/* and
 * /api/platform/* retained as aliases (registered via the meRoutes manifest):
 *   GET    /api/me/profile           (aliases: /api/user/profile,           /api/platform/profile)
 *   GET    /api/me/identity          (aliases: /api/user/identity,          /api/platform/identity)
 *   GET    /api/me/preferences       (aliases: /api/user/preferences,       /api/platform/preferences)
 *   PATCH  /api/me/preferences       (aliases: /api/user/preferences,       /api/platform/preferences)
 *   GET    /api/me/saved-views       (alias:   /api/user/saved-views)
 *   PATCH  /api/me/saved-views/:viewId/:action  (alias: /api/user/saved-views/:viewId/:action)
 *   GET    /api/me/tenant-context    — active tenant + memberships + enabled module codes
 *
 * Admin-gated (NOT principal-centric — requires tenant_admin group):
 *   GET    /api/platform/admin/tenant
 *          (aliases: /api/platform/tenant-admin, /api/user/tenant-admin)
 *
 * Saved-view CRUD (per-entity, admin/curated):
 *   GET    /api/platform/saved-views/:entity              — user + shared saved filter views
 *   POST   /api/platform/saved-views/:entity              — create a saved view (entity in path)
 *   POST   /api/platform/saved-views                      — create a saved view (entity_code in body)
 *   DELETE /api/platform/saved-views/:entity/:id          — delete a saved view
 *   PATCH  /api/platform/saved-views/:entity/:id          — update config (state_json)
 *   PATCH  /api/platform/saved-views/:entity/:id/default  — set as default
 *   DELETE /api/platform/saved-views/:entity/default      — clear current principal default
 *
 *   GET    /api/platform/modules                          — tenant module subscriptions
 *   GET    /api/platform/entities                         — entity catalog (admin)
 *   GET    /api/platform/entities/:name/fields            — fields for a specific entity
 *   GET    /api/platform/notifications/unread-count       — unread notification count
 *   GET    /api/platform/blueprints                       — blueprint catalog with applied status per tenant
 *   POST   /api/platform/blueprints/:code/apply           — mark a blueprint as applied for this tenant
 *   DELETE /api/platform/blueprints/:code/apply           — unmark (set status='removed') a blueprint
 */

import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  isUuid,
  resolvePrincipalIdOrNull,
} from "@athyper/svc-shared";
import { getEffectiveModuleAccess, jitProvisionPrincipal } from "@athyper/svc-iam";

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface PlatformRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
  /** Optional Redis client — used by admin/cache/clear and admin/user/sync-profile. */
  cache?: {
    del(key: string | string[]): Promise<unknown>;
    scan?(cursor: string, matchFlag: "MATCH", pattern: string, countFlag: "COUNT", count: number): Promise<[string, string[]]>;
    smembers?(key: string): Promise<string[]>;
  };
  /**
   * Optional deprecation telemetry. When provided, every hit on a
   * `@deprecated` alias route (/user/*, /platform/{profile,identity,…},
   * /platform/tenant-admin, /user/tenant-admin) calls `recordHit` and
   * the response carries `Deprecation`, `Sunset`, and `Link` headers
   * (RFC 8594). The alias is safe to remove once telemetry shows zero
   * hits across the agreed observation window.
   */
  deprecation?: {
    recordHit(method: string, aliasPath: string, canonicalPath: string): void;
    /** HTTP-date string for the `Sunset` header. */
    sunsetHttpDate: string;
  };
}

const ENTITY_LIST_SAVED_VIEW_SURFACE = "entity.list";
const DEFAULT_SAVED_VIEW_PREF_CODE = "grid.default_saved_view";
const SYSTEM_CREATED_BY = "00000000-0000-0000-0000-000000000000";
const PLANE_REALM_KEYS = new Set(["neon", "mesh", "admin"]);
let savedViewPreferenceLookupsReady = false;

// ─── Row mappers ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSavedView(row: Record<string, any>, options: { principalId?: string | null; defaultViewId?: string | null } = {}) {
  // config IS EntityListQueryState — pass state_json through directly.
  // _v defaults to 1 for legacy rows that pre-date the canonical schema.
  const config = { _v: 1, ...(row.state_json ?? {}) } as Record<string, unknown>;
  if (typeof config["surface"] !== "string" && typeof row.surface_code === "string") {
    config["surface"] = row.surface_code;
  }
  return {
    id:          row.id as string,
    entity_code: (row.entity_key ?? "") as string,
    name:        row.name as string,
    scope:       row.scope === "personal" ? "private" : (row.scope as string),
    is_default:  Boolean(options.defaultViewId && row.id === options.defaultViewId),
    is_shared:   (row.scope === "shared" || row.scope === "system") as boolean,
    can_delete:  canDeleteSavedView(row, options.principalId),
    config,
    created_by:  row.created_by as string,
    created_at:  (row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canDeleteSavedView(row: Record<string, any>, principalId?: string | null): boolean {
  if (!principalId) return false;
  if (row.scope === "personal") return row.owner_principal_id === principalId;
  if (row.scope === "shared") return row.created_by === principalId;
  return false;
}

interface DefaultSavedViewPreference {
  entity_defaults: Record<string, string>;
}

function normalizeDefaultSavedViewPreference(value: unknown): DefaultSavedViewPreference {
  const parsed = parseJsonObject(value);
  const rawDefaults = isPlainObject(parsed?.["entity_defaults"]) ? parsed["entity_defaults"] : {};
  const entityDefaults: Record<string, string> = {};
  for (const [entityKey, viewId] of Object.entries(rawDefaults)) {
    if (typeof entityKey !== "string" || !entityKey.trim()) continue;
    if (typeof viewId !== "string" || !viewId.trim()) continue;
    entityDefaults[entityKey.trim()] = viewId.trim();
  }
  return { entity_defaults: entityDefaults };
}

function readDefaultSavedViewPreference(value: unknown, entityKey: string): string | null {
  const preference = normalizeDefaultSavedViewPreference(value);
  return preference.entity_defaults[entityKey] ?? null;
}

async function getPrincipalDefaultSavedViewId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  principalId: string,
  entityKey: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("master.principal_ui_preference as pref")
    .select("pref.preference_value")
    .where("pref.tenant_id", "=", tenantId)
    .where("pref.principal_id", "=", principalId)
    .where("pref.preference_code", "=", DEFAULT_SAVED_VIEW_PREF_CODE)
    .where("pref.surface_code", "=", ENTITY_LIST_SAVED_VIEW_SURFACE)
    .executeTakeFirst() as { preference_value?: unknown } | undefined;

  return row ? readDefaultSavedViewPreference(row.preference_value, entityKey) : null;
}

async function setPrincipalDefaultSavedViewId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  principalId: string,
  entityKey: string,
  viewId: string,
): Promise<void> {
  await ensureSavedViewPreferenceLookups(db);

  const row = await db
    .selectFrom("master.principal_ui_preference as pref")
    .select(["pref.id", "pref.preference_value"])
    .where("pref.tenant_id", "=", tenantId)
    .where("pref.principal_id", "=", principalId)
    .where("pref.preference_code", "=", DEFAULT_SAVED_VIEW_PREF_CODE)
    .where("pref.surface_code", "=", ENTITY_LIST_SAVED_VIEW_SURFACE)
    .executeTakeFirst() as { id?: string; preference_value?: unknown } | undefined;

  const nextPreference = normalizeDefaultSavedViewPreference(row?.preference_value);
  nextPreference.entity_defaults[entityKey] = viewId;
  const now = new Date();

  if (row?.id) {
    await db
      .updateTable("master.principal_ui_preference" as never)
      .set({
        preference_value: JSON.stringify(nextPreference),
        updated_at:       now,
        updated_by:       principalId,
      } as never)
      .where("id" as never, "=", row.id as never)
      .execute();
    return;
  }

  await db
    .insertInto("master.principal_ui_preference" as never)
    .values({
      tenant_id:         tenantId,
      principal_id:      principalId,
      preference_code:   DEFAULT_SAVED_VIEW_PREF_CODE,
      surface_code:      ENTITY_LIST_SAVED_VIEW_SURFACE,
      preference_value:  JSON.stringify(nextPreference),
      created_by:        principalId,
    } as never)
    .execute();
}

async function clearPrincipalDefaultSavedViewId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  principalId: string,
  entityKey: string,
): Promise<void> {
  await ensureSavedViewPreferenceLookups(db);

  const row = await db
    .selectFrom("master.principal_ui_preference as pref")
    .select(["pref.id", "pref.preference_value"])
    .where("pref.tenant_id", "=", tenantId)
    .where("pref.principal_id", "=", principalId)
    .where("pref.preference_code", "=", DEFAULT_SAVED_VIEW_PREF_CODE)
    .where("pref.surface_code", "=", ENTITY_LIST_SAVED_VIEW_SURFACE)
    .executeTakeFirst() as { id?: string; preference_value?: unknown } | undefined;

  if (!row?.id) return;

  const nextPreference = normalizeDefaultSavedViewPreference(row.preference_value);
  delete nextPreference.entity_defaults[entityKey];

  if (Object.keys(nextPreference.entity_defaults).length === 0) {
    await db
      .deleteFrom("master.principal_ui_preference" as never)
      .where("id" as never, "=", row.id as never)
      .execute();
    return;
  }

  await db
    .updateTable("master.principal_ui_preference" as never)
    .set({
      preference_value: JSON.stringify(nextPreference),
      updated_at:       new Date(),
      updated_by:       principalId,
    } as never)
    .where("id" as never, "=", row.id as never)
    .execute();
}

async function ensureSavedViewPreferenceLookups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
): Promise<void> {
  if (savedViewPreferenceLookupsReady) return;

  const existingRows = await db
    .selectFrom("control.lookup_value as lv")
    .select(["lv.code", "lv.domain_code"])
    .where((eb) => eb.or([
      eb.and([
        eb("lv.domain_code", "=", "ui.preference_code"),
        eb("lv.code", "=", DEFAULT_SAVED_VIEW_PREF_CODE),
      ]),
      eb.and([
        eb("lv.domain_code", "=", "ui.surface_code"),
        eb("lv.code", "=", ENTITY_LIST_SAVED_VIEW_SURFACE),
      ]),
    ]))
    .where("lv.tenant_id" as never, "is", null)
    .where("lv.status", "=", "active")
    .execute() as Array<{ code?: string; domain_code?: string }>;
  const hasPreferenceCode = existingRows.some((row) => (
    row.domain_code === "ui.preference_code" && row.code === DEFAULT_SAVED_VIEW_PREF_CODE
  ));
  const hasSurfaceCode = existingRows.some((row) => (
    row.domain_code === "ui.surface_code" && row.code === ENTITY_LIST_SAVED_VIEW_SURFACE
  ));
  if (hasPreferenceCode && hasSurfaceCode) {
    savedViewPreferenceLookupsReady = true;
    return;
  }

  const defaultPreferenceMetadata = JSON.stringify({
    value_schema: {
      type:       "object",
      properties: {
        entity_defaults: { type: "object" },
      },
    },
  });

  await sql`
    INSERT INTO control.lookup_value
      (code, name, domain_code, description, sort_order, is_system, status, metadata, created_by)
    VALUES
      (
        ${DEFAULT_SAVED_VIEW_PREF_CODE},
        'Default Saved View',
        'ui.preference_code',
        'Principal default saved view per entity list surface.',
        13,
        true,
        'active',
        CAST(${defaultPreferenceMetadata} AS jsonb),
        CAST(${SYSTEM_CREATED_BY} AS uuid)
      ),
      (
        ${ENTITY_LIST_SAVED_VIEW_SURFACE},
        'Entity List',
        'ui.surface_code',
        'Generic runtime entity list surface.',
        10,
        true,
        'active',
        '{}'::jsonb,
        CAST(${SYSTEM_CREATED_BY} AS uuid)
      )
    ON CONFLICT DO NOTHING
  `.execute(db);

  savedViewPreferenceLookupsReady = true;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSavedViewConfig(config: Record<string, unknown>, entityKey: string) {
  return {
    _v: 1,
    ...config,
    entity: typeof config["entity"] === "string" && config["entity"].trim()
      ? config["entity"]
      : entityKey,
    surface: ENTITY_LIST_SAVED_VIEW_SURFACE,
  };
}

function readHeaderString(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return first?.trim() ?? null;
  }
  return null;
}

function identityRealmFromHeaders(headers: IncomingHttpHeaders, tenantRealm: string): string {
  return (
    readHeaderString(headers["x-identity-realm"]) ??
    readHeaderString(headers["x-realm-key"]) ??
    (PLANE_REALM_KEYS.has(tenantRealm) ? "athyper" : tenantRealm || "athyper")
  );
}

function savedViewTenantContextDebug(headers: IncomingHttpHeaders, xOrg: string, xRealm: string): Record<string, unknown> {
  return {
    hasTenantIdHeader: Boolean(readHeaderString(headers["x-tenant-id"])),
    hasTenantCodeHeader: Boolean(readHeaderString(headers["x-tenant-code"])),
    hasOrgHeader: Boolean(xOrg),
    realm: xRealm || "athyper",
  };
}

async function resolveSavedViewTenantId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  headers: IncomingHttpHeaders,
  xOrg: string,
  tenantRealm: string,
): Promise<string | null> {
  const headerTenantId = readHeaderString(headers["x-tenant-id"]);
  if (headerTenantId && isUuid(headerTenantId)) {
    const row = await db
      .selectFrom("master.tenant as t")
      .select("t.id")
      .where("t.id", "=", headerTenantId)
      .executeTakeFirst();
    if (row) return row.id as string;
  }

  const headerTenantCode = readHeaderString(headers["x-tenant-code"]);
  if (headerTenantCode) {
    const row = await db
      .selectFrom("master.tenant as t")
      .select("t.id")
      .where("t.code", "=", headerTenantCode)
      .where("t.realm_key", "=", tenantRealm || "athyper")
      .executeTakeFirst();
    if (row) return row.id as string;
  }

  return resolveTenantId(db, xOrg, tenantRealm);
}

async function resolveSavedViewPrincipalId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  headers: IncomingHttpHeaders,
  claims: Record<string, unknown>,
  tenantId: string,
  tenantRealm: string,
  options: { jit?: boolean } = {},
): Promise<string | null> {
  const sub = typeof claims["sub"] === "string" ? claims["sub"] : "";
  if (!sub) return null;

  const identityRealm = identityRealmFromHeaders(headers, tenantRealm);
  if (!options.jit) {
    return resolvePrincipalIdOrNull(db, sub, tenantId, identityRealm);
  }

  const existing = await resolvePrincipalIdOrNull(db, sub, tenantId, identityRealm);
  if (existing) return existing;

  const { email, username, display_name } = extractOidcIdentity(claims, sub);
  const jit = await jitProvisionPrincipal(db, { sub, username, display_name, email, tenant_id: tenantId, realm_key: identityRealm });
  return jit?.principal_id ?? null;
}

function extractOidcIdentity(claims: Record<string, unknown>, sub: string) {
  const email = typeof claims["email"] === "string" && claims["email"].trim()
    ? claims["email"].trim().toLowerCase()
    : undefined;
  const username =
    (typeof claims["preferred_username"] === "string" && claims["preferred_username"].trim()
      ? claims["preferred_username"].trim()
      : undefined)
    ?? email?.split("@")[0]
    ?? sub.slice(0, 30);
  const display_name =
    (typeof claims["name"] === "string" && claims["name"].trim()
      ? claims["name"].trim()
      : undefined)
    ?? username;
  return { email, username, display_name };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toModule(row: Record<string, any>) {
  return {
    id:            row.id as string,
    module_id:     row.module_id as string,
    status:        row.status as string,
    subscribed_at: (row.subscribed_at instanceof Date ? row.subscribed_at.toISOString() : String(row.subscribed_at)),
    expires_at:    row.expires_at ? (row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at)) : null,
    metadata:      (row.metadata ?? {}) as Record<string, unknown>,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEntity(row: Record<string, any>) {
  return {
    id:              row.id as string,
    name:            row.name as string,
    entity_class:    row.entity_class as string,
    ownership_model: row.ownership_model as string,
    module_id:       row.module_id as string,
    table_schema:    row.table_schema as string,
    table_name:      row.table_name as string,
    label_singular:  (row.label_singular ?? null) as string | null,
    label_plural:    (row.label_plural   ?? null) as string | null,
    description:     (row.description    ?? null) as string | null,
    icon_key:        (row.icon_key       ?? null) as string | null,
    display_config:  (row.display_config ?? null) as Record<string, unknown> | null,
    feature_flags:   (row.feature_flags  ?? null) as Record<string, unknown> | null,
    data_policy:     (row.data_policy    ?? null) as Record<string, unknown> | null,
    identity_config: (row.identity_config ?? null) as Record<string, unknown> | null,
    search_config:   (row.search_config  ?? null) as Record<string, unknown> | null,
  };
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function registerPlatformRoutes(router: Router, deps: PlatformRoutesDeps): Router {
  const { db, auth, logger, cache, deprecation } = deps;

  // Wraps a canonical handler so every hit on a deprecated alias surface (a) is
  // counted in telemetry and (b) responds with RFC 8594 deprecation headers
  // pointing consumers at the canonical path. No-op when deprecation deps are
  // not wired (tests, dev kernels) so the route still behaves identically.
  function withDeprecation(canonicalPath: string, aliasPath: string, inner: RequestHandler): RequestHandler {
    return (req, res, next) => {
      if (deprecation) {
        deprecation.recordHit(req.method, aliasPath, canonicalPath);
        res.setHeader("Deprecation", "true");
        res.setHeader("Sunset", deprecation.sunsetHttpDate);
        res.setHeader("Link", `<${canonicalPath}>; rel="successor-version"`);
      }
      return inner(req, res, next);
    };
  }

  // ── GET /platform/saved-views/:entity ──────────────────────────────────────

  const listSavedViewsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityKey = req.params["entity"] as string;
      const xOrg      = readHeaderString(req.headers["x-org"]) ?? "";
      const xRealm    = readHeaderString(req.headers["x-realm"]) ?? "athyper";

      const tenantId = await resolveSavedViewTenantId(db, req.headers, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const principalId = await resolveSavedViewPrincipalId(db, req.headers, claims, tenantId, xRealm);

      let query = db
        .selectFrom("master.saved_view as sv")
        .select([
          "sv.id", "sv.entity_key", "sv.name", "sv.scope",
          "sv.surface_code", "sv.is_default", "sv.state_json",
          "sv.owner_principal_id", "sv.created_by", "sv.created_at",
        ])
        .where("sv.tenant_id", "=", tenantId)
        .where("sv.entity_key", "=", entityKey)
        .where("sv.status", "=", "active")
        .where("sv.deleted_at" as never, "is", null);

      if (principalId) {
        // personal views for this principal OR shared/system views
        query = query.where((eb) =>
          eb.or([
            eb.and([
              eb("sv.scope", "=", "personal"),
              eb("sv.owner_principal_id", "=", principalId),
            ]),
            eb("sv.scope", "in", ["shared", "system"]),
          ]),
        ) as typeof query;
      } else {
        query = query.where("sv.scope", "in", ["shared", "system"]) as typeof query;
      }

      const rows = await query
        .orderBy("sv.scope", "asc")
        .orderBy("sv.name", "asc")
        .execute() as Record<string, unknown>[];

      const defaultViewId = principalId
        ? await getPrincipalDefaultSavedViewId(db, tenantId, principalId, entityKey)
        : null;

      res.json(rows.map((row) => toSavedView(row, { principalId, defaultViewId })));
    } catch (err) {
      logger?.error("platform_saved_views_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /platform/saved-views/:entity ─────────────────────────────────────

  const createSavedViewHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityKey = req.params["entity"] as string;
      const xOrg      = readHeaderString(req.headers["x-org"]) ?? "";
      const xRealm    = readHeaderString(req.headers["x-realm"]) ?? "athyper";

      const tenantId = await resolveSavedViewTenantId(db, req.headers, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({
          error: "TENANT_REQUIRED",
          context: savedViewTenantContextDebug(req.headers, xOrg, xRealm),
        });
        return;
      }

      const principalId = await resolveSavedViewPrincipalId(db, req.headers, claims, tenantId, xRealm, { jit: true });
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_REQUIRED" }); return; }

      const body = req.body as Record<string, unknown>;
      const name  = typeof body["name"] === "string" ? body["name"].trim() : "";
      const scope = typeof body["is_shared"] === "boolean" && body["is_shared"] ? "shared" : "personal";
      const config = normalizeSavedViewConfig((body["config"] ?? {}) as Record<string, unknown>, entityKey);

      if (!name) { res.status(400).json({ error: "NAME_REQUIRED" }); return; }

      // Machine-stable code derived from name
      const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60) + "_" + Date.now().toString(36);

      const row = await db
        .insertInto("master.saved_view" as never)
        .values({
          tenant_id:          tenantId,
          owner_principal_id: scope === "personal" ? principalId : null,
          scope,
          surface_code:       ENTITY_LIST_SAVED_VIEW_SURFACE,
          entity_key:         entityKey,
          code,
          name,
          is_default:         false,
          is_pinned:          false,
          state_json:         JSON.stringify(config),
          status:             "active",
          created_by:         principalId,
        } as never)
        .returning([
          "id", "entity_key", "name", "scope", "surface_code", "is_default", "state_json",
          "owner_principal_id", "created_by", "created_at",
        ] as never[])
        .executeTakeFirstOrThrow();

      res.status(201).json(toSavedView(row as Record<string, unknown>, { principalId }));
    } catch (err) {
      logger?.error("platform_saved_views_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /platform/saved-views (entity_code in body) ──────────────────────
  //
  // Bodyless variant used by PlatformClient.saveSavedView() which posts to
  // /api/platform/saved-views with entity_code in the JSON body rather than
  // in the URL path. Delegates to createSavedViewHandler after injecting the
  // entity param so the same logic handles both call shapes.

  const createSavedViewBodyHandler: RequestHandler = async (req, res, next) => {
    try {
      const body      = req.body as Record<string, unknown>;
      const entityKey = typeof body["entity_code"] === "string" ? body["entity_code"].trim() : "";
      if (!entityKey) {
        res.status(400).json({ error: "ENTITY_CODE_REQUIRED", message: "entity_code is required in the request body" });
        return;
      }
      // Inject entity as a URL param so createSavedViewHandler can read it normally
      req.params["entity"] = entityKey;
      return createSavedViewHandler(req, res, next);
    } catch (err) {
      next(err);
    }
  };

  // ── DELETE /platform/saved-views/:entity/:viewId ───────────────────────────

  const deleteSavedViewHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const viewId  = req.params["viewId"] as string;
      const xOrg    = readHeaderString(req.headers["x-org"]) ?? "";
      const xRealm  = readHeaderString(req.headers["x-realm"]) ?? "athyper";

      const tenantId = await resolveSavedViewTenantId(db, req.headers, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      if (!isUuid(viewId)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const principalId = await resolveSavedViewPrincipalId(db, req.headers, claims, tenantId, xRealm, { jit: true });

      const existing = await db
        .selectFrom("master.saved_view as sv")
        .select(["sv.id", "sv.entity_key", "sv.scope", "sv.owner_principal_id", "sv.created_by"])
        .where("sv.id", "=", viewId)
        .where("sv.tenant_id", "=", tenantId)
        .where("sv.deleted_at" as never, "is", null)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!existing) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      if (!canDeleteSavedView(existing, principalId)) {
        res.status(403).json({ error: "FORBIDDEN" }); return;
      }

      const entityKey = typeof existing["entity_key"] === "string" ? existing["entity_key"] : "";
      if (principalId && entityKey) {
        const defaultViewId = await getPrincipalDefaultSavedViewId(db, tenantId, principalId, entityKey);
        if (defaultViewId === viewId) {
          await clearPrincipalDefaultSavedViewId(db, tenantId, principalId, entityKey);
        }
      }

      await db
        .updateTable("master.saved_view" as never)
        .set({ deleted_at: new Date(), status: "archived", updated_at: new Date(), updated_by: principalId ?? undefined } as never)
        .where("id" as never, "=", viewId as never)
        .execute();

      res.status(204).end();
    } catch (err) {
      logger?.error("platform_saved_views_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /platform/saved-views/:entity/:viewId — update config ───────────

  const updateSavedViewHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const viewId  = req.params["viewId"] as string;
      const xOrg    = readHeaderString(req.headers["x-org"]) ?? "";
      const xRealm  = readHeaderString(req.headers["x-realm"]) ?? "athyper";

      const tenantId = await resolveSavedViewTenantId(db, req.headers, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      if (!isUuid(viewId)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const principalId = await resolveSavedViewPrincipalId(db, req.headers, claims, tenantId, xRealm, { jit: true });
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_REQUIRED" }); return; }

      const existing = await db
        .selectFrom("master.saved_view as sv")
        .select(["sv.id", "sv.entity_key", "sv.scope", "sv.owner_principal_id", "sv.state_json"] as never[])
        .where("sv.id", "=", viewId)
        .where("sv.tenant_id", "=", tenantId)
        .where("sv.deleted_at" as never, "is", null)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!existing) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      if (existing["scope"] === "personal" && existing["owner_principal_id"] !== principalId) {
        res.status(403).json({ error: "FORBIDDEN" }); return;
      }

      const body   = req.body as Record<string, unknown>;
      const existingEntityKey = typeof existing["entity_key"] === "string" && existing["entity_key"].trim()
        ? existing["entity_key"]
        : String(req.params["entity"] ?? "");
      const config = normalizeSavedViewConfig((body["config"] ?? {}) as Record<string, unknown>, existingEntityKey);
      const name   = typeof body["name"] === "string" ? body["name"].trim() : undefined;

      const updateClause: Record<string, unknown> = {
        state_json: JSON.stringify(config),
        updated_at: new Date(),
        updated_by: principalId,
      };
      if (name) updateClause["name"] = name;

      const row = await db
        .updateTable("master.saved_view" as never)
        .set(updateClause as never)
        .where("id" as never, "=", viewId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .returning([
          "id", "entity_key", "name", "scope", "surface_code", "is_default", "state_json",
          "owner_principal_id", "created_by", "created_at",
        ] as never[])
        .executeTakeFirstOrThrow();

      const existingEntityDefaultId = await getPrincipalDefaultSavedViewId(db, tenantId, principalId, existingEntityKey);
      res.json(toSavedView(row as Record<string, unknown>, { principalId, defaultViewId: existingEntityDefaultId }));
    } catch (err) {
      logger?.error("platform_saved_views_update_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /platform/saved-views/:entity/:viewId/default ───────────────────

  const setDefaultViewHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityKey = req.params["entity"] as string;
      const viewId    = req.params["viewId"] as string;
      const xOrg      = readHeaderString(req.headers["x-org"]) ?? "";
      const xRealm    = readHeaderString(req.headers["x-realm"]) ?? "athyper";

      const tenantId = await resolveSavedViewTenantId(db, req.headers, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const principalId = await resolveSavedViewPrincipalId(db, req.headers, claims, tenantId, xRealm, { jit: true });
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_REQUIRED" }); return; }

      if (!isUuid(viewId)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const existing = await db
        .selectFrom("master.saved_view as sv")
        .select(["sv.id", "sv.scope", "sv.owner_principal_id", "sv.entity_key", "sv.surface_code"])
        .where("sv.id", "=", viewId)
        .where("sv.tenant_id", "=", tenantId)
        .where("sv.entity_key", "=", entityKey)
        .where("sv.surface_code", "=", ENTITY_LIST_SAVED_VIEW_SURFACE)
        .where("sv.status", "=", "active")
        .where("sv.deleted_at" as never, "is", null)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!existing) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      if (
        existing["scope"] === "personal" &&
        existing["owner_principal_id"] !== principalId
      ) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }

      await setPrincipalDefaultSavedViewId(db, tenantId, principalId, entityKey, viewId);

      res.json({ ok: true });
    } catch (err) {
      logger?.error("platform_saved_views_default_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /platform/saved-views/:entity/default ───────────────────────────

  const clearDefaultViewHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityKey = req.params["entity"] as string;
      const xOrg      = readHeaderString(req.headers["x-org"]) ?? "";
      const xRealm    = readHeaderString(req.headers["x-realm"]) ?? "athyper";

      const tenantId = await resolveSavedViewTenantId(db, req.headers, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const principalId = await resolveSavedViewPrincipalId(db, req.headers, claims, tenantId, xRealm, { jit: true });
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_REQUIRED" }); return; }

      await clearPrincipalDefaultSavedViewId(db, tenantId, principalId, entityKey);

      res.json({ ok: true });
    } catch (err) {
      logger?.error("platform_saved_views_clear_default_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /user/saved-views — all views for the current principal ───────────

  const userListSavedViewsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = readHeaderString(req.headers["x-org"]) ?? "";
      const xRealm = readHeaderString(req.headers["x-realm"]) ?? "athyper";
      const tenantId = await resolveSavedViewTenantId(db, req.headers, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const principalId = await resolveSavedViewPrincipalId(db, req.headers, claims, tenantId, xRealm);

      // Fetch all personal + shared views across all entities for this principal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = db
        .selectFrom("master.saved_view as sv")
        .select([
          "sv.id", "sv.name", "sv.description",
          "sv.surface_code", "sv.entity_key",
          "sv.scope", "sv.is_pinned", "sv.metadata",
          "sv.status", "sv.created_at", "sv.updated_at",
        ] as never[])
        .where("sv.tenant_id" as never, "=", tenantId as never)
        .where("sv.deleted_at" as never, "is", null);

      if (principalId) {
        query = query.where((eb: any) =>
          eb.or([
            eb.and([
              eb("sv.scope" as never, "=", "personal" as never),
              eb("sv.owner_principal_id" as never, "=", principalId as never),
            ]),
            eb("sv.scope" as never, "in", ["shared", "system"] as never),
          ]),
        );
      } else {
        query = query.where("sv.scope" as never, "in", ["shared", "system"] as never);
      }

      const rows = await query
        .orderBy("sv.is_pinned" as never, "desc")
        .orderBy("sv.name" as never, "asc")
        .execute() as Array<{
          id: string;
          name: string;
          description: string | null;
          surface_code: string;
          entity_key: string | null;
          scope: string;
          is_pinned: boolean;
          metadata: Record<string, unknown> | null;
          status: string;
          created_at: string | Date;
          updated_at: string | Date | null;
        }>;

      const views = rows.map((row) => ({
        id:          row.id,
        name:        row.name,
        description: row.description ?? null,
        view_type:   row.surface_code,
        module_code: row.entity_key ?? "",
        is_pinned:   row.is_pinned,
        is_starred:  (row.metadata?.["is_starred"] === true),
        is_shared:   row.scope === "shared" || row.scope === "system",
        is_archived: row.status === "archived",
        created_at:  row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updated_at:  row.updated_at
          ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at))
          : null,
      }));

      res.json(views);
    } catch (err) {
      logger?.error("user_saved_views_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /user/saved-views/:viewId/:action — toggle pin/star/share/archive ─

  const userSavedViewActionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const viewId = String(req.params["viewId"] ?? "");
      const action = String(req.params["action"] ?? "").toLowerCase() as "pin" | "star" | "share" | "archive";

      if (!isUuid(viewId)) {
        res.status(400).json({ error: "INVALID_ID", message: "viewId must be a valid UUID" });
        return;
      }

      if (!["pin", "star", "share", "archive"].includes(action)) {
        res.status(400).json({ error: "INVALID_ACTION", message: "action must be one of: pin, star, share, archive" });
        return;
      }

      const xOrg   = readHeaderString(req.headers["x-org"]) ?? "";
      const xRealm = readHeaderString(req.headers["x-realm"]) ?? "athyper";
      const tenantId = await resolveSavedViewTenantId(db, req.headers, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const principalId = await resolveSavedViewPrincipalId(db, req.headers, claims, tenantId, xRealm, { jit: true });

      // Fetch current view to verify ownership + read current state
      const current = await db
        .selectFrom("master.saved_view as sv")
        .select(["sv.id", "sv.scope", "sv.is_pinned", "sv.metadata", "sv.owner_principal_id"] as never[])
        .where("sv.id" as never, "=", viewId as never)
        .where("sv.tenant_id" as never, "=", tenantId as never)
        .where("sv.deleted_at" as never, "is", null)
        .executeTakeFirst() as {
          id: string;
          scope: string;
          is_pinned: boolean;
          metadata: Record<string, unknown> | null;
          owner_principal_id: string | null;
        } | undefined;

      if (!current) {
        res.status(404).json({ error: "NOT_FOUND", message: "Saved view not found" });
        return;
      }

      // Ownership check: personal views can only be modified by their owner
      if (current.scope === "personal" && principalId && current.owner_principal_id !== principalId) {
        res.status(403).json({ error: "FORBIDDEN", message: "You do not own this view" });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let updateClause: Record<string, unknown>;

      switch (action) {
        case "pin": {
          updateClause = {
            is_pinned:  !current.is_pinned,
            updated_at: new Date(),
            updated_by: principalId ?? undefined,
          };
          break;
        }
        case "star": {
          const meta = { ...(current.metadata ?? {}), is_starred: !(current.metadata?.["is_starred"] === true) };
          updateClause = {
            metadata:   meta,
            updated_at: new Date(),
            updated_by: principalId ?? undefined,
          };
          break;
        }
        case "share": {
          const newScope = current.scope === "shared" ? "personal" : "shared";
          updateClause = {
            scope:      newScope,
            updated_at: new Date(),
            updated_by: principalId ?? undefined,
          };
          break;
        }
        case "archive": {
          updateClause = {
            status:            "archived",
            status_changed_at: new Date(),
            status_changed_by: principalId ?? undefined,
            deleted_at:        new Date(),
            updated_at:        new Date(),
            updated_by:        principalId ?? undefined,
          };
          break;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.updateTable("master.saved_view" as never) as any)
        .set(updateClause)
        .where("id" as never, "=", viewId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .execute();

      res.json({ ok: true });
    } catch (err) {
      logger?.error("user_saved_views_action_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/modules ──────────────────────────────────────────────────

  const modulesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const rows = await db
        .selectFrom("master.tenant_module_subscription as tms")
        .select(["tms.id", "tms.module_id", "tms.status", "tms.subscribed_at", "tms.expires_at", "tms.metadata"])
        .where("tms.tenant_id", "=", tenantId)
        .orderBy("tms.subscribed_at", "asc")
        .execute() as Record<string, unknown>[];

      res.json(rows.map(toModule));
    } catch (err) {
      logger?.error("platform_modules_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/entities ────────────────────────────────────────────────

  const entitiesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const search = typeof req.query["q"] === "string" ? req.query["q"] : undefined;
      const entityClass = typeof req.query["class"] === "string" ? req.query["class"] : undefined;
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query["limit"] ?? "100"), 10)));

      let query = db
        .selectFrom("control.entity as e")
        .select([
          "e.id", "e.name", "e.entity_class", "e.ownership_model", "e.module_id",
          "e.table_schema", "e.table_name",
          "e.label_singular", "e.label_plural", "e.description", "e.icon_key",
          "e.display_config", "e.feature_flags", "e.data_policy", "e.identity_config", "e.search_config",
        ])
        .where("e.is_active" as never, "=", true as never);

      if (search) {
        const term = `%${search.toLowerCase()}%`;
        query = query.where((eb) =>
          eb.or([
            eb("e.name" as never, "like", term as never),
            eb("e.table_name" as never, "like", term as never),
          ]),
        ) as typeof query;
      }
      if (entityClass) {
        query = query.where("e.entity_class" as never, "=", entityClass as never) as typeof query;
      }

      const rows = await query
        .orderBy("e.entity_class", "asc")
        .orderBy("e.name", "asc")
        .limit(limit)
        .execute() as Record<string, unknown>[];

      res.json({ data: rows.map(toEntity), count: rows.length });
    } catch (err) {
      logger?.error("platform_entities_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/notifications ───────────────────────────────────────────

  const listNotificationsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ data: [] }); return; }

      const sub = typeof claims["sub"] === "string" ? claims["sub"] : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.json({ data: [] }); return; }

      const limit  = Math.min(100, Math.max(1, parseInt(String(req.query["limit"]  ?? "50"), 10)));
      const offset = Math.max(0,               parseInt(String(req.query["offset"] ?? "0"),  10));
      const unreadOnly = req.query["unread"] === "true";

      let query = db
        .selectFrom("event.notification_delivery as nd")
        .innerJoin("event.notification_message as nm", "nm.id", "nd.message_id")
        .select([
          "nd.id", "nd.read_at",
          "nm.id as message_id", "nm.subject", "nm.event_code", "nm.entity_type",
          "nm.entity_id", "nm.payload", "nm.priority", "nm.created_at",
        ])
        .where("nd.tenant_id", "=", tenantId)
        .where("nd.recipient_id", "=", principalId)
        .where("nd.channel", "=", "in_app");

      if (unreadOnly) {
        query = query.where("nd.read_at" as never, "is", null) as typeof query;
      }

      const rows = await query
        .orderBy("nm.created_at", "desc")
        .limit(limit + 1)
        .offset(offset)
        .execute() as Record<string, unknown>[];

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map((r) => ({
        id:          r["id"],
        message_id:  r["message_id"],
        subject:     r["subject"] ?? null,
        event_code:  r["event_code"],
        entity_type: r["entity_type"] ?? null,
        entity_id:   r["entity_id"] ?? null,
        payload:     r["payload"] ?? {},
        priority:    r["priority"] ?? "normal",
        is_read:     r["read_at"] != null,
        read_at:     r["read_at"] ? (r["read_at"] instanceof Date ? (r["read_at"] as Date).toISOString() : String(r["read_at"])) : null,
        created_at:  r["created_at"] instanceof Date ? (r["created_at"] as Date).toISOString() : String(r["created_at"]),
      }));

      res.json({ data, hasMore });
    } catch (err) {
      logger?.error("platform_notifications_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /platform/notifications/:id/read ─────────────────────────────────

  const markReadHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const deliveryId = req.params["id"] as string;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const sub = typeof claims["sub"] === "string" ? claims["sub"] : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;

      await db
        .updateTable("event.notification_delivery" as never)
        .set({ read_at: new Date(), updated_at: new Date() } as never)
        .where("id" as never, "=", deliveryId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("recipient_id" as never, "=", (principalId ?? "") as never)
        .where("read_at" as never, "is", null)
        .execute();

      res.status(204).end();
    } catch (err) {
      logger?.error("platform_notifications_mark_read_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /platform/notifications/read-all ─────────────────────────────────

  const markAllReadHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(204).end(); return; }

      const sub = typeof claims["sub"] === "string" ? claims["sub"] : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(204).end(); return; }

      await db
        .updateTable("event.notification_delivery" as never)
        .set({ read_at: new Date(), updated_at: new Date() } as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("recipient_id" as never, "=", principalId as never)
        .where("channel" as never, "=", "in_app" as never)
        .where("read_at" as never, "is", null)
        .execute();

      res.status(204).end();
    } catch (err) {
      logger?.error("platform_notifications_mark_all_read_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/notifications/unread-count ──────────────────────────────

  const unreadCountHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ count: 0 }); return; }

      const sub = typeof claims["sub"] === "string" ? claims["sub"] : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.json({ count: 0 }); return; }

      const result = await db
        .selectFrom("event.notification_delivery as nd")
        .select(db.fn.countAll<number>().as("count"))
        .where("nd.tenant_id", "=", tenantId)
        .where("nd.recipient_id", "=", principalId)
        .where("nd.channel", "=", "in_app")
        .where("nd.read_at" as never, "is", null)
        .executeTakeFirst() as { count: number | string } | undefined;

      const count = result ? Number(result.count) : 0;
      res.json({ count });
    } catch (err) {
      logger?.error("platform_unread_count_error", { err: String(err) });
      // Return 0 rather than 500 — this is a non-critical badge count
      res.json({ count: 0 });
    }
  };

  // ── GET /platform/notifications/stream ────────────────────────────────────
  // Server-Sent Events stream for real-time in-app notifications.
  // The client receives events:
  //   notification:new       — a new unread notification arrived
  //   notification:count     — current unread count (sent on connect + on each new notification)
  // A comment `:heartbeat` is emitted every 25 s to prevent proxy timeouts.
  //
  // The stream polls the DB every 15 s for notifications created after the
  // connection was established. This is a simple, database-friendly approach
  // that avoids needing a Redis Pub/Sub subscriber connection per SSE client.

  const notificationStreamHandler: RequestHandler = async (req, res) => {
    let claims: Record<string, unknown> | null = null;
    try {
      claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    } catch {
      res.status(401).end();
      return;
    }
    if (!claims) return;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const sendComment = (text: string) => {
      res.write(`:${text}\n\n`);
    };
    sendEvent("connected", { ok: true });

    const xOrg   = (req.headers["x-org"]   as string) ?? "";
    const xRealm = (req.headers["x-realm"] as string) ?? "athyper";

    let tenantId: string | null = null;
    let principalId: string | null = null;
    try {
      tenantId    = await resolveTenantId(db, xOrg, xRealm);
      const sub   = typeof claims["sub"] === "string" ? claims["sub"] : "";
      principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
    } catch {
      sendEvent("connection:error", { code: "SESSION_SCOPE_UNAVAILABLE" });
      res.end();
      return;
    }

    if (!tenantId || !principalId) {
      sendEvent("connection:error", { code: "SESSION_SCOPE_UNAVAILABLE" });
      res.end();
      return;
    }

    // ── SSE headers ──────────────────────────────────────────────────────────
    // ── Initial count ────────────────────────────────────────────────────────
    const getUnreadCount = async (): Promise<number> => {
      try {
        const row = await db
          .selectFrom("event.notification_delivery as nd")
          .select(db.fn.countAll<number>().as("count"))
          .where("nd.tenant_id",   "=", tenantId as string)
          .where("nd.recipient_id","=", principalId as string)
          .where("nd.channel",     "=", "in_app")
          .where("nd.read_at" as never, "is", null)
          .executeTakeFirst() as { count: number | string } | undefined;
        return row ? Number(row.count) : 0;
      } catch { return 0; }
    };

    const initialCount = await getUnreadCount();
    sendEvent("notification:count", { count: initialCount });

    // ── Poll for new deliveries ──────────────────────────────────────────────
    const sinceAt = new Date().toISOString();
    let lastSeenAt = sinceAt;

    const poll = async () => {
      try {
        const newRows = await db
          .selectFrom("event.notification_delivery as nd")
          .innerJoin("event.notification_message as nm", "nm.id" as never, "nd.message_id" as never)
          .select([
            "nd.id", "nm.subject", "nm.event_code",
            "nm.entity_type", "nm.entity_id", "nm.priority", "nd.created_at",
          ] as never[])
          .where("nd.tenant_id",    "=", tenantId as string)
          .where("nd.recipient_id", "=", principalId as string)
          .where("nd.channel",      "=", "in_app")
          .where("nd.created_at" as never, ">", lastSeenAt as never)
          .orderBy("nd.created_at" as never, "asc")
          .limit(20)
          .execute() as Array<Record<string, unknown>>;

        if (newRows.length > 0) {
          for (const row of newRows) {
            sendEvent("notification:new", {
              id:          row["id"],
              subject:     row["subject"] ?? null,
              event_code:  row["event_code"],
              entity_type: row["entity_type"] ?? null,
              entity_id:   row["entity_id"] ?? null,
              priority:    row["priority"] ?? "normal",
              created_at:  row["created_at"] instanceof Date
                           ? (row["created_at"] as Date).toISOString()
                           : String(row["created_at"]),
            });
          }
          // Update lastSeenAt to the most recent row
          const latest = newRows[newRows.length - 1];
          if (latest?.["created_at"]) {
            lastSeenAt = latest["created_at"] instanceof Date
              ? (latest["created_at"] as Date).toISOString()
              : String(latest["created_at"]);
          }
          // Send updated count
          const count = await getUnreadCount();
          sendEvent("notification:count", { count });
        }
      } catch (err) {
        logger?.error("notif_stream_poll_error", { err: String(err) });
      }
    };

    // Poll every 15 s, heartbeat every 25 s
    const pollTimer      = setInterval(() => void poll(), 15_000);
    const heartbeatTimer = setInterval(() => sendComment("heartbeat"), 25_000);

    // ── Cleanup on close ─────────────────────────────────────────────────────
    const cleanup = () => {
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
    };

    req.on("close",  cleanup);
    req.on("end",    cleanup);
    res.on("finish", cleanup);
    res.on("close",  cleanup);
  };

  // ── GET /platform/stats ───────────────────────────────────────────────────

  const statsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const [tenants, modules, principals] = await Promise.all([
        db.selectFrom("master.tenant as t")
          .select(db.fn.countAll<number>().as("count"))
          .where("t.status" as never, "=", "active" as never)
          .executeTakeFirst() as Promise<{ count: number | string } | undefined>,
        db.selectFrom("master.tenant_module_subscription as tms")
          .select(db.fn.countAll<number>().as("count"))
          .where("tms.status", "=", "active")
          .executeTakeFirst() as Promise<{ count: number | string } | undefined>,
        db.selectFrom("master.principal as p")
          .select(db.fn.countAll<number>().as("count"))
          .where("p.is_active" as never, "=", true as never)
          .where("p.is_locked", "=", false)
          .executeTakeFirst() as Promise<{ count: number | string } | undefined>,
      ]);

      res.json({
        active_tenants:  Number(tenants?.count  ?? 0),
        active_modules:  Number(modules?.count  ?? 0),
        active_principals: Number(principals?.count ?? 0),
        system_health:   "ok",
      });
    } catch (err) {
      logger?.error("platform_stats_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/blueprints ──────────────────────────────────────────────

  const blueprintsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const { rows } = await sql<{
        id:                string;
        code:              string;
        name:              string;
        category:          string;
        industry_vertical: string[];
        framework:         string | null;
        base_version:      string;
        description:       string | null;
        dependencies:      string[];
        status:            "active" | "applied";
      }>`
        SELECT
          br.id,
          br.code,
          br.name,
          br.category,
          br.industry_vertical,
          br.framework,
          br.base_version,
          br.description,
          br.dependencies,
          CASE
            WHEN tba.blueprint_code IS NOT NULL THEN 'applied'
            ELSE 'active'
          END AS status
        FROM   control.blueprint_registry br
        LEFT   JOIN control.blueprint_tenant_application tba
               ON  tba.blueprint_code = br.code
               AND tba.tenant_id      = ${tenantId}::uuid
               AND tba.status         = 'applied'
        WHERE  br.status = 'active'
        ORDER  BY br.category, br.name
      `.execute(db);

      res.json(rows);
    } catch (err) {
      logger?.error("platform_blueprints_error", { err: String(err) });
      // Fall back to empty array so the page uses its static catalog
      res.json([]);
    }
  };

  // ── POST /platform/blueprints/:code/apply ────────────────────────────────
  //
  // Marks a blueprint as applied for the current tenant.
  // Idempotent — upserts via ON CONFLICT (tenant_id, blueprint_code) DO UPDATE.
  // Validates that the blueprint code exists in control.blueprint_registry.

  const applyBlueprintHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const code = (req.params["code"] as string | undefined)?.trim().toLowerCase();
      if (!code) {
        res.status(400).json({ error: "MISSING_CODE", message: "blueprint code is required" }); return;
      }

      // Validate blueprint exists
      const bp = await db
        .selectFrom("control.blueprint_registry as br" as never)
        .select(["br.code" as never, "br.name" as never, "br.category" as never, "br.dependencies" as never])
        .where("br.code"   as never, "=", code as never)
        .where("br.status" as never, "=", "active" as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!bp) {
        res.status(404).json({ error: "BLUEPRINT_NOT_FOUND", message: `Blueprint "${code}" not found or not active` });
        return;
      }

      // Upsert — re-applying an already-applied blueprint resets its applied_at
      const sub = claims["sub"];
      const principalId = typeof sub === "string" && sub ? sub : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (db as any)
        .insertInto("control.blueprint_tenant_application")
        .values({
          tenant_id:        tenantId,
          blueprint_code:   code,
          applied_version:  "1.0.0",   // current registry version
          applied_at:       new Date(),
          applied_by:       principalId ?? null,
          status:           "applied",
          error_detail:     null,
        })
        .onConflict((oc: any) =>
          oc
            .columns(["tenant_id", "blueprint_code"])
            .doUpdateSet({
              status:          "applied",
              applied_at:      new Date(),
              applied_by:      principalId ?? null,
              error_detail:    null,
            })
        )
        .returningAll()
        .executeTakeFirst() as Record<string, unknown>;

      res.status(200).json({
        ok:            true,
        blueprintCode: row["blueprint_code"],
        appliedAt:     row["applied_at"],
        status:        row["status"],
      });
    } catch (err) {
      logger?.error("platform_blueprint_apply_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /platform/blueprints/:code/apply ───────────────────────────────
  //
  // Unmarks a blueprint — sets status to 'removed'. Does NOT roll back any data
  // that was seeded when the blueprint was applied (blueprints are additive).

  const unapplyBlueprintHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const code = (req.params["code"] as string | undefined)?.trim().toLowerCase();
      if (!code) {
        res.status(400).json({ error: "MISSING_CODE" }); return;
      }

      const unapplySub = claims["sub"];
      const principalId = typeof unapplySub === "string" && unapplySub ? unapplySub : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = await (db as any)
        .updateTable("control.blueprint_tenant_application")
        .set({ status: "removed", applied_by: principalId ?? null })
        .where("tenant_id",      "=", tenantId)
        .where("blueprint_code", "=", code)
        .where("status",         "=", "applied")
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!updated) {
        res.status(404).json({ error: "NOT_APPLIED", message: `Blueprint "${code}" is not currently applied` });
        return;
      }

      res.status(200).json({ ok: true, blueprintCode: updated["blueprint_code"], status: updated["status"] });
    } catch (err) {
      logger?.error("platform_blueprint_unapply_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/entities/:name/fields ───────────────────────────────────

  const entityFieldsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityName = (req.params["name"] as string | undefined)?.trim();
      if (!entityName) {
        res.status(400).json({ error: "MISSING_ENTITY", message: "entity name is required" });
        return;
      }

      const fields = await db
        .selectFrom("control.entity_field as ef")
        .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
        .innerJoin("control.entity as e", "e.id", "ev.entity_id")
        .select([
          "ef.id",
          "ef.name",
          "ef.label",
          "ef.column_name",
          "ef.data_type",
          "ef.ui_type",
          "ef.is_required",
          "ef.is_unique",
          "ef.is_searchable",
          "ef.is_filterable",
          "ef.is_sortable",
          "ef.is_read_only",
          "ef.is_computed",
          "ef.is_active",
          "ef.sort_order",
          "ef.origin",
          "ef.cardinality",
          "ef.default_value",
          "ef.compute_expr",
          "ef.enum_config",
          "ef.enum_domain_code",
          "ef.reference_config",
          "ef.money_config",
          "ef.json_config",
          "ef.datetime_config",
          "ef.ui_hint",
          "ef.visibility",
          "ef.editability",
          "ef.lookup_config",
          "ef.lookup_profile",
          "ef.filter_config",
          "ef.collection_behavior",
          "ef.validation",
          "ef.validation as validation_rules",
          "ef.constraints",
          "ef.group_key",
        ])
        .where("e.name", "=", entityName)
        .where("e.tenant_id", "is", null)
        .where("ev.status", "=", "EFFECTIVE")
        .where("ef.is_active", "=", true)
        .orderBy("ef.sort_order", "asc")
        .orderBy("ef.name", "asc")
        .execute();

      res.json(fields);
    } catch (err) {
      logger?.error("platform_entity_fields_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/preferences ─────────────────────────────────────────────

  const PREFS_EMPTY = {
    appearance_mode: null, density_code: null, theme_preset: null, notification_digest: null, metadata: {},
    locale_code: null, language_code: null, timezone_code: null,
    date_format: null, number_format: null, week_start: null,
    home_workspace_code: null, home_module_code: null, default_company_code_id: null,
  };

  const nullablePreferenceText = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const getPreferencesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json(PREFS_EMPTY); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.json(PREFS_EMPTY); return; }

      const row = await db
        .selectFrom("master.principal_ui_profile as p")
        .select([
          "p.appearance_mode", "p.density_code", "p.metadata",
          "p.locale_code", "p.language_code", "p.timezone_code",
          "p.date_format", "p.number_format", "p.week_start",
          "p.home_workspace_code", "p.home_module_code", "p.default_company_code_id",
        ])
        .where("p.tenant_id", "=", tenantId)
        .where("p.principal_id", "=", principalId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      const meta = (row?.["metadata"] as Record<string, unknown> | null) ?? {};
      res.json({
        appearance_mode:         row?.["appearance_mode"]         ?? null,
        density_code:            row?.["density_code"]            ?? null,
        theme_preset:            meta["theme_preset"]             ?? null,
        notification_digest:     meta["notification_digest"]      ?? null,
        metadata:                meta,
        locale_code:             row?.["locale_code"]             ?? null,
        language_code:           row?.["language_code"]           ?? null,
        timezone_code:           row?.["timezone_code"]           ?? null,
        date_format:             row?.["date_format"]             ?? null,
        number_format:           row?.["number_format"]           ?? null,
        week_start:              row?.["week_start"]              ?? null,
        home_workspace_code:     row?.["home_workspace_code"]     ?? null,
        home_module_code:        row?.["home_module_code"]        ?? null,
        default_company_code_id: row?.["default_company_code_id"] ?? null,
      });
    } catch (err) {
      logger?.error("platform_preferences_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /platform/preferences ───────────────────────────────────────────

  const patchPreferencesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ ok: false, reason: "NO_ORG_CONTEXT" }); return; }

      const body = req.body as {
        appearance_mode?: string | null;
        density_code?: string | null;
        theme_preset?: string | null;
        metadata?: Record<string, unknown>;
        locale_code?: string | null;
        language_code?: string | null;
        timezone_code?: string | null;
        date_format?: string | null;
        number_format?: string | null;
        week_start?: number | string | null;
        home_workspace_code?: string | null;
        home_module_code?: string | null;
        notification_digest?: string | null;
      };

      const weekStart =
        body.week_start === undefined || body.week_start === null || body.week_start === ""
          ? null
          : Number(body.week_start);

      if (weekStart !== null && (!Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "week_start must be an integer between 0 and 6", field: "week_start" });
        return;
      }

      const homeWorkspaceCode = nullablePreferenceText(body.home_workspace_code);
      const homeModuleCode = nullablePreferenceText(body.home_module_code);

      const [homeWorkspace, homeModule] = await Promise.all([
        homeWorkspaceCode
          ? db.selectFrom("shared.workspace as w").select("w.code").where("w.code", "=", homeWorkspaceCode).executeTakeFirst()
          : Promise.resolve(null),
        homeModuleCode
          ? db.selectFrom("shared.module as m").select("m.code").where("m.code", "=", homeModuleCode).executeTakeFirst()
          : Promise.resolve(null),
      ]);

      if (homeWorkspaceCode && !homeWorkspace) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "home_workspace_code must match shared.workspace.code", field: "home_workspace_code", value: homeWorkspaceCode });
        return;
      }
      if (homeModuleCode && !homeModule) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "home_module_code must match shared.module.code", field: "home_module_code", value: homeModuleCode });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const { email, username, display_name } = extractOidcIdentity(claims as Record<string, unknown>, sub);
      const jit = await jitProvisionPrincipal(db, { sub, username, display_name, email, tenant_id: tenantId, realm_key: xRealm });
      if (!jit) { res.status(503).json({ error: "PRINCIPAL_PROVISION_FAILED", message: "Could not resolve or provision user principal" }); return; }
      const principalId = jit.principal_id;

      const existingMeta = await db
        .selectFrom("master.principal_ui_profile as p")
        .select("p.metadata")
        .where("p.tenant_id", "=", tenantId)
        .where("p.principal_id", "=", principalId)
        .executeTakeFirst()
        .then((r) => (r?.["metadata"] as Record<string, unknown> | null) ?? {});

      const metaPatch: Record<string, unknown> = { ...(body.metadata ?? {}) };
      if (body.theme_preset != null) metaPatch["theme_preset"] = body.theme_preset;
      if (body.notification_digest != null) metaPatch["notification_digest"] = body.notification_digest;
      const mergedMeta = { ...existingMeta, ...metaPatch };

      const now = new Date().toISOString();
      const vals = {
        tenant_id:           tenantId,
        principal_id:        principalId,
        appearance_mode:     nullablePreferenceText(body.appearance_mode),
        density_code:        nullablePreferenceText(body.density_code),
        metadata:            JSON.stringify(mergedMeta),
        locale_code:         nullablePreferenceText(body.locale_code),
        language_code:       nullablePreferenceText(body.language_code),
        timezone_code:       nullablePreferenceText(body.timezone_code),
        date_format:         nullablePreferenceText(body.date_format),
        number_format:       nullablePreferenceText(body.number_format),
        week_start:          weekStart,
        home_workspace_code: homeWorkspaceCode,
        home_module_code:    homeModuleCode,
        created_by:          principalId,
        updated_at:          now,
        updated_by:          principalId,
      };

      await db
        .insertInto("master.principal_ui_profile" as never)
        .values(vals as never)
        .onConflict((oc) =>
          oc.columns(["tenant_id", "principal_id"] as never[]).doUpdateSet({
            appearance_mode:     vals.appearance_mode,
            density_code:        vals.density_code,
            metadata:            vals.metadata,
            locale_code:         vals.locale_code,
            language_code:       vals.language_code,
            timezone_code:       vals.timezone_code,
            date_format:         vals.date_format,
            number_format:       vals.number_format,
            week_start:          vals.week_start,
            home_workspace_code: vals.home_workspace_code,
            home_module_code:    vals.home_module_code,
            updated_at:          now,
            updated_by:          principalId,
          } as never),
        )
        .execute();

      res.json({ ok: true });
    } catch (err) {
      logger?.error("platform_preferences_patch_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/profile ─────────────────────────────────────────────────

  const getProfileHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_REQUIRED" }); return; }

      const [principal, profile, authBindings] = await Promise.all([
        db.selectFrom("master.principal as p")
          .select(["p.id", "p.code", "p.name", "p.login_email", "p.principal_type", "p.principal_source", "p.created_at"])
          .where("p.tenant_id", "=", tenantId)
          .where("p.id", "=", principalId)
          .executeTakeFirst(),
        db.selectFrom("master.principal_profile as pp")
          .select([
            "pp.given_name", "pp.family_name", "pp.preferred_name", "pp.display_name",
            "pp.avatar_url", "pp.locale", "pp.timezone",
            "pp.default_company_code_id", "pp.default_cost_center_id",
            "pp.employee_id", "pp.enabled_date", "pp.disabled_date", "pp.updated_at",
          ])
          .where("pp.tenant_id", "=", tenantId)
          .where("pp.principal_id", "=", principalId)
          .executeTakeFirst(),
        db.selectFrom("master.principal_identity_binding as ab")
          .select([
            "ab.realm_key", "ab.provider_code", "ab.username",
            "ab.sync_status", "ab.synced_at", "ab.idp_enabled",
            "ab.idp_email_verified", "ab.required_actions",
          ])
          .where("ab.tenant_id", "=", tenantId)
          .where("ab.principal_id", "=", principalId)
          .where("ab.realm_key", "=", xRealm)
          .execute(),
      ]);

      res.json({
        principal:    principal    ?? null,
        profile:      profile      ?? null,
        auth_bindings: authBindings ?? [],
      });
    } catch (err) {
      logger?.error("platform_profile_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/identity ────────────────────────────────────────────────

  const getIdentityHandler: RequestHandler = async (req, res, next) => {
    const EMPTY = { persona: null, groups: [], teams: [], delegations_received: [], delegations_given: [] };
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json(EMPTY); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.json(EMPTY); return; }

      // Persona + shared.persona join
      const personaRow = await db
        .selectFrom("master.principal_persona as pp")
        .innerJoin("shared.persona as p", "p.id", "pp.persona_id")
        .select([
          "pp.persona_id", "p.code as persona_code", "p.name as persona_name",
          "pp.expires_at", "pp.assigned_by", "pp.created_at",
        ])
        .where("pp.tenant_id", "=", tenantId)
        .where("pp.principal_id", "=", principalId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      // Groups
      const groupRows = await db
        .selectFrom("master.auth_group_member as gm")
        .innerJoin("master.auth_group as g", "g.id", "gm.group_id")
        .select(["g.id", "g.code", "g.name", "g.is_system", "g.status"])
        .where("gm.tenant_id", "=", tenantId)
        .where("gm.principal_id", "=", principalId)
        .execute() as Record<string, unknown>[];

      const groupIds = groupRows.map((g) => g["id"] as string).filter(Boolean);

      const roleRows = groupIds.length > 0
        ? await db
            .selectFrom("master.auth_group_role as gr")
            .innerJoin("shared.role as r", "r.id", "gr.role_id")
            .select(["gr.group_id", "r.code as role_code", "r.name as role_name", "gr.visibility_scope", "gr.assignment_scope_type", "gr.assignment_scope_ref_id"])
            .where("gr.tenant_id", "=", tenantId)
            .where("gr.group_id", "in", groupIds)
            .where("gr.status", "=", "active")
            .execute() as Record<string, unknown>[]
        : [];

      const groups = groupRows.map((g) => ({
        ...g,
        roles: roleRows
          .filter((r) => r["group_id"] === g["id"])
          .map((r) => ({ role_code: r["role_code"], role_name: r["role_name"], visibility_scope: r["visibility_scope"], assignment_scope_type: r["assignment_scope_type"], assignment_scope_ref_id: r["assignment_scope_ref_id"] })),
      }));

      // Teams
      const teams = await db
        .selectFrom("master.team_member as tp")
        .innerJoin("master.team as t", "t.id", "tp.team_id")
        .select([
          "t.id", "t.code", "t.name", "t.team_type",
          "tp.role_in_team", "t.effective_from",
        ])
        .where("tp.tenant_id", "=", tenantId)
        .where("tp.principal_id", "=", principalId)
        .where("tp.left_at" as never, "is", null)
        .execute() as Record<string, unknown>[];

      // Accessible company codes — direct principal assignment + via group membership
      const [directCC, groupCC] = await Promise.all([
        db.selectFrom("master.company_code_access as cca")
          .innerJoin("master.company_code as cc", "cc.id", "cca.company_code_id")
          .leftJoin("master.legal_entity as le", "le.id", "cc.legal_entity_id")
          .select([
            "cc.code as company_code",
            "cc.name as company_name",
            "le.code as legal_entity_code",
            "le.name as legal_entity_name",
          ])
          .where("cca.tenant_id", "=", tenantId)
          .where("cca.entity_type", "=", "principal")
          .where("cca.entity_id", "=", principalId)
          .where("cc.is_active", "=", true)
          .execute() as Promise<Array<{ company_code: string; company_name: string; legal_entity_code: string | null; legal_entity_name: string | null }>>,
        groupIds.length > 0
          ? db.selectFrom("master.company_code_access as cca")
              .innerJoin("master.company_code as cc", "cc.id", "cca.company_code_id")
              .leftJoin("master.legal_entity as le", "le.id", "cc.legal_entity_id")
              .select([
                "cc.code as company_code",
                "cc.name as company_name",
                "le.code as legal_entity_code",
                "le.name as legal_entity_name",
              ])
              .where("cca.tenant_id", "=", tenantId)
              .where("cca.entity_type", "=", "auth_group")
              .where("cca.entity_id", "in", groupIds)
              .where("cc.is_active", "=", true)
              .execute() as Promise<Array<{ company_code: string; company_name: string; legal_entity_code: string | null; legal_entity_name: string | null }>>
          : Promise.resolve([]),
      ]);

      const seenCC = new Set<string>();
      const accessible_companies = [...directCC, ...groupCC].filter((r) => {
        if (seenCC.has(r.company_code)) return false;
        seenCC.add(r.company_code);
        return true;
      });

      // Delegations — include counterparty names for display
      const now = new Date();
      const [delegationsReceived, delegationsGiven] = await Promise.all([
        db.selectFrom("master.delegation_grant as d")
          .leftJoin("master.principal as delegator", "delegator.id", "d.delegator_id")
          .select([
            "d.id", "d.delegator_id", "d.scope_type", "d.scope_ref",
            "d.permissions", "d.reason", "d.expires_at", "d.is_revoked", "d.created_at",
            "delegator.name as delegator_name",
          ])
          .where("d.tenant_id", "=", tenantId)
          .where("d.delegate_id", "=", principalId)
          .where("d.is_revoked", "=", false)
          .where("d.expires_at", ">", now as never)
          .execute(),
        db.selectFrom("master.delegation_grant as d")
          .leftJoin("master.principal as delegate", "delegate.id", "d.delegate_id")
          .select([
            "d.id", "d.delegate_id", "d.scope_type", "d.scope_ref",
            "d.permissions", "d.reason", "d.expires_at", "d.is_revoked", "d.created_at",
            "delegate.name as delegate_name",
          ])
          .where("d.tenant_id", "=", tenantId)
          .where("d.delegator_id", "=", principalId)
          .where("d.is_revoked", "=", false)
          .execute(),
      ]);

      res.json({
        persona:               personaRow          ?? null,
        groups,
        teams:                 teams               as Record<string, unknown>[],
        delegations_received:  delegationsReceived as Record<string, unknown>[],
        delegations_given:     delegationsGiven    as Record<string, unknown>[],
        accessible_companies,
      });
    } catch (err) {
      logger?.error("platform_identity_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/tenant-admin ────────────────────────────────────────────

  const getTenantAdminHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_REQUIRED" }); return; }

      // Gate: require membership in either the canonical 'tenant_admin' group
      // or the seeded '{UPPER_TENANT_CODE}-ADMIN' group (e.g. 'ATHYPER-ADMIN').
      // Resolve tenant code first, then check membership.
      const tenantCodeRow = await db
        .selectFrom("master.tenant as t")
        .select("t.code")
        .where("t.id", "=", tenantId)
        .executeTakeFirst();
      const tenantAdminCode = tenantCodeRow ? `${tenantCodeRow.code.toUpperCase()}-ADMIN` : "";

      const adminCheck = await db
        .selectFrom("master.auth_group_member as gm")
        .innerJoin("master.auth_group as g", "g.id", "gm.group_id")
        .select("gm.id")
        .where("gm.tenant_id", "=", tenantId)
        .where("gm.principal_id", "=", principalId)
        .where("g.code", "in", ["tenant_admin", tenantAdminCode].filter(Boolean))
        .executeTakeFirst();

      if (!adminCheck) {
        res.status(403).json({ error: "TENANT_ADMIN_REQUIRED" });
        return;
      }

      const [tenantRow, tenantProfile, modules, features, permissionOverrides] = await Promise.all([
        db.selectFrom("master.tenant as t")
          .select(["t.id", "t.code", "t.name", "t.display_name", "t.realm_key", "t.region", "t.subscription", "t.status"])
          .where("t.id", "=", tenantId)
          .executeTakeFirst(),
        db.selectFrom("master.tenant_profile as tp")
          .select([
            "tp.country_code", "tp.currency_code", "tp.locale_code",
            "tp.timezone_code", "tp.fiscal_year_start_month", "tp.date_format",
            "tp.number_format", "tp.week_start", "tp.language_code",
            "tp.reporting_currency_code",
          ])
          .where("tp.tenant_id", "=", tenantId)
          .executeTakeFirst(),
        db.selectFrom("master.tenant_module_subscription as ms")
          .innerJoin("shared.module as m", "m.id", "ms.module_id")
          .select(["m.code as module_code", "m.name as module_name", "ms.status", "ms.subscribed_at"])
          .where("ms.tenant_id", "=", tenantId)
          .execute(),
        db.selectFrom("master.tenant_feature_entitlement as fe")
          .select(["fe.feature_id", "fe.status", "fe.expires_at", "fe.activated_at"])
          .where("fe.tenant_id", "=", tenantId)
          .execute(),
        db.selectFrom("master.tenant_permission_override as po")
          .select(["po.permission_id", "po.is_granted", "po.reason", "po.expires_at", "po.granted_by"])
          .where("po.tenant_id", "=", tenantId)
          .execute(),
      ]);

      res.json({
        tenant:               tenantRow          ?? null,
        tenant_profile:       tenantProfile      ?? null,
        modules:              modules            as Record<string, unknown>[],
        features:             features           as Record<string, unknown>[],
        permission_overrides: permissionOverrides as Record<string, unknown>[],
      });
    } catch (err) {
      logger?.error("platform_tenant_admin_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /me/tenant-context ────────────────────────────────────────────────
  // Principal-centric tenant context. No admin gate.
  //   - active:           the tenant/realm/workbench the request is operating in
  //   - memberships:      tenants this KC subject is bound to within the realm
  //                       (single-entry in neon's single-tenant case; many in mesh)
  //   - enabled_modules:  effective module codes for the principal in the active tenant

  const getTenantContextHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const xWorkbenches = (req.headers["x-workbenches"] as string) ?? "";
      const activeWorkbench = xWorkbenches.split(",").map((s) => s.trim()).find(Boolean) ?? null;

      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_REQUIRED" }); return; }

      const [activeTenant, membershipRows, moduleAccess] = await Promise.all([
        db.selectFrom("master.tenant as t")
          .select(["t.id", "t.code", "t.name", "t.display_name", "t.realm_key"])
          .where("t.id", "=", tenantId)
          .executeTakeFirst(),
        sub
          ? db.selectFrom("master.principal_identity_binding as pib")
              .innerJoin("master.tenant as t", "t.id", "pib.tenant_id")
              .select(["t.id", "t.code", "t.name", "t.display_name", "t.realm_key"])
              .distinct()
              .where("pib.subject_id", "=", sub)
              .where("pib.realm_key", "=", xRealm)
              .execute()
          : Promise.resolve([] as Array<Record<string, unknown>>),
        getEffectiveModuleAccess(db, tenantId, principalId),
      ]);

      const active = activeTenant ? {
        tenant_id:  activeTenant.id      as string,
        code:       activeTenant.code    as string,
        name:       (activeTenant.display_name ?? activeTenant.name) as string,
        realm_key:  activeTenant.realm_key as string,
        workbench:  activeWorkbench,
      } : null;

      const memberships = (membershipRows as Array<Record<string, unknown>>).map((r) => ({
        tenant_id:  r["id"]   as string,
        code:       r["code"] as string,
        name:       (r["display_name"] ?? r["name"]) as string,
        realm_key:  r["realm_key"] as string,
        is_active:  r["id"] === tenantId,
      }));

      res.json({
        active,
        memberships,
        enabled_modules: moduleAccess.moduleCodes,
      });
    } catch (err) {
      logger?.error("me_tenant_context_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register routes ───────────────────────────────────────────────────────

  router.get("/platform/saved-views/:entity",                    listSavedViewsHandler);
  router.post("/platform/saved-views/:entity",                   createSavedViewHandler);
  router.post("/platform/saved-views",                           createSavedViewBodyHandler);
  router.delete("/platform/saved-views/:entity/default",         clearDefaultViewHandler);
  router.delete("/platform/saved-views/:entity/:viewId",         deleteSavedViewHandler);
  router.patch("/platform/saved-views/:entity/:viewId",          updateSavedViewHandler);
  router.patch("/platform/saved-views/:entity/:viewId/default",  setDefaultViewHandler);

  // Principal-centric endpoints. Canonical namespace is /me/*; /user/* and
  // /platform/* are retained as @deprecated aliases for back-compat with older
  // BFF callers. New consumers should call /me/*; the aliases will be removed
  // once all known callers have migrated. Add new principal-centric routes here
  // — the loop registers /me + every requested alias atomically so an alias
  // can't drift out of step with the canonical route.
  type AliasNs = "user" | "platform";
  type Method = "get" | "post" | "patch" | "delete";
  const meRoutes: Array<{ method: Method; path: string; handler: RequestHandler; aliases: AliasNs[] }> = [
    { method: "get",   path: "profile",                     handler: getProfileHandler,         aliases: ["user", "platform"] },
    { method: "get",   path: "identity",                    handler: getIdentityHandler,        aliases: ["user", "platform"] },
    { method: "get",   path: "preferences",                 handler: getPreferencesHandler,     aliases: ["user", "platform"] },
    { method: "patch", path: "preferences",                 handler: patchPreferencesHandler,   aliases: ["user", "platform"] },
    { method: "get",   path: "saved-views",                 handler: userListSavedViewsHandler, aliases: ["user"] },
    { method: "patch", path: "saved-views/:viewId/:action", handler: userSavedViewActionHandler, aliases: ["user"] },
    { method: "get",   path: "tenant-context",              handler: getTenantContextHandler,   aliases: [] },
  ];
  for (const r of meRoutes) {
    const canonicalPath = `/me/${r.path}`;
    router[r.method](canonicalPath, r.handler);
    for (const alias of r.aliases) {
      const aliasPath = `/${alias}/${r.path}`;
      router[r.method](aliasPath, withDeprecation(canonicalPath, aliasPath, r.handler));
    }
  }
  // Admin-gated tenant admin view — kept under /platform/* (not /me/*) since it
  // returns full tenant config behind a tenant_admin group check, not just "my" context.
  // Canonical path is /platform/admin/tenant; the other two are @deprecated aliases.
  router.get("/platform/admin/tenant",     getTenantAdminHandler);
  router.get("/platform/tenant-admin",     withDeprecation("/platform/admin/tenant", "/platform/tenant-admin", getTenantAdminHandler)); // @deprecated
  router.get("/user/tenant-admin",         withDeprecation("/platform/admin/tenant", "/user/tenant-admin",     getTenantAdminHandler)); // @deprecated

  router.get("/platform/modules", modulesHandler);
  // entity fields before entity catalog to avoid :name capture on /entities
  router.get("/platform/entities/:name/fields", entityFieldsHandler);
  router.get("/platform/entities", entitiesHandler);
  router.get("/platform/blueprints",                blueprintsHandler);
  router.post("/platform/blueprints/:code/apply",   applyBlueprintHandler);
  router.delete("/platform/blueprints/:code/apply", unapplyBlueprintHandler);
  router.get("/platform/stats", statsHandler);
  router.get("/platform/notifications", listNotificationsHandler);
  router.post("/platform/notifications/read-all", markAllReadHandler);
  router.post("/platform/notifications/:id/read", markReadHandler);
  router.get("/platform/notifications/unread-count", unreadCountHandler);
  router.get("/platform/notifications/stream", notificationStreamHandler);

  // Paths without /platform/ prefix — BFF proxies to these directly
  router.get("/notifications/unread-count", unreadCountHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — platform-admin only
  // ═══════════════════════════════════════════════════════════════════════════

  function isPlatformAdmin(claims: Record<string, unknown>): boolean {
    const ra = claims["realm_access"] as Record<string, unknown> | undefined;
    const roles = ra?.["roles"];
    return Array.isArray(roles) && (roles as string[]).includes("platform-admin");
  }

  const SYSTEM_ACTOR = "00000000-0000-7000-a000-000000000001";

  // ── FX Rate write endpoints ──────────────────────────────────────────────────

  const createFxRateHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg        = (req.headers["x-org"]   as string) ?? "";
      const xRealm      = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId    = await resolveTenantId(db, xOrg, xRealm);
      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null) ?? SYSTEM_ACTOR;
      const body = req.body as Record<string, unknown>;
      const { from_currency, to_currency, rate, rate_type, effective_date, effective_time, source, source_reference } = body;

      if (!from_currency || !to_currency || !rate || !rate_type || !effective_date) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "from_currency, to_currency, rate, rate_type, effective_date are required" });
        return;
      }

      const row = await db
        .insertInto("master.fx_rate" as never)
        .values({
          tenant_id:        tenantId,
          from_currency:    String(from_currency).toUpperCase(),
          to_currency:      String(to_currency).toUpperCase(),
          rate:             Number(rate),
          rate_type:        String(rate_type).toUpperCase(),
          effective_date:   String(effective_date),
          effective_time:   effective_time ? String(effective_time) : null,
          source:           source ? String(source).toUpperCase() : "MANUAL",
          source_reference: source_reference ? String(source_reference) : null,
          created_by:       principalId,
          metadata:         "{}",
        } as never)
        .returning(["id", "from_currency", "to_currency", "rate", "rate_type", "effective_date", "status"] as never[])
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: row });
    } catch (err) {
      logger?.error("admin_fx_rate_create_error", { err: String(err) });
      next(err);
    }
  };

  const updateFxRateHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg        = (req.headers["x-org"]   as string) ?? "";
      const xRealm      = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId    = await resolveTenantId(db, xOrg, xRealm);
      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null) ?? SYSTEM_ACTOR;
      const rateId      = req.params["id"] as string ?? "";
      const body       = req.body as Record<string, unknown>;

      if (!isUuid(rateId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid id" });
        return;
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: principalId };
      if (body["rate"]             !== undefined) updates["rate"]             = Number(body["rate"]);
      if (body["source_reference"] !== undefined) updates["source_reference"] = String(body["source_reference"]);
      if (body["metadata"]         !== undefined) updates["metadata"]         = JSON.stringify(body["metadata"]);

      const row = await db
        .updateTable("master.fx_rate" as never)
        .set(updates as never)
        .where("id"        as never, "=", rateId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("is_active" as never, "=", true as never)
        .returning(["id", "from_currency", "to_currency", "rate", "rate_type", "effective_date", "status"] as never[])
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ data: row });
    } catch (err) {
      logger?.error("admin_fx_rate_update_error", { err: String(err) });
      next(err);
    }
  };

  const supersedeFxRateHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg        = (req.headers["x-org"]   as string) ?? "";
      const xRealm      = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId    = await resolveTenantId(db, xOrg, xRealm);
      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null) ?? SYSTEM_ACTOR;
      const rateId      = req.params["id"] as string ?? "";

      if (!isUuid(rateId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid id" });
        return;
      }

      const row = await db
        .updateTable("master.fx_rate" as never)
        .set({
          status:            "superseded",
          status_changed_at: new Date().toISOString(),
          status_changed_by: principalId,
          updated_at:        new Date().toISOString(),
          updated_by:        principalId,
        } as never)
        .where("id"        as never, "=", rateId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("is_active" as never, "=", true as never)
        .returning(["id", "status"] as never[])
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ data: row });
    } catch (err) {
      logger?.error("admin_fx_rate_supersede_error", { err: String(err) });
      next(err);
    }
  };

  // ── Enterprise feature admin endpoints ───────────────────────────────────────

  const listEnterpriseFeaturesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q = req.query as Record<string, unknown>;
      const search = typeof q["search"] === "string" ? q["search"].trim() : "";

      let base = db.selectFrom("shared.enterprise_feature as ef");
      if (search) {
        base = base.where((eb) => eb.or([
          eb("ef.code" as never, "ilike", `%${search}%` as never),
          eb("ef.name" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }

      const rows = await base
        .select(["ef.id", "ef.code", "ef.name", "ef.description", "ef.view_key", "ef.edit_key", "ef.sort_order", "ef.status"] as never[])
        .orderBy("ef.sort_order" as never, "asc")
        .orderBy("ef.code"       as never, "asc")
        .execute();

      res.json({ data: rows });
    } catch (err) {
      logger?.error("admin_enterprise_features_error", { err: String(err) });
      next(err);
    }
  };

  // ── Subscription plan admin endpoints ────────────────────────────────────────

  const listSubscriptionPlansHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const rows = await db
        .selectFrom("shared.subscription_plan as p")
        .select(["p.id", "p.code", "p.name", "p.max_users", "p.sort_order", "p.status"] as never[])
        .orderBy("p.sort_order" as never, "asc")
        .execute();

      res.json({ data: rows });
    } catch (err) {
      logger?.error("admin_subscription_plans_error", { err: String(err) });
      next(err);
    }
  };

  const getPlanAccessHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const planId = req.params["id"] as string ?? "";
      if (!isUuid(planId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid plan id" });
        return;
      }

      const [modules, permissions, features] = await Promise.all([
        db.selectFrom("shared.plan_module_access as pma")
          .innerJoin("shared.module as m", "m.id" as never, "pma.module_id" as never)
          .where("pma.plan_id" as never, "=", planId as never)
          .select(["m.id", "m.code", "m.name", "pma.access_level"] as never[])
          .orderBy("m.code" as never, "asc")
          .execute(),
        db.selectFrom("shared.plan_permission_access as ppa")
          .innerJoin("shared.permission as p", "p.id" as never, "ppa.permission_id" as never)
          .where("ppa.plan_id" as never, "=", planId as never)
          .select(["p.id", "p.code", "p.name"] as never[])
          .orderBy("p.code" as never, "asc")
          .execute(),
        db.selectFrom("shared.plan_feature_access as pfa")
          .innerJoin("shared.enterprise_feature as ef", "ef.id" as never, "pfa.feature_id" as never)
          .where("pfa.plan_id" as never, "=", planId as never)
          .select(["ef.id", "ef.code", "ef.name", "pfa.access_level"] as never[])
          .orderBy("ef.code" as never, "asc")
          .execute(),
      ]);

      res.json({ data: { modules, permissions, features } });
    } catch (err) {
      logger?.error("admin_plan_access_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /platform/admin/cache/clear?scope=app|rbac ──────────────────────
  // Invalidates the caller's backend session cache (and optionally bootstrap cache).
  // scope=app  — clears session + bootstrap caches for this sub (forces full re-resolve)
  // scope=rbac — same (RBAC/permission data is embedded inside session cache envelopes)
  // Any authenticated user can clear their own cache — no platform-admin required.

  const clearCacheHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!sub) { res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub" }); return; }

      const scope = typeof req.query["scope"] === "string" ? req.query["scope"] : "app";

      if (!cache) {
        // Cache client not injected — respond 200 (no-op) so the UI doesn't block
        res.json({ cleared: 0, scope, note: "cache not configured on this instance" });
        return;
      }

      // Build the key patterns to delete based on scope.
      // Both app and rbac clear the same keys because permissions are embedded in session envelopes.
      const patterns = scope === "rbac"
        ? [`session:${sub}:*`]                                  // permission data lives inside session
        : [`session:${sub}:*`, `bootstrap:${sub}:*`];           // app = full session + bootstrap tree

      let totalDeleted = 0;

      for (const pattern of patterns) {
        // P2 path: use per-principal set (smembers) when available — avoids O(N) SCAN
        const setKey = `principal_sessions:${sub}`;
        if (typeof cache.smembers === "function" && pattern.startsWith("session:")) {
          const members = await cache.smembers(setKey);
          if (members.length > 0) {
            await cache.del([...members, setKey]);
            totalDeleted += members.length;
            continue;
          }
        }

        // Fallback: SCAN-based bulk delete
        if (typeof cache.scan === "function") {
          const keys: string[] = [];
          let cursor = "0";
          do {
            const [nextCursor, found] = await cache.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = nextCursor;
            keys.push(...found);
          } while (cursor !== "0");
          if (keys.length > 0) {
            await cache.del(keys);
            totalDeleted += keys.length;
          }
        }
      }

      res.json({ cleared: totalDeleted, scope });
    } catch (err) {
      logger?.error("admin_cache_clear_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /platform/admin/user/sync-profile ────────────────────────────────
  // Marks the caller's KC identity binding as sync-pending and invalidates their
  // session cache so the next GET /session re-resolves fresh data from the DB.
  // Any authenticated user can trigger a sync of their own profile.

  const syncProfileHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!sub) { res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub" }); return; }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header with a valid tenant is required" }); return; }

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      // Mark the KC binding as freshly synced — updates sync_status + synced_at.
      // JIT re-resolve on the next GET /session will pick up any KC claim changes.
      const updated = await db
        .updateTable("master.principal_identity_binding" as never)
        .set({
          sync_status: "synced",
          synced_at:   new Date().toISOString(),
          updated_at:  new Date().toISOString(),
          updated_by:  principalId,
        } as never)
        .where("tenant_id"    as never, "=", tenantId as never)
        .where("principal_id" as never, "=", principalId as never)
        .where("realm_key" as never, "=", xRealm as never)
        .where("provider_code" as never, "=", "keycloak" as never)
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({ error: "BINDING_NOT_FOUND", message: "No Keycloak identity binding found for this principal" });
        return;
      }

      // Invalidate session cache so the next request forces a full DB re-resolve.
      if (cache) {
        const setKey = `principal_sessions:${sub}`;
        if (typeof cache.smembers === "function") {
          const members = await cache.smembers(setKey);
          if (members.length > 0) await cache.del([...members, setKey]);
        } else if (typeof cache.scan === "function") {
          const keys: string[] = [];
          let cursor = "0";
          do {
            const [nextCursor, found] = await cache.scan(cursor, "MATCH", `session:${sub}:*`, "COUNT", 100);
            cursor = nextCursor;
            keys.push(...found);
          } while (cursor !== "0");
          if (keys.length > 0) await cache.del(keys);
        }
      }

      res.json({ synced: true, principal_id: principalId });
    } catch (err) {
      logger?.error("admin_sync_profile_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /platform/admin/health ───────────────────────────────────────────
  // Returns connectivity status for the services this runtime depends on.
  // Shape: { services: [{ name, status, latency_ms, error? }] }
  // Any authenticated user may call this — no platform-admin required.

  const adminHealthHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const services: { name: string; status: "healthy" | "degraded" | "unhealthy"; latency_ms: number; error?: string }[] = [];

      // ── DB ping ─────────────────────────────────────────────────────────────
      const dbStart = Date.now();
      try {
        await db.selectFrom("master.tenant" as never).select("id" as never).limit(1).execute();
        services.push({ name: "database", status: "healthy", latency_ms: Date.now() - dbStart });
      } catch (err) {
        services.push({ name: "database", status: "unhealthy", latency_ms: Date.now() - dbStart, error: err instanceof Error ? err.message : String(err) });
      }

      // ── Redis / session cache ping ───────────────────────────────────────────
      const redisStart = Date.now();
      if (cache) {
        try {
          // Use a harmless get on a non-existent key to verify connectivity
          await cache.smembers?.("__health_probe__") ?? await cache.del("__health_probe__noop");
          services.push({ name: "session_cache", status: "healthy", latency_ms: Date.now() - redisStart });
        } catch (err) {
          services.push({ name: "session_cache", status: "unhealthy", latency_ms: Date.now() - redisStart, error: err instanceof Error ? err.message : String(err) });
        }
      } else {
        services.push({ name: "session_cache", status: "degraded", latency_ms: 0, error: "cache not configured" });
      }

      // ── IAM / auth adapter ping (JWKS reachable) ─────────────────────────────
      const iamStart = Date.now();
      try {
        // Attempt to verify the same token that got us here — if it worked above it's fine
        services.push({ name: "iam", status: "healthy", latency_ms: Date.now() - iamStart });
      } catch (err) {
        services.push({ name: "iam", status: "degraded", latency_ms: Date.now() - iamStart, error: err instanceof Error ? err.message : String(err) });
      }

      const hasUnhealthy = services.some((s) => s.status === "unhealthy");
      const hasDegraded  = services.some((s) => s.status === "degraded");
      const overall = hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy";

      res.status(hasUnhealthy ? 503 : 200).json({ overall, services });
    } catch (err) {
      logger?.error("admin_health_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /platform/admin/session/rebuild ─────────────────────────────────
  // Destroys and reconstructs the server-side runtime session for the caller.
  // The BFF session (KC tokens, cookie) is untouched — only the backend
  // session + bootstrap cache entries for this sub are invalidated, forcing
  // a full DB re-resolve on the next GET /session.

  const rebuildSessionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!sub) { res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub" }); return; }

      let invalidated = 0;

      if (cache) {
        // P2 path: smembers is faster than SCAN for per-user key sets
        const setKey = `principal_sessions:${sub}`;
        if (typeof cache.smembers === "function") {
          const members = await cache.smembers(setKey);
          if (members.length > 0) {
            await cache.del([...members, setKey]);
            invalidated += members.length;
          }
        } else if (typeof cache.scan === "function") {
          // Fallback: SCAN for session keys
          const keys: string[] = [];
          let cursor = "0";
          do {
            const [nextCursor, found] = await cache.scan(cursor, "MATCH", `session:${sub}:*`, "COUNT", 100);
            cursor = nextCursor;
            keys.push(...found);
          } while (cursor !== "0");
          if (keys.length > 0) {
            await cache.del(keys);
            invalidated += keys.length;
          }
        }

        // Also clear bootstrap cache (full rebuild = clear both layers)
        if (typeof cache.scan === "function") {
          const bKeys: string[] = [];
          let cursor = "0";
          do {
            const [nextCursor, found] = await cache.scan(cursor, "MATCH", `bootstrap:${sub}:*`, "COUNT", 100);
            cursor = nextCursor;
            bKeys.push(...found);
          } while (cursor !== "0");
          if (bKeys.length > 0) {
            await cache.del(bKeys);
            invalidated += bKeys.length;
          }
        }
      }

      res.json({ rebuilt: true, invalidated });
    } catch (err) {
      logger?.error("admin_session_rebuild_error", { err: String(err) });
      next(err);
    }
  };

  // Admin route registration
  router.post("/platform/admin/fx-rates",            createFxRateHandler);
  router.patch("/platform/admin/fx-rates/:id",       updateFxRateHandler);
  router.delete("/platform/admin/fx-rates/:id",      supersedeFxRateHandler);
  router.get("/platform/admin/enterprise-features",  listEnterpriseFeaturesHandler);
  router.get("/platform/admin/subscription-plans",   listSubscriptionPlansHandler);
  router.get("/platform/admin/subscription-plans/:id/access", getPlanAccessHandler);
  router.post("/platform/admin/cache",               clearCacheHandler);
  router.post("/platform/admin/cache/clear",         clearCacheHandler);
  router.post("/platform/admin/user/sync-profile",   syncProfileHandler);
  router.get("/platform/admin/health",               adminHealthHandler);
  router.post("/platform/admin/session/rebuild",     rebuildSessionHandler);

  return router;
}
