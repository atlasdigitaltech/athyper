/**
 * Notification Routes — admin config + user preferences
 *
 * Auth tiers
 * ──────────
 *   platform-admin bearer:
 *     routing rules CRUD
 *     templates CRUD + activate + preview
 *   general bearer:
 *     categories (lookup domain read)
 *     preferences (self-scoped — own rows only)
 *
 * Final URLs (apiRouter mounted at /api):
 *   GET    /api/notifications/routing-rules
 *   POST   /api/notifications/routing-rules
 *   PATCH  /api/notifications/routing-rules/:id
 *   DELETE /api/notifications/routing-rules/:id
 *
 *   GET    /api/notifications/templates
 *   POST   /api/notifications/templates
 *   PATCH  /api/notifications/templates/:id
 *   POST   /api/notifications/templates/:id/activate
 *   POST   /api/notifications/templates/:id/preview
 *
 *   GET    /api/notifications/categories
 *
 *   GET    /api/notifications/preferences
 *   PATCH  /api/notifications/preferences
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  parsePagination,
  parseSearch,
  setCachePrivate,
  resolveTenantId,
  isUuid,
  resolvePrincipalIdOrNull,
} from "@athyper/svc-shared";

// ─── Deps ──────────────────────────────────────────────────────────────────────

export interface NotificationRoutesDeps {
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
  const ra = claims["realm_access"] as Record<string, unknown> | undefined;
  const roles = ra?.["roles"];
  return Array.isArray(roles) && (roles as string[]).includes("platform-admin");
}

const SYSTEM_ACTOR = "00000000-0000-7000-a000-000000000001";

// ─── Route factory ─────────────────────────────────────────────────────────────

export function registerNotificationRoutes(router: Router, deps: NotificationRoutesDeps): Router {
  const { db, auth, logger } = deps;

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUTING RULES  [platform-admin]
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /notifications/routing-rules ────────────────────────────────────────

  const listRoutingRulesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q         = req.query as Record<string, unknown>;
      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const search    = parseSearch(q);
      const eventType = typeof q["event_type"] === "string" ? q["event_type"].trim() : "";
      const enabled   = q["is_enabled"] === "true" ? true : q["is_enabled"] === "false" ? false : undefined;
      const { page, limit, offset } = parsePagination(q);

      // Include global rules (tenant_id IS NULL) and tenant-specific rules
      let base = db
        .selectFrom("control.notification_routing_rule as r")
        .where((eb) => eb.or([
          eb("r.tenant_id" as never, "is", null),
          eb("r.tenant_id" as never, "=", tenantId as never),
        ]));

      if (eventType) { base = base.where("r.event_type" as never, "=", eventType as never) as typeof base; }
      if (enabled !== undefined) { base = base.where("r.is_enabled" as never, "=", enabled as never) as typeof base; }
      if (search) {
        base = base.where((eb) => eb.or([
          eb("r.code"       as never, "ilike", `%${search}%` as never),
          eb("r.name"       as never, "ilike", `%${search}%` as never),
          eb("r.event_type" as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select([
            "r.id", "r.tenant_id", "r.code", "r.name", "r.description",
            "r.event_type", "r.entity_type", "r.template_key", "r.channels",
            "r.priority", "r.recipient_rules", "r.sla_minutes", "r.dedup_window_ms",
            "r.is_enabled", "r.sort_order", "r.created_at", "r.updated_at",
          ] as never[])
          .orderBy("r.sort_order" as never, "asc")
          .orderBy("r.event_type" as never, "asc")
          .limit(limit).offset(offset).execute(),
      ]);

      setCachePrivate(res);
      res.json({
        data: rows,
        meta: { total: Number(countRow?.n ?? 0), page, limit, pages: Math.ceil(Number(countRow?.n ?? 0) / limit) },
      });
    } catch (err) {
      logger?.error("notif_routing_rules_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /notifications/routing-rules ───────────────────────────────────────

  const createRoutingRuleHandler: RequestHandler = async (req, res, next) => {
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
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null) ?? SYSTEM_ACTOR;
      const body        = req.body as Record<string, unknown>;

      const { code, name, event_type, template_key, channels } = body;
      if (!code || !name || !event_type || !template_key || !Array.isArray(channels) || channels.length === 0) {
        res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "code, name, event_type, template_key, channels[] are required",
        });
        return;
      }

      const row = await db
        .insertInto("control.notification_routing_rule" as never)
        .values({
          tenant_id:        tenantId,
          code:             String(code).trim(),
          name:             String(name).trim(),
          description:      body["description"] ? String(body["description"]) : null,
          event_type:       String(event_type).trim(),
          entity_type:      body["entity_type"]     ? String(body["entity_type"])  : null,
          lifecycle_state:  body["lifecycle_state"]  ? String(body["lifecycle_state"]) : null,
          condition_expr:   body["condition_expr"]   ? JSON.stringify(body["condition_expr"])   : null,
          template_key:     String(template_key).trim(),
          channels:         JSON.stringify(channels),
          priority:         body["priority"]         ? String(body["priority"])    : "normal",
          recipient_rules:  body["recipient_rules"]  ? JSON.stringify(body["recipient_rules"])  : "{}",
          sla_minutes:      body["sla_minutes"]      ? Number(body["sla_minutes"])  : null,
          dedup_window_ms:  body["dedup_window_ms"]  ? Number(body["dedup_window_ms"]) : 300000,
          is_enabled:       body["is_enabled"] !== false,
          sort_order:       body["sort_order"]       ? Number(body["sort_order"])   : 0,
          created_by:       principalId,
          metadata:         "{}",
        } as never)
        .returning(["id", "code", "name", "event_type", "is_enabled"] as never[])
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: row });
    } catch (err) {
      logger?.error("notif_routing_rule_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /notifications/routing-rules/:id ──────────────────────────────────

  const updateRoutingRuleHandler: RequestHandler = async (req, res, next) => {
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
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null) ?? SYSTEM_ACTOR;
      const ruleId      = req.params["id"] as string ?? "";
      const body        = req.body as Record<string, unknown>;

      if (!isUuid(ruleId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid id" });
        return;
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: principalId,
      };

      const fields: Array<[string, (v: unknown) => unknown]> = [
        ["name",            (v) => String(v).trim()],
        ["description",     (v) => v ? String(v) : null],
        ["template_key",    (v) => String(v).trim()],
        ["channels",        (v) => JSON.stringify(v)],
        ["priority",        (v) => String(v)],
        ["recipient_rules", (v) => JSON.stringify(v)],
        ["sla_minutes",     (v) => v !== null ? Number(v) : null],
        ["dedup_window_ms", (v) => Number(v)],
        ["is_enabled",      (v) => Boolean(v)],
        ["sort_order",      (v) => Number(v)],
        ["condition_expr",  (v) => v ? JSON.stringify(v) : null],
      ];

      for (const [field, transform] of fields) {
        if (body[field] !== undefined) updates[field] = transform(body[field]);
      }

      const row = await db
        .updateTable("control.notification_routing_rule" as never)
        .set(updates as never)
        .where("id"        as never, "=", ruleId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .returning(["id", "code", "name", "event_type", "is_enabled", "updated_at"] as never[])
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ data: row });
    } catch (err) {
      logger?.error("notif_routing_rule_update_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /notifications/routing-rules/:id ─────────────────────────────────
  // Soft-delete: sets is_enabled = false. Tenant rules only (global rules are system-owned).

  const deleteRoutingRuleHandler: RequestHandler = async (req, res, next) => {
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
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null) ?? SYSTEM_ACTOR;
      const ruleId      = req.params["id"] as string ?? "";

      if (!isUuid(ruleId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid id" });
        return;
      }

      const row = await db
        .updateTable("control.notification_routing_rule" as never)
        .set({
          is_enabled: false,
          updated_at: new Date().toISOString(),
          updated_by: principalId,
        } as never)
        .where("id"        as never, "=", ruleId as never)
        .where("tenant_id" as never, "=", tenantId as never)   // cannot delete global rules
        .returning(["id", "is_enabled"] as never[])
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ data: row });
    } catch (err) {
      logger?.error("notif_routing_rule_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATES  [platform-admin]
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /notifications/templates ────────────────────────────────────────────

  const listTemplatesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const q         = req.query as Record<string, unknown>;
      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const search    = parseSearch(q);
      const channel   = typeof q["channel"] === "string" ? q["channel"].trim() : "";
      const locale    = typeof q["locale"]  === "string" ? q["locale"].trim()  : "";
      const status    = typeof q["status"]  === "string" ? q["status"].trim()  : "";
      const { page, limit, offset } = parsePagination(q);

      let base = db
        .selectFrom("control.notification_template as t")
        .where((eb) => eb.or([
          eb("t.tenant_id" as never, "is", null),
          eb("t.tenant_id" as never, "=", tenantId as never),
        ]));

      if (channel) { base = base.where("t.channel"  as never, "=", channel as never) as typeof base; }
      if (locale)  { base = base.where("t.locale"   as never, "=", locale as never)  as typeof base; }
      if (status)  { base = base.where("t.status"   as never, "=", status as never)  as typeof base; }
      if (search) {
        base = base.where((eb) => eb.or([
          eb("t.template_key" as never, "ilike", `%${search}%` as never),
          eb("t.subject"      as never, "ilike", `%${search}%` as never),
        ])) as typeof base;
      }

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select([
            "t.id", "t.tenant_id", "t.template_key", "t.channel", "t.locale",
            "t.version", "t.status", "t.subject", "t.variables_schema",
            "t.created_at", "t.updated_at",
          ] as never[])
          .orderBy("t.template_key" as never, "asc")
          .orderBy("t.channel"      as never, "asc")
          .orderBy("t.version"      as never, "desc")
          .limit(limit).offset(offset).execute(),
      ]);

      setCachePrivate(res);
      res.json({
        data: rows,
        meta: { total: Number(countRow?.n ?? 0), page, limit, pages: Math.ceil(Number(countRow?.n ?? 0) / limit) },
      });
    } catch (err) {
      logger?.error("notif_templates_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /notifications/templates ───────────────────────────────────────────

  const createTemplateHandler: RequestHandler = async (req, res, next) => {
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
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null) ?? SYSTEM_ACTOR;
      const body        = req.body as Record<string, unknown>;

      const { template_key, channel } = body;
      if (!template_key || !channel) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "template_key and channel are required" });
        return;
      }
      if (!body["body_text"] && !body["body_html"] && !body["body_json"]) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "At least one of body_text, body_html, body_json is required" });
        return;
      }

      // Determine next version number for this template_key+channel+locale+tenant combination
      const existingMax = await db
        .selectFrom("control.notification_template as t")
        .where("t.template_key" as never, "=", String(template_key as never) as never)
        .where("t.channel"      as never, "=", String(channel as never) as never)
        .where("t.locale"       as never, "=", (body["locale"] ? String(body["locale"] as never) : "en") as never)
        .where((eb) => eb.or([
          eb("t.tenant_id" as never, "is", null),
          eb("t.tenant_id" as never, "=", tenantId as never),
        ]))
        .select((eb) => eb.fn.max<number>("t.version" as never).as("max_v"))
        .executeTakeFirst();

      const nextVersion = (Number(existingMax?.["max_v"] ?? 0)) + 1;

      const row = await db
        .insertInto("control.notification_template" as never)
        .values({
          tenant_id:        tenantId,
          template_key:     String(template_key).trim(),
          channel:          String(channel).trim(),
          locale:           body["locale"]           ? String(body["locale"])           : "en",
          version:          nextVersion,
          status:           "draft",
          subject:          body["subject"]          ? String(body["subject"])          : null,
          body_text:        body["body_text"]        ? String(body["body_text"])        : null,
          body_html:        body["body_html"]        ? String(body["body_html"])        : null,
          body_json:        body["body_json"]        ? JSON.stringify(body["body_json"]) : null,
          variables_schema: body["variables_schema"] ? JSON.stringify(body["variables_schema"]) : null,
          metadata:         "{}",
          created_by:       principalId,
        } as never)
        .returning(["id", "template_key", "channel", "locale", "version", "status"] as never[])
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: row });
    } catch (err) {
      logger?.error("notif_template_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /notifications/templates/:id ──────────────────────────────────────
  // Only allowed on draft templates.

  const updateTemplateHandler: RequestHandler = async (req, res, next) => {
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
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null) ?? SYSTEM_ACTOR;
      const templateId  = req.params["id"] as string ?? "";
      const body        = req.body as Record<string, unknown>;

      if (!isUuid(templateId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid id" });
        return;
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: principalId,
      };

      const fields: Array<[string, (v: unknown) => unknown]> = [
        ["subject",          (v) => v ? String(v) : null],
        ["body_text",        (v) => v ? String(v) : null],
        ["body_html",        (v) => v ? String(v) : null],
        ["body_json",        (v) => v ? JSON.stringify(v) : null],
        ["variables_schema", (v) => v ? JSON.stringify(v) : null],
      ];

      for (const [field, transform] of fields) {
        if (body[field] !== undefined) updates[field] = transform(body[field]);
      }

      const row = await db
        .updateTable("control.notification_template" as never)
        .set(updates as never)
        .where("id"        as never, "=", templateId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("status"    as never, "=", "draft" as never)   // only draft templates can be edited
        .returning(["id", "template_key", "channel", "version", "status", "updated_at"] as never[])
        .executeTakeFirst();

      if (!row) {
        res.status(404).json({ error: "NOT_FOUND", message: "Template not found or not in draft status" });
        return;
      }
      res.json({ data: row });
    } catch (err) {
      logger?.error("notif_template_update_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /notifications/templates/:id/activate ──────────────────────────────
  // Promotes draft → active; retires the previous active version for same key+channel+locale.

  const activateTemplateHandler: RequestHandler = async (req, res, next) => {
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
      const principalId = (sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null) ?? SYSTEM_ACTOR;
      const templateId  = req.params["id"] as string ?? "";

      if (!isUuid(templateId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid id" });
        return;
      }

      // Load the draft template being activated
      const draft = await db
        .selectFrom("control.notification_template as t")
        .select(["t.template_key", "t.channel", "t.locale", "t.tenant_id"] as never[])
        .where("t.id"     as never, "=", templateId as never)
        .where("t.status" as never, "=", "draft" as never)
        .executeTakeFirst() as Record<string, string> | undefined;

      if (!draft) {
        res.status(404).json({ error: "NOT_FOUND", message: "Draft template not found" });
        return;
      }

      // Retire-then-activate in a transaction to avoid a race where two concurrent
      // activations both retire the current active version simultaneously.
      const row = await db.transaction().execute(async (trx) => {
        // Retire current active versions for this key+channel+locale
        await trx
          .updateTable("control.notification_template" as never)
          .set({
            status:     "retired",
            updated_at: new Date().toISOString(),
            updated_by: principalId,
          } as never)
          .where("template_key" as never, "=", draft["template_key"] as never)
          .where("channel"      as never, "=", draft["channel"] as never)
          .where("locale"       as never, "=", draft["locale"] as never)
          .where("status"       as never, "=", "active" as never)
          .where((eb) => eb.or([
            eb("tenant_id" as never, "is", null),
            eb("tenant_id" as never, "=", tenantId as never),
          ]))
          .execute();

        // Activate the draft
        return trx
          .updateTable("control.notification_template" as never)
          .set({
            status:     "active",
            updated_at: new Date().toISOString(),
            updated_by: principalId,
          } as never)
          .where("id"        as never, "=", templateId as never)
          .where("tenant_id" as never, "=", tenantId as never)
          .returning(["id", "template_key", "channel", "version", "status"] as never[])
          .executeTakeFirstOrThrow();
      });

      res.json({ data: row });
    } catch (err) {
      logger?.error("notif_template_activate_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /notifications/templates/:id/preview ───────────────────────────────
  // Renders template subject/body with sample variables from the request body.
  // Does not send anything; returns rendered strings for review.

  const previewTemplateHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg      = (req.headers["x-org"]   as string) ?? "";

      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const templateId = req.params["id"] as string ?? "";
      const variables  = (req.body as Record<string, unknown>)["variables"] ?? {};

      if (!isUuid(templateId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid id" });
        return;
      }

      const tmpl = await db
        .selectFrom("control.notification_template as t")
        .select(["t.subject", "t.body_text", "t.body_html", "t.body_json", "t.variables_schema"] as never[])
        .where("t.id" as never, "=", templateId as never)
        .where((eb) => eb.or([
          eb("t.tenant_id" as never, "is", null),
          eb("t.tenant_id" as never, "=", tenantId as never),
        ]))
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!tmpl) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      // Simple Mustache-style {{variable}} substitution for preview
      function interpolate(template: string | null): string | null {
        if (!template) return null;
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
          const val = (variables as Record<string, unknown>)[key];
          return val !== undefined ? String(val) : `{{${key}}}`;
        });
      }

      setCachePrivate(res);
      res.json({
        data: {
          subject:   interpolate(tmpl["subject"] as string | null),
          body_text: interpolate(tmpl["body_text"] as string | null),
          body_html: interpolate(tmpl["body_html"] as string | null),
          body_json: tmpl["body_json"],
        },
      });
    } catch (err) {
      logger?.error("notif_template_preview_error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES  [general bearer — lookup domain read]
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /notifications/categories ───────────────────────────────────────────
  // Returns values from the notification.category lookup domain.

  const listCategoriesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const rows = await sql<{ code: string; label: string; sort_order: number }>`
        SELECT lv.code, lv.label, lv.sort_order
        FROM   control.lookup_value lv
        JOIN   control.lookup_domain ld ON ld.id = lv.domain_id
        WHERE  ld.domain_key = 'notification.category'
          AND  lv.status     = 'active'
        ORDER  BY lv.sort_order ASC, lv.code ASC
      `.execute(db);

      setCachePrivate(res);
      res.json({ data: rows.rows });
    } catch (err) {
      logger?.error("notif_categories_error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PREFERENCES  [self-scoped bearer]
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /notifications/preferences ──────────────────────────────────────────
  // Returns the calling principal's notification preferences.

  const getPreferencesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg      = (req.headers["x-org"]   as string) ?? "";

      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
      if (!principalId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      const rows = await db
        .selectFrom("master.principal_notification_preference as p")
        .select([
          "p.id", "p.event_code", "p.channel", "p.is_enabled", "p.frequency_code", "p.status",
        ] as never[])
        .where("p.tenant_id"    as never, "=", tenantId as never)
        .where("p.principal_id" as never, "=", principalId as never)
        .where("p.is_active"    as never, "=", true as never)
        .orderBy("p.event_code" as never, "asc")
        .orderBy("p.channel"    as never, "asc")
        .execute();

      setCachePrivate(res);
      res.json({ data: rows });
    } catch (err) {
      logger?.error("notif_preferences_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /notifications/preferences ────────────────────────────────────────
  // Upserts an array of preferences for the calling principal.
  // Body: { preferences: [{ event_code, channel, is_enabled, frequency_code }] }

  const patchPreferencesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg      = (req.headers["x-org"]   as string) ?? "";

      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";

      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
      if (!principalId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      const body        = req.body as Record<string, unknown>;
      const preferences = body["preferences"];

      if (!Array.isArray(preferences) || preferences.length === 0) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "preferences[] array is required" });
        return;
      }

      const now = new Date().toISOString();

      for (const pref of preferences as Record<string, unknown>[]) {
        const { event_code, channel, is_enabled, frequency_code } = pref;
        if (!event_code || !channel) continue;

        await db
          .insertInto("master.principal_notification_preference" as never)
          .values({
            tenant_id:      tenantId,
            principal_id:   principalId,
            event_code:     String(event_code),
            channel:        String(channel),
            is_enabled:     is_enabled !== undefined ? Boolean(is_enabled) : null,
            frequency_code: frequency_code ? String(frequency_code) : null,
            created_by:     principalId,
            metadata:       "{}",
          } as never)
          .onConflict((oc) =>
            oc.columns(["tenant_id", "principal_id", "event_code", "channel"] as never[])
              .doUpdateSet({
                is_enabled:     is_enabled !== undefined ? Boolean(is_enabled) : null,
                frequency_code: frequency_code ? String(frequency_code) : null,
                updated_at:     now,
                updated_by:     principalId,
              } as never),
          )
          .execute();
      }

      res.json({ ok: true });
    } catch (err) {
      logger?.error("notif_preferences_patch_error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECT SEND / TRIGGER  [platform-admin]
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /notifications/send ─────────────────────────────────────────────
  // Direct send: bypasses routing rules, creates a notification_message
  // immediately and enqueues a "send" BullMQ job.
  // Body: { recipient_id, template_key, subject?, channels?, payload, priority? }

  const directSendHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const sub       = typeof claims.sub === "string" ? claims.sub : "";
      const actorId   = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

      const body         = req.body as Record<string, unknown>;
      const recipientId  = body["recipient_id"];
      const templateKey  = body["template_key"];
      const subject      = typeof body["subject"] === "string" ? body["subject"] : null;
      const channels     = Array.isArray(body["channels"]) ? body["channels"] as string[] : ["in_app"];
      const payload      = (body["payload"] ?? {}) as Record<string, unknown>;
      const priority     = typeof body["priority"] === "string" ? body["priority"] : "normal";

      if (!recipientId || !templateKey) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "recipient_id and template_key are required" });
        return;
      }

      const row = await sql<{ id: string }>`
        INSERT INTO event.notification_message
          (tenant_id,    event_id,          event_code,
           template_key, template_version,  subject,
           payload,      channels,          priority,
           recipient_count, status,         created_by)
        VALUES
          (${tenantId}::uuid,
           gen_random_uuid()::text,
           ${"manual.direct_send"},
           ${String(templateKey)},
           1,
           ${subject},
           ${JSON.stringify({ ...payload, recipient_id: recipientId })}::jsonb,
           ${JSON.stringify(channels)}::text[],
           ${priority},
           1,
           ${"pending"},
           ${actorId ?? SYSTEM_ACTOR}::uuid)
        RETURNING id
      `.execute(db);

      const messageId = row.rows[0]?.id;
      if (!messageId) {
        res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create notification message" });
        return;
      }

      res.status(201).json({ data: { message_id: messageId } });
    } catch (err) {
      logger?.error("notif_direct_send_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /notifications/trigger ──────────────────────────────────────────
  // Trigger by event_code: evaluates matching routing rules for the given
  // event, expands recipients, and creates notification_message rows.
  // Body: { event_code, entity_type?, entity_id?, payload, priority? }

  const triggerHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg     = (req.headers["x-org"]   as string) ?? "";
      const xRealm   = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const sub      = typeof claims.sub === "string" ? claims.sub : "";
      const actorId  = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

      const body       = req.body as Record<string, unknown>;
      const eventCode  = body["event_code"];
      const entityType = typeof body["entity_type"] === "string" ? body["entity_type"] : null;
      const entityId   = typeof body["entity_id"]   === "string" ? body["entity_id"]   : null;
      const payload    = (body["payload"] ?? {}) as Record<string, unknown>;
      const priority   = typeof body["priority"] === "string" ? body["priority"] : "normal";

      if (!eventCode) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "event_code is required" });
        return;
      }

      // Find matching active routing rules
      const rules = await db
        .selectFrom("control.notification_routing_rule as r")
        .select(["r.id", "r.template_key", "r.channels", "r.recipient_rules"] as never[])
        .where((eb) => eb.or([
          eb("r.tenant_id" as never, "is",  null),
          eb("r.tenant_id" as never, "=",   tenantId as never),
        ]))
        .where("r.event_type"  as never, "=",   eventCode as never)
        .where("r.is_enabled"  as never, "=",   true as never)
        .execute() as Array<{
          id: string;
          template_key: string;
          channels: string[] | null;
          recipient_rules: Record<string, unknown> | null;
        }>;

      if (rules.length === 0) {
        res.json({ data: { triggered: 0, message_ids: [] } });
        return;
      }

      const messageIds: string[] = [];

      for (const rule of rules) {
        // Extract explicit recipient IDs from recipient_rules.explicit_ids
        const explicitIds = (rule.recipient_rules?.["explicit_ids"] as string[] | undefined) ?? [];
        // actor from payload if recipient_rules.actor = true
        const actorRecipient = rule.recipient_rules?.["actor"] === true && actorId ? [actorId] : [];
        const recipients = [...new Set([...explicitIds, ...actorRecipient])];

        if (recipients.length === 0) continue;

        for (const recipientId of recipients) {
          const row = await sql<{ id: string }>`
            INSERT INTO event.notification_message
              (tenant_id,    event_id,          event_code,
               rule_id,      template_key,      template_version,
               entity_type,  entity_id,         subject,
               payload,      channels,           priority,
               recipient_count, status,          created_by)
            VALUES
              (${tenantId}::uuid,
               gen_random_uuid()::text,
               ${String(eventCode)},
               ${rule.id}::uuid,
               ${rule.template_key},
               1,
               ${entityType},
               ${entityId ? `${entityId}::uuid` : null}::uuid,
               null,
               ${JSON.stringify({ ...payload, recipient_id: recipientId })}::jsonb,
               ${JSON.stringify(rule.channels ?? ["in_app"])}::text[],
               ${priority},
               1,
               ${"pending"},
               ${actorId ?? SYSTEM_ACTOR}::uuid)
            RETURNING id
          `.execute(db);
          const msgId = row.rows[0]?.id;
          if (msgId) messageIds.push(msgId);
        }
      }

      res.status(201).json({ data: { triggered: messageIds.length, message_ids: messageIds } });
    } catch (err) {
      logger?.error("notif_trigger_error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PUSH SUBSCRIPTIONS  [bearer — self-scoped]
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /notifications/push/vapid-key ───────────────────────────────────
  // Returns the server's VAPID public key for Web Push subscription setup.

  const vapidKeyHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      // The VAPID public key is read from the VAPID_PUBLIC_KEY env var.
      // When not configured, return an empty key so the client can degrade.
      const publicKey = process.env["VAPID_PUBLIC_KEY"] ?? "";
      res.json({ data: { public_key: publicKey, configured: publicKey.length > 0 } });
    } catch (err) {
      logger?.error("notif_vapid_key_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /notifications/push/subscribe ──────────────────────────────────
  // Register or refresh a push subscription for the calling principal.
  // Body: { platform, device_id, endpoint, p256dh_key?, auth_key?, device_token?, user_agent? }

  const pushSubscribeHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const sub       = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
      if (!principalId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      const body       = req.body as Record<string, unknown>;
      const platform   = body["platform"];
      const deviceId   = body["device_id"];
      const endpoint   = body["endpoint"];

      if (!platform || !deviceId || !endpoint) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "platform, device_id, and endpoint are required" });
        return;
      }
      if (!["web", "android", "ios"].includes(String(platform))) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "platform must be one of: web, android, ios" });
        return;
      }

      const row = await sql<{ id: string }>`
        INSERT INTO event.push_subscription
          (tenant_id,    principal_id,   platform,   device_id,   endpoint,
           p256dh_key,   auth_key,       device_token, user_agent,
           is_active,    last_used_at,   created_by)
        VALUES
          (${tenantId}::uuid,   ${principalId}::uuid,
           ${String(platform)}, ${String(deviceId)},  ${String(endpoint)},
           ${typeof body["p256dh_key"] === "string" ? body["p256dh_key"] : null},
           ${typeof body["auth_key"]   === "string" ? body["auth_key"]   : null},
           ${typeof body["device_token"] === "string" ? body["device_token"] : null},
           ${typeof body["user_agent"]   === "string" ? body["user_agent"]   : null},
           true,  now(),  ${principalId}::uuid)
        ON CONFLICT (tenant_id, principal_id, platform, device_id)
          DO UPDATE SET
            endpoint      = EXCLUDED.endpoint,
            p256dh_key    = COALESCE(EXCLUDED.p256dh_key,    event.push_subscription.p256dh_key),
            auth_key      = COALESCE(EXCLUDED.auth_key,       event.push_subscription.auth_key),
            device_token  = COALESCE(EXCLUDED.device_token,   event.push_subscription.device_token),
            user_agent    = COALESCE(EXCLUDED.user_agent,     event.push_subscription.user_agent),
            is_active     = true,
            last_used_at  = now(),
            updated_at    = now(),
            updated_by    = ${principalId}::uuid
        RETURNING id
      `.execute(db);

      const id = row.rows[0]?.id;
      res.status(201).json({ data: { id } });
    } catch (err) {
      logger?.error("notif_push_subscribe_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /notifications/push/subscribe/:id ─────────────────────────────
  // Deactivate a push subscription (unregister device).

  const pushUnsubscribeHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const subscriptionId = req.params["id"] as string;
      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const sub       = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
      if (!principalId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      if (!isUuid(subscriptionId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid subscription id" });
        return;
      }

      await sql`
        UPDATE event.push_subscription
        SET    is_active   = false,
               updated_at  = now(),
               updated_by  = ${principalId}::uuid
        WHERE  id           = ${subscriptionId}::uuid
          AND  tenant_id    = ${tenantId}::uuid
          AND  principal_id = ${principalId}::uuid
      `.execute(db);

      res.status(204).end();
    } catch (err) {
      logger?.error("notif_push_unsubscribe_error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP CONSENT  [bearer — self-scoped]
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /notifications/whatsapp/consent ─────────────────────────────────
  // List the calling principal's WhatsApp consent records.

  const listWhatsAppConsentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const sub       = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
      if (!principalId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      const rows = await sql<{
        id: string;
        phone_e164: string;
        consent_status: string;
        consented_at: string | null;
        revoked_at: string | null;
        created_at: string;
      }>`
        SELECT id, phone_e164, consent_status, consented_at, revoked_at, created_at
        FROM   event.whatsapp_consent
        WHERE  tenant_id    = ${tenantId}::uuid
          AND  principal_id = ${principalId}::uuid
        ORDER  BY created_at DESC
      `.execute(db);

      setCachePrivate(res);
      res.json({ data: rows.rows });
    } catch (err) {
      logger?.error("notif_whatsapp_consent_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /notifications/whatsapp/consent ────────────────────────────────
  // Opt-in to WhatsApp notifications for a given phone number.
  // Body: { phone_e164, consent_source? }

  const whatsAppOptInHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const sub       = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
      if (!principalId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      const body           = req.body as Record<string, unknown>;
      const phone          = body["phone_e164"];
      const consentSource  = typeof body["consent_source"] === "string" ? body["consent_source"] : "api";

      if (!phone || typeof phone !== "string" || !/^\+[1-9]\d{1,14}$/.test(phone)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "phone_e164 must be a valid E.164 number" });
        return;
      }

      const row = await sql<{ id: string }>`
        INSERT INTO event.whatsapp_consent
          (tenant_id,    principal_id,   phone_e164,   consent_status,
           consented_at, consent_source, created_by)
        VALUES
          (${tenantId}::uuid, ${principalId}::uuid,
           ${phone},          ${"opted_in"},
           now(),             ${consentSource},
           ${principalId}::uuid)
        ON CONFLICT (tenant_id, principal_id, phone_e164)
          DO UPDATE SET
            consent_status = ${"opted_in"},
            consented_at   = now(),
            revoked_at     = null,
            consent_source = EXCLUDED.consent_source,
            updated_at     = now(),
            updated_by     = ${principalId}::uuid
        RETURNING id
      `.execute(db);

      res.status(201).json({ data: { id: row.rows[0]?.id } });
    } catch (err) {
      logger?.error("notif_whatsapp_optin_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /notifications/whatsapp/consent/:id ──────────────────────────
  // Revoke WhatsApp consent (opt-out). Irreversible — a new opt-in is required.

  const whatsAppRevokeHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const consentId  = req.params["id"] as string;
      const xOrg       = (req.headers["x-org"]   as string) ?? "";
      const xRealm     = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId   = await resolveTenantId(db, xOrg, xRealm);
      const sub        = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
      if (!principalId) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

      if (!isUuid(consentId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid consent id" });
        return;
      }

      await sql`
        UPDATE event.whatsapp_consent
        SET    consent_status = ${"revoked"},
               revoked_at     = now(),
               updated_at     = now(),
               updated_by     = ${principalId}::uuid
        WHERE  id           = ${consentId}::uuid
          AND  tenant_id    = ${tenantId}::uuid
          AND  principal_id = ${principalId}::uuid
          AND  consent_status NOT IN (${"revoked"}, ${"opted_out"})
      `.execute(db);

      res.status(204).end();
    } catch (err) {
      logger?.error("notif_whatsapp_revoke_error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN  [platform-admin]
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /notifications/messages ──────────────────────────────────────────
  // Message history with filters: status, event_code, channel, principal_id.
  // Frontend calls /api/notifications/admin/messages → BFF strips /admin/ → here.

  const adminListMessagesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const q         = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);

      const status      = typeof q["status"]       === "string" ? q["status"]       : undefined;
      const eventCode   = typeof q["event_code"]   === "string" ? q["event_code"]   : undefined;
      const channel     = typeof q["channel"]      === "string" ? q["channel"]      : undefined;
      const principalId = typeof q["principal_id"] === "string" ? q["principal_id"] : undefined;

      let base = db
        .selectFrom("event.notification_message as m")
        .where("m.tenant_id" as never, "=", tenantId as never);

      if (status)      base = base.where("m.status"       as never, "=", status      as never) as typeof base;
      if (eventCode)   base = base.where("m.event_code"   as never, "=", eventCode   as never) as typeof base;
      if (principalId) base = base.where("m.recipient_id" as never, "=", principalId as never) as typeof base;

      // Channel filter: notification_message.channels is a text[] column
      if (channel) {
        base = base.where(
          (eb) => eb.fn("m.channels @> ARRAY[?]::text[]" as never, [channel as never]),
        ) as typeof base;
      }

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirst(),
        base
          .select([
            "m.id", "m.event_code", "m.template_key", "m.subject",
            "m.channels", "m.status", "m.priority",
            "m.recipient_count", "m.delivered_count", "m.failed_count",
            "m.created_at", "m.completed_at",
          ] as never[])
          .orderBy("m.created_at" as never, "desc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      setCachePrivate(res);
      res.json({
        data: rows,
        meta: {
          total: Number(countRow?.n ?? 0),
          page,
          limit,
          pages: Math.ceil(Number(countRow?.n ?? 0) / limit),
        },
      });
    } catch (err) {
      logger?.error("notif_admin_messages_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /notifications/messages/:id/deliveries ───────────────────────────
  // Delivery log for a specific notification message.

  const adminListDeliveriesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const messageId = req.params["id"] as string;

      if (!isUuid(messageId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid message id" });
        return;
      }

      const rows = await sql<{
        id:             string;
        channel:        string;
        recipient_addr: string;
        status:         string;
        external_id:    string | null;
        last_error:     string | null;
        attempt_count:  number;
        sent_at:        string | null;
        created_at:     string;
      }>`
        SELECT id, channel, recipient_addr, status, external_id,
               last_error, attempt_count, sent_at, created_at
        FROM   event.notification_delivery
        WHERE  tenant_id  = ${tenantId}::uuid
          AND  message_id = ${messageId}::uuid
        ORDER  BY channel ASC, created_at ASC
      `.execute(db);

      setCachePrivate(res);
      res.json({ data: rows.rows });
    } catch (err) {
      logger?.error("notif_admin_deliveries_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /notifications/deliveries/:id/retry ─────────────────────────────
  // Reset a failed delivery to pending so the sweep job re-dispatches it.

  const adminRetryDeliveryHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const xOrg      = (req.headers["x-org"]   as string) ?? "";
      const xRealm    = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId  = await resolveTenantId(db, xOrg, xRealm);
      const deliveryId = req.params["id"] as string;

      if (!isUuid(deliveryId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid delivery id" });
        return;
      }

      // Fetch the delivery to find its parent message
      const delivery = await sql<{ id: string; message_id: string; status: string }>`
        SELECT id, message_id, status
        FROM   event.notification_delivery
        WHERE  id        = ${deliveryId}::uuid
          AND  tenant_id = ${tenantId}::uuid
      `.execute(db);

      const row = delivery.rows[0];
      if (!row) {
        res.status(404).json({ error: "NOT_FOUND", message: "Delivery not found" });
        return;
      }
      if (row.status !== "failed") {
        res.status(409).json({ error: "CONFLICT", message: "Only failed deliveries can be retried" });
        return;
      }

      // Reset the delivery row and parent message to allow re-sweep
      await sql`
        UPDATE event.notification_delivery
        SET    status        = ${"pending"},
               last_error    = NULL,
               attempt_count = attempt_count + 1,
               updated_at    = now()
        WHERE  id = ${deliveryId}::uuid
      `.execute(db);

      await sql`
        UPDATE event.notification_message
        SET    status     = ${"pending"},
               updated_at = now()
        WHERE  id         = ${row.message_id}::uuid
          AND  tenant_id  = ${tenantId}::uuid
          AND  status     IN (${"failed"}, ${"partial"})
      `.execute(db);

      res.json({ ok: true, messageId: row.message_id });
    } catch (err) {
      logger?.error("notif_admin_retry_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /notifications/providers ─────────────────────────────────────────
  // Provider health dashboard — returns control.notification_provider rows.

  const adminListProvidersHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      if (!isPlatformAdmin(claims)) {
        res.status(403).json({ error: "FORBIDDEN", message: "platform-admin role required" });
        return;
      }

      const rows = await sql<{
        id:            string;
        channel:       string;
        code:          string;
        name:          string;
        adapter_key:   string;
        health:        string;
        is_active:     boolean;
        priority:      number;
        last_check_at: string | null;
        created_at:    string;
      }>`
        SELECT id, channel, code, name, adapter_key, health,
               is_active, priority, last_check_at, created_at
        FROM   control.notification_provider
        ORDER  BY channel ASC, priority ASC
      `.execute(db);

      setCachePrivate(res);
      res.json({ data: rows.rows });
    } catch (err) {
      logger?.error("notif_admin_providers_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register routes ───────────────────────────────────────────────────────

  router.get("/notifications/routing-rules",           listRoutingRulesHandler);
  router.post("/notifications/routing-rules",          createRoutingRuleHandler);
  router.patch("/notifications/routing-rules/:id",     updateRoutingRuleHandler);
  router.delete("/notifications/routing-rules/:id",    deleteRoutingRuleHandler);

  router.get("/notifications/templates",               listTemplatesHandler);
  router.post("/notifications/templates",              createTemplateHandler);
  router.patch("/notifications/templates/:id",         updateTemplateHandler);
  router.post("/notifications/templates/:id/activate", activateTemplateHandler);
  router.post("/notifications/templates/:id/preview",  previewTemplateHandler);

  router.get("/notifications/categories",              listCategoriesHandler);

  router.get("/notifications/preferences",             getPreferencesHandler);
  router.patch("/notifications/preferences",           patchPreferencesHandler);

  // Direct send / trigger
  router.post("/notifications/send",                   directSendHandler);
  router.post("/notifications/trigger",                triggerHandler);

  // Push subscriptions
  router.get("/notifications/push/vapid-key",              vapidKeyHandler);
  router.post("/notifications/push/subscribe",             pushSubscribeHandler);
  router.delete("/notifications/push/subscribe/:id",       pushUnsubscribeHandler);

  // WhatsApp consent
  router.get("/notifications/whatsapp/consent",            listWhatsAppConsentHandler);
  router.post("/notifications/whatsapp/consent",           whatsAppOptInHandler);
  router.delete("/notifications/whatsapp/consent/:id",     whatsAppRevokeHandler);

  // Admin — message history + delivery log + retry + providers
  // BFF /api/notifications/admin/<path> strips the /admin/ prefix before
  // forwarding, so these routes sit at /notifications/<path> on the backend.
  router.get("/notifications/messages",                   adminListMessagesHandler);
  router.get("/notifications/messages/:id/deliveries",    adminListDeliveriesHandler);
  router.post("/notifications/deliveries/:id/retry",      adminRetryDeliveryHandler);
  router.get("/notifications/providers",                  adminListProvidersHandler);

  return router;
}
