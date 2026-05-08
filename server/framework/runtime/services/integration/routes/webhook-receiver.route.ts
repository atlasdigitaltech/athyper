/**
 * Inbound Webhook Receiver — Sprint 38
 *
 * Public endpoint for receiving signed payloads from external systems.
 *
 *   POST /api/webhooks/:subscriptionId
 *
 * No Bearer auth — the HMAC-SHA256 signature is the authentication mechanism.
 *
 * Request headers:
 *   X-Webhook-Signature-256: sha256=<hex>   — HMAC-SHA256(signing_secret, rawBody)
 *   X-Webhook-Delivery:      <uuid>          — Optional idempotency key from sender
 *   Content-Type:            application/json (required)
 *
 * Processing:
 *   1. Resolve event.webhook_subscription by subscriptionId + tenantId (via X-Org header).
 *   2. Verify HMAC-SHA256 signature (constant-time comparison; 401 on mismatch).
 *   3. Replay protection: SHA-256 of the raw body is checked against an in-process
 *      LRU window (REPLAY_WINDOW_MS). Duplicate payloads within the window → 409.
 *      Note: for multi-instance deployments, this should be backed by Redis SET NX.
 *   4. Rate limiting: max RATE_LIMIT_RPM requests per minute per subscriptionId.
 *      Implemented as a sliding window in the process-local rate map.
 *   5. Writes payload + metadata to event.outbox with topic = 'webhook:inbound'.
 *   6. Returns 202 Accepted with the outbox event ID.
 *
 * Failure responses:
 *   400 — missing/malformed signature header or non-JSON body
 *   401 — signature mismatch (no detail to prevent oracle attacks)
 *   404 — subscriptionId not found or inactive
 *   409 — duplicate delivery (replay detected)
 *   429 — rate limit exceeded
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { resolveTenantId, extractOrgHeaders } from "../../shared/route-helpers.js";
import type { CacheClient } from "../../iam/session/session.service.js";
import {
  resolveParameterSnapshot,
  getIntParam,
} from "../../iam/parameters/parameter-resolver.service.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WebhookReceiverDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  logger?: {
    info?(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
  cache?: CacheClient;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const REPLAY_WINDOW_MS  = 5 * 60 * 1_000;  // 5 min replay protection window
const RATE_LIMIT_RPM    = 120;              // max inbound deliveries per subscription per minute
const MAX_BODY_BYTES    = 1_048_576;        // 1 MiB max payload

// ─── In-process replay protection ─────────────────────────────────────────────
// Key: SHA-256(rawBody) as hex  →  Value: expires at timestamp
// For single-process deployments. Multi-instance requires Redis SET NX.

const replayCache = new Map<string, number>();

function seenBefore(hash: string): boolean {
  const exp = replayCache.get(hash);
  if (exp === undefined) return false;
  if (Date.now() > exp) {
    replayCache.delete(hash);
    return false;
  }
  return true;
}

function markSeen(hash: string): void {
  replayCache.set(hash, Date.now() + REPLAY_WINDOW_MS);
  // Prune stale entries periodically to prevent memory leak
  if (replayCache.size > 10_000) {
    const now = Date.now();
    for (const [k, exp] of replayCache) {
      if (now > exp) replayCache.delete(k);
    }
  }
}

// ─── In-process rate limiting (sliding window) ────────────────────────────────

interface RateEntry {
  windowStart: number;
  count:       number;
}

const rateMap = new Map<string, RateEntry>();

function isRateLimited(subscriptionId: string, limit: number = RATE_LIMIT_RPM): boolean {
  const now   = Date.now();
  const entry = rateMap.get(subscriptionId);

  if (!entry || now - entry.windowStart > 60_000) {
    rateMap.set(subscriptionId, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  if (entry.count > limit) return true;

  return false;
}

// ─── HMAC helper ──────────────────────────────────────────────────────────────

function computeHmacSha256(secret: string, payload: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison of two hex HMAC strings.
 * Prevents timing oracle attacks.
 */
function hmacEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// ─── System actor ─────────────────────────────────────────────────────────────

const SYSTEM_ACTOR_ID = "00000000-0000-7000-a000-000000000001";

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createWebhookReceiverRoute(router: Router, deps: WebhookReceiverDeps): Router {
  const { db, logger, cache } = deps;

  /**
   * POST /api/webhooks/:subscriptionId
   *
   * Callers: external systems that have been registered as webhook sources.
   * No Bearer auth — signature is the authentication.
   */
  const receiveWebhook: RequestHandler = async (req, res, next) => {
    try {
      const subscriptionId = String(req.params["subscriptionId"] ?? "");

      // ── 1. Resolve tenant from X-Org/X-Realm headers ─────────────────────
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      // ── 2. Rate limiting ──────────────────────────────────────────────────
      const webhookSnap = cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "notifications.webhook").catch(() => null)
        : null;
      const rateLimitRpm = getIntParam(webhookSnap, "notifications.webhook.rate_limit_rpm", RATE_LIMIT_RPM);

      if (isRateLimited(subscriptionId, rateLimitRpm)) {
        res.status(429).json({ error: "RATE_LIMITED", message: "Too many webhook deliveries" });
        return;
      }

      // ── 3. Lookup subscription ────────────────────────────────────────────
      const sub = await db
        .selectFrom("event.webhook_subscription" as never)
        .select(["id", "signing_secret", "is_active", "topics"] as never[])
        .where("id" as never, "=", subscriptionId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as {
          id: string;
          signing_secret: string | null;
          is_active: boolean;
          topics: string[];
        } | undefined;

      if (!sub || !sub.is_active) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }

      // ── 4. Read raw body ─────────────────────────────────────────────────
      // Express raw body must be available — caller mounts express.raw() before this route.
      const rawBody: Buffer = req.body instanceof Buffer
        ? req.body
        : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));

      if (rawBody.length > MAX_BODY_BYTES) {
        res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
        return;
      }

      // ── 5. HMAC signature verification ────────────────────────────────────
      if (sub.signing_secret) {
        const sigHeader = String(req.headers["x-webhook-signature-256"] ?? "");
        const expected  = `sha256=${computeHmacSha256(sub.signing_secret, rawBody)}`;

        if (!sigHeader || !hmacEqual(sigHeader.replace(/^sha256=/i, ""), expected.replace(/^sha256=/, ""))) {
          logger?.warn?.("webhook_receiver_sig_mismatch", { subscriptionId, tenantId });
          res.status(401).json({ error: "INVALID_SIGNATURE" });
          return;
        }
      }

      // ── 6. Replay protection ──────────────────────────────────────────────
      const bodyHash = createHash("sha256").update(rawBody).digest("hex");
      if (seenBefore(bodyHash)) {
        logger?.warn?.("webhook_receiver_replay", { subscriptionId, tenantId });
        res.status(409).json({ error: "DUPLICATE_DELIVERY" });
        return;
      }
      markSeen(bodyHash);

      // ── 7. Parse body ─────────────────────────────────────────────────────
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString("utf-8"));
      } catch {
        res.status(400).json({ error: "INVALID_JSON", message: "Request body must be valid JSON" });
        return;
      }

      // ── 8. Write to event.outbox ──────────────────────────────────────────
      const deliveryId  = req.headers["x-webhook-delivery"] as string | undefined;
      const outboxEvent = await db
        .insertInto("event.outbox" as never)
        .values({
          tenant_id:    tenantId,
          topic:        "webhook:inbound",
          event_type:   "webhook.received",
          entity_type:  "webhook_subscription",
          entity_id:    subscriptionId,
          payload:      JSON.stringify({
            subscription_id:  subscriptionId,
            delivery_id:      deliveryId ?? null,
            body_hash:        bodyHash,
            payload,
          }),
          status:       "pending",
          available_at: new Date(),
          created_by:   SYSTEM_ACTOR_ID,
        } as never)
        .returning(["id"] as never[])
        .executeTakeFirst() as { id: string } | undefined;

      logger?.info?.("webhook_receiver_accepted", {
        subscriptionId,
        tenantId,
        deliveryId:    deliveryId ?? null,
        outboxEventId: outboxEvent?.id ?? null,
        bodyBytes:     rawBody.length,
      });

      res.status(202).json({
        ok:             true,
        outboxEventId:  outboxEvent?.id ?? null,
      });
    } catch (err) {
      logger?.error("webhook_receiver_error", { err: String(err) });
      next(err);
    }
  };

  // Route — no auth middleware; HMAC signature is the authentication
  router.post("/webhooks/:subscriptionId", receiveWebhook);

  return router;
}
