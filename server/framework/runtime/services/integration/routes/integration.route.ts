/**
 * Integration Hub Routes
 *
 * Endpoint registry (event.endpoint):
 *   GET    /integration/endpoints              — list endpoints
 *   POST   /integration/endpoints              — register endpoint
 *   PATCH  /integration/endpoints/:id          — update config/health
 *   POST   /integration/endpoints/:id/deactivate — soft-deactivate (no hard delete)
 *
 * Outbox operations (event.outbox — partitioned, always date-bounded):
 *   GET    /integration/outbox                 — list events (topic, status, date filter)
 *   GET    /integration/outbox/:id             — event detail + last_error
 *   POST   /integration/outbox/:id/retry       — requeue failed/dead_letter event
 *   POST   /integration/outbox/:id/discard     — mark dead_letter, do NOT hard-delete
 *
 * Provider config (control.notification_provider):
 *   GET    /integration/providers              — list providers (config jsonb omitted)
 *   POST   /integration/providers              — register provider
 *   PATCH  /integration/providers/:id          — update config/rate_limit/health
 *   POST   /integration/providers/:id/disable  — is_enabled=false
 *
 * Delivery monitoring (event.notification_delivery — read-only ledger):
 *   GET    /integration/deliveries             — list deliveries (always date-bounded)
 *   GET    /integration/deliveries/:id         — full detail + channel_detail
 *
 * Webhook subscriptions (event.webhook_subscription):
 *   GET    /integration/webhooks               — list subscriptions
 *   POST   /integration/webhooks               — register subscription
 *   PATCH  /integration/webhooks/:id           — update topics/config
 *   POST   /integration/webhooks/:id/disable   — is_active=false
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  parsePagination,
} from "../../shared/route-helpers.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface IntegrationRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 30;

function parseDateBounds(query: Record<string, unknown>): { from: Date; to: Date } {
  const now = new Date();
  const to   = query["to"]   ? new Date(String(query["to"]))   : now;
  const from = query["from"] ? new Date(String(query["from"])) : new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);
  const maxFrom = new Date(to.getTime() - MAX_WINDOW_DAYS * 86_400_000);
  return { from: from < maxFrom ? maxFrom : from, to };
}

function toEndpoint(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], service: r["service"],
    code: r["code"], name: r["name"], description: r["description"] ?? null,
    path: r["path"], method: r["method"],
    config: r["config"], health: r["health"],
    lastCheckedAt: r["last_checked_at"] ?? null,
    isActive: r["is_active"], createdAt: r["created_at"], updatedAt: r["updated_at"] ?? null,
  };
}

function toOutboxEvent(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], topic: r["topic"],
    eventType: r["event_type"] ?? null, eventKey: r["event_key"] ?? null,
    entityType: r["entity_type"] ?? null, entityId: r["entity_id"] ?? null,
    aggregateId: r["aggregate_id"] ?? null, aggregateType: r["aggregate_type"] ?? null,
    actorId: r["actor_id"] ?? null, source: r["source"] ?? null,
    correlationId: r["correlation_id"] ?? null,
    status: r["status"], attempts: r["attempts"], maxAttempts: r["max_attempts"],
    availableAt: r["available_at"], lockedAt: r["locked_at"] ?? null,
    lockedBy: r["locked_by"] ?? null, lastError: r["last_error"] ?? null,
    processedAt: r["processed_at"] ?? null, createdAt: r["created_at"],
  };
}

function toProvider(r: Record<string, unknown>) {
  // Omit config jsonb from list responses — may contain sensitive adapter keys
  return {
    id: r["id"], channel: r["channel"], code: r["code"], name: r["name"],
    adapterKey: r["adapter_key"], priority: r["priority"],
    isEnabled: r["is_enabled"], health: r["health"],
    rateLimit: r["rate_limit"] ?? null,
    createdAt: r["created_at"], updatedAt: r["updated_at"] ?? null,
  };
}

function toDelivery(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], messageId: r["message_id"],
    notificationId: r["notification_id"] ?? null,
    recipientId: r["recipient_id"] ?? null, recipientAddr: r["recipient_addr"],
    channel: r["channel"], providerId: r["provider_id"] ?? null,
    providerCode: r["provider_code"] ?? null,
    status: r["status"], attemptCount: r["attempt_count"], maxAttempts: r["max_attempts"],
    lastError: r["last_error"] ?? null, errorCategory: r["error_category"] ?? null,
    externalId: r["external_id"] ?? null,
    sentAt: r["sent_at"] ?? null, deliveredAt: r["delivered_at"] ?? null,
    readAt: r["read_at"] ?? null, bouncedAt: r["bounced_at"] ?? null,
    nextRetryAt: r["next_retry_at"] ?? null,
    channelDetail: r["channel_detail"] ?? null,
    createdAt: r["created_at"],
  };
}

function toWebhook(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], targetUrl: r["target_url"],
    topics: r["topics"], description: r["description"] ?? null,
    maxRetries: r["max_retries"], timeoutMs: r["timeout_ms"],
    lastDeliveryAt: r["last_delivery_at"] ?? null,
    lastDeliveryStatus: r["last_delivery_status"] ?? null,
    failureCount: r["failure_count"], isActive: r["is_active"],
    createdAt: r["created_at"], updatedAt: r["updated_at"] ?? null,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createIntegrationRoutes(router: Router, deps: IntegrationRouteDeps): void {
  const { db, auth, logger } = deps;

  async function resolveCtx(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;
    const { xOrg, xRealm } = extractOrgHeaders(req);
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return null; }
    const sub = claims["sub"] as string ?? "";
    const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId) ?? sub;
    return { tenantId, principalId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINT REGISTRY
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/integration/endpoints", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const q = req.query as Record<string, unknown>;

      let query = db
        .selectFrom("event.endpoint as e" as never)
        .selectAll("e" as never)
        .where("e.tenant_id" as never, "=", c.tenantId as never)
        .orderBy("e.service" as never).orderBy("e.name" as never)
        .limit(limit + 1).offset(offset);

      if (q["service"])            query = query.where("e.service" as never,   "=", q["service"] as never);
      if (q["isActive"] !== undefined) query = query.where("e.is_active" as never, "=", (q["isActive"] !== "false") as never);

      const rows = await query.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toEndpoint), hasMore });
    } catch (err) { logger?.error("integration_list_endpoints_error", { err: String(err) }); next(err); }
  });

  router.post("/integration/endpoints", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const body = req.body as Record<string, unknown>;
      if (!body["service"] || !body["code"] || !body["name"] || !body["path"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "service, code, name, path required" }); return;
      }
      const row = await db
        .insertInto("event.endpoint" as never)
        .values({
          tenant_id: c.tenantId, service: body["service"], code: body["code"],
          name: body["name"], description: body["description"] ?? null,
          path: body["path"], method: body["method"] ?? "POST",
          config: body["config"] ? JSON.stringify(body["config"]) : "{}",
          created_by: c.principalId,
        } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toEndpoint(row) });
    } catch (err) { logger?.error("integration_create_endpoint_error", { err: String(err) }); next(err); }
  });

  router.patch("/integration/endpoints/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: c.principalId };
      if (body["name"] !== undefined)        updates["name"] = body["name"];
      if (body["description"] !== undefined) updates["description"] = body["description"];
      if (body["path"] !== undefined)        updates["path"] = body["path"];
      if (body["method"] !== undefined)      updates["method"] = body["method"];
      if (body["config"] !== undefined)      updates["config"] = JSON.stringify(body["config"]);
      if (body["health"] !== undefined)      updates["health"] = body["health"];
      if (body["isActive"] !== undefined)    updates["is_active"] = body["isActive"];
      const row = await db
        .updateTable("event.endpoint" as never)
        .set(updates as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toEndpoint(row) });
    } catch (err) { logger?.error("integration_update_endpoint_error", { err: String(err) }); next(err); }
  });

  router.post("/integration/endpoints/:id/deactivate", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .updateTable("event.endpoint" as never)
        .set({ is_active: false, updated_at: new Date(), updated_by: c.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toEndpoint(row) });
    } catch (err) { logger?.error("integration_deactivate_endpoint_error", { err: String(err) }); next(err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // OUTBOX OPERATIONS
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/integration/outbox", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const { from, to } = parseDateBounds(req.query as Record<string, unknown>);
      const q = req.query as Record<string, unknown>;

      let query = db
        .selectFrom("event.outbox as o" as never)
        .selectAll("o" as never)
        .where("o.tenant_id" as never, "=", c.tenantId as never)
        .where("o.created_at" as never, ">=", from as never)
        .where("o.created_at" as never, "<", to as never)
        .orderBy("o.created_at" as never, "desc")
        .limit(limit + 1).offset(offset);

      if (q["topic"])  query = query.where("o.topic" as never,  "=", q["topic"] as never);
      if (q["status"]) query = query.where("o.status" as never, "=", q["status"] as never);

      const rows = await query.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toOutboxEvent), hasMore });
    } catch (err) { logger?.error("integration_list_outbox_error", { err: String(err) }); next(err); }
  });

  router.get("/integration/outbox/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .selectFrom("event.outbox as o" as never)
        .selectAll("o" as never)
        .where("o.id" as never, "=", id as never)
        .where("o.tenant_id" as never, "=", c.tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: { ...toOutboxEvent(row), payload: row["payload"] } });
    } catch (err) { logger?.error("integration_get_outbox_error", { err: String(err) }); next(err); }
  });

  // Retry — requeue a failed or dead_letter event
  router.post("/integration/outbox/:id/retry", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .updateTable("event.outbox" as never)
        .set({ status: "pending", attempts: 0, available_at: new Date(), locked_at: null, locked_by: null, last_error: null } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .where("status" as never, "in", ["failed", "dead_letter"] as never)
        .returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE", message: "Only failed or dead_letter events can be retried" }); return; }
      res.json({ ok: true, data: toOutboxEvent(row) });
    } catch (err) { logger?.error("integration_retry_outbox_error", { err: String(err) }); next(err); }
  });

  // Discard — mark as dead_letter with reason. No physical DELETE.
  router.post("/integration/outbox/:id/discard", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .updateTable("event.outbox" as never)
        .set({ status: "dead_letter", last_error: "manually_discarded", locked_at: null, locked_by: null } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .where("status" as never, "in", ["failed", "pending"] as never)
        .returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE", message: "Only failed or pending events can be discarded" }); return; }
      res.json({ ok: true });
    } catch (err) { logger?.error("integration_discard_outbox_error", { err: String(err) }); next(err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PROVIDER CONFIG (control.notification_provider — no tenant_id column,
  // system-scoped global registry, no per-tenant filtering)
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/integration/providers", async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      // config omitted — may contain encrypted API keys
      const rows = await db
        .selectFrom("control.notification_provider as np" as never)
        .select(["np.id", "np.channel", "np.code", "np.name", "np.adapter_key", "np.priority", "np.is_enabled", "np.health", "np.rate_limit", "np.created_at", "np.updated_at"] as never[])
        .where("np.is_enabled" as never, "=", true as never)
        .orderBy("np.priority" as never).orderBy("np.channel" as never)
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows.map(toProvider) });
    } catch (err) { logger?.error("integration_list_providers_error", { err: String(err) }); next(err); }
  });

  router.post("/integration/providers", async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const body = req.body as Record<string, unknown>;
      if (!body["channel"] || !body["code"] || !body["name"] || !body["adapterKey"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "channel, code, name, adapterKey required" }); return;
      }
      const row = await db
        .insertInto("control.notification_provider" as never)
        .values({
          channel: body["channel"], code: body["code"], name: body["name"],
          adapter_key: body["adapterKey"], priority: body["priority"] ?? 1,
          config: body["config"] ? JSON.stringify(body["config"]) : "{}",
          rate_limit: body["rateLimit"] ? JSON.stringify(body["rateLimit"]) : null,
          created_by: (claims["sub"] as string) ?? "system",
        } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toProvider(row) });
    } catch (err) { logger?.error("integration_create_provider_error", { err: String(err) }); next(err); }
  });

  router.patch("/integration/providers/:id", async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: claims["sub"] };
      if (body["config"] !== undefined)    updates["config"] = JSON.stringify(body["config"]);
      if (body["rateLimit"] !== undefined) updates["rate_limit"] = JSON.stringify(body["rateLimit"]);
      if (body["health"] !== undefined)    updates["health"] = body["health"];
      if (body["priority"] !== undefined)  updates["priority"] = body["priority"];
      if (body["isEnabled"] !== undefined) updates["is_enabled"] = body["isEnabled"];
      const row = await db
        .updateTable("control.notification_provider" as never)
        .set(updates as never)
        .where("id" as never, "=", id as never)
        .returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toProvider(row) });
    } catch (err) { logger?.error("integration_update_provider_error", { err: String(err) }); next(err); }
  });

  router.post("/integration/providers/:id/disable", async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .updateTable("control.notification_provider" as never)
        .set({ is_enabled: false, updated_at: new Date(), updated_by: claims["sub"] } as never)
        .where("id" as never, "=", id as never)
        .returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toProvider(row) });
    } catch (err) { logger?.error("integration_disable_provider_error", { err: String(err) }); next(err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELIVERY MONITORING (read-only)
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/integration/deliveries", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const { from, to } = parseDateBounds(req.query as Record<string, unknown>);
      const q = req.query as Record<string, unknown>;

      let query = db
        .selectFrom("event.notification_delivery as nd" as never)
        .select([
          "nd.id", "nd.tenant_id", "nd.message_id", "nd.notification_id",
          "nd.recipient_id", "nd.recipient_addr", "nd.channel", "nd.provider_id",
          "nd.provider_code", "nd.status", "nd.attempt_count", "nd.max_attempts",
          "nd.last_error", "nd.error_category", "nd.external_id",
          "nd.sent_at", "nd.delivered_at", "nd.read_at", "nd.bounced_at",
          "nd.next_retry_at", "nd.created_at",
        ] as never[])
        .where("nd.tenant_id" as never, "=", c.tenantId as never)
        .where("nd.created_at" as never, ">=", from as never)
        .where("nd.created_at" as never, "<", to as never)
        .orderBy("nd.created_at" as never, "desc")
        .limit(limit + 1).offset(offset);

      if (q["channel"])    query = query.where("nd.channel" as never,     "=", q["channel"] as never);
      if (q["status"])     query = query.where("nd.status" as never,      "=", q["status"] as never);
      if (q["providerId"] && isUuid(String(q["providerId"])))
                           query = query.where("nd.provider_id" as never, "=", q["providerId"] as never);

      const rows = await query.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toDelivery), hasMore });
    } catch (err) { logger?.error("integration_list_deliveries_error", { err: String(err) }); next(err); }
  });

  router.get("/integration/deliveries/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .selectFrom("event.notification_delivery as nd" as never)
        .selectAll("nd" as never)
        .where("nd.id" as never, "=", id as never)
        .where("nd.tenant_id" as never, "=", c.tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: { ...toDelivery(row), channelDetail: row["channel_detail"] ?? null, metadata: row["metadata"] ?? null } });
    } catch (err) { logger?.error("integration_get_delivery_error", { err: String(err) }); next(err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WEBHOOK SUBSCRIPTIONS (event.webhook_subscription)
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/integration/webhooks", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const isActive = req.query["isActive"] !== "false";
      const rows = await db
        .selectFrom("event.webhook_subscription as ws" as never)
        // signing_secret omitted from list response
        .select(["ws.id", "ws.tenant_id", "ws.target_url", "ws.topics", "ws.description", "ws.max_retries", "ws.timeout_ms", "ws.last_delivery_at", "ws.last_delivery_status", "ws.failure_count", "ws.is_active", "ws.created_at", "ws.updated_at"] as never[])
        .where("ws.tenant_id" as never, "=", c.tenantId as never)
        .where("ws.is_active" as never, "=", isActive as never)
        .orderBy("ws.created_at" as never, "desc")
        .limit(limit + 1).offset(offset)
        .execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toWebhook), hasMore });
    } catch (err) { logger?.error("integration_list_webhooks_error", { err: String(err) }); next(err); }
  });

  router.post("/integration/webhooks", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const body = req.body as Record<string, unknown>;
      if (!body["targetUrl"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "targetUrl required" }); return;
      }
      const row = await db
        .insertInto("event.webhook_subscription" as never)
        .values({
          tenant_id: c.tenantId, target_url: body["targetUrl"],
          signing_secret: body["signingSecret"] ?? null,
          topics: body["topics"] ?? [],
          description: body["description"] ?? null,
          max_retries: body["maxRetries"] ?? 3,
          timeout_ms: body["timeoutMs"] ?? 10000,
          created_by: c.principalId,
        } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toWebhook(row) });
    } catch (err) { logger?.error("integration_create_webhook_error", { err: String(err) }); next(err); }
  });

  router.patch("/integration/webhooks/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: c.principalId };
      if (body["targetUrl"] !== undefined)    updates["target_url"] = body["targetUrl"];
      if (body["signingSecret"] !== undefined) updates["signing_secret"] = body["signingSecret"];
      if (body["topics"] !== undefined)       updates["topics"] = body["topics"];
      if (body["description"] !== undefined)  updates["description"] = body["description"];
      if (body["maxRetries"] !== undefined)   updates["max_retries"] = body["maxRetries"];
      if (body["timeoutMs"] !== undefined)    updates["timeout_ms"] = body["timeoutMs"];
      const row = await db
        .updateTable("event.webhook_subscription" as never)
        .set(updates as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toWebhook(row) });
    } catch (err) { logger?.error("integration_update_webhook_error", { err: String(err) }); next(err); }
  });

  router.post("/integration/webhooks/:id/disable", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .updateTable("event.webhook_subscription" as never)
        .set({ is_active: false, updated_at: new Date(), updated_by: c.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toWebhook(row) });
    } catch (err) { logger?.error("integration_disable_webhook_error", { err: String(err) }); next(err); }
  });
}
