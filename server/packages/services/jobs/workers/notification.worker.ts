/**
 * Notification Worker
 *
 * Queue: jobs:notifications
 *
 * Two job names:
 *
 *   "sweep"  — runs every NOTIFICATION_SWEEP_MS (default 5 min).
 *              Finds event.notification_message WHERE status='pending', marks
 *              them 'planning', and enqueues individual "send" jobs.
 *
 *   "send"   — dispatches a single notification message.
 *              Resolves recipients, creates event.notification_delivery rows,
 *              and attempts delivery per channel.
 *
 * Delivery implementations (email, push, webhook) are plugged in via
 * NotificationChannelHandler. Unregistered channels are logged and skipped
 * so they do not block the queue.
 *
 * Concurrency: 5 (I/O-bound — external provider calls)
 */

import { Worker, Queue } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import { randomUUID, createHash } from "node:crypto";
import {
  QUEUE_NAME,
  JOB_NAME,
  SYSTEM_ACTOR_ID,
  type SendNotificationJobData,
  type SweepJobData,
  type DigestFlushJobData,
  type ProviderHealthJobData,
  type JobLogger,
} from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;
// Alias used in dedup helpers (matches DB above)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Channel handler interface ────────────────────────────────────────────────

export interface NotificationChannelHandler {
  /**
   * Dispatch a single notification delivery attempt.
   * Should throw on failure (worker will retry the "send" job).
   *
   * tenantId and recipientId are provided so channel-specific adapters
   * (e.g. push) can perform per-tenant DB lookups (device registries, etc.)
   * without embedding tenantId in recipientAddr.
   */
  send(opts: {
    channel:       string;
    recipientAddr: string;
    templateKey:   string;
    subject:       string | null;
    payload:       Record<string, unknown>;
    /** Tenant UUID — required by push adapter for subscription lookup */
    tenantId?:     string;
    /** Principal UUID — preferred over recipientAddr for push lookup */
    recipientId?:  string;
    /** Override the sender FROM address (e.g. per-plane email routing). */
    fromOverride?: string;
  }): Promise<{ externalId?: string }>;

  /**
   * Optional health check for this channel adapter.
   * Receives the provider row so adapters can use provider-specific config.
   * Returns "healthy", "degraded", or "down". Defaults to "healthy" if absent.
   */
  healthCheck?(provider?: Record<string, unknown>): Promise<"healthy" | "degraded" | "down">;
}

interface PendingMessage {
  id:               string;
  tenant_id:        string;
  event_id:         string;
  template_key:     string;
  template_version: number;
  subject:          string | null;
  payload:          Record<string, unknown>;
  channels:         string[] | null;
  /** FK to control.notification_routing_rule — present when created by routing rule evaluation */
  rule_id:          string | null;
  event_code:       string;
  entity_type:      string | null;
  entity_id:        string | null;
}

// ─── Semantic dedup ───────────────────────────────────────────────────────────
//
// Prevents delivering semantically duplicate notifications to the same recipient
// within a routing rule's dedup_window_ms window, or DEFAULT_DEDUP_WINDOW_MS
// for direct/rule-less notification messages.
//
// Fingerprint: sha256 of (scope|event_code|entity_ref|recipient_id|channel).
// Stored in event.notification_delivery.idempotency_key and claimed in
// event.notification_delivery_claim before provider dispatch.
//
// Implementation note (user correction applied): fingerprint is persisted to DB,
// not just Redis. Redis is an optional fast-path cache only.

/** Default dedup window (ms) when routing rule is not available: 5 min */
const DEFAULT_DEDUP_WINDOW_MS = 300_000;

/** In-memory dedup cache: fingerprint → expiresAt (ms). Process-local fast path. */
const dedupCache = new Map<string, number>();

function buildFingerprint(
  scopeId:     string,
  eventCode:   string,
  entityType:  string | null,
  entityId:    string | null,
  recipientId: string,
  channel:     string,
): string {
  const raw = [scopeId, eventCode, entityType ?? "", entityId ?? "", recipientId, channel].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function buildDeliveryFingerprint(msg: PendingMessage, recipientId: string, channel: string): string {
  const scopeId = msg.rule_id ? `rule:${msg.rule_id}` : `message:${msg.event_id || msg.id}`;
  return buildFingerprint(
    scopeId,
    msg.event_code,
    msg.entity_type,
    msg.entity_id,
    recipientId,
    channel,
  );
}

async function isDuplicate(
  db:          AnyDb,
  tenantId:    string,
  fingerprint: string,
  windowMs:    number,
): Promise<boolean> {
  // 1. Fast path: in-process cache (prune expired entries opportunistically)
  const now = Date.now();
  const cached = dedupCache.get(fingerprint);
  if (cached !== undefined && cached > now) return true;
  if (cached !== undefined) dedupCache.delete(fingerprint);

  // 2. DB check: look for a recent delivery with this idempotency_key
  const windowSec = Math.ceil(windowMs / 1000);
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM   event.notification_delivery
      WHERE  tenant_id        = ${tenantId}::uuid
        AND  idempotency_key  = ${fingerprint}
        AND  created_at       > now() - (${windowSec} || ' seconds')::interval
        AND  status NOT IN ('failed', 'bounced', 'cancelled')
    ) AS exists
  `.execute(db);

  return result.rows[0]?.exists ?? false;
}

async function tryClaimDelivery(
  db:          AnyDb,
  tenantId:    string,
  fingerprint: string,
  windowMs:    number,
  messageId:   string,
  recipientId: string,
  channel:     string,
): Promise<boolean> {
  const result = await sql<{ id: string }>`
    INSERT INTO event.notification_delivery_claim
      (tenant_id, idempotency_key, message_id, recipient_id, channel,
       claimed_at, expires_at, created_by)
    VALUES
      (${tenantId}::uuid, ${fingerprint}, ${messageId}::uuid, ${recipientId}::uuid, ${channel},
       now(), now() + (${Math.max(1, Math.ceil(windowMs))}::bigint * interval '1 millisecond'),
       ${SYSTEM_ACTOR_ID}::uuid)
    ON CONFLICT (tenant_id, idempotency_key)
      DO UPDATE SET
        message_id   = EXCLUDED.message_id,
        recipient_id = EXCLUDED.recipient_id,
        channel      = EXCLUDED.channel,
        claimed_at   = now(),
        completed_at = NULL,
        expires_at   = EXCLUDED.expires_at,
        updated_at   = now(),
        updated_by   = ${SYSTEM_ACTOR_ID}::uuid
      WHERE event.notification_delivery_claim.expires_at < now()
    RETURNING id
  `.execute(db);

  return result.rows.length > 0;
}

async function completeDeliveryClaim(db: AnyDb, tenantId: string, fingerprint: string): Promise<void> {
  await sql`
    UPDATE event.notification_delivery_claim
    SET    completed_at = now(),
           updated_at   = now(),
           updated_by   = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  tenant_id       = ${tenantId}::uuid
      AND  idempotency_key = ${fingerprint}
  `.execute(db);
}

async function releaseDeliveryClaim(db: AnyDb, tenantId: string, fingerprint: string): Promise<void> {
  await sql`
    DELETE FROM event.notification_delivery_claim
    WHERE tenant_id       = ${tenantId}::uuid
      AND idempotency_key = ${fingerprint}
      AND completed_at IS NULL
  `.execute(db);
}

async function getRuleDedupWindowMs(
  db:     AnyDb,
  ruleId: string,
): Promise<number> {
  try {
    const result = await sql<{ dedup_window_ms: number }>`
      SELECT dedup_window_ms FROM control.notification_routing_rule
      WHERE  id = ${ruleId}::uuid LIMIT 1
    `.execute(db);
    return result.rows[0]?.dedup_window_ms ?? DEFAULT_DEDUP_WINDOW_MS;
  } catch {
    return DEFAULT_DEDUP_WINDOW_MS;
  }
}

// ─── Sweep ────────────────────────────────────────────────────────────────────

async function sweep(
  db: DB,
  queue: Queue<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>,
  logger?: JobLogger,
): Promise<void> {
  const BATCH = 100;

  // Claim: mark 'planning' so concurrent sweeps skip these rows
  const result = await sql<PendingMessage>`
    UPDATE event.notification_message
    SET    status = 'planning', updated_at = now(), updated_by = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id IN (
      SELECT id
      FROM   event.notification_message
      WHERE  status = 'pending'
        AND (expires_at IS NULL OR expires_at > now())
      ORDER  BY priority DESC, created_at ASC
      LIMIT  ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tenant_id, event_id, template_key, template_version, subject, payload, channels,
              rule_id, event_code, entity_type, entity_id
  `.execute(db);

  const msgs = result.rows;
  if (msgs.length === 0) return;

  await queue.addBulk(
    msgs.map((m) => ({
      name: JOB_NAME.SEND,
      data: { messageId: m.id, tenantId: m.tenant_id } satisfies SendNotificationJobData,
      opts: {
        jobId:            `notif-${m.id}`,
        attempts:         3,
        backoff:          { type: "exponential", delay: 60_000 },
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 200 },
      },
    })),
  );

  logger?.info("notification_sweep", { claimed: msgs.length });
}

// ─── Send ─────────────────────────────────────────────────────────────────────

async function send(
  db: DB,
  queue: Queue<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>,
  data: SendNotificationJobData,
  channelHandlers: Map<string, NotificationChannelHandler>,
  logger?: JobLogger,
  emailFromMap?: Map<string, string>,
  attemptsMade: number = 0,
  maxAttempts: number = 3,
): Promise<void> {
  const { messageId, tenantId } = data;

  // Load message — must be in 'planning' or 'delivering'
  const msgResult = await sql<PendingMessage>`
    SELECT id, tenant_id, event_id, template_key, template_version, subject, payload, channels,
           rule_id, event_code, entity_type, entity_id
    FROM   event.notification_message
    WHERE  id = ${messageId}::uuid AND tenant_id = ${tenantId}::uuid
      AND  status IN ('planning', 'delivering')
  `.execute(db);

  const msg = msgResult.rows[0];
  if (!msg) {
    logger?.warn("notification_send_skip", { messageId, reason: "not_found_or_wrong_status" });
    return;
  }

  const channels = msg.channels ?? ["in_app"];

  // source_plane embedded in payload by callers that need per-plane email FROM routing.
  const sourcePlane = typeof (msg.payload as Record<string, unknown>)["source_plane"] === "string"
    ? (msg.payload as Record<string, unknown>)["source_plane"] as string
    : undefined;

  // Resolve recipients from payload. On retry, ensureDeliveryRows is idempotent —
  // existing rows are detected and skipped, so the dispatch loop picks them up directly.
  const recipients = await resolveRecipients(db, tenantId, msg, channels);

  // Compatibility shim: create pending delivery rows (attempt_count=0) for any
  // recipient/channel pair that doesn't already have a row for this message.
  // Uses the claim mechanism for concurrent-worker safety; skips deduped pairs.
  await ensureDeliveryRows(db, tenantId, msg, recipients, channels, maxAttempts, logger);

  const initialAgg = await aggregateDeliveryStatus(db, messageId, tenantId);

  if (initialAgg.total === 0) {
    // No delivery rows created — either no recipients resolved or all deduped
    await sql`
      UPDATE event.notification_message
      SET    status = 'completed', recipient_count = 0,
             completed_at = now(), updated_at = now(), updated_by = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id = ${messageId}::uuid
    `.execute(db);
    logger?.info("notification_no_recipients", { messageId, templateKey: msg.template_key });
    return;
  }

  // Transition → delivering (only from 'planning' — idempotent on retry)
  await sql`
    UPDATE event.notification_message
    SET    status = 'delivering', recipient_count = ${initialAgg.total}, updated_at = now(),
           updated_by = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id = ${messageId}::uuid AND status = 'planning'
  `.execute(db);

  // Load rows eligible for dispatch: pending or failed with retries remaining
  const rowsResult = await sql<DeliveryRow>`
    SELECT id, recipient_id, recipient_addr, channel, attempt_count, max_attempts, idempotency_key
    FROM   event.notification_delivery
    WHERE  message_id    = ${messageId}::uuid
      AND  tenant_id     = ${tenantId}::uuid
      AND  status        IN ('pending', 'failed')
      AND  attempt_count < max_attempts
      AND  (next_retry_at IS NULL OR next_retry_at <= now())
  `.execute(db);

  const eligibleRows = rowsResult.rows;

  if (eligibleRows.length === 0) {
    // Nothing left to dispatch — finalize from DB aggregate
    const agg = await aggregateDeliveryStatus(db, messageId, tenantId);
    if (agg.retryable > 0) {
      await scheduleNotificationRetry(queue, messageId, tenantId, agg, logger);
      return;
    }
    const finalStatus = finalNotificationMessageStatus(agg);
    await sql`
      UPDATE event.notification_message
      SET    status          = ${finalStatus},
             delivered_count = ${agg.delivered},
             failed_count    = ${agg.failed},
             completed_at    = now(),
             updated_at      = now(),
             updated_by      = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id = ${messageId}::uuid
    `.execute(db);
    logger?.info("notification_send_complete", {
      messageId, status: finalStatus, delivered: agg.delivered, failed: agg.failed,
    });
    return;
  }

  let anyFailed = false;

  for (const row of eligibleRows) {
    const handler = channelHandlers.get(row.channel);
    const fromOverride = row.channel === "email" && sourcePlane && emailFromMap
      ? emailFromMap.get(sourcePlane)
      : undefined;

    const ok = await dispatchDeliveryRow(db, tenantId, { row, msg, handler, fromOverride, logger });
    if (!ok) anyFailed = true;
  }

  // Aggregate counts from DB — single source of truth across multi-channel recipients
  const agg = await aggregateDeliveryStatus(db, messageId, tenantId);

  // Retryable rows are scheduled from the durable DB timestamp. BullMQ retries
  // remain a safety net for worker/Redis failures, not the source of truth.
  if (anyFailed && agg.retryable > 0) {
    await sql`
      UPDATE event.notification_message
      SET    delivered_count = ${agg.delivered},
             failed_count    = ${agg.failed},
             updated_at      = now(),
             updated_by      = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id = ${messageId}::uuid
    `.execute(db);
    logger?.warn("notification_send_retry", {
      messageId, attempt: attemptsMade + 1, maxAttempts,
      failed: agg.failed, retryable: agg.retryable,
    });
    await scheduleNotificationRetry(queue, messageId, tenantId, agg, logger);
    return;
  }

  const finalStatus = finalNotificationMessageStatus(agg);

  await sql`
    UPDATE event.notification_message
    SET    status          = ${finalStatus},
           delivered_count = ${agg.delivered},
           failed_count    = ${agg.failed},
           completed_at    = now(),
           updated_at      = now(),
           updated_by      = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id = ${messageId}::uuid
  `.execute(db);

  logger?.info("notification_send_complete", {
    messageId, status: finalStatus, delivered: agg.delivered, failed: agg.failed,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Recipient {
  id:         string;       // principal UUID
  loginEmail: string | null;
}

/** Row queried from event.notification_delivery for row-driven dispatch */
interface DeliveryRow {
  id:              string;
  recipient_id:    string;
  recipient_addr:  string;
  channel:         string;
  attempt_count:   number;
  max_attempts:    number;
  idempotency_key: string | null;
}

export interface DeliveryAggregate {
  delivered: number;
  failed:    number;
  pending:   number;
  retryable: number;
  total:     number;
  nextRetryAt: string | null;
}

export type DeliveryErrorCategory = "transient" | "permanent" | "rate_limit" | "auth";

export function classifyNotificationDeliveryError(err: unknown): DeliveryErrorCategory {
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const explicit = record["error_category"] ?? record["errorCategory"] ?? record["category"];
    if (explicit === "permanent" || explicit === "rate_limit" || explicit === "auth" || explicit === "transient") {
      return explicit;
    }
    const status = Number(record["status"] ?? record["statusCode"] ?? record["httpStatus"]);
    if (Number.isFinite(status)) {
      if (status === 401 || status === 403) return "auth";
      if (status === 408 || status === 409 || status === 425 || status >= 500) return "transient";
      if (status === 429) return "rate_limit";
      if (status >= 400 && status < 500) return "permanent";
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/\b(401|403|unauthori[sz]ed|forbidden)\b/i.test(message)) return "auth";
  if (/\b(429|rate limit|too many requests)\b/i.test(message)) return "rate_limit";
  if (/\b(400|404|410|422|permanent|invalid recipient|bad request)\b/i.test(message)) return "permanent";
  return "transient";
}

function retryAfterMsFromError(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const record = err as Record<string, unknown>;
  const retryAfter = record["retryAfterMs"] ?? record["retry_after_ms"];
  const value = typeof retryAfter === "number" ? retryAfter : Number(retryAfter);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function computeNotificationRetryDelayMs(
  attemptCount: number,
  category: DeliveryErrorCategory,
  retryAfterMs: number | null = null,
): number {
  if (category === "rate_limit") return retryAfterMs ?? 60 * 60_000;
  return Math.min(60_000 * 2 ** Math.max(0, attemptCount - 1), 15 * 60_000);
}

export function finalNotificationMessageStatus(agg: DeliveryAggregate): "completed" | "failed" | "partial" {
  return agg.failed === 0 ? "completed" : agg.delivered === 0 ? "failed" : "partial";
}

/**
 * Resolve notification recipients from the message payload.
 *
 * The wf outbox handler embeds `recipient_id` (single UUID) or
 * `recipient_ids` (UUID[]) in the notification_message payload.
 * Channel-specific addresses are derived later when delivery rows are created.
 */
async function resolveRecipients(
  db:          DB,
  tenantId:    string,
  msg:         PendingMessage,
  channels:    string[],
): Promise<Recipient[]> {
  const payload = (msg.payload ?? {}) as Record<string, unknown>;

  // Collect recipient UUIDs from payload conventions
  const recipientIds: string[] = [];
  if (typeof payload["recipient_id"] === "string") {
    recipientIds.push(payload["recipient_id"]);
  } else if (Array.isArray(payload["recipient_ids"])) {
    recipientIds.push(...(payload["recipient_ids"] as string[]));
  }

  if (recipientIds.length === 0) return [];

  // For in_app only: no external address lookup needed
  if (channels.every((c) => c === "in_app")) {
    return [...new Set(recipientIds)].map((id) => ({ id, loginEmail: null }));
  }

  // Look up login_email for email channel delivery
  const principals = await sql<{ id: string; login_email: string | null }>`
    SELECT id::text, login_email
    FROM   master.principal
    WHERE  tenant_id = ${tenantId}::uuid
      AND  id        = ANY(${recipientIds}::uuid[])
      AND  status    = 'active'
  `.execute(db);

  return principals.rows.map((p) => ({
    id:         p.id,
    loginEmail: p.login_email,
  }));
}

function stringPayloadValue(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function recipientAddressForChannel(
  recipient: Recipient,
  channel: string,
  payload: Record<string, unknown>,
): string | null {
  if (channel === "in_app" || channel === "push") return recipient.id;
  if (channel === "email") {
    const email = recipient.loginEmail?.trim();
    return email && email.includes("@") ? email : null;
  }
  if (channel === "webhook") {
    return stringPayloadValue(payload, ["webhook_url", "webhook_endpoint", "recipient_url"]);
  }
  if (channel === "sms" || channel === "whatsapp") {
    const phone = stringPayloadValue(payload, ["recipient_phone", "phone_number", "phone", "recipient_addr"]);
    return phone?.startsWith("+") ? phone : null;
  }
  return null;
}

/**
 * Compatibility shim: create pending delivery rows (attempt_count=0) for each
 * (recipient, channel) pair that does not already have a row for this message.
 *
 * Idempotent — on BullMQ retry, existing rows are found and skipped; the
 * dispatch loop picks up the failed-but-retryable rows directly.
 * Uses the claim mechanism to serialize concurrent workers.
 */
async function ensureDeliveryRows(
  db:          DB,
  tenantId:    string,
  msg:         PendingMessage,
  recipients:  Recipient[],
  channels:    string[],
  maxAttempts: number,
  logger?:     JobLogger,
): Promise<void> {
  const payload = (msg.payload ?? {}) as Record<string, unknown>;

  for (const recipient of recipients) {
    for (const channel of channels) {
      const recipientAddr = recipientAddressForChannel(recipient, channel, payload);
      if (!recipientAddr) {
        logger?.warn("notification_channel_address_missing", {
          messageId: msg.id, recipientId: recipient.id, channel,
        });
        continue;
      }

      // Skip if a non-cancelled row already exists (covers retries — the failed
      // row from the previous attempt is reused rather than duplicated)
      const existing = await sql<{ id: string }>`
        SELECT id FROM event.notification_delivery
        WHERE  tenant_id    = ${tenantId}::uuid
          AND  message_id   = ${msg.id}::uuid
          AND  recipient_id = ${recipient.id}::uuid
          AND  channel      = ${channel}
          AND  status       NOT IN ('cancelled')
        LIMIT 1
      `.execute(db);

      if (existing.rows.length > 0) continue;

      const fingerprint = buildDeliveryFingerprint(msg, recipient.id, channel);
      const windowMs = msg.rule_id
        ? await getRuleDedupWindowMs(db, msg.rule_id)
        : DEFAULT_DEDUP_WINDOW_MS;

      // Dedup: skip if already delivered for this event/recipient/channel in the window
      const dup = await isDuplicate(db, tenantId, fingerprint, windowMs);
      if (dup) {
        logger?.info("notification_dedup_skip", {
          messageId: msg.id, channel, recipientId: recipient.id,
          ruleId: msg.rule_id, eventCode: msg.event_code,
        });
        continue;
      }

      // Claim: only one concurrent worker proceeds past this point per fingerprint
      const claimed = await tryClaimDelivery(
        db, tenantId, fingerprint, windowMs, msg.id, recipient.id, channel,
      );
      if (!claimed) {
        logger?.info("notification_dedup_claim_skip", {
          messageId: msg.id, channel, recipientId: recipient.id,
        });
        continue;
      }
      dedupCache.set(fingerprint, Date.now() + windowMs);

      try {
        // Insert pending row — attempt_count=0 (not yet dispatched).
        // notification_delivery is partitioned by created_at; default partition catches all rows.
        await sql`
          INSERT INTO event.notification_delivery
            (tenant_id,         message_id,         recipient_id,
             recipient_addr,    channel,             status,
             attempt_count,     max_attempts,        idempotency_key,
             created_by)
          VALUES
            (${tenantId}::uuid, ${msg.id}::uuid, ${recipient.id}::uuid,
             ${recipientAddr}, ${channel},      'pending',
             0,                 ${maxAttempts},  ${fingerprint},
             ${SYSTEM_ACTOR_ID}::uuid)
        `.execute(db);
      } catch (err) {
        await releaseDeliveryClaim(db, tenantId, fingerprint);
        dedupCache.delete(fingerprint);
        throw err;
      }
    }
  }
}

/**
 * Dispatch one existing delivery row and update it in-place.
 *
 * Returns true on success (delivered) or permanent failure (no handler —
 * attempt_count set to max_attempts so the row is never retried).
 * Returns false on transient adapter failure so the caller can rethrow
 * after the loop when retryable rows remain.
 */
async function dispatchDeliveryRow(
  db: DB,
  tenantId: string,
  opts: {
    row:          DeliveryRow;
    msg:          PendingMessage;
    handler:      NotificationChannelHandler | undefined;
    fromOverride: string | undefined;
    logger?:      JobLogger;
  },
): Promise<boolean> {
  const { row, msg, handler, fromOverride, logger } = opts;
  const { id: rowId, recipient_id, recipient_addr, channel, attempt_count, max_attempts } = row;
  const fingerprint = row.idempotency_key;

  if (!handler) {
    // No adapter registered for this channel (e.g. whatsapp before the adapter ships).
    // Mark cancelled — not failed — so agg.failed stays clean and the message can
    // still finalize as 'completed' if other channels delivered successfully.
    // Return true so anyFailed is not set; BullMQ will not retry this delivery.
    logger?.warn("notification_channel_unhandled", { channel, messageId: msg.id });
    await sql`
      UPDATE event.notification_delivery
      SET    status     = 'cancelled',
             last_error = ${`No handler registered for channel '${channel}'`},
             updated_at = now(),
             updated_by = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id         = ${rowId}::uuid
        AND  tenant_id  = ${tenantId}::uuid
        AND  message_id = ${msg.id}::uuid
    `.execute(db);
    if (fingerprint) {
      await releaseDeliveryClaim(db, tenantId, fingerprint);
      dedupCache.delete(fingerprint);
    }
    return true;
  }

  try {
    const { externalId } = await handler.send({
      channel,
      recipientAddr: recipient_addr,
      templateKey:   msg.template_key,
      subject:       msg.subject,
      payload:       (msg.payload ?? {}) as Record<string, unknown>,
      tenantId,
      recipientId:   recipient_id,
      fromOverride,
    });

    await sql`
      UPDATE event.notification_delivery
      SET    status        = 'delivered',
             external_id  = ${externalId ?? null},
             attempt_count = ${Math.min(attempt_count + 1, max_attempts)},
             sent_at      = now(),
             delivered_at = now(),
             last_error   = NULL,
             error_category = NULL,
             next_retry_at = NULL,
             updated_at   = now(),
             updated_by   = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id         = ${rowId}::uuid
        AND  tenant_id  = ${tenantId}::uuid
        AND  message_id = ${msg.id}::uuid
    `.execute(db);

    if (fingerprint) await completeDeliveryClaim(db, tenantId, fingerprint);
    return true;

  } catch (err) {
    logger?.error("notification_delivery_error", {
      messageId: msg.id, channel, rowId, err: String(err),
    });
    const category = classifyNotificationDeliveryError(err);
    const newCount = Math.min(attempt_count + 1, max_attempts);
    const terminal = category === "permanent" || category === "auth" || newCount >= max_attempts;
    const nextRetryAt = terminal
      ? null
      : new Date(Date.now() + computeNotificationRetryDelayMs(newCount, category, retryAfterMsFromError(err))).toISOString();
    await sql`
      UPDATE event.notification_delivery
      SET    status        = ${terminal ? "bounced" : "failed"},
             attempt_count = ${newCount},
             last_error    = ${String(err).slice(0, 500)},
             error_category = ${category},
             next_retry_at = ${nextRetryAt}::timestamptz,
             bounced_at    = CASE WHEN ${terminal} THEN now() ELSE bounced_at END,
             updated_at    = now(),
             updated_by    = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id         = ${rowId}::uuid
        AND  tenant_id  = ${tenantId}::uuid
        AND  message_id = ${msg.id}::uuid
    `.execute(db);
    if (fingerprint) {
      await releaseDeliveryClaim(db, tenantId, fingerprint);
      dedupCache.delete(fingerprint);
    }
    return false;
  }
}

async function scheduleNotificationRetry(
  queue: Queue<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>,
  messageId: string,
  tenantId: string,
  agg: DeliveryAggregate,
  logger?: JobLogger,
): Promise<void> {
  const retryAtMs = agg.nextRetryAt ? Date.parse(agg.nextRetryAt) : Date.now() + 60_000;
  const delay = Math.max(1_000, Number.isNaN(retryAtMs) ? 60_000 : retryAtMs - Date.now());
  const bucket = Number.isNaN(retryAtMs) ? Date.now() + delay : retryAtMs;

  await queue.add(
    JOB_NAME.SEND,
    { messageId, tenantId } satisfies SendNotificationJobData,
    {
      jobId: `notif-retry:${messageId}:${bucket}`,
      delay,
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );

  logger?.info("notification_retry_scheduled", {
    messageId,
    tenantId,
    delay,
    retryable: agg.retryable,
  });
}

async function aggregateDeliveryStatus(
  db:        DB,
  messageId: string,
  tenantId:  string,
): Promise<DeliveryAggregate> {
  const result = await sql<{
    delivered: string;
    failed:    string;
    pending:   string;
    retryable: string;
    total:     string;
    next_retry_at: string | null;
  }>`
    SELECT
      COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered,
      COUNT(*) FILTER (WHERE status IN ('failed', 'bounced'))::text AS failed,
      COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
      COUNT(*) FILTER (
        WHERE status IN ('pending', 'failed')
          AND attempt_count < max_attempts
      )::text AS retryable,
      COUNT(*) FILTER (WHERE status != 'cancelled')::text AS total,
      MIN(next_retry_at)::text AS next_retry_at
    FROM event.notification_delivery
    WHERE message_id = ${messageId}::uuid
      AND tenant_id  = ${tenantId}::uuid
  `.execute(db);

  const row = result.rows[0];
  return {
    delivered: Number(row?.delivered ?? 0),
    failed:    Number(row?.failed    ?? 0),
    pending:   Number(row?.pending   ?? 0),
    retryable: Number(row?.retryable ?? 0),
    total:     Number(row?.total     ?? 0),
    nextRetryAt: row?.next_retry_at ?? null,
  };
}

// ─── Digest flush ─────────────────────────────────────────────────────────────
//
// Merged here from digest.worker.ts to share the QUEUE_NAME.NOTIFICATIONS queue.
// BullMQ's competing-consumer model means separate Workers on the same queue
// steal each other's jobs — all job names must be handled by a single Worker.

interface StagedRow {
  id:           string;
  tenant_id:    string;
  recipient_id: string;
  channel:      string;
  frequency:    string;
  message_id:   string;    // source notification_message.id
  event_code:   string;
  subject:      string | null;
  payload:      Record<string, unknown>;
  template_key: string;
  priority:     string;
}

async function flush(
  db:        DB,
  queue:     Queue<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>,
  frequency: string,
  logger?:   JobLogger,
): Promise<void> {
  const BATCH = 500;

  const claimed = await sql<StagedRow>`
    UPDATE event.digest_staging
    SET    delivered_at = now()
    WHERE  id IN (
      SELECT id
      FROM   event.digest_staging
      WHERE  frequency     = ${frequency}
        AND  delivered_at IS NULL
      ORDER  BY staged_at ASC
      LIMIT  ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id, tenant_id, recipient_id, channel, frequency,
      message_id, event_code, subject, payload, template_key, priority
  `.execute(db);

  const rows = claimed.rows;
  if (rows.length === 0) return;

  // Group by (tenant_id, recipient_id, channel)
  const groups = new Map<string, StagedRow[]>();
  for (const row of rows) {
    const key = `${row.tenant_id}::${row.recipient_id}::${row.channel}`;
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  const enqueueJobs: { name: string; data: SendNotificationJobData; opts: object }[] = [];

  for (const [, groupRows] of groups) {
    const { tenant_id, recipient_id, channel } = groupRows[0]!;

    const sourceMessageIds = [...new Set(groupRows.map((r) => r.message_id))];
    const items = groupRows.slice(0, 50).map((r) => ({
      event_code:   r.event_code,
      subject:      r.subject,
      template_key: r.template_key,
      payload:      r.payload,
    }));

    const msgResult = await sql<{ id: string }>`
      INSERT INTO event.notification_message
        (tenant_id,    event_id,              event_code,
         template_key, template_version,      subject,
         payload,      channels,              priority,
         recipient_count, status,             created_by)
      VALUES
        (${tenant_id}::uuid,
         ${randomUUID()},
         ${"digest." + frequency},
         ${"digest." + channel},
         1,
         ${"Digest: " + groupRows.length + " notification(s)"},
         ${JSON.stringify({
           recipient_id:       recipient_id,
           recipient_ids:      [recipient_id],
           digest_source_ids:  sourceMessageIds,
           digest_frequency:   frequency,
           digest_item_count:  groupRows.length,
           digest_items:       items,
         })}::jsonb,
         ARRAY[${channel}]::text[],
         'normal',
         1,
         'pending',
         ${SYSTEM_ACTOR_ID}::uuid)
      RETURNING id
    `.execute(db);

    const msgId = msgResult.rows[0]?.id;
    if (!msgId) continue;

    enqueueJobs.push({
      name: JOB_NAME.SEND,
      data: { messageId: msgId, tenantId: tenant_id } satisfies SendNotificationJobData,
      opts: {
        jobId:            `digest:${msgId}`,
        attempts:         3,
        backoff:          { type: "exponential", delay: 60_000 },
        removeOnComplete: { count: 200 },
        removeOnFail:     { count: 100 },
      },
    });
  }

  if (enqueueJobs.length > 0) {
    await queue.addBulk(enqueueJobs);
  }

  logger?.info("notification_digest_flush", {
    frequency,
    staged_rows: rows.length,
    groups:      groups.size,
    messages:    enqueueJobs.length,
  });
}

// ─── Provider health check ────────────────────────────────────────────────────
//
// Merged here from provider-health.worker.ts for the same competing-consumer reason.

interface ProviderRow {
  id:     string;
  channel: string;
  code:   string;
  config: Record<string, unknown>;
}

async function checkAllProviders(
  db:              DB,
  channelHandlers: Map<string, NotificationChannelHandler>,
  logger?:         JobLogger,
): Promise<void> {
  const providers = await sql<ProviderRow>`
    SELECT id, channel, code, config
    FROM   control.notification_provider
    WHERE  is_enabled = true
    ORDER  BY channel ASC, priority ASC
  `.execute(db);

  // Warn when registered adapters have no corresponding DB row — this makes
  // GET /api/notifications/providers return empty for those channels.
  const seenChannels = new Set(providers.rows.map((p) => p.channel));
  for (const channel of channelHandlers.keys()) {
    if (!seenChannels.has(channel)) {
      logger?.warn("notification_provider_row_missing", {
        channel,
        hint: "Seed a row in control.notification_provider for this channel to surface health via GET /api/notifications/providers",
      });
    }
  }

  if (providers.rows.length === 0) return;

  let checked = 0;
  let missingHandlers = 0;

  for (const provider of providers.rows) {
    const adapter = channelHandlers.get(provider.channel);

    let health: "healthy" | "degraded" | "down";
    try {
      if (!adapter) {
        missingHandlers++;
        health = "down";
      } else {
        health = await adapter.healthCheck?.(provider as unknown as Record<string, unknown>) ?? "healthy";
      }
    } catch (err) {
      logger?.error("provider_health_check_error", {
        providerId: provider.id,
        channel:    provider.channel,
        code:       provider.code,
        err:        String(err),
      });
      health = "down";
    }

    await sql`
      UPDATE control.notification_provider
      SET    health     = ${health},
             updated_at = now(),
             updated_by = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id = ${provider.id}::uuid
    `.execute(db);

    checked++;
  }

  logger?.info("notification_provider_health_check", {
    total:   providers.rows.length,
    checked,
    missingHandlers,
  });
}

// ─── Housekeeping ─────────────────────────────────────────────────────────────

async function pruneNotificationHousekeeping(db: DB, logger?: JobLogger): Promise<void> {
  const claims = await sql<{ count: string }>`
    WITH deleted AS (
      DELETE FROM event.notification_delivery_claim
      WHERE expires_at < now() - interval '1 day'
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM deleted
  `.execute(db);

  const subscriptions = await sql<{ count: string }>`
    WITH deleted AS (
      DELETE FROM event.push_subscription
      WHERE is_active = false
        AND COALESCE(updated_at, expires_at, created_at) < now() - interval '90 days'
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM deleted
  `.execute(db);

  const claimCount = Number(claims.rows[0]?.count ?? "0");
  const subscriptionCount = Number(subscriptions.rows[0]?.count ?? "0");
  if (claimCount > 0 || subscriptionCount > 0) {
    logger?.info("notification_housekeeping_pruned", {
      deliveryClaims: claimCount,
      pushSubscriptions: subscriptionCount,
    });
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface NotificationWorkerDeps {
  db:              DB;
  queue:           Queue<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>;
  connection:      ConnectionOptions;
  channelHandlers?: Map<string, NotificationChannelHandler>;
  /** Per-plane FROM address overrides for the email channel. Keys: 'neon' | 'mesh' | 'admin'. */
  emailFromMap?:   Map<string, string>;
  logger?:         JobLogger;
}

export function createNotificationWorker(deps: NotificationWorkerDeps): Worker {
  const { db, queue, connection, logger } = deps;
  const channelHandlers = deps.channelHandlers ?? new Map();
  const emailFromMap    = deps.emailFromMap;

  const worker = new Worker<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>(
    QUEUE_NAME.NOTIFICATIONS,
    async (job: Job) => {
      if      (job.name === JOB_NAME.SWEEP)           await sweep(db, queue, logger);
      else if (job.name === JOB_NAME.SEND)            await send(
        db, queue, job.data as SendNotificationJobData, channelHandlers, logger, emailFromMap,
        job.attemptsMade,
        typeof job.opts?.attempts === "number" ? job.opts.attempts : 3,
      );
      // TODO: Phase 2 — digest flush scheduler is deferred; handler kept so
      // any jobs still in Redis from prior deployments drain gracefully.
      else if (job.name === JOB_NAME.DIGEST_FLUSH)    await flush(db, queue, (job.data as DigestFlushJobData).frequency, logger);
      else if (job.name === JOB_NAME.PROVIDER_HEALTH) {
        await checkAllProviders(db, channelHandlers, logger);
        await pruneNotificationHousekeeping(db, logger);
      }
      else logger?.warn("notification_unknown_job", { name: job.name });
    },
    { connection, concurrency: 5 },
  );

  // When BullMQ permanently fails a SEND job (all attempts exhausted before
  // normal finalization), mark the message so it does not stay in delivering/planning.
  worker.on("failed", async (job, _err) => {
    if (!job || job.name !== JOB_NAME.SEND) return;
    const maxAttempts = typeof job.opts?.attempts === "number" ? job.opts.attempts : 3;
    if (job.attemptsMade < maxAttempts) return;

    const { messageId, tenantId } = job.data as SendNotificationJobData;
    await sql`
      UPDATE event.notification_delivery
      SET    status        = 'bounced',
             attempt_count = max_attempts,
             error_category = COALESCE(error_category, 'transient'),
             last_error    = COALESCE(last_error, 'Notification send job exhausted BullMQ attempts'),
             bounced_at    = COALESCE(bounced_at, now()),
             next_retry_at = NULL,
             updated_at    = now(),
             updated_by    = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  message_id    = ${messageId}::uuid
        AND  tenant_id     = ${tenantId}::uuid
        AND  status        IN ('pending', 'failed')
        AND  attempt_count >= max_attempts
    `.execute(db).catch((updateErr) => {
      logger?.error("notification_delivery_final_fail_update_error", {
        messageId, err: String(updateErr),
      });
    });

    await sql`
      UPDATE event.notification_message
      SET    status     = 'failed',
             updated_at = now(),
             updated_by = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id        = ${messageId}::uuid
        AND  tenant_id = ${tenantId}::uuid
        AND  status    IN ('planning', 'delivering')
    `.execute(db).catch((updateErr) => {
      logger?.error("notification_send_final_fail_update_error", {
        messageId, err: String(updateErr),
      });
    });
    logger?.warn("notification_send_permanently_failed", {
      messageId, tenantId, attempts: job.attemptsMade,
    });
  });

  return worker;
}
