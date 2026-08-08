/**
 * Webhook Delivery Worker
 *
 * The database is the durable state machine. BullMQ wakes the worker and runs
 * due work; event.outbox and event.notification_delivery decide what still
 * needs recovery after a crash, Redis flush, or terminal provider failure.
 */

import { Queue, Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { sql, type Kysely } from "kysely";
import { buildWebhookHeaders } from "@athyper/svc-integration";
import {
  JOB_NAME,
  QUEUE_NAME,
  SCHEDULER_ID,
  SYSTEM_ACTOR_ID,
  type DeliverWebhookJobData,
  type JobLogger,
  type SweepJobData,
} from "../jobs.types.js";

const SWEEP_BATCH_SIZE = 50;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_BYTES = 1_024 * 1_024;
const OUTBOX_LOCK_DURATION_MS = 90_000;
const DELIVERY_LOCK_BUFFER_MS = 15_000;
const TRANSIENT_BACKOFF_BASE_MS = 2_000;
const TRANSIENT_BACKOFF_MAX_MS = 15 * 60_000;
const RATE_LIMIT_BACKOFF_MS = 60 * 60_000;

// The runtime supplies the concrete database adapter. This worker only needs
// Kysely's query contract, so the platform package must not depend on Neon.
type WebhookDatabase = Record<string, Record<string, unknown>>;

export type WebhookDeliveryTerminalStatus = "delivered" | "cancelled" | "bounced";
export type WebhookDeliveryStatus = "pending" | "queued" | "failed" | WebhookDeliveryTerminalStatus;
export type WebhookErrorCategory = "transient" | "permanent" | "rate_limit" | "auth";

interface ClaimedEvent {
  id: string;
  tenant_id: string;
  topic: string;
}

interface WebhookSubscription {
  id: string;
  target_url: string;
  max_retries: number | null;
}

interface WebhookDeliveryRow {
  id: string;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  locked_until: string | null;
}

interface WebhookDeliveryContext {
  deliveryId: string;
  tenantId: string;
  outboxEventId: string;
  webhookSubscriptionId: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  topic: string;
  payload: unknown;
  outboxStatus: string;
  targetUrl: string;
  signingSecret: string | null;
  timeoutMs: number;
  subscriptionActive: boolean;
}

export interface WebhookClassificationInput {
  httpStatus: number | null;
  errorMessage?: string | null;
  payloadTooLarge?: boolean;
  subscriptionInactive?: boolean;
}

export interface WebhookClassification {
  status: WebhookDeliveryStatus;
  errorCategory: WebhookErrorCategory | null;
  retryable: boolean;
}

interface WebhookAttemptResult {
  httpStatus: number | null;
  errorMessage: string | null;
  durationMs: number;
  retryAfterMs: number | null;
  rawPayload: string | null;
  requestHeaders: Record<string, string> | null;
}

interface ReconcileCounts {
  total: string;
  positive: string;
  bounced: string;
  pending_or_queued: string;
  retryable_failed: string;
  next_retry_at: string | null;
}

export function isWebhookDeliveryTerminal(status: string): boolean {
  return status === "delivered" || status === "cancelled" || status === "bounced";
}

export function computeWebhookBackoffMs(
  attemptCount: number,
  category: WebhookErrorCategory,
  retryAfterMs: number | null = null,
): number {
  if (category === "rate_limit") return retryAfterMs ?? RATE_LIMIT_BACKOFF_MS;
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(TRANSIENT_BACKOFF_BASE_MS * 2 ** exponent, TRANSIENT_BACKOFF_MAX_MS);
}

export function classifyWebhookDeliveryOutcome(input: WebhookClassificationInput): WebhookClassification {
  if (input.subscriptionInactive) {
    return { status: "cancelled", errorCategory: null, retryable: false };
  }
  if (input.payloadTooLarge) {
    return { status: "bounced", errorCategory: "permanent", retryable: false };
  }

  const status = input.httpStatus;
  if (status !== null && status >= 200 && status < 300) {
    return { status: "delivered", errorCategory: null, retryable: false };
  }
  if (status === null) {
    return { status: "failed", errorCategory: "transient", retryable: true };
  }
  if (status === 401 || status === 403) {
    return { status: "bounced", errorCategory: "auth", retryable: false };
  }
  if (status === 408 || status === 409 || status === 425 || status >= 500) {
    return { status: "failed", errorCategory: "transient", retryable: true };
  }
  if (status === 429) {
    return { status: "failed", errorCategory: "rate_limit", retryable: true };
  }
  if (status >= 400 && status < 500) {
    return { status: "bounced", errorCategory: "permanent", retryable: false };
  }
  return { status: "failed", errorCategory: "transient", retryable: true };
}

function isDue(row: WebhookDeliveryRow, nowMs = Date.now()): boolean {
  const retryDue = !row.next_retry_at || new Date(row.next_retry_at).getTime() <= nowMs;
  const lockExpired = !row.locked_until || new Date(row.locked_until).getTime() <= nowMs;
  return retryDue && lockExpired && !isWebhookDeliveryTerminal(row.status);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  // eslint-disable-next-line no-direct-date-parse -- reason: HTTP Retry-After per RFC 9110 §10.2.3 may be HTTP-date; Date.parse is the standard interpretation, NaN handled below.
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

async function claimOutboxEvents(db: Kysely<WebhookDatabase>, tenantId: string): Promise<ClaimedEvent[]> {
  const lockedUntil = new Date(Date.now() + OUTBOX_LOCK_DURATION_MS).toISOString();
  const { rows } = await sql<ClaimedEvent>`
    UPDATE event.outbox
    SET    status       = 'processing',
           locked_at    = now(),
           locked_by    = 'webhook-delivery-worker',
           locked_until = ${lockedUntil}::timestamptz
    WHERE  id IN (
      SELECT id
      FROM   event.outbox
      WHERE  tenant_id = ${tenantId}::uuid
        AND  ( (
               status IN ('pending', 'failed')
               AND available_at <= now()
             )
         OR  (
               status = 'processing'
               AND locked_until IS NOT NULL
               AND locked_until < now()
             )
          )
      ORDER  BY available_at ASC, created_at ASC
      LIMIT  ${SWEEP_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tenant_id, topic
  `.execute(db);
  return rows;
}

async function listMatchingSubscriptions(
  db: Kysely<WebhookDatabase>,
  tenantId: string,
  topic: string,
): Promise<WebhookSubscription[]> {
  return await db
    .selectFrom("event.webhook_subscription as ws" as never)
    .select(["ws.id" as never, "ws.target_url" as never, "ws.max_retries" as never])
    .where("ws.tenant_id" as never, "=" as never, tenantId as never)
    .where("ws.is_active" as never, "=" as never, true as never)
    .where(() =>
      sql`COALESCE(cardinality(ws.topics), 0) = 0
          OR ws.topics @> ARRAY[${topic}]::text[]
          OR ws.topics @> ARRAY['*']::text[]`
    )
    .execute() as WebhookSubscription[];
}

async function ensureWebhookDeliveryRow(
  db: Kysely<WebhookDatabase>,
  event: ClaimedEvent,
  sub: WebhookSubscription,
): Promise<WebhookDeliveryRow> {
  const maxAttempts = Math.max(1, Number(sub.max_retries ?? 3));
  const idempotencyKey = `webhook:${event.id}:${sub.id}`;
  const channelDetail = {
    targetUrl: sub.target_url,
    subscriptionId: sub.id,
    topic: event.topic,
  };

  const result = await sql<WebhookDeliveryRow>`
    WITH existing AS (
      SELECT id, status, attempt_count, max_attempts,
             next_retry_at::text AS next_retry_at,
             locked_until::text AS locked_until
      FROM   event.notification_delivery
      WHERE  tenant_id       = ${event.tenant_id}::uuid
        AND  outbox_id       = ${event.id}::uuid
        AND  subscription_id = ${sub.id}::uuid
        AND  channel         = 'webhook'
        AND  status         != 'cancelled'
      ORDER  BY created_at DESC
      LIMIT  1
    ),
    inserted AS (
      INSERT INTO event.notification_delivery
        (tenant_id, outbox_id, subscription_id, recipient_addr, channel,
         status, attempt_count, max_attempts, idempotency_key,
         channel_detail, metadata, created_by)
      SELECT
        ${event.tenant_id}::uuid,
        ${event.id}::uuid,
        ${sub.id}::uuid,
        ${sub.target_url},
        'webhook',
        'pending',
        0,
        ${maxAttempts},
        ${idempotencyKey},
        ${safeJson(channelDetail)}::jsonb,
        ${safeJson({ outboxEventId: event.id, topic: event.topic })}::jsonb,
        ${SYSTEM_ACTOR_ID}::uuid
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id, status, attempt_count, max_attempts,
                next_retry_at::text AS next_retry_at,
                locked_until::text AS locked_until
    )
    SELECT * FROM inserted
    UNION ALL
    SELECT * FROM existing
    LIMIT 1
  `.execute(db);

  const row = result.rows[0];
  if (!row) throw new Error(`webhook_delivery_row_missing:${event.id}:${sub.id}`);
  return row;
}

async function enqueueDelivery(queue: Queue<DeliverWebhookJobData | SweepJobData>, row: WebhookDeliveryRow, tenantId: string): Promise<void> {
  await queue.add(
    JOB_NAME.DELIVER_WEBHOOK,
    { deliveryId: row.id, tenantId } satisfies DeliverWebhookJobData,
    {
      jobId: `wh-deliver:${row.id}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  );
}

async function markOutboxCompletedWithoutSubscriptions(db: Kysely<WebhookDatabase>, eventId: string): Promise<void> {
  await sql`
    UPDATE event.outbox
    SET    status       = 'completed',
           processed_at = now(),
           locked_at    = NULL,
           locked_by    = NULL,
           locked_until = NULL,
           last_error   = NULL
    WHERE  id = ${eventId}::uuid
  `.execute(db);
}

async function sweepWebhooks(
  db: Kysely<WebhookDatabase>,
  queue: Queue<DeliverWebhookJobData | SweepJobData>,
  tenantId: string,
  logger: JobLogger,
): Promise<void> {
  const events = await claimOutboxEvents(db, tenantId);
  if (events.length === 0) return;

  let enqueued = 0;
  for (const event of events) {
    const subs = await listMatchingSubscriptions(db, event.tenant_id, event.topic);
    if (subs.length === 0) {
      await markOutboxCompletedWithoutSubscriptions(db, event.id);
      continue;
    }

    for (const sub of subs) {
      const row = await ensureWebhookDeliveryRow(db, event, sub);
      if (isDue(row)) {
        await enqueueDelivery(queue, row, event.tenant_id);
        enqueued++;
      }
    }

    await reconcileWebhookOutbox(db, event.id);
  }

  logger.info("webhook_delivery_sweep_done", { swept: events.length, enqueued });
}

async function loadWebhookContext(
  db: Kysely<WebhookDatabase>,
  data: DeliverWebhookJobData,
): Promise<WebhookDeliveryContext | null> {
  const result = await sql<WebhookDeliveryContext>`
    SELECT nd.id AS "deliveryId",
           nd.tenant_id::text AS "tenantId",
           nd.outbox_id::text AS "outboxEventId",
           nd.subscription_id::text AS "webhookSubscriptionId",
           nd.status AS "status",
           nd.attempt_count AS "attemptCount",
           nd.max_attempts AS "maxAttempts",
           o.topic AS "topic",
           o.payload AS "payload",
           o.status AS "outboxStatus",
           COALESCE(ws.target_url, nd.recipient_addr) AS "targetUrl",
           ws.signing_secret AS "signingSecret",
           COALESCE(ws.timeout_ms, ${DEFAULT_TIMEOUT_MS}) AS "timeoutMs",
           COALESCE(ws.is_active, false) AS "subscriptionActive"
    FROM event.notification_delivery nd
    JOIN event.outbox o
      ON o.id = nd.outbox_id
     AND o.tenant_id = nd.tenant_id
    LEFT JOIN event.webhook_subscription ws
      ON ws.id = nd.subscription_id
     AND ws.tenant_id = nd.tenant_id
    WHERE nd.id = ${data.deliveryId}::uuid
      AND nd.tenant_id = ${data.tenantId}::uuid
      AND nd.channel = 'webhook'
    LIMIT 1
  `.execute(db);

  return result.rows[0] ?? null;
}

async function markDeliveryQueued(db: Kysely<WebhookDatabase>, ctx: WebhookDeliveryContext): Promise<boolean> {
  const lockedUntil = new Date(Date.now() + ctx.timeoutMs + DELIVERY_LOCK_BUFFER_MS).toISOString();
  const result = await sql<{ id: string }>`
    UPDATE event.notification_delivery
    SET    status       = 'queued',
           locked_until = ${lockedUntil}::timestamptz,
           updated_at   = now(),
           updated_by   = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id        = ${ctx.deliveryId}::uuid
      AND  tenant_id = ${ctx.tenantId}::uuid
      AND  channel   = 'webhook'
      AND  status    IN ('pending', 'failed', 'queued')
      AND  (locked_until IS NULL OR locked_until < now())
    RETURNING id
  `.execute(db);

  return result.rows.length > 0;
}

async function attemptHttpDelivery(ctx: WebhookDeliveryContext): Promise<WebhookAttemptResult> {
  const rawPayload = typeof ctx.payload === "string" ? ctx.payload : JSON.stringify(ctx.payload ?? {});
  if (Buffer.byteLength(rawPayload, "utf8") > MAX_PAYLOAD_BYTES) {
    return {
      httpStatus: null,
      errorMessage: `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
      durationMs: 0,
      retryAfterMs: null,
      rawPayload: null,
      requestHeaders: null,
    };
  }

  const requestHeaders = buildWebhookHeaders({
    topic: ctx.topic,
    deliveryId: ctx.deliveryId,
    rawBody: rawPayload,
    signingSecret: ctx.signingSecret,
  });

  const startMs = Date.now();
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  let retryAfterMs: number | null = null;

  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), ctx.timeoutMs);
    try {
      const response = await fetch(ctx.targetUrl, {
        method: "POST",
        headers: requestHeaders,
        body: rawPayload,
        signal: ac.signal,
      });
      httpStatus = response.status;
      retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      if (!response.ok) errorMessage = `HTTP ${response.status} ${response.statusText}`;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return {
    httpStatus,
    errorMessage,
    durationMs: Date.now() - startMs,
    retryAfterMs,
    rawPayload,
    requestHeaders,
  };
}

async function writeWebhookAttempt(
  tx: Kysely<WebhookDatabase>,
  ctx: WebhookDeliveryContext,
  attempt: WebhookAttemptResult,
  isSuccess: boolean,
): Promise<void> {
  await sql`
    INSERT INTO log.notification_delivery_attempt
      (tenant_id, delivery_id, subscription_id, request_url, request_method,
       request_headers, request_body, response_status, duration_ms,
       is_success, error, is_redacted, body_truncated, created_by)
    VALUES
      (${ctx.tenantId}::uuid,
       ${ctx.deliveryId}::uuid,
       ${ctx.webhookSubscriptionId}::uuid,
       ${ctx.targetUrl},
       'POST',
       ${safeJson(attempt.requestHeaders ?? {})}::jsonb,
       NULL,
       ${attempt.httpStatus},
       ${attempt.durationMs},
       ${isSuccess},
       ${attempt.errorMessage},
       true,
       ${attempt.rawPayload ? Buffer.byteLength(attempt.rawPayload, "utf8") > MAX_PAYLOAD_BYTES : false},
       ${SYSTEM_ACTOR_ID}::uuid)
  `.execute(tx);
}

async function updateDeliveryOutcome(
  tx: Kysely<WebhookDatabase>,
  ctx: WebhookDeliveryContext,
  attempt: WebhookAttemptResult,
  classification: WebhookClassification,
): Promise<WebhookDeliveryStatus> {
  const nextAttemptCount = Math.min(ctx.attemptCount + 1, ctx.maxAttempts);
  const exhausted = classification.retryable && nextAttemptCount >= ctx.maxAttempts;
  const finalStatus: WebhookDeliveryStatus = exhausted ? "bounced" : classification.status;
  const nextRetryAt = classification.retryable && !exhausted
    ? new Date(Date.now() + computeWebhookBackoffMs(nextAttemptCount, classification.errorCategory ?? "transient", attempt.retryAfterMs)).toISOString()
    : null;

  const detailPatch = {
    lastHttpStatus: attempt.httpStatus,
    lastDurationMs: attempt.durationMs,
    retryAfterMs: attempt.retryAfterMs,
  };

  await sql`
    UPDATE event.notification_delivery
    SET    status         = ${finalStatus},
           attempt_count  = ${nextAttemptCount},
           last_error     = ${attempt.errorMessage},
           error_category = ${classification.errorCategory},
           sent_at        = COALESCE(sent_at, now()),
           delivered_at   = CASE WHEN ${finalStatus} = 'delivered' THEN now() ELSE delivered_at END,
           bounced_at     = CASE WHEN ${finalStatus} = 'bounced' THEN now() ELSE bounced_at END,
           next_retry_at  = ${nextRetryAt}::timestamptz,
           locked_until   = NULL,
           channel_detail = COALESCE(channel_detail, '{}'::jsonb) || ${safeJson(detailPatch)}::jsonb,
           updated_at     = now(),
           updated_by     = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id        = ${ctx.deliveryId}::uuid
      AND  tenant_id = ${ctx.tenantId}::uuid
      AND  channel   = 'webhook'
  `.execute(tx);

  return finalStatus;
}

async function updateSubscriptionStats(
  tx: Kysely<WebhookDatabase>,
  ctx: WebhookDeliveryContext,
  status: WebhookDeliveryStatus,
): Promise<void> {
  if (status === "delivered") {
    await sql`
      UPDATE event.webhook_subscription
      SET    last_delivery_at     = now(),
             last_delivery_status = 'success',
             failure_count        = 0,
             updated_at           = now(),
             updated_by           = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id        = ${ctx.webhookSubscriptionId}::uuid
        AND  tenant_id = ${ctx.tenantId}::uuid
    `.execute(tx);
    return;
  }

  if (status === "failed" || status === "bounced") {
    await sql`
      UPDATE event.webhook_subscription
      SET    last_delivery_at     = now(),
             last_delivery_status = ${status === "bounced" ? "bounced" : "failure"},
             failure_count        = failure_count + 1,
             updated_at           = now(),
             updated_by           = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id        = ${ctx.webhookSubscriptionId}::uuid
        AND  tenant_id = ${ctx.tenantId}::uuid
    `.execute(tx);
  }
}

async function cancelInactiveSubscriptionDelivery(db: Kysely<WebhookDatabase>, ctx: WebhookDeliveryContext): Promise<void> {
  const attempt: WebhookAttemptResult = {
    httpStatus: null,
    errorMessage: "Webhook subscription inactive or missing",
    durationMs: 0,
    retryAfterMs: null,
    rawPayload: null,
    requestHeaders: null,
  };
  const classification = classifyWebhookDeliveryOutcome({ httpStatus: null, subscriptionInactive: true });

  await db.transaction().execute(async (tx) => {
    await writeWebhookAttempt(tx, ctx, attempt, false);
    await updateDeliveryOutcome(tx, ctx, attempt, classification);
    await reconcileWebhookOutbox(tx, ctx.outboxEventId);
  });
}

async function deliverWebhook(
  db: Kysely<WebhookDatabase>,
  data: DeliverWebhookJobData,
  logger: JobLogger,
): Promise<void> {
  const ctx = await loadWebhookContext(db, data);
  if (!ctx) {
    logger.warn("webhook_delivery_row_not_found", { deliveryId: data.deliveryId });
    return;
  }

  if (isWebhookDeliveryTerminal(ctx.status)) {
    await reconcileWebhookOutbox(db, ctx.outboxEventId);
    return;
  }

  if (ctx.outboxStatus === "completed" || ctx.outboxStatus === "dead_letter") {
    logger.warn("webhook_delivery_parent_terminal", {
      deliveryId: ctx.deliveryId,
      outboxEventId: ctx.outboxEventId,
      outboxStatus: ctx.outboxStatus,
    });
    return;
  }

  const claimed = await markDeliveryQueued(db, ctx);
  if (!claimed) return;

  if (!ctx.subscriptionActive) {
    await cancelInactiveSubscriptionDelivery(db, ctx);
    return;
  }

  const attempt = await attemptHttpDelivery(ctx);
  const payloadTooLarge = attempt.rawPayload === null && attempt.durationMs === 0 && attempt.httpStatus === null;
  const classification = classifyWebhookDeliveryOutcome({
    httpStatus: attempt.httpStatus,
    errorMessage: attempt.errorMessage,
    payloadTooLarge,
  });

  await db.transaction().execute(async (tx) => {
    const finalStatus = await updateDeliveryOutcome(tx, ctx, attempt, classification);
    await writeWebhookAttempt(tx, ctx, attempt, finalStatus === "delivered");
    await updateSubscriptionStats(tx, ctx, finalStatus);
    await reconcileWebhookOutbox(tx, ctx.outboxEventId);
  });

  logger.info("webhook_delivery_attempt_done", {
    deliveryId: ctx.deliveryId,
    outboxEventId: ctx.outboxEventId,
    status: classification.status,
    httpStatus: attempt.httpStatus,
    durationMs: attempt.durationMs,
  });
}

export async function reconcileWebhookOutbox(db: Kysely<WebhookDatabase>, outboxEventId: string): Promise<void> {
  const result = await sql<ReconcileCounts>`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE status IN ('delivered', 'cancelled'))::text AS positive,
      COUNT(*) FILTER (WHERE status = 'bounced')::text AS bounced,
      COUNT(*) FILTER (WHERE status IN ('pending', 'queued'))::text AS pending_or_queued,
      COUNT(*) FILTER (WHERE status = 'failed' AND attempt_count < max_attempts)::text AS retryable_failed,
      MIN(next_retry_at)::text AS next_retry_at
    FROM event.notification_delivery
    WHERE outbox_id = ${outboxEventId}::uuid
      AND channel = 'webhook'
  `.execute(db);

  const counts = result.rows[0];
  const total = Number(counts?.total ?? 0);
  const positive = Number(counts?.positive ?? 0);
  const bounced = Number(counts?.bounced ?? 0);
  const pendingOrQueued = Number(counts?.pending_or_queued ?? 0);
  const retryableFailed = Number(counts?.retryable_failed ?? 0);

  if (total === 0 || positive === total) {
    await sql`
      UPDATE event.outbox
      SET    status       = 'completed',
             processed_at = now(),
             locked_at    = NULL,
             locked_by    = NULL,
             locked_until = NULL,
             last_error   = NULL
      WHERE  id = ${outboxEventId}::uuid
    `.execute(db);
    return;
  }

  if (bounced > 0) {
    await sql`
      UPDATE event.outbox
      SET    status       = 'dead_letter',
             processed_at = now(),
             locked_at    = NULL,
             locked_by    = NULL,
             locked_until = NULL,
             last_error   = 'One or more webhook deliveries reached terminal failure'
      WHERE  id = ${outboxEventId}::uuid
    `.execute(db);
    return;
  }

  if (pendingOrQueued > 0) return;

  if (retryableFailed > 0) {
    await sql`
      UPDATE event.outbox
      SET    status       = CASE WHEN attempts + 1 >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
             attempts     = attempts + 1,
             available_at = COALESCE(${counts?.next_retry_at}::timestamptz, now() + interval '30 seconds'),
             locked_at    = NULL,
             locked_by    = NULL,
             locked_until = NULL,
             last_error   = 'One or more webhook deliveries failed and are retryable'
      WHERE  id = ${outboxEventId}::uuid
    `.execute(db);
  }
}

export interface WebhookDeliveryWorkerResult {
  worker: Worker;
  queue: Queue;
}

export function createWebhookDeliveryWorker(
  db: Kysely<WebhookDatabase>,
  redis: ConnectionOptions,
  logger: JobLogger,
  runWithJobContext?: <T>(context: { tenantId?: string }, fn: () => T | Promise<T>) => Promise<T>,
): WebhookDeliveryWorkerResult {
  const runInTenant = async <T>(tenantId: string, fn: () => T | Promise<T>): Promise<T> =>
    runWithJobContext ? runWithJobContext({ tenantId }, fn) : Promise.resolve(fn());

  const workTenants = async (): Promise<string[]> => {
    const result = await sql<{ tenant_id: string }>`
      SELECT tenant_id::text FROM event.fn_notification_work_tenants('webhook', NULL, 1000)
    `.execute(db);
    return result.rows.map((row) => row.tenant_id);
  };
  const queue = new Queue<DeliverWebhookJobData | SweepJobData>(QUEUE_NAME.WEBHOOK_DELIVERY, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });

  void queue.upsertJobScheduler(
    SCHEDULER_ID.WEBHOOK_DELIVERY_SWEEP,
    { every: 30_000 },
    { name: JOB_NAME.SWEEP_WEBHOOKS, data: {} satisfies SweepJobData },
  );

  const worker = new Worker<DeliverWebhookJobData | SweepJobData>(
    QUEUE_NAME.WEBHOOK_DELIVERY,
    async (job: Job) => {
      switch (job.name) {
        case JOB_NAME.SWEEP_WEBHOOKS:
          for (const tenantId of await workTenants()) {
            await runInTenant(tenantId, () => sweepWebhooks(db, queue, tenantId, logger));
          }
          return;
        case JOB_NAME.DELIVER_WEBHOOK: {
          const data = job.data as DeliverWebhookJobData;
          return runInTenant(data.tenantId, () => deliverWebhook(db, data, logger));
        }
        default:
          logger.warn("webhook_delivery_unknown_job", { name: job.name });
      }
    },
    {
      connection: redis,
      concurrency: 10,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error("webhook_delivery_job_failed", {
      jobName: job?.name,
      jobId: job?.id,
      err: String(err),
    });
  });

  return { worker, queue };
}
