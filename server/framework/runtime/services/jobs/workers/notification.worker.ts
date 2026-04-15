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
// within a routing rule's dedup_window_ms window.
//
// Fingerprint: sha256 of (rule_id|event_code|entity_ref|recipient_id|channel).
// "Same event, same entity, same recipient, same channel within window = skip."
// Stored in event.notification_delivery.idempotency_key — a unique index on
// (tenant_id, idempotency_key) ensures exactly-once DB semantics.
//
// Implementation note (user correction applied): fingerprint is persisted to DB,
// not just Redis. Redis is an optional fast-path cache only.

/** Default dedup window (ms) when routing rule is not available: 5 min */
const DEFAULT_DEDUP_WINDOW_MS = 300_000;

/** In-memory dedup cache: fingerprint → expiresAt (ms). Process-local fast path. */
const dedupCache = new Map<string, number>();

function buildFingerprint(
  ruleId:      string | null,
  eventCode:   string,
  entityType:  string | null,
  entityId:    string | null,
  recipientId: string,
  channel:     string,
): string {
  const raw = [ruleId ?? "", eventCode, entityType ?? "", entityId ?? "", recipientId, channel].join("|");
  return createHash("sha256").update(raw).digest("hex");
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
        AND  status NOT IN ('failed', 'cancelled')
    ) AS exists
  `.execute(db);

  return result.rows[0]?.exists ?? false;
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
    SET    status = 'planning', updated_at = now()
    WHERE  id IN (
      SELECT id
      FROM   event.notification_message
      WHERE  status = 'pending'
        AND (expires_at IS NULL OR expires_at > now())
      ORDER  BY priority DESC, created_at ASC
      LIMIT  ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tenant_id, template_key, template_version, subject, payload, channels,
              rule_id, event_code, entity_type, entity_id
  `.execute(db);

  const msgs = result.rows;
  if (msgs.length === 0) return;

  await queue.addBulk(
    msgs.map((m) => ({
      name: JOB_NAME.SEND,
      data: { messageId: m.id, tenantId: m.tenant_id } satisfies SendNotificationJobData,
      opts: {
        jobId:            `notif:${m.id}`,
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
  data: SendNotificationJobData,
  channelHandlers: Map<string, NotificationChannelHandler>,
  logger?: JobLogger,
): Promise<void> {
  const { messageId, tenantId } = data;

  // Load message — must be in 'planning' state
  const msgResult = await sql<PendingMessage>`
    SELECT id, tenant_id, template_key, template_version, subject, payload, channels,
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

  // Resolve recipients from the message payload (recipient_id / recipient_ids fields
  // are embedded by the outbox handler when creating the notification_message).
  const recipients = await resolveRecipients(db, tenantId, msg, channels);

  if (recipients.length === 0) {
    // No recipients — mark completed with 0 counts
    await sql`
      UPDATE event.notification_message
      SET    status = 'completed', recipient_count = 0,
             completed_at = now(), updated_at = now()
      WHERE  id = ${messageId}::uuid
    `.execute(db);
    logger?.info("notification_no_recipients", { messageId, templateKey: msg.template_key });
    return;
  }

  // Transition → delivering
  await sql`
    UPDATE event.notification_message
    SET    status = 'delivering', recipient_count = ${recipients.length}, updated_at = now()
    WHERE  id = ${messageId}::uuid
  `.execute(db);

  let deliveredCount = 0;
  let failedCount    = 0;
  let dedupCount     = 0;

  for (const recipient of recipients) {
    for (const channel of channels) {
      const handler = channelHandlers.get(channel);
      const result  = await deliverOne(db, {
        messageId, tenantId, msg, recipient, channel, handler, logger,
      });
      if      (result === "ok")    deliveredCount++;
      else if (result === "dedup") dedupCount++;
      else                         failedCount++;
    }
  }

  // All deduplicated — treat as completed (not failed) so it doesn't re-enter queue
  const finalStatus =
    failedCount === 0 && (deliveredCount > 0 || dedupCount > 0) ? "completed"
    : failedCount === 0 && deliveredCount === 0                  ? "completed"
    : deliveredCount === 0 && dedupCount === 0                   ? "failed"
    :                                                              "partial";

  await sql`
    UPDATE event.notification_message
    SET    status          = ${finalStatus},
           delivered_count = ${deliveredCount},
           failed_count    = ${failedCount},
           completed_at    = now(),
           updated_at      = now()
    WHERE  id = ${messageId}::uuid
  `.execute(db);

  logger?.info("notification_send_complete", {
    messageId, status: finalStatus, deliveredCount, failedCount, dedupCount,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Recipient {
  id:   string;  // principal UUID
  addr: string;  // channel-specific address (email addr, or principal UUID for in_app)
}

/**
 * Resolve notification recipients from the message payload.
 *
 * The wf outbox handler embeds `recipient_id` (single UUID) or
 * `recipient_ids` (UUID[]) in the notification_message payload.
 * For email: addr = master.principal.login_email.
 * For in_app: addr = recipient UUID (no external address needed).
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
    return recipientIds.map((id) => ({ id, addr: id }));
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
    id:   p.id,
    addr: p.login_email ?? p.id, // fall back to UUID for in_app-style delivery
  }));
}

async function deliverOne(
  db: DB,
  opts: {
    messageId: string;
    tenantId:  string;
    msg:       PendingMessage;
    recipient: Recipient;
    channel:   string;
    handler:   NotificationChannelHandler | undefined;
    logger?:   JobLogger;
  },
): Promise<"ok" | "fail" | "dedup"> {
  const { messageId, tenantId, msg, recipient, channel, handler, logger } = opts;

  // ── Semantic dedup check ───────────────────────────────────────────────────
  // Build a fingerprint of (rule, event, entity, recipient, channel). If a
  // non-failed delivery with this fingerprint exists within dedup_window_ms,
  // skip silently. This prevents duplicate notifications caused by outbox
  // retries, double-triggers, or sweep races.
  if (msg.rule_id) {
    const fingerprint = buildFingerprint(
      msg.rule_id, msg.event_code,
      msg.entity_type, msg.entity_id,
      recipient.id, channel,
    );
    const windowMs = await getRuleDedupWindowMs(db, msg.rule_id);
    const dup = await isDuplicate(db, tenantId, fingerprint, windowMs);
    if (dup) {
      logger?.info("notification_dedup_skip", {
        messageId, channel, recipientId: recipient.id,
        ruleId: msg.rule_id, eventCode: msg.event_code,
      });
      return "dedup";
    }
    // Store fingerprint in process cache for duration of window
    dedupCache.set(fingerprint, Date.now() + windowMs);
  }

  if (!handler) {
    logger?.warn("notification_channel_unhandled", { channel, messageId });
    await insertDelivery(db, tenantId, {
      messageId, recipientId: recipient.id, recipientAddr: recipient.addr,
      channel, status: "failed", lastError: `No handler registered for channel '${channel}'`,
    });
    return "fail";
  }

  try {
    const { externalId } = await handler.send({
      channel,
      recipientAddr: recipient.addr,
      templateKey:   msg.template_key,
      subject:       msg.subject,
      payload:       (msg.payload ?? {}) as Record<string, unknown>,
      tenantId,
      recipientId:   recipient.id,
    });

    await insertDelivery(db, tenantId, {
      messageId, recipientId: recipient.id, recipientAddr: recipient.addr,
      channel, status: "sent", externalId,
      // Store fingerprint as idempotency_key for DB-level dedup on retry
      idempotencyKey: msg.rule_id ? buildFingerprint(
        msg.rule_id, msg.event_code,
        msg.entity_type, msg.entity_id,
        recipient.id, channel,
      ) : undefined,
    });
    return "ok";
  } catch (err) {
    logger?.error("notification_delivery_error", { messageId, channel, err: String(err) });
    await insertDelivery(db, tenantId, {
      messageId, recipientId: recipient.id, recipientAddr: recipient.addr,
      channel, status: "failed", lastError: String(err).slice(0, 500),
    });
    return "fail";
  }
}

async function insertDelivery(
  db:       DB,
  tenantId: string,
  opts: {
    messageId:      string;
    recipientId:    string;
    recipientAddr:  string;
    channel:        string;
    status:         string;
    externalId?:    string;
    lastError?:     string;
    /** SHA-256 semantic dedup fingerprint — stored for cross-worker idempotency */
    idempotencyKey?: string;
  },
): Promise<void> {
  // notification_delivery is partitioned by created_at — the default partition catches all rows.
  await sql`
    INSERT INTO event.notification_delivery
      (tenant_id,         message_id,         recipient_id,
       recipient_addr,    channel,             status,
       external_id,       last_error,          attempt_count,
       idempotency_key,   sent_at,             created_by)
    VALUES
      (${tenantId}::uuid, ${opts.messageId}::uuid, ${opts.recipientId}::uuid,
       ${opts.recipientAddr}, ${opts.channel},     ${opts.status},
       ${opts.externalId ?? null}, ${opts.lastError ?? null}, 1,
       ${opts.idempotencyKey ?? null},
       CASE WHEN ${opts.status} = 'sent' THEN now() ELSE NULL END,
       ${SYSTEM_ACTOR_ID}::uuid)
    ON CONFLICT DO NOTHING
  `.execute(db);
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
         ${JSON.stringify([channel])}::text[],
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

  if (providers.rows.length === 0) return;

  let checked = 0;

  for (const provider of providers.rows) {
    const adapter = channelHandlers.get(provider.channel);
    if (!adapter || typeof adapter.healthCheck !== "function") continue;

    let health: "healthy" | "degraded" | "down";
    try {
      health = await adapter.healthCheck(provider as unknown as Record<string, unknown>);
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
    skipped: providers.rows.length - checked,
  });
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface NotificationWorkerDeps {
  db:              DB;
  queue:           Queue<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>;
  connection:      ConnectionOptions;
  channelHandlers?: Map<string, NotificationChannelHandler>;
  logger?:         JobLogger;
}

export function createNotificationWorker(deps: NotificationWorkerDeps): Worker {
  const { db, queue, connection, logger } = deps;
  const channelHandlers = deps.channelHandlers ?? new Map();

  return new Worker<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>(
    QUEUE_NAME.NOTIFICATIONS,
    async (job: Job) => {
      if      (job.name === JOB_NAME.SWEEP)           await sweep(db, queue, logger);
      else if (job.name === JOB_NAME.SEND)            await send(db, job.data as SendNotificationJobData, channelHandlers, logger);
      else if (job.name === JOB_NAME.DIGEST_FLUSH)    await flush(db, queue, (job.data as DigestFlushJobData).frequency, logger);
      else if (job.name === JOB_NAME.PROVIDER_HEALTH) await checkAllProviders(db, channelHandlers, logger);
      else logger?.warn("notification_unknown_job", { name: job.name });
    },
    { connection, concurrency: 5 },
  );
}
