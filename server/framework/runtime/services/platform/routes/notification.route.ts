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

  return router;
}
