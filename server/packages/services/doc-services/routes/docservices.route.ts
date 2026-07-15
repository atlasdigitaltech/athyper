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
 * Render Jobs (document.render_job)
 *   GET    /api/docservices/jobs                   — list (output_id, status filter)
 *   POST   /api/docservices/jobs/:id/retry         — reset FAILED → PENDING for retry
 *
 * Dead Letter Queue (log.render_dlq)
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

      const b = req.body as Record<string, unknown>;
      if (!b["code"] || !b["name"] || !b["kind"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code, name, kind are required" });
        return;
      }

      const row = await db
        .insertInto("master.template")
        .values({
          tenant_id:              ctx.tenantId,
          code:                   String(b["code"]),
          name:                   String(b["name"]),
          kind:                   String(b["kind"]),
          engine:                 String(b["engine"] ?? "HANDLEBARS"),
          is_rtl_supported:       Boolean(b["is_rtl_supported"] ?? false),
          is_letterhead_required: Boolean(b["is_letterhead_required"] ?? false),
          allowed_operations:     Array.isArray(b["allowed_operations"]) ? b["allowed_operations"] : null,
          supported_locales:      Array.isArray(b["supported_locales"])  ? b["supported_locales"]  : null,
          status:                 String(b["status"] ?? "DRAFT"),
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

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.principalId };

      if (b["name"]                   !== undefined) set["name"]                   = String(b["name"]);
      if (b["status"]                 !== undefined) set["status"]                 = String(b["status"]);
      if (b["engine"]                 !== undefined) set["engine"]                 = String(b["engine"]);
      if (b["is_rtl_supported"]       !== undefined) set["is_rtl_supported"]       = Boolean(b["is_rtl_supported"]);
      if (b["is_letterhead_required"] !== undefined) set["is_letterhead_required"] = Boolean(b["is_letterhead_required"]);
      if (b["allowed_operations"]     !== undefined) set["allowed_operations"]     = b["allowed_operations"];
      if (b["supported_locales"]      !== undefined) set["supported_locales"]      = b["supported_locales"];
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

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const row = await db
        .updateTable("master.template")
        .set({ status: "ARCHIVED", updated_at: new Date().toISOString(), updated_by: ctx.principalId } as never)
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

      const b = req.body as Record<string, unknown>;
      if (!b["template_id"] || !isUuid(String(b["template_id"]))) {
        res.status(400).json({ error: "MISSING_TEMPLATE_ID" });
        return;
      }
      if (!b["checksum"]) {
        res.status(400).json({ error: "MISSING_CHECKSUM", message: "checksum (SHA-256 of content) is required" });
        return;
      }
      if (!b["content_html"] && !b["content_json"]) {
        res.status(400).json({ error: "MISSING_CONTENT", message: "content_html or content_json required" });
        return;
      }

      const templateId = String(b["template_id"]);

      // Compute next version number
      const maxRow = await db
        .selectFrom("snapshot.template_version as tv")
        .select(db.fn.max("tv.version").as("max_v"))
        .where("tv.tenant_id", "=", ctx.tenantId)
        .where("tv.template_id", "=", templateId)
        .executeTakeFirst();
      const nextVersion = ((maxRow as Record<string, unknown>)?.["max_v"] as number ?? 0) + 1;

      const result = await db.transaction().execute(async (trx) => {
        const ver = await trx
          .insertInto("snapshot.template_version")
          .values({
            tenant_id:        ctx.tenantId,
            template_id:      templateId,
            version:          nextVersion,
            content_html:     (b["content_html"] as string) ?? null,
            content_json:     (b["content_json"] as object) ?? null,
            header_html:      (b["header_html"] as string)  ?? null,
            footer_html:      (b["footer_html"] as string)  ?? null,
            styles_css:       (b["styles_css"] as string)   ?? null,
            variables_schema: (b["variables_schema"] as object) ?? null,
            assets_manifest:  (b["assets_manifest"] as object)  ?? null,
            checksum:         String(b["checksum"]),
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

      const b = req.body as Record<string, unknown>;
      if (!b["code"] || !b["name"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code and name are required" });
        return;
      }

      const row = await db
        .insertInto("master.brand_profile")
        .values({
          tenant_id:         ctx.tenantId,
          code:              String(b["code"]),
          name:              String(b["name"]),
          direction:         String(b["direction"]      ?? "LTR"),
          default_locale:    String(b["default_locale"] ?? "en"),
          supported_locales: Array.isArray(b["supported_locales"]) ? b["supported_locales"] : null,
          palette:           (b["palette"]    as object) ?? null,
          typography:        (b["typography"] as object) ?? null,
          spacing_scale:     (b["spacing_scale"] as object) ?? null,
          is_default:        Boolean(b["is_default"] ?? false),
          is_active:         true,
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

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.principalId };

      if (b["name"]              !== undefined) set["name"]              = String(b["name"]);
      if (b["direction"]         !== undefined) set["direction"]         = String(b["direction"]);
      if (b["default_locale"]    !== undefined) set["default_locale"]    = String(b["default_locale"]);
      if (b["supported_locales"] !== undefined) set["supported_locales"] = b["supported_locales"];
      if (b["palette"]           !== undefined) set["palette"]           = b["palette"];
      if (b["typography"]        !== undefined) set["typography"]        = b["typography"];
      if (b["spacing_scale"]     !== undefined) set["spacing_scale"]     = b["spacing_scale"];
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

      const b = req.body as Record<string, unknown>;
      if (!b["code"] || !b["name"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code and name are required" });
        return;
      }

      const row = await db
        .insertInto("master.letterhead")
        .values({
          tenant_id:          ctx.tenantId,
          code:               String(b["code"]),
          name:               String(b["name"]),
          company_code_id:    (b["company_code_id"] as string) ?? null,
          logo_storage_key:   (b["logo_storage_key"] as string) ?? null,
          header_html:        (b["header_html"] as string) ?? null,
          footer_html:        (b["footer_html"] as string) ?? null,
          watermark_text:     (b["watermark_text"] as string) ?? null,
          watermark_opacity:  b["watermark_opacity"] != null ? Number(b["watermark_opacity"]) : 0.15,
          default_fonts:      (b["default_fonts"] as object) ?? null,
          page_margins:       (b["page_margins"] as object)  ?? null,
          is_default:         Boolean(b["is_default"] ?? false),
          is_active:          true,
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

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.principalId };

      if (b["name"]               !== undefined) set["name"]               = String(b["name"]);
      if (b["company_code_id"]    !== undefined) set["company_code_id"]    = b["company_code_id"] ?? null;
      if (b["logo_storage_key"]   !== undefined) set["logo_storage_key"]   = b["logo_storage_key"] ?? null;
      if (b["header_html"]        !== undefined) set["header_html"]        = b["header_html"] ?? null;
      if (b["footer_html"]        !== undefined) set["footer_html"]        = b["footer_html"] ?? null;
      if (b["watermark_text"]     !== undefined) set["watermark_text"]     = b["watermark_text"] ?? null;
      if (b["watermark_opacity"]  !== undefined) set["watermark_opacity"]  = Number(b["watermark_opacity"]);
      if (b["page_margins"]       !== undefined) set["page_margins"]       = b["page_margins"] ?? null;
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

      const q = req.query as Record<string, unknown>;

      let query = db
        .selectFrom("master.template_binding as tb")
        .innerJoin("master.template as t", "t.id", "tb.template_id")
        .select([
          "tb.id", "tb.template_id", "tb.entity_name", "tb.operation",
          "tb.variant", "tb.priority", "tb.is_active", "tb.created_at",
          "t.code as template_code", "t.name as template_name",
        ])
        .where("tb.tenant_id", "=", ctx.tenantId)
        .orderBy("tb.entity_name", "asc")
        .orderBy("tb.priority", "desc");

      if (q["entity_name"])  query = query.where("tb.entity_name" as never, "=", q["entity_name"] as never);
      if (q["operation"])    query = query.where("tb.operation"   as never, "=", q["operation"]   as never);
      if (q["is_active"] !== undefined) {
        query = query.where("tb.is_active" as never, "=", (q["is_active"] === "true") as never);
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

      const b = req.body as Record<string, unknown>;
      if (!b["template_id"] || !b["entity_name"] || !b["operation"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "template_id, entity_name, operation are required" });
        return;
      }

      const row = await db
        .insertInto("master.template_binding")
        .values({
          tenant_id:   ctx.tenantId,
          template_id: String(b["template_id"]),
          entity_name: String(b["entity_name"]),
          operation:   String(b["operation"]),
          variant:     String(b["variant"] ?? "default"),
          priority:    b["priority"] != null ? Number(b["priority"]) : 0,
          is_active:   Boolean(b["is_active"] ?? true),
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

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = {};

      if (b["is_active"] !== undefined) set["is_active"] = Boolean(b["is_active"]);
      if (b["priority"]  !== undefined) set["priority"]  = Number(b["priority"]);
      if (b["variant"]   !== undefined) set["variant"]   = String(b["variant"]);

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

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const row = await db
        .updateTable("master.template_binding")
        .set({ is_active: false } as never)
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

  // Enqueue a new render (creates QUEUED render_output + PENDING render_job)
  const enqueueOutput: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const b = req.body as Record<string, unknown>;
      if (!b["entity_name"] || !b["entity_id"] || !b["operation"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_name, entity_id, operation are required" });
        return;
      }

      const result = await db.transaction().execute(async (trx) => {
        const output = await trx
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

        const outputId = (output as Record<string, unknown>)["id"] as string;

        const job = await trx
          .insertInto("document.render_job")
          .values({
            tenant_id:    ctx.tenantId,
            output_id:    outputId,
            status:       "PENDING",
            attempts:     0,
            max_attempts: 3,
            created_by:   ctx.principalId,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow();

        return { output, job };
      });

      res.status(201).json({ ok: true, data: result });
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
  // §7  RENDER JOBS — document.render_job
  // ══════════════════════════════════════════════════════════════════════════

  const listJobs: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const q = req.query as Record<string, unknown>;
      const { pageSize, offset } = parsePage(q);

      let query = db
        .selectFrom("document.render_job as rj")
        .selectAll("rj")
        .where("rj.tenant_id", "=", ctx.tenantId)
        .orderBy("rj.created_at", "desc");

      if (q["output_id"] && isUuid(String(q["output_id"]))) {
        query = query.where("rj.output_id" as never, "=", q["output_id"] as never);
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

      const result = await db.transaction().execute(async (trx) => {
        const job = await trx
          .updateTable("document.render_job")
          .set({ status: "PENDING", updated_at: new Date().toISOString() } as never)
          .where("id", "=", id)
          .where("tenant_id", "=", ctx.tenantId)
          .where("status" as never, "=", "FAILED" as never)
          .returningAll()
          .executeTakeFirst();

        if (!job) return null;

        const outputId = (job as Record<string, unknown>)["output_id"] as string;
        await trx
          .updateTable("document.render_output")
          .set({ status: "QUEUED", updated_at: new Date().toISOString(), updated_by: ctx.principalId } as never)
          .where("id", "=", outputId)
          .where("tenant_id", "=", ctx.tenantId)
          .execute();

        return job;
      });

      if (!result) { res.status(404).json({ error: "NOT_FOUND_OR_NOT_FAILED" }); return; }
      res.json({ ok: true, data: result });
    } catch (err) {
      logger?.error("docservices_jobs_retry_error", { err: String(err) });
      next(err);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // §8  DEAD LETTER QUEUE — log.render_dlq
  // ══════════════════════════════════════════════════════════════════════════

  const listDlq: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const q = req.query as Record<string, unknown>;
      const { pageSize, offset } = parsePage(q);

      let query = db
        .selectFrom("log.render_dlq as dlq")
        .selectAll("dlq")
        .where("dlq.tenant_id", "=", ctx.tenantId)
        .orderBy("dlq.dead_at", "desc");

      if (q["error_category"]) query = query.where("dlq.error_category" as never, "=", q["error_category"] as never);
      if (q["replayed"] === "true")  query = query.where("dlq.replayed_at" as never, "is not", null as never);
      if (q["replayed"] === "false") query = query.where("dlq.replayed_at" as never, "is",     null as never);

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

      const result = await db.transaction().execute(async (trx) => {
        const entry = await trx
          .updateTable("log.render_dlq")
          .set({
            replayed_at:  now,
            replayed_by:  ctx.principalId,
            replay_count: sql`replay_count + 1` as never,
            updated_at:   now,
            updated_by:   ctx.principalId,
          } as never)
          .where("id", "=", id)
          .where("tenant_id", "=", ctx.tenantId)
          .where("replayed_at" as never, "is", null as never)
          .returningAll()
          .executeTakeFirst();

        if (!entry) return null;

        const outputId = (entry as Record<string, unknown>)["output_id"] as string;
        await trx
          .updateTable("document.render_output")
          .set({ status: "QUEUED", error_code: null, error_message: null, updated_at: now, updated_by: ctx.principalId } as never)
          .where("id", "=", outputId)
          .where("tenant_id", "=", ctx.tenantId)
          .execute();

        return entry;
      });

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

      const b = req.body as Record<string, unknown>;
      if (!b["code"] || !b["name"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code and name are required" });
        return;
      }

      const row = await db
        .insertInto("master.print_profile")
        .values({
          tenant_id:           ctx.tenantId,
          code:                String(b["code"]),
          name:                String(b["name"]),
          paper_size:          String(b["paper_size"]  ?? "A4"),
          orientation:         String(b["orientation"] ?? "portrait"),
          color_mode:          String(b["color_mode"]  ?? "color"),
          quality_dpi:         b["quality_dpi"] != null ? Number(b["quality_dpi"]) : 300,
          output_format:       String(b["output_format"] ?? "pdf"),
          duplex:              String(b["duplex"]      ?? "none"),
          margins:             String(b["margins"]     ?? "normal"),
          compression:         String(b["compression"] ?? "medium"),
          header_footer:       Boolean(b["header_footer"]       ?? true),
          background_graphics: Boolean(b["background_graphics"] ?? true),
          watermark_enabled:   Boolean(b["watermark_enabled"]   ?? false),
          watermark_text:      (b["watermark_text"] as string)  ?? null,
          encrypt_pdf:         Boolean(b["encrypt_pdf"]         ?? false),
          archive_after_render: Boolean(b["archive_after_render"] ?? true),
          email_after_render:  Boolean(b["email_after_render"]  ?? false),
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

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const b   = req.body as Record<string, unknown>;
      const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.principalId };

      const textFields = ["name", "paper_size", "orientation", "color_mode", "output_format", "duplex", "margins", "compression", "watermark_text", "status"];
      const boolFields = ["header_footer", "background_graphics", "watermark_enabled", "encrypt_pdf", "archive_after_render", "email_after_render", "is_default"];

      for (const f of textFields) if (b[f] !== undefined) set[f] = b[f] != null ? String(b[f]) : null;
      for (const f of boolFields) if (b[f] !== undefined) set[f] = Boolean(b[f]);
      if (b["quality_dpi"] !== undefined) set["quality_dpi"] = Number(b["quality_dpi"]);
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
  // Emulates: document.resolve_template_binding(tenant_id, entity_name, operation, variant)
  // Priority order: exact variant > 'default' fallback. Highest priority wins.

  const resolveBinding: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveCtx(db, req, auth, res);
      if (!ctx) return;

      const b = req.body as Record<string, unknown>;
      if (!b["entity_name"] || !b["operation"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_name and operation are required" });
        return;
      }

      const entityName = String(b["entity_name"]);
      const operation  = String(b["operation"]);
      const variant    = String(b["variant"] ?? "default");

      // Find the highest-priority active binding matching (entity, operation, variant|default)
      const binding = await db
        .selectFrom("master.template_binding as tb")
        .selectAll("tb")
        .where("tb.tenant_id",   "=", ctx.tenantId)
        .where("tb.entity_name", "=", entityName)
        .where("tb.operation",   "=", operation)
        .where("tb.is_active",   "=", true as never)
        .orderBy(
          // Prefer exact variant match over 'default' fallback
          sql`CASE WHEN tb.variant = ${variant} THEN 1 ELSE 2 END` as never,
          "asc"
        )
        .orderBy("tb.priority", "desc")
        .limit(1)
        .executeTakeFirst();

      if (!binding) {
        res.status(404).json({ ok: false, error: "NO_BINDING", entity_name: entityName, operation, variant });
        return;
      }

      const bindingRow = binding as Record<string, unknown>;

      // Fetch the template + current version
      const template = await db
        .selectFrom("master.template as t")
        .selectAll("t")
        .where("t.id", "=", bindingRow["template_id"] as string)
        .executeTakeFirst();

      const templateRow = template as Record<string, unknown> | undefined;
      let version: Record<string, unknown> | undefined;

      if (templateRow?.["current_version_id"]) {
        const ver = await db
          .selectFrom("snapshot.template_version as tv")
          .selectAll("tv")
          .where("tv.id", "=", templateRow["current_version_id"] as string)
          .executeTakeFirst();
        version = ver as Record<string, unknown> | undefined;
      }

      res.json({
        ok:      true,
        binding: bindingRow,
        template: templateRow ?? null,
        version:  version    ?? null,
        resolved_variant: bindingRow["variant"],
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
        .selectFrom("shared.tenant")
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
