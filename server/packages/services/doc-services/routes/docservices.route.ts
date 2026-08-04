/**
 * Document Services Routes — Module 8: PDF/HTML Generation & Print Services
 *
 * Resources + verbs:
 *
 * Templates (master.template)
 *   GET    /api/docservices/templates              — list (search, status, kind filter)
 *   POST   /api/docservices/templates              — create
 *   PATCH  /api/docservices/templates/:id          — update name/metadata/flags
 *   DELETE /api/docservices/templates/:id          — archive (status → ARCHIVED)
 *
 * Template Versions (snapshot.template_version — append-only)
 *   GET    /api/docservices/versions?template_id=  — list versions for a template
 *   POST   /api/docservices/versions               — publish new version
 *
 * Brand Profiles (master.brand_profile)
 *   GET    /api/docservices/brands                 — list
 *   POST   /api/docservices/brands                 — create
 *   PATCH  /api/docservices/brands/:id             — update
 *
 * Letterheads (master.letterhead)
 *   GET    /api/docservices/letterheads            — list
 *   POST   /api/docservices/letterheads            — create
 *   PATCH  /api/docservices/letterheads/:id        — update
 *
 * Template Bindings (master.template_binding)
 *   GET    /api/docservices/bindings               — list (entity_name, operation filter)
 *   POST   /api/docservices/bindings               — create
 *   PATCH  /api/docservices/bindings/:id           — toggle is_active / change priority
 *   DELETE /api/docservices/bindings/:id           — deactivate (is_active → false)
 *
 * Render Outputs (document.render_output)
 *   GET    /api/docservices/outputs                — list (entity_id, status filter)
 *   POST   /api/docservices/outputs                — enqueue new render
 *   GET    /api/docservices/outputs/:id/download   — presigned URL (302 redirect or JSON) for RENDERED output
 *   POST   /api/docservices/outputs/:id/deliver    — mark DELIVERED
 *   POST   /api/docservices/outputs/:id/revoke     — REVOKE with reason
 *
 * Render Jobs (document.render_output execution state)
 *   GET    /api/docservices/jobs                   — list (output_id, status filter)
 *   POST   /api/docservices/jobs/:id/retry         — reset FAILED → PENDING for retry
 *
 * Failed render/replay queue (document.render_output)
 *   GET    /api/docservices/dlq                    — list (error_category, replayed filter)
 *   POST   /api/docservices/dlq/:id/replay         — mark replayed + re-enqueue output
 *
 * Print Profiles (master.print_profile)
 *   GET    /api/docservices/profiles               — list
 *   POST   /api/docservices/profiles               — create
 *   PATCH  /api/docservices/profiles/:id           — update
 *
 * Resolver
 *   POST   /api/docservices/resolver               — resolve highest-priority binding
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";
import { checkPermissionBatch } from "@athyper/svc-iam";
import type { SyncPdfRenderer } from "@athyper/server-foundation/render/pdf-renderer-client";
import { resolveEntityPrintSections, resolvePrintIdentity } from "@athyper/entity-print/core";
import { buildEntityPrintHtml } from "../lib/build-entity-print-html.js";
import { mapProfileToRenderOptions, DEFAULT_RENDER_OPTIONS } from "../lib/print-profile-mapper.js";
import { resolveReferenceDisplayValues } from "../lib/resolve-reference-display.js";

// ── Deps interface ────────────────────────────────────────────────────────────

/** Minimal object-storage interface needed by docservices routes (subset of ObjectStorageAdapter). */
export interface DocServicesObjectStorage {
  getPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
}

export interface DocServicesRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  /** Object storage used to generate presigned download URLs for rendered documents. */
  objectStorage?: DocServicesObjectStorage;
  /** PDF renderer (Gotenberg). When absent, entity-print PDF returns 503. */
  renderer?: SyncPdfRenderer;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function parsePage(q: Record<string, unknown>) {
    const page     = Math.max(1, parseInt(String(q["page"] ?? "1"), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(q["page_size"] ?? "25"), 10)));
    return { page, pageSize, offset: (page - 1) * pageSize };
}

function normalizeLocaleCode(value: unknown): string | null {
  const parts = String(value ?? "en").trim().split("-");
  const normalized = parts.length === 1
    ? parts[0]?.toLowerCase()
    : `${parts[0]?.toLowerCase()}-${parts[1]?.toUpperCase()}`;
  return normalized && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(normalized)
    ? normalized
    : null;
}

async function resolveCtx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  req: Parameters<RequestHandler>[0],
  auth: DocServicesRouteDeps["auth"],
  res: Parameters<RequestHandler>[1],
) {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;
  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(db, xOrg, xRealm);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant" });
    return null;
  }
  const sub         = typeof claims.sub === "string" ? claims.sub : "";
  const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : SYSTEM_PRINCIPAL_UUID;
  return { claims, tenantId, principalId };
}

type DocResource = "template" | "brand_profile" | "letterhead" | "template_binding" | "print_profile";
type DocAction = "export" | "create" | "update" | "delete";

async function requireDocPermission(
  db: Kysely<any>,
  res: Parameters<RequestHandler>[1],
  ctx: { tenantId: string; principalId: string },
  resource: DocResource,
  action: DocAction,
): Promise<boolean> {
  const permissionCode = `neon.catalog.${resource}.${action}`;
  const decisions = await checkPermissionBatch(db, ctx.tenantId, ctx.principalId);
  const decision = decisions[permissionCode];
  if (decision?.decision === "allow") return true;

  res.status(403).json({
    error: "FORBIDDEN",
    required_permission: permissionCode,
  });
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route factory
// ─────────────────────────────────────────────────────────────────────────────

export function createDocServicesRoutes(router: Router, deps: DocServicesRouteDeps): Router {
  const { db, auth, logger, objectStorage, renderer } = deps;

  // ══════════════════════════════════════════════════════════════════════════
  // §1  TEMPLATES — master.template
  // ══════════════════════════════════════════════════════════════════════════

  // LIST
  const listTemplates: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template", "export")) return;

      const q = req.query as Record<string, unknown>;
      const { page, pageSize, offset } = parsePage(q);

      let query = db
        .selectFrom("master.template as t")
        .selectAll("t")
        .where("t.tenant_id", "=", ctx.tenantId)
        .orderBy("t.updated_at", "desc")
        .orderBy("t.created_at", "desc");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (q["status"])  query = (query as any).where("t.status", "=", q["status"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (q["kind"])    query = (query as any).where("t.kind",   "=", q["kind"]);
      if (q["search"]) {
        const like = `%${q["search"]}%`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).where((eb: any) =>
          eb.or([
            eb("t.code", "ilike", like),
            eb("t.name", "ilike", like),
          ])
        );
      }

      const rows  = await query.limit(pageSize).offset(offset).execute();
      const total = rows.length; // lightweight — swap to countAll for large datasets

      res.json({ ok: true, data: rows, pagination: { page, page_size: pageSize, total } });
    } catch (err) {
      logger?.error("docservices_templates_list_error", { err: String(err) });
      next(err);
    }
  };

  // CREATE
  const createTemplate: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template", "create")) return;

      const b = req.body as Record<string, unknown>;
      if (!b["code"] || !b["name"] || !b["kind"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code, name, kind are required" });
        return;
      }

      const row = await db
        .insertInto("master.template")
        .values({
          tenant_id:              ctx.tenantId,
          code:                   String(b["code"]).trim().toLowerCase(),
          name:                   String(b["name"]),
          kind:                   String(b["kind"]).trim().toLowerCase(),
          engine:                 String(b["engine"] ?? "handlebars").trim().toLowerCase(),
          is_rtl_supported:       Boolean(b["is_rtl_supported"] ?? false),
          is_letterhead_required: Boolean(b["is_letterhead_required"] ?? false),
          status:                 "draft",
          metadata:               (b["metadata"] as object) ?? {},
          created_by:             ctx.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_templates_create_error", { err: String(err) });
      next(err);
    }
  };

  // UPDATE
  const updateTemplate: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template", "update")) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.principalId };

      if (b["name"]                   !== undefined) set["name"]                   = String(b["name"]);
      if (b["status"]                 !== undefined) set["status"]                 = String(b["status"]).trim().toLowerCase();
      if (b["engine"]                 !== undefined) set["engine"]                 = String(b["engine"]).trim().toLowerCase();
      if (b["is_rtl_supported"]       !== undefined) set["is_rtl_supported"]       = Boolean(b["is_rtl_supported"]);
      if (b["is_letterhead_required"] !== undefined) set["is_letterhead_required"] = Boolean(b["is_letterhead_required"]);
      if (b["current_version_id"]     !== undefined) set["current_version_id"]     = b["current_version_id"] ?? null;
      if (b["metadata"]               !== undefined) set["metadata"]               = b["metadata"];

      const row = await db
        .updateTable("master.template")
        .set(set as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_templates_update_error", { err: String(err) });
      next(err);
    }
  };

  // ARCHIVE
  const archiveTemplate: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template", "delete")) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const row = await db
        .updateTable("master.template")
        .set({ status: "archived", updated_at: new Date().toISOString(), updated_by: ctx.principalId } as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_templates_archive_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §2  TEMPLATE VERSIONS — snapshot.template_version (append-only)
  // ══════════════════════════════════════════════════════════════════════════

  // LIST by template_id
  const listVersions: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template", "export")) return;

      const templateId = req.query["template_id"] as string | undefined;
      if (!templateId || !isUuid(templateId)) {
        res.status(400).json({ error: "MISSING_TEMPLATE_ID", message: "template_id query param required" });
        return;
      }

      const rows = await db
        .selectFrom("snapshot.template_version as tv")
        .selectAll("tv")
        .where("tv.tenant_id", "=", ctx.tenantId)
        .where("tv.template_id", "=", templateId)
        .orderBy("tv.version", "desc")
        .execute();

      res.json({ ok: true, data: rows });
    } catch (err) {
      logger?.error("docservices_versions_list_error", { err: String(err) });
      next(err);
    }
  };

  // CREATE VERSION (publish new immutable version + update current_version_id)
  const createVersion: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template", "update")) return;

      const b = req.body as Record<string, unknown>;
      if (!b["template_id"] || !isUuid(String(b["template_id"]))) {
        res.status(400).json({ error: "MISSING_TEMPLATE_ID" });
        return;
      }
      if (!b["checksum"]) {
        res.status(400).json({ error: "MISSING_CHECKSUM", message: "checksum (SHA-256 of content) is required" });
        return;
      }
      const hasHtml = typeof b["content_html"] === "string" && b["content_html"].trim().length > 0;
      const hasJson = b["content_json"] !== undefined && b["content_json"] !== null;
      if (hasHtml === hasJson) {
        res.status(400).json({ error: "INVALID_CONTENT", message: "Provide exactly one of content_html or content_json" });
        return;
      }
      const checksum = String(b["checksum"]).trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(checksum)) {
        res.status(400).json({ error: "INVALID_CHECKSUM", message: "checksum must be a SHA-256 hex digest" });
        return;
      }

      const templateId = String(b["template_id"]);
      const localeCode = normalizeLocaleCode(b["locale_code"]);
      if (!localeCode) {
        res.status(400).json({ error: "INVALID_LOCALE", message: "locale_code must use language or language-REGION format" });
        return;
      }

      const parent = await db
        .selectFrom("master.template")
        .select("id")
        .where("id", "=", templateId)
        .where("tenant_id", "=", ctx.tenantId)
        .executeTakeFirst();
      if (!parent) {
        res.status(404).json({ error: "NOT_FOUND", message: "Template not found" });
        return;
      }

      const result = await db.transaction().execute(async (trx) => {
        await sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${ctx.tenantId}:${templateId}:${localeCode}`}, 0)
          )
        `.execute(trx);

        const maxRow = await trx
          .selectFrom("snapshot.template_version as tv")
          .select(trx.fn.max("tv.version").as("max_v"))
          .where("tv.tenant_id", "=", ctx.tenantId)
          .where("tv.template_id", "=", templateId)
          .where("tv.locale_code", "=", localeCode)
          .executeTakeFirst();
        const nextVersion = (Number((maxRow as Record<string, unknown>)?.["max_v"] ?? 0)) + 1;

        const ver = await trx
          .insertInto("snapshot.template_version")
          .values({
            tenant_id:        ctx.tenantId,
            template_id:      templateId,
            version:          nextVersion,
            locale_code:      localeCode,
            content_html:     (b["content_html"] as string) ?? null,
            content_json:     (b["content_json"] as object) ?? null,
            styles_css:       (b["styles_css"] as string)   ?? null,
            variables_schema: (b["variables_schema"] as object) ?? null,
            assets_manifest:  (b["assets_manifest"] as object)  ?? {},
            checksum,
            effective_from:   (b["effective_from"] as string) ?? null,
            effective_to:     (b["effective_to"] as string)   ?? null,
            created_by:       ctx.principalId,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow();

        // Promote to current version on the parent template
        await trx
          .updateTable("master.template")
          .set({
            current_version_id: (ver as Record<string, unknown>)["id"],
            updated_at:         new Date().toISOString(),
            updated_by:         ctx.principalId,
          } as never)
          .where("id", "=", templateId)
          .where("tenant_id", "=", ctx.tenantId)
          .execute();

        return ver;
      });

      res.status(201).json({ ok: true, data: result });
    } catch (err) {
      logger?.error("docservices_versions_create_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §3  BRAND PROFILES — master.brand_profile
  // ══════════════════════════════════════════════════════════════════════════

  const listBrands: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "brand_profile", "export")) return;

      const rows = await db
        .selectFrom("master.brand_profile as bp")
        .selectAll("bp")
        .where("bp.tenant_id", "=", ctx.tenantId)
        .orderBy("bp.is_default", "desc")
        .orderBy("bp.code", "asc")
        .execute();

      res.json({ ok: true, data: rows });
    } catch (err) {
      logger?.error("docservices_brands_list_error", { err: String(err) });
      next(err);
    }
  };

  const createBrand: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "brand_profile", "create")) return;

      const b = req.body as Record<string, unknown>;
      if (!b["code"] || !b["name"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code and name are required" });
        return;
      }

      const row = await db
        .insertInto("master.brand_profile")
        .values({
          tenant_id:         ctx.tenantId,
          code:              String(b["code"]).trim().toLowerCase(),
          name:              String(b["name"]),
          palette:           (b["palette"]    as object) ?? {},
          typography:        (b["typography"] as object) ?? {},
          is_default:        Boolean(b["is_default"] ?? false),
          metadata:          (b["metadata"] as object) ?? {},
          created_by:        ctx.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_brands_create_error", { err: String(err) });
      next(err);
    }
  };

  const updateBrand: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "brand_profile", "update")) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.principalId };

      if (b["name"]              !== undefined) set["name"]              = String(b["name"]);
      if (b["palette"]           !== undefined) set["palette"]           = b["palette"];
      if (b["typography"]        !== undefined) set["typography"]        = b["typography"];
      if (b["is_default"]        !== undefined) set["is_default"]        = Boolean(b["is_default"]);
      if (b["status"]            !== undefined) set["status"]            = String(b["status"]);
      if (b["metadata"]          !== undefined) set["metadata"]          = b["metadata"];

      const row = await db
        .updateTable("master.brand_profile")
        .set(set as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_brands_update_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §4  LETTERHEADS — master.letterhead
  // ══════════════════════════════════════════════════════════════════════════

  const listLetterheads: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "letterhead", "export")) return;

      const rows = await db
        .selectFrom("master.letterhead as lh")
        .selectAll("lh")
        .where("lh.tenant_id", "=", ctx.tenantId)
        .orderBy("lh.is_default", "desc")
        .orderBy("lh.code", "asc")
        .execute();

      res.json({ ok: true, data: rows });
    } catch (err) {
      logger?.error("docservices_letterheads_list_error", { err: String(err) });
      next(err);
    }
  };

  const createLetterhead: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "letterhead", "create")) return;

      const b = req.body as Record<string, unknown>;
      if (!b["code"] || !b["name"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code and name are required" });
        return;
      }

      const row = await db
        .insertInto("master.letterhead")
        .values({
          tenant_id:          ctx.tenantId,
          code:               String(b["code"]).trim().toLowerCase(),
          name:               String(b["name"]),
          logo_asset_ref:     (b["logo_asset_ref"] as string) ?? null,
          header_html:        (b["header_html"] as string) ?? null,
          footer_html:        (b["footer_html"] as string) ?? null,
          watermark_text:     (b["watermark_text"] as string) ?? null,
          watermark_opacity:  b["watermark_opacity"] != null ? Number(b["watermark_opacity"]) : 0.15,
          is_default:         Boolean(b["is_default"] ?? false),
          metadata:           (b["metadata"] as object) ?? {},
          created_by:         ctx.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_letterheads_create_error", { err: String(err) });
      next(err);
    }
  };

  const updateLetterhead: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "letterhead", "update")) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.principalId };

      if (b["name"]               !== undefined) set["name"]               = String(b["name"]);
      if (b["logo_asset_ref"]     !== undefined) set["logo_asset_ref"]     = b["logo_asset_ref"] ?? null;
      if (b["header_html"]        !== undefined) set["header_html"]        = b["header_html"] ?? null;
      if (b["footer_html"]        !== undefined) set["footer_html"]        = b["footer_html"] ?? null;
      if (b["watermark_text"]     !== undefined) set["watermark_text"]     = b["watermark_text"] ?? null;
      if (b["watermark_opacity"]  !== undefined) set["watermark_opacity"]  = Number(b["watermark_opacity"]);
      if (b["is_default"]         !== undefined) set["is_default"]         = Boolean(b["is_default"]);
      if (b["status"]             !== undefined) set["status"]             = String(b["status"]);
      if (b["metadata"]           !== undefined) set["metadata"]           = b["metadata"];

      const row = await db
        .updateTable("master.letterhead")
        .set(set as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_letterheads_update_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §5  TEMPLATE BINDINGS — master.template_binding
  // ══════════════════════════════════════════════════════════════════════════

  const listBindings: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template_binding", "export")) return;

      const q = req.query as Record<string, unknown>;

      let query = db
        .selectFrom("master.template_binding as tb")
        .innerJoin("master.template as t", "t.id", "tb.template_id")
        .select([
          "tb.id", "tb.template_id", "tb.entity_code", "tb.operation_code",
          "tb.variant_code", "tb.locale_code", "tb.brand_profile_id",
          "tb.letterhead_id", "tb.print_profile_id", "tb.status", "tb.created_at",
          "t.code as template_code", "t.name as template_name",
        ])
        .where("tb.tenant_id", "=", ctx.tenantId)
        .orderBy("tb.entity_code", "asc")
        .orderBy("tb.operation_code", "asc");

      if (q["entity_code"])  query = query.where("tb.entity_code" as never, "=", q["entity_code"] as never);
      if (q["operation_code"]) query = query.where("tb.operation_code" as never, "=", q["operation_code"] as never);
      if (q["is_active"] !== undefined) {
        query = query.where("tb.status" as never, "=", (q["is_active"] === "true" ? "active" : "inactive") as never);
      }

      const rows = await query.execute();
      res.json({ ok: true, data: rows });
    } catch (err) {
      logger?.error("docservices_bindings_list_error", { err: String(err) });
      next(err);
    }
  };

  const createBinding: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template_binding", "create")) return;

      const b = req.body as Record<string, unknown>;
      if (!b["template_id"] || !b["entity_code"] || !b["operation_code"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "template_id, entity_code, operation_code are required" });
        return;
      }
      if (!isUuid(String(b["template_id"]))) {
        res.status(400).json({ error: "INVALID_TEMPLATE_ID" });
        return;
      }
      const localeCode = normalizeLocaleCode(b["locale_code"]);
      if (!localeCode) {
        res.status(400).json({ error: "INVALID_LOCALE", message: "locale_code must use language or language-REGION format" });
        return;
      }

      const row = await db
        .insertInto("master.template_binding")
        .values({
          tenant_id:   ctx.tenantId,
          template_id: String(b["template_id"]),
          entity_code: String(b["entity_code"]).trim().toLowerCase(),
          operation_code: String(b["operation_code"]).trim().toLowerCase(),
          variant_code: String(b["variant_code"] ?? "default").trim().toLowerCase(),
          locale_code: localeCode,
          brand_profile_id: (b["brand_profile_id"] as string) ?? null,
          letterhead_id: (b["letterhead_id"] as string) ?? null,
          print_profile_id: (b["print_profile_id"] as string) ?? null,
          metadata: (b["metadata"] as object) ?? {},
          status: String(b["status"] ?? "active"),
          created_by:  ctx.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_bindings_create_error", { err: String(err) });
      next(err);
    }
  };

  const updateBinding: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template_binding", "update")) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = {};

      if (b["status"]           !== undefined) set["status"]           = String(b["status"]);
      if (b["brand_profile_id"] !== undefined) set["brand_profile_id"] = b["brand_profile_id"] ?? null;
      if (b["letterhead_id"]    !== undefined) set["letterhead_id"]    = b["letterhead_id"] ?? null;
      if (b["print_profile_id"] !== undefined) set["print_profile_id"] = b["print_profile_id"] ?? null;
      if (b["metadata"]         !== undefined) set["metadata"]         = b["metadata"];
      set["updated_at"] = new Date().toISOString();
      set["updated_by"] = ctx.principalId;

      const row = await db
        .updateTable("master.template_binding")
        .set(set as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_bindings_update_error", { err: String(err) });
      next(err);
    }
  };

  const deactivateBinding: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template_binding", "delete")) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const row = await db
        .updateTable("master.template_binding")
        .set({ status: "inactive", updated_at: new Date().toISOString(), updated_by: ctx.principalId } as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_bindings_deactivate_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §6  RENDER OUTPUTS — document.render_output
  // ══════════════════════════════════════════════════════════════════════════

  const listOutputs: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const q = req.query as Record<string, unknown>;
      const { page, pageSize, offset } = parsePage(q);

      let query = db
        .selectFrom("document.render_output as ro")
        .selectAll("ro")
        .where("ro.tenant_id", "=", ctx.tenantId)
        .orderBy("ro.created_at", "desc");

      if (q["entity_id"])   query = query.where("ro.entity_id"   as never, "=", q["entity_id"]   as never);
      if (q["entity_name"]) query = query.where("ro.entity_name" as never, "=", q["entity_name"] as never);
      if (q["status"])      query = query.where("ro.status"      as never, "=", q["status"]      as never);
      if (q["operation"])   query = query.where("ro.operation"   as never, "=", q["operation"]   as never);

      const rows = await query.limit(pageSize).offset(offset).execute();
      res.json({ ok: true, data: rows, pagination: { page, page_size: pageSize } });
    } catch (err) {
      logger?.error("docservices_outputs_list_error", { err: String(err) });
      next(err);
    }
  };

  // Enqueue a new render (creates a QUEUED render_output)
  const enqueueOutput: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const b = req.body as Record<string, unknown>;
      if (!b["entity_name"] || !b["entity_id"] || !b["operation"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_name, entity_id, operation are required" });
        return;
      }

      const output = await db
          .insertInto("document.render_output")
          .values({
            tenant_id:           ctx.tenantId,
            template_version_id: (b["template_version_id"] as string) ?? null,
            letterhead_id:       (b["letterhead_id"]       as string) ?? null,
            brand_profile_id:    (b["brand_profile_id"]    as string) ?? null,
            entity_name:         String(b["entity_name"]),
            entity_id:           String(b["entity_id"]),
            operation:           String(b["operation"]),
            variant:             String(b["variant"]  ?? "default"),
            locale:              String(b["locale"]   ?? "en"),
            timezone:            String(b["timezone"] ?? "UTC"),
            status:              "QUEUED",
            manifest_json:       (b["manifest_json"] as object) ?? { entity_name: String(b["entity_name"]) },
            created_by:          ctx.principalId,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: { output } });
    } catch (err) {
      logger?.error("docservices_outputs_enqueue_error", { err: String(err) });
      next(err);
    }
  };

  // DOWNLOAD — returns a presigned URL (302 redirect or JSON) for a RENDERED output
  const downloadOutput: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const id = String(req.params["id"] ?? "");
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const row = await db
        .selectFrom("document.render_output")
        .select(["id", "storage_key", "status", "output_format"] as never[])
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .executeTakeFirst() as { id: string; storage_key: string | null; status: string; output_format: string | null } | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      if (row.status !== "RENDERED" && row.status !== "DELIVERED") {
        res.status(409).json({ error: "NOT_READY", message: `Render status is ${row.status}` });
        return;
      }

      if (!row.storage_key) {
        res.status(409).json({ error: "NO_STORAGE_KEY", message: "Rendered document has no storage key" });
        return;
      }

      if (!objectStorage) {
        res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage not configured" });
        return;
      }

      const presignedUrl = await objectStorage.getPresignedUrl(row.storage_key, 3_600);

      // If client prefers JSON, return the URL; otherwise redirect
      const acceptJson = (req.headers["accept"] ?? "").includes("application/json");
      if (acceptJson) {
        res.json({ ok: true, data: { url: presignedUrl, expires_in: 3_600 } });
      } else {
        res.redirect(302, presignedUrl);
      }
    } catch (err) {
      logger?.error("docservices_outputs_download_error", { err: String(err) });
      next(err);
    }
  };

  // DELIVER
  const deliverOutput: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const row = await db
        .updateTable("document.render_output")
        .set({ status: "DELIVERED", delivered_at: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: ctx.principalId } as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .where("status" as never, "=", "RENDERED" as never)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND_OR_NOT_RENDERED" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_outputs_deliver_error", { err: String(err) });
      next(err);
    }
  };

  // REVOKE
  const revokeOutput: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b = req.body as Record<string, unknown>;
      if (!b["revoke_reason"]) {
        res.status(400).json({ error: "MISSING_REASON", message: "revoke_reason is required" });
        return;
      }

      const row = await db
        .updateTable("document.render_output")
        .set({
          status:        "REVOKED",
          revoked_at:    new Date().toISOString(),
          revoked_by:    ctx.principalId,
          revoke_reason: String(b["revoke_reason"]),
          updated_at:    new Date().toISOString(),
          updated_by:    ctx.principalId,
        } as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_outputs_revoke_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §7  RENDER JOBS — document.render_output execution state
  // ══════════════════════════════════════════════════════════════════════════

  const listJobs: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const q = req.query as Record<string, unknown>;
      const { pageSize, offset } = parsePage(q);

      let query = db
        .selectFrom("document.render_output as rj")
        .selectAll("rj")
        .where("rj.tenant_id", "=", ctx.tenantId)
        .orderBy("rj.created_at", "desc");

      if (q["output_id"] && isUuid(String(q["output_id"]))) {
        query = query.where("rj.id" as never, "=", q["output_id"] as never);
      }
      if (q["status"]) {
        query = query.where("rj.status" as never, "=", q["status"] as never);
      }

      const rows = await query.limit(pageSize).offset(offset).execute();
      res.json({ ok: true, data: rows });
    } catch (err) {
      logger?.error("docservices_jobs_list_error", { err: String(err) });
      next(err);
    }
  };

  // RETRY: reset FAILED job → PENDING and bump parent output back to QUEUED
  const retryJob: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const result = await db
          .updateTable("document.render_output")
          .set({
            status: "QUEUED",
            error_code: null,
            error_message: null,
            failure_category: null,
            attempt_count: 0,
            replay_count: sql`replay_count + 1` as never,
            last_replayed_at: new Date().toISOString(),
            last_replayed_by: ctx.principalId,
            updated_at: new Date().toISOString(),
            updated_by: ctx.principalId,
          } as never)
          .where("id", "=", id)
          .where("tenant_id", "=", ctx.tenantId)
          .where("status" as never, "=", "FAILED" as never)
          .returningAll()
          .executeTakeFirst();

      if (!result) { res.status(404).json({ error: "NOT_FOUND_OR_NOT_FAILED" }); return; }
      res.json({ ok: true, data: result });
    } catch (err) {
      logger?.error("docservices_jobs_retry_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §8  FAILED RENDER / REPLAY QUEUE — document.render_output
  // ══════════════════════════════════════════════════════════════════════════

  const listDlq: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const q = req.query as Record<string, unknown>;
      const { pageSize, offset } = parsePage(q);

      let query = db
        .selectFrom("document.render_output as dlq")
        .selectAll("dlq")
        .where("dlq.tenant_id", "=", ctx.tenantId)
        .where("dlq.status" as never, "=", "FAILED" as never)
        .orderBy("dlq.last_attempt_at", "desc");

      if (q["error_category"]) query = query.where("dlq.failure_category" as never, "=", q["error_category"] as never);
      if (q["replayed"] === "true")  query = query.where("dlq.last_replayed_at" as never, "is not", null as never);
      if (q["replayed"] === "false") query = query.where("dlq.last_replayed_at" as never, "is",     null as never);

      const rows = await query.limit(pageSize).offset(offset).execute();
      res.json({ ok: true, data: rows });
    } catch (err) {
      logger?.error("docservices_dlq_list_error", { err: String(err) });
      next(err);
    }
  };

  // REPLAY a DLQ entry — mark replayed + reset the parent render_output → QUEUED
  const replayDlq: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const now = new Date().toISOString();

      const result = await db
          .updateTable("document.render_output")
          .set({
            status:            "QUEUED",
            error_code:        null,
            error_message:     null,
            failure_category:  null,
            attempt_count:     0,
            last_replayed_at:  now,
            last_replayed_by:  ctx.principalId,
            replay_count:      sql`replay_count + 1` as never,
            updated_at:        now,
            updated_by:        ctx.principalId,
          } as never)
          .where("id", "=", id)
          .where("tenant_id", "=", ctx.tenantId)
          .where("status" as never, "=", "FAILED" as never)
          .returningAll()
          .executeTakeFirst();

      if (!result) { res.status(404).json({ error: "NOT_FOUND_OR_ALREADY_REPLAYED" }); return; }
      res.json({ ok: true, data: result });
    } catch (err) {
      logger?.error("docservices_dlq_replay_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §9  PRINT PROFILES — master.print_profile
  // ══════════════════════════════════════════════════════════════════════════

  const listProfiles: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "print_profile", "export")) return;

      const q = req.query as Record<string, unknown>;

      let query = db
        .selectFrom("master.print_profile as pp")
        .selectAll("pp")
        .where("pp.tenant_id", "=", ctx.tenantId)
        .orderBy("pp.is_default", "desc")
        .orderBy("pp.code", "asc");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (q["status"]) query = (query as any).where("pp.status", "=", q["status"]);
      if (q["search"]) {
        const like = `%${q["search"]}%`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).where((eb: any) =>
          eb.or([
            eb("pp.code", "ilike", like),
            eb("pp.name", "ilike", like),
          ])
        );
      }

      const rows = await query.execute();
      res.json({ ok: true, data: rows });
    } catch (err) {
      logger?.error("docservices_profiles_list_error", { err: String(err) });
      next(err);
    }
  };

  const createProfile: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "print_profile", "create")) return;

      const b = req.body as Record<string, unknown>;
      if (!b["code"] || !b["name"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code and name are required" });
        return;
      }

      const row = await db
        .insertInto("master.print_profile")
        .values({
          tenant_id:           ctx.tenantId,
          code:                String(b["code"]).trim().toLowerCase(),
          name:                String(b["name"]),
          paper_size:          String(b["paper_size"]  ?? "A4"),
          orientation:         String(b["orientation"] ?? "portrait"),
          margins:             String(b["margins"]     ?? "normal"),
          header_footer:       Boolean(b["header_footer"]       ?? true),
          background_graphics: Boolean(b["background_graphics"] ?? true),
          is_default:          Boolean(b["is_default"]          ?? false),
          metadata:            (b["metadata"] as object) ?? {},
          created_by:          ctx.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_profiles_create_error", { err: String(err) });
      next(err);
    }
  };

  const updateProfile: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "print_profile", "update")) return;

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.principalId };

      const textFields = ["name", "paper_size", "orientation", "margins", "status"];
      const boolFields = ["header_footer", "background_graphics", "is_default"];

      for (const f of textFields) if (b[f] !== undefined) set[f] = b[f] != null ? String(b[f]) : null;
      for (const f of boolFields) if (b[f] !== undefined) set[f] = Boolean(b[f]);
      if (b["metadata"]    !== undefined) set["metadata"]    = b["metadata"];

      const row = await db
        .updateTable("master.print_profile")
        .set(set as never)
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: row });
    } catch (err) {
      logger?.error("docservices_profiles_update_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §10  RESOLVER — resolve_template_binding
  // ══════════════════════════════════════════════════════════════════════════
  // Tenant-bound deterministic resolution: exact requested variant first,
  // then the default variant. Active-coordinate uniqueness prevents ambiguity.

  const resolveBinding: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;
      if (!await requireDocPermission(db, res, ctx, "template_binding", "export")) return;

      const b = req.body as Record<string, unknown>;
      const entityCode = String(b["entity_code"] ?? b["entity_name"] ?? "").trim().toLowerCase();
      const operationCode = String(b["operation_code"] ?? b["operation"] ?? "").trim().toLowerCase();
      if (!entityCode || !operationCode) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_code and operation_code are required" });
        return;
      }

      const variant = String(b["variant_code"] ?? b["variant"] ?? "default").trim().toLowerCase();
      const localeCode = normalizeLocaleCode(b["locale_code"] ?? b["locale"]);
      if (!localeCode) {
        res.status(400).json({ error: "INVALID_LOCALE", message: "locale_code must use language or language-REGION format" });
        return;
      }

      // Find the active binding matching (entity, operation, requested variant|default).
      const binding = await db
        .selectFrom("master.template_binding as tb")
        .selectAll("tb")
        .where("tb.tenant_id",   "=", ctx.tenantId)
        .where("tb.entity_code", "=", entityCode)
        .where("tb.operation_code", "=", operationCode)
        .where("tb.locale_code", "=", localeCode)
        .where("tb.variant_code", "in", [...new Set([variant, "default"])] as never)
        .where("tb.status", "=", "active")
        .orderBy(
          // Prefer exact variant match over 'default' fallback
          sql`CASE WHEN tb.variant_code = ${variant} THEN 1 ELSE 2 END` as never,
          "asc"
        )
        .limit(1)
        .executeTakeFirst();

      if (!binding) {
        res.status(404).json({
          ok: false,
          error: "NO_BINDING",
          entity_code: entityCode,
          operation_code: operationCode,
          variant_code: variant,
          locale_code: localeCode,
        });
        return;
      }

      const bindingRow = binding as Record<string, unknown>;

      // Fetch the template + current version
      const template = await db
        .selectFrom("master.template as t")
        .selectAll("t")
        .where("t.id", "=", bindingRow["template_id"] as string)
        .where("t.tenant_id", "=", ctx.tenantId)
        .where("t.status", "=", "published")
        .executeTakeFirst();

      const templateRow = template as Record<string, unknown> | undefined;
      let version: Record<string, unknown> | undefined;

      if (templateRow?.["current_version_id"]) {
        const ver = await db
          .selectFrom("snapshot.template_version as tv")
          .selectAll("tv")
          .where("tv.id", "=", templateRow["current_version_id"] as string)
          .where("tv.tenant_id", "=", ctx.tenantId)
          .where("tv.locale_code", "=", localeCode)
          .executeTakeFirst();
        version = ver as Record<string, unknown> | undefined;
      }

      res.json({
        ok:      true,
        binding: bindingRow,
        template: templateRow ?? null,
        version:  version    ?? null,
        resolved_variant: bindingRow["variant_code"],
      });
    } catch (err) {
      logger?.error("docservices_resolver_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §10  ENTITY PRINT RENDER — POST /docservices/entity-print/render
  //      Renders a compiled entity record to PDF via Gotenberg.
  // ══════════════════════════════════════════════════════════════════════════

  const renderEntityPrint: RequestHandler = async (req, res, next) => {
    try {
      if (!renderer) {
        res.status(503).json({ error: "PDF_RENDERER_UNAVAILABLE", message: "PDF renderer is not configured" });
        return;
      }

      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const { entity_code, record_id, profile_id } = req.body as {
        entity_code?: string;
        record_id?:   string;
        profile_id?:  string;
      };

      if (!entity_code || !record_id) {
        res.status(400).json({ error: "MISSING_PARAMS", message: "entity_code and record_id are required" });
        return;
      }

      // Resolve entity metadata
      const entityRow = await db
        .selectFrom("control.entity as e")
        .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
        .innerJoin("snapshot.entity_compiled as ec", "ec.entity_version_id", "ev.id")
        .selectAll("e")
        .select("ec.compiled_json as compiled_json")
        .where("e.entity_code", "=", entity_code)
        .where((eb) => eb.or([
          eb("e.tenant_id", "=", ctx.tenantId),
          eb("e.tenant_id", "is", null as never),
        ]))
        .where("e.runtime_enabled", "=", true)
        .where("e.status", "=", "ACTIVE")
        .where("e.is_active", "=", true)
        .where("e.read_capability", "<>", "none")
        .where("ev.status", "=", "EFFECTIVE")
        .where("ec.artifact_kind", "=", "execution")
        .orderBy(sql`CASE WHEN e.tenant_id IS NOT NULL THEN 0 ELSE 1 END`, "asc")
        .limit(1)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entity_code}' not found` });
        return;
      }

      const tableSchema = entityRow["table_schema"] as string;
      const tableName   = entityRow["table_name"]   as string;
      const primaryKey = String(entityRow["primary_key"] ?? "id");
      const tenantColumn = (entityRow["tenant_column"] as string | null) ?? null;

      // Fetch the record
      const recordRow = await db
        .selectFrom(`${tableSchema}.${tableName}`)
        .selectAll()
        .where(primaryKey as never, "=" as never, record_id as never)
        .$if(Boolean(tenantColumn), (query) => query.where(tenantColumn as never, "=" as never, ctx.tenantId as never))
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!recordRow) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: "Record not found" });
        return;
      }

      const compiledSnapshot = (() => {
        const raw = entityRow["compiled_json"];
        if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed)
              ? parsed as Record<string, unknown>
              : null;
          } catch { return null; }
        }
        return null;
      })();
      if (!compiledSnapshot || !Array.isArray(compiledSnapshot["fields"])) {
        res.status(503).json({ error: "ENTITY_EXECUTION_SNAPSHOT_INVALID", message: `Entity '${entity_code}' has no valid execution snapshot` });
        return;
      }

      // The execution snapshot is the authoritative print contract.
      const compiledEntity = compiledSnapshot as any;
      /* const legacyCompiledEntity = {
        entity_id:      entityRow["id"],
        entity_code:    entityRow["entity_code"],
        slug:           entityRow["entity_code"],
        entity_name:    entityRow["entity_name"] ?? entityRow["entity_code"],
        entity_class:   entityRow["entity_class"] ?? "MASTER",
        table_schema:   tableSchema,
        table_name:     tableName,
        version_no:     1,
        version_hash:   "",
        display_config: entityRow["display_config"] ?? {},
        identity_config: entityRow["identity_config"] ?? {},
        search_config:  entityRow["search_config"] ?? {},
        data_policy:    entityRow["data_policy"] ?? {},
        feature_flags:  entityRow["feature_flags"] ?? {},
        fields: fieldsRows.map((f) => ({
          name:             f["name"],
          column_name:      f["column_name"],
          label:            f["label"],
          data_type:        f["data_type"],
          ui_type:          f["ui_type"] ?? f["data_type"],
          sort_order:       f["sort_order"] ?? 0,
          origin:           f["origin"] ?? "business",
          is_readonly:      f["is_readonly"] ?? false,
          is_required:      f["is_required"] ?? false,
          is_pii:           false,
          group_key:        f["group_key"] ?? null,
          ui_hint:          f["ui_hint"] ?? {},
          reference_config: f["reference_config"] ?? null,
          money_config:     f["money_config"] ?? null,
        })),
        // Build field_groups from the global field_group table + field group_key assignments
        field_groups: groupsRows.map((g) => ({
          group_key:   g["group_key"] as string,
          label:       (g["label"] as string | null) ?? "",
          description: (g["description"] as string | null) ?? null,
          sort_order:  (g["sort_order"] as number | null) ?? 0,
          columns:     (Number(g["columns"] ?? 3)) as 1 | 2 | 3,
          page_span:   ((g["page_span"] as string | null) ?? "half") as "full" | "half",
          fields:      fieldsRows
            .filter((f) => f["group_key"] === g["group_key"])
            .sort((a, b) => ((a["sort_order"] as number) ?? 0) - ((b["sort_order"] as number) ?? 0))
            .map((f) => f["name"] as string),
        })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any; */

      // Resolve print sections
      const sections = resolveEntityPrintSections(compiledEntity);

      // Fetch print profile
      let profileRow: Record<string, unknown> | undefined;
      if (profile_id && isUuid(profile_id)) {
        profileRow = await db
          .selectFrom("master.print_profile")
          .selectAll()
          .where("id", "=", profile_id)
          .where("tenant_id", "=", ctx.tenantId)
          .executeTakeFirst() as Record<string, unknown> | undefined;
      }
      if (!profileRow) {
        profileRow = await db
          .selectFrom("master.print_profile")
          .selectAll()
          .where("tenant_id", "=", ctx.tenantId)
          .where("is_default", "=", true as never)
          .where("status", "=", "active")
          .executeTakeFirst() as Record<string, unknown> | undefined;
      }

      // Resolve reference display values
      const mutableData = { ...recordRow };
      await resolveReferenceDisplayValues(db, sections, mutableData, ctx.tenantId);

      // Resolve print identity
      const displayConfig = compiledEntity.display_config as Record<string, unknown> | undefined;
      const printConfig   = displayConfig?.["print_config"] as Record<string, unknown> | undefined;
      const identity      = resolvePrintIdentity(compiledEntity, mutableData, printConfig as never);

      // Fetch tenant name
      const tenantRow = await db
        .selectFrom("master.tenant")
        .select("name")
        .where("id", "=", ctx.tenantId)
        .executeTakeFirst() as { name?: string } | undefined;
      const tenantName = tenantRow?.name ?? "";

      const printedAt = new Date().toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

      const twoColumn = (printConfig?.["layout"] as Record<string, unknown> | undefined)?.["mode"] === "two_column";

      const html = buildEntityPrintHtml({
        identity,
        sections,
        record:     mutableData,
        tenantName,
        printedAt,
        twoColumn,
      });

      const renderOptions = profileRow
        ? mapProfileToRenderOptions(profileRow as never)
        : DEFAULT_RENDER_OPTIONS;

      const pdfBuffer = await renderer.renderSync(html, renderOptions);

      if (pdfBuffer.byteLength > 50 * 1024 * 1024) {
        logger?.warn("entity_print_pdf_too_large", { byteLength: pdfBuffer.byteLength, entity_code, record_id });
        res.status(413).json({ error: "PDF_TOO_LARGE", message: "Generated PDF exceeds 50 MB limit" });
        return;
      }

      const filename = `${entity_code}-${record_id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdfBuffer.byteLength));
      res.status(200).send(pdfBuffer);
    } catch (err) {
      logger?.error("entity_print_render_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Mount routes
  // ══════════════════════════════════════════════════════════════════════════

  // Templates
  router.get   ("/docservices/templates",              listTemplates);
  router.post  ("/docservices/templates",              createTemplate);
  router.patch ("/docservices/templates/:id",          updateTemplate);
  router.delete("/docservices/templates/:id",          archiveTemplate);

  // Versions
  router.get   ("/docservices/versions",               listVersions);
  router.post  ("/docservices/versions",               createVersion);

  // Brands
  router.get   ("/docservices/brands",                 listBrands);
  router.post  ("/docservices/brands",                 createBrand);
  router.patch ("/docservices/brands/:id",             updateBrand);

  // Letterheads
  router.get   ("/docservices/letterheads",            listLetterheads);
  router.post  ("/docservices/letterheads",            createLetterhead);
  router.patch ("/docservices/letterheads/:id",        updateLetterhead);

  // Bindings
  router.get   ("/docservices/bindings",               listBindings);
  router.post  ("/docservices/bindings",               createBinding);
  router.patch ("/docservices/bindings/:id",           updateBinding);
  router.delete("/docservices/bindings/:id",           deactivateBinding);

  // Render outputs
  router.get   ("/docservices/outputs",                listOutputs);
  router.post  ("/docservices/outputs",                enqueueOutput);
  router.get   ("/docservices/outputs/:id/download",   downloadOutput);
  router.post  ("/docservices/outputs/:id/deliver",    deliverOutput);
  router.post  ("/docservices/outputs/:id/revoke",     revokeOutput);

  // Render jobs
  router.get   ("/docservices/jobs",                   listJobs);
  router.post  ("/docservices/jobs/:id/retry",         retryJob);

  // Dead letter queue
  router.get   ("/docservices/dlq",                    listDlq);
  router.post  ("/docservices/dlq/:id/replay",         replayDlq);

  // Print profiles
  router.get   ("/docservices/profiles",               listProfiles);
  router.post  ("/docservices/profiles",               createProfile);
  router.patch ("/docservices/profiles/:id",           updateProfile);

  // Resolver
  router.post  ("/docservices/resolver",               resolveBinding);

  // Entity print
  router.post  ("/docservices/entity-print/render",    renderEntityPrint);

  return router;
}
