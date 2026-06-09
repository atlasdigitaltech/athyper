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
import { timingSafeEqual } from "node:crypto";
import { JOB_NAME, type SendNotificationJobData } from "@athyper/svc-jobs";
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
  notificationQueue?: {
    add(name: string, data: SendNotificationJobData, opts?: Record<string, unknown>): Promise<unknown>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
  bounceWebhookSecret?: string;
  webPush?: {
    configured: boolean;
    publicKey?: string;
    maxSubscriptionsPerPrincipal?: number;
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function isPlatformAdmin(claims: Record<string, unknown>): boolean {
  const ra = claims["realm_access"] as Record<string, unknown> | undefined;
  const roles = ra?.["roles"];
  return Array.isArray(roles) && (roles as string[]).includes("platform-admin");
}

const SYSTEM_ACTOR = "00000000-0000-7000-a000-000000000001";
const DEFAULT_CHANNELS = ["in_app"];
const ALLOWED_CHANNELS = new Set(["in_app", "email", "sms", "push", "webhook", "whatsapp"]);
const DEFAULT_MAX_PUSH_SUBSCRIPTIONS_PER_PRINCIPAL = 10;

function normalizeChannels(value: unknown, fallback: string[] = DEFAULT_CHANNELS): string[] | null {
  const raw = value === undefined ? fallback : value;
  if (!Array.isArray(raw)) return null;

  const channels = raw
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  const unique = [...new Set(channels)];
  if (unique.length === 0) return null;
  if (unique.some((channel) => !ALLOWED_CHANNELS.has(channel))) return null;
  return unique;
}

function textArray(values: string[]) {
  return sql`ARRAY[${sql.join(values)}]::text[]`;
}

function safeSecretEquals(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function jsonObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fallback;
}

function stringHeader(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first.trim() : null;
  }
  return null;
}

function normalizeSourcePlane(value: unknown): "neon" | "mesh" | "admin" | null {
  const plane = typeof value === "string" ? value.trim().toLowerCase() : "";
  return plane === "neon" || plane === "mesh" || plane === "admin" ? plane : null;
}

function resolveSourcePlane(body: Record<string, unknown>, headers: Record<string, unknown>): "neon" | "mesh" | "admin" {
  return normalizeSourcePlane(body["source_plane"])
    ?? normalizeSourcePlane(stringHeader(headers["x-plane-key"]))
    ?? normalizeSourcePlane(stringHeader(headers["x-plane"]))
    ?? normalizeSourcePlane(stringHeader(headers["x-athyper-plane"]))
    ?? "neon";
}

function lifecycleStateFromPayload(payload: Record<string, unknown>): string | null {
  for (const key of ["lifecycle_state", "to_status", "to_state", "status"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function enqueuePendingNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  queue: NotificationRoutesDeps["notificationQueue"],
  tenantId: string,
  messageId: string,
  logger?: NotificationRoutesDeps["logger"],
): Promise<boolean> {
  if (!queue) return false;

  try {
    await sql`
      UPDATE event.notification_message
      SET    status = 'planning', updated_at = now()
      WHERE  id = ${messageId}::uuid
        AND  tenant_id = ${tenantId}::uuid
        AND  status = 'pending'
    `.execute(db);

    await queue.add(
      JOB_NAME.SEND,
      { messageId, tenantId },
      {
        jobId:            `notif-${messageId}`,
        attempts:         3,
        backoff:          { type: "exponential", delay: 60_000 },
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 200 },
      },
    );
    return true;
  } catch (err) {
    await sql`
      UPDATE event.notification_message
      SET    status = 'pending', updated_at = now()
      WHERE  id = ${messageId}::uuid
        AND  tenant_id = ${tenantId}::uuid
        AND  status = 'planning'
    `.execute(db).catch(() => undefined);
    logger?.error("notif_enqueue_error", { messageId, err: String(err) });
    return false;
  }
}

// ─── Route factory ─────────────────────────────────────────────────────────────

// ─── Bounce payload normalisation ─────────────────────────────────────────────
// Accepts Resend, SendGrid, Postmark, or a generic envelope.
// Returns one entry per affected address.

type BounceEntry = { email: string; reason: "hard" | "soft" | "complaint" };

function normaliseBouncePayload(body: unknown): BounceEntry[] {
  if (!body || typeof body !== "object") return [];

  // AWS SES via SNS envelope: { Type: "Notification", Message: "<json-string>", ... }
  // The inner Message is a JSON-stringified SES bounce/complaint notification.
  if (
    "Type" in (body as Record<string, unknown>) &&
    (body as Record<string, unknown>)["Type"] === "Notification" &&
    typeof (body as Record<string, unknown>)["Message"] === "string"
  ) {
    let msg: unknown;
    try { msg = JSON.parse((body as Record<string, unknown>)["Message"] as string); }
    catch { return []; }
    if (!msg || typeof msg !== "object") return [];
    const m = msg as Record<string, unknown>;
    const notifType = m["notificationType"] as string | undefined;
    if (notifType === "Bounce") {
      const bounce = (m["bounce"] ?? {}) as Record<string, unknown>;
      const reason: "hard" | "soft" = (bounce["bounceType"] as string | undefined) === "Permanent" ? "hard" : "soft";
      const recipients = Array.isArray(bounce["bouncedRecipients"])
        ? (bounce["bouncedRecipients"] as Record<string, unknown>[])
        : [];
      return recipients
        .map((r) => (typeof r["emailAddress"] === "string" ? r["emailAddress"].toLowerCase().trim() : null))
        .filter((e): e is string => Boolean(e))
        .map((email) => ({ email, reason }));
    }
    if (notifType === "Complaint") {
      const complaint = (m["complaint"] ?? {}) as Record<string, unknown>;
      const recipients = Array.isArray(complaint["complainedRecipients"])
        ? (complaint["complainedRecipients"] as Record<string, unknown>[])
        : [];
      return recipients
        .map((r) => (typeof r["emailAddress"] === "string" ? r["emailAddress"].toLowerCase().trim() : null))
        .filter((e): e is string => Boolean(e))
        .map((email) => ({ email, reason: "complaint" as const }));
    }
    return [];
  }

  // Resend: { type: "email.bounced" | "email.complained", data: { to: string[], bounce?: { type: "hard"|"soft" } } }
  if ("type" in (body as Record<string, unknown>)) {
    const b = body as Record<string, unknown>;
    const type = b["type"] as string;
    const data = (b["data"] ?? {}) as Record<string, unknown>;
    const toList = Array.isArray(data["to"]) ? (data["to"] as string[]) : [];
    if (type === "email.bounced") {
      const bounceType = ((data["bounce"] as Record<string, unknown> | undefined)?.["type"] as string | undefined);
      const reason: "hard" | "soft" = bounceType === "soft" ? "soft" : "hard";
      return toList.map((email) => ({ email: email.toLowerCase().trim(), reason }));
    }
    if (type === "email.complained") {
      return toList.map((email) => ({ email: email.toLowerCase().trim(), reason: "complaint" as const }));
    }
    return [];
  }

  // SendGrid: array of event objects
  if (Array.isArray(body)) {
    const entries: BounceEntry[] = [];
    for (const ev of body as Record<string, unknown>[]) {
      const event = ev["event"] as string | undefined;
      const email = typeof ev["email"] === "string" ? ev["email"].toLowerCase().trim() : null;
      if (!email) continue;
      if (event === "bounce") {
        const sgType = ev["type"] as string | undefined;
        const reason: "hard" | "soft" = sgType === "soft" || sgType === "blocked" ? "soft" : "hard";
        entries.push({ email, reason });
      } else if (event === "spamreport") {
        entries.push({ email, reason: "complaint" });
      }
    }
    return entries;
  }

  // Postmark: { RecordType: "Bounce", Type: "HardBounce"|"SoftBounce", Recipient: string }
  if ("RecordType" in (body as Record<string, unknown>)) {
    const b = body as Record<string, unknown>;
    const email = typeof b["Recipient"] === "string" ? b["Recipient"].toLowerCase().trim() : null;
    if (!email) return [];
    if (b["RecordType"] === "Bounce") {
      const reason: "hard" | "soft" = String(b["Type"] ?? "").toLowerCase().includes("soft") ? "soft" : "hard";
      return [{ email, reason }];
    }
    if (b["RecordType"] === "SpamComplaint") {
      return [{ email, reason: "complaint" }];
    }
    return [];
  }

  // Generic / Brevo: { event: "bounce"|"hard_bounce"|"soft_bounce"|"complaint", email: string, bounce_type?: "hard"|"soft" }
  // Brevo sends "hard_bounce" and "soft_bounce" (not "bounce") so both are matched here.
  const b = body as Record<string, unknown>;
  const email = typeof b["email"] === "string" ? b["email"].toLowerCase().trim() : null;
  if (!email) return [];
  const event = b["event"] as string | undefined;
  if (event === "bounce" || event === "hard_bounce") {
    const reason: "hard" | "soft" = b["bounce_type"] === "soft" ? "soft" : "hard";
    return [{ email, reason }];
  }
  if (event === "soft_bounce") {
    return [{ email, reason: "soft" }];
  }
  if (event === "complaint") {
    return [{ email, reason: "complaint" }];
  }
  return [];
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function registerNotificationRoutes(router: Router, deps: NotificationRoutesDeps): Router {
  const { db, auth, logger, bounceWebhookSecret, notificationQueue, webPush } = deps;

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
      const parsedChannels = normalizeChannels(channels, []);
      if (!code || !name || !event_type || !template_key || !parsedChannels) {
        res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "code, name, event_type, template_key, and valid channels[] are required",
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
          channels:         textArray(parsedChannels),
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
      const parsedUpdateChannels = body["channels"] !== undefined
        ? normalizeChannels(body["channels"], [])
        : undefined;
      if (body["channels"] !== undefined && !parsedUpdateChannels) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "channels must be a non-empty array of valid notification channels" });
        return;
      }

      const fields: Array<[string, (v: unknown) => unknown]> = [
        ["name",            (v) => String(v).trim()],
        ["description",     (v) => v ? String(v) : null],
        ["template_key",    (v) => String(v).trim()],
        ["channels",        () => textArray(parsedUpdateChannels!)],
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

      const rows = await sql<{ code: string; name: string; sort_order: number }>`
        SELECT lv.code, lv.name, lv.sort_order
        FROM   control.lookup_value lv
        JOIN   control.lookup_domain ld ON ld.code = lv.domain_code
        WHERE  ld.code     = 'notification.category'
          AND  lv.status   = 'active'
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
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }
      const sub       = typeof claims.sub === "string" ? claims.sub : "";
      const actorId   = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

      const body         = req.body as Record<string, unknown>;
      const recipientId  = typeof body["recipient_id"] === "string" ? body["recipient_id"].trim() : "";
      const templateKey  = typeof body["template_key"] === "string" ? body["template_key"].trim() : "";
      const subject      = typeof body["subject"] === "string" ? body["subject"] : null;
      const channels     = normalizeChannels(body["channels"]);
      const payload      = jsonObject(body["payload"]);
      const priority     = typeof body["priority"] === "string" ? body["priority"] : "normal";
      const sourcePlane = resolveSourcePlane(body, req.headers as Record<string, unknown>);

      if (!recipientId || !templateKey || !channels) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "recipient_id, template_key, and valid channels[] are required" });
        return;
      }
      if (!isUuid(recipientId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "recipient_id must be a UUID" });
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
           ${JSON.stringify({ ...payload, recipient_id: recipientId, source_plane: sourcePlane })}::jsonb,
           ${textArray(channels)},
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

      const queued = await enqueuePendingNotification(db, notificationQueue, tenantId, messageId, logger);
      res.status(201).json({ data: { message_id: messageId, queued } });
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
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }
      const sub      = typeof claims.sub === "string" ? claims.sub : "";
      const actorId  = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

      const body       = req.body as Record<string, unknown>;
      const eventCode  = typeof body["event_code"] === "string" ? body["event_code"].trim() : "";
      const entityType = typeof body["entity_type"] === "string" && body["entity_type"].trim()
        ? body["entity_type"].trim()
        : null;
      const entityId   = typeof body["entity_id"] === "string" && body["entity_id"].trim()
        ? body["entity_id"].trim()
        : null;
      const payload      = jsonObject(body["payload"]);
      const priority     = typeof body["priority"] === "string" ? body["priority"] : "normal";
      const sourcePlane = resolveSourcePlane(body, req.headers as Record<string, unknown>);
      const lifecycleState = lifecycleStateFromPayload(payload);
      const workflowPhase = typeof body["workflow_phase"] === "string" && body["workflow_phase"].trim()
        ? body["workflow_phase"].trim()
        : null;

      if (!eventCode) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "event_code is required" });
        return;
      }
      if (entityId && !isUuid(entityId)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "entity_id must be a UUID" });
        return;
      }

      // Find matching active routing rules
      let rulesQuery = db
        .selectFrom("control.notification_routing_rule as r")
        .select(["r.id", "r.template_key", "r.channels", "r.recipient_rules"] as never[])
        .where((eb) => eb.or([
          eb("r.tenant_id" as never, "is",  null),
          eb("r.tenant_id" as never, "=",   tenantId as never),
        ]))
        .where("r.event_type"  as never, "=",   eventCode as never)
        .where("r.is_enabled"  as never, "=",   true as never);

      rulesQuery = entityType
        ? rulesQuery.where((eb) => eb.or([
            eb("r.entity_type" as never, "is", null),
            eb("r.entity_type" as never, "=", entityType as never),
          ])) as typeof rulesQuery
        : rulesQuery.where("r.entity_type" as never, "is", null) as typeof rulesQuery;

      rulesQuery = lifecycleState
        ? rulesQuery.where((eb) => eb.or([
            eb("r.lifecycle_state" as never, "is", null),
            eb("r.lifecycle_state" as never, "=", lifecycleState as never),
          ])) as typeof rulesQuery
        : rulesQuery.where("r.lifecycle_state" as never, "is", null) as typeof rulesQuery;

      rulesQuery = workflowPhase
        ? rulesQuery.where((eb) => eb.or([
            eb("r.workflow_phase" as never, "is", null),
            eb("r.workflow_phase" as never, "=", workflowPhase as never),
          ])) as typeof rulesQuery
        : rulesQuery.where("r.workflow_phase" as never, "is", null) as typeof rulesQuery;

      const rules = await rulesQuery
        .orderBy("r.sort_order" as never, "asc")
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
        const explicitIds = Array.isArray(rule.recipient_rules?.["explicit_ids"])
          ? (rule.recipient_rules?.["explicit_ids"] as unknown[]).filter((id): id is string => typeof id === "string" && isUuid(id))
          : [];
        // actor from payload if recipient_rules.actor = true
        const rawPayloadActorId = payload["actor_id"];
        const payloadActorId = typeof rawPayloadActorId === "string" && isUuid(rawPayloadActorId)
          ? rawPayloadActorId
          : null;
        const actorRecipient = rule.recipient_rules?.["actor"] === true && (payloadActorId ?? actorId)
          ? [payloadActorId ?? actorId!]
          : [];
        const recipients = [...new Set([...explicitIds, ...actorRecipient])];
        const ruleChannels = normalizeChannels(rule.channels);

        if (recipients.length === 0 || !ruleChannels) continue;

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
               ${entityId}::uuid,
               null,
               ${JSON.stringify({ ...payload, recipient_id: recipientId, source_plane: sourcePlane })}::jsonb,
               ${textArray(ruleChannels)},
               ${priority},
               1,
               ${"pending"},
               ${actorId ?? SYSTEM_ACTOR}::uuid)
            RETURNING id
          `.execute(db);
          const msgId = row.rows[0]?.id;
          if (msgId) {
            messageIds.push(msgId);
            await enqueuePendingNotification(db, notificationQueue, tenantId, msgId, logger);
          }
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

      const publicKey = webPush?.publicKey ?? "";
      const configured = Boolean(webPush?.configured && publicKey);
      res.json({
        data: {
          public_key: configured ? publicKey : "",
          configured,
        },
      });
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

      const maxSubscriptions = webPush?.maxSubscriptionsPerPrincipal ?? DEFAULT_MAX_PUSH_SUBSCRIPTIONS_PER_PRINCIPAL;
      const activeCount = await sql<{ count: string }>`
        SELECT count(*)::text AS count
        FROM   event.push_subscription
        WHERE  tenant_id    = ${tenantId}::uuid
          AND  principal_id = ${principalId}::uuid
          AND  is_active    = true
          AND NOT (
            platform  = ${String(platform)}
            AND device_id = ${String(deviceId)}
          )
      `.execute(db);
      if (Number(activeCount.rows[0]?.count ?? "0") >= maxSubscriptions) {
        res.status(429).json({
          error: "PUSH_SUBSCRIPTION_LIMIT",
          message: `Maximum active push subscriptions reached (${maxSubscriptions}). Disable another browser/device first.`,
        });
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

      if (status)    base = base.where("m.status"     as never, "=", status    as never) as typeof base;
      if (eventCode) base = base.where("m.event_code" as never, "=", eventCode as never) as typeof base;
      if (principalId) {
        base = base.where(sql<boolean>`
          EXISTS (
            SELECT 1
            FROM   event.notification_delivery nd
            WHERE  nd.message_id   = m.id
              AND  nd.tenant_id    = m.tenant_id
              AND  nd.recipient_id = ${principalId}::uuid
          )
        `) as typeof base;
      }

      // Channel filter: notification_message.channels is a text[] column
      if (channel) {
        base = base.where(sql<boolean>`m.channels @> ARRAY[${channel}]::text[]`) as typeof base;
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
        id:          string;
        channel:     string;
        code:        string;
        name:        string;
        adapter_key: string;
        health:      string;
        is_enabled:  boolean;
        priority:    number;
        updated_at:  string | null;
        created_at:  string;
      }>`
        SELECT id, channel, code, name, adapter_key, health,
               is_enabled, priority, updated_at, created_at
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

  // ── POST /notifications/webhooks/email-bounce ─────────────────────────────
  // Unauthenticated (no bearer) — validated via Authorization: Bearer <bounceWebhookSecret>.
  // Called by SMTP providers (Resend, SendGrid, Postmark) on bounce or complaint events.
  //
  // For hard bounces and spam complaints:
  //   - Increments master.contact_email bounce_count / last_bounce_at / last_bounce_reason
  //   - Sets master.contact_link status = 'inactive', is_verified = false
  //   - Trigger trg_contact_link_sync_login_email fires → clears principal.login_email
  //
  // For soft bounces: increments bounce metadata only (contact_link stays active).

  const emailBounceWebhookHandler: RequestHandler = async (req, res, next) => {
    try {
      // Secret check — required when SMTP_BOUNCE_WEBHOOK_SECRET is configured.
      // Accepts Authorization: Bearer <secret> (SES/SNS, generic)
      //         Authorization: Token  <secret> (Brevo outbound webhook)
      if (!bounceWebhookSecret) {
        res.status(403).json({ error: "FORBIDDEN", message: "Bounce webhook is not configured" });
        return;
      }
      {
        const authHeader = req.headers.authorization ?? "";
        const provided = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : authHeader.startsWith("Token ")
            ? authHeader.slice(6).trim()
            : "";
        if (!safeSecretEquals(provided, bounceWebhookSecret)) {
          res.status(401).json({ error: "UNAUTHORIZED" });
          return;
        }
      }

      const entries = normaliseBouncePayload(req.body);
      if (entries.length === 0) {
        res.json({ processed: 0, deactivated: 0 });
        return;
      }

      let processed = 0;
      let deactivated = 0;

      for (const { email, reason } of entries) {
        // Increment bounce metadata on contact_email (joined through contact_link by email value)
        const updated = await sql<{ count: string }>`
          UPDATE master.contact_email ce
             SET bounce_count       = ce.bounce_count + 1,
                 last_bounce_at     = now(),
                 last_bounce_reason = ${reason},
                 updated_at         = now(),
                 updated_by         = ${SYSTEM_ACTOR}::uuid
            FROM master.contact_link cl
           WHERE cl.id             = ce.contact_link_id
             AND cl.tenant_id      = ce.tenant_id
             AND lower(cl.value)   = ${email}
             AND cl.channel_type   = 'email'
        `.execute(db);

        const affectedRows = (updated as { numAffectedRows?: bigint }).numAffectedRows ?? 0n;
        if (affectedRows > 0n) processed++;

        // Hard bounce or complaint: deactivate the contact_link so the
        // trg_contact_link_sync_login_email trigger clears principal.login_email
        if (reason === "hard" || reason === "complaint") {
          const deact = await sql<never>`
            UPDATE master.contact_link
               SET status      = 'inactive',
                   is_verified = false,
                   updated_at  = now(),
                   updated_by  = ${SYSTEM_ACTOR}::uuid
             WHERE lower(value)  = ${email}
               AND channel_type  = 'email'
               AND status        = 'active'
          `.execute(db);

          const deactRows = (deact as { numAffectedRows?: bigint }).numAffectedRows ?? 0n;
          if (deactRows > 0n) deactivated++;
        }
      }

      res.json({ processed, deactivated });
    } catch (err) {
      logger?.error("notif_bounce_webhook_error", { err: String(err) });
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

  // Bounce webhook — unauthenticated, secret-validated
  router.post("/notifications/webhooks/email-bounce",     emailBounceWebhookHandler);

  return router;
}
