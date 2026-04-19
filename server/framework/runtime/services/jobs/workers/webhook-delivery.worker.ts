/**
 * Webhook Delivery Worker — Sprint 30
 *
 * Fans out pending event.outbox rows to matching event.webhook_subscription
 * records, signs each delivery with HMAC-SHA256, and records the outcome in
 * event.notification_delivery.
 *
 * Two job types on the WEBHOOK_DELIVERY queue:
 *
 *   sweep-webhooks  (scheduled every 30 s)
 *     Atomically claims a batch of pending outbox events via
 *     UPDATE...RETURNING FOR UPDATE SKIP LOCKED (prevents concurrent
 *     worker double-claim).  For each event, finds all active webhook
 *     subscriptions matching its topic, enqueues one `deliver-webhook`
 *     job per (event, subscription) pair, then marks the outbox event
 *     'completed'.  The event lifecycle lives here; individual delivery
 *     outcomes are tracked in event.notification_delivery.
 *
 *   deliver-webhook  (enqueued by sweep)
 *     Loads the outbox event payload + subscription target URL / secret.
 *     Signs with HMAC-SHA256 via buildWebhookHeaders() if signing_secret set.
 *     POSTs to target_url with configurable timeout.
 *     On success: marks the event segment as 'delivered' in notification_delivery;
 *       increments subscription.last_delivery_at.
 *     On failure: records error; increments subscription.failure_count;
 *       re-throws so BullMQ can retry (exponential backoff from queue config).
 */

import { Worker, Queue, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { sql, type Kysely } from "kysely";
import type { DB } from "@athyper/adapter-db";
import {
  QUEUE_NAME, JOB_NAME, SCHEDULER_ID, SYSTEM_ACTOR_ID,
  type DeliverWebhookJobData, type SweepJobData, type JobLogger,
} from "../jobs.types.js";
import { buildWebhookHeaders } from "../../integration/webhook-signing.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const SWEEP_BATCH_SIZE   = 50;   // outbox rows per sweep
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_BYTES  = 1_024 * 1024; // 1 MiB hard cap per delivery
const LOCK_DURATION_MS   = 10 * 60 * 1000; // 10-min sweep lock

// ── Claimed event shape returned by the atomic claim SQL ──────────────────────

interface ClaimedEvent {
  id:        string;
  tenant_id: string;
  topic:     string;
}

// ── Sweep ─────────────────────────────────────────────────────────────────────

async function sweepWebhooks(
  db: Kysely<DB>,
  queue: Queue,
  logger: JobLogger,
): Promise<void> {
  const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);

  // Atomic claim: UPDATE...RETURNING with FOR UPDATE SKIP LOCKED prevents
  // two concurrent sweeps from claiming the same event.
  const { rows: events } = await sql<ClaimedEvent>`
    UPDATE event.outbox
    SET    status       = 'processing',
           locked_at    = now(),
           locked_by    = 'webhook-delivery-worker',
           locked_until = ${lockedUntil.toISOString()}::timestamptz,
           attempts     = attempts + 1
    WHERE  id IN (
      SELECT id FROM event.outbox
      WHERE  status = 'pending'
        AND  (locked_until IS NULL OR locked_until < now())
      ORDER  BY created_at ASC
      LIMIT  ${SWEEP_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tenant_id, topic
  `.execute(db);

  if (events.length === 0) return;

  for (const event of events) {
    const { id: eventId, tenant_id: tenantId, topic } = event;

    // Find active subscriptions matching this topic
    const subs = await db
      .selectFrom("event.webhook_subscription as ws" as never)
      .select(["ws.id" as never, "ws.max_retries" as never])
      .where("ws.tenant_id" as never, "=", tenantId as never)
      .where("ws.is_active" as never, "=", true as never)
      .where(() =>
        // topics @> ARRAY[topic] OR topics @> ARRAY['*']
        sql`ws.topics @> ARRAY[${topic}]::text[] OR ws.topics @> ARRAY['*']::text[]`
      )
      .execute() as Array<{ id: string; max_retries: number | null }>;

    for (const sub of subs) {
      const maxRetry = Number(sub.max_retries ?? 3);

      await queue.add(
        JOB_NAME.DELIVER_WEBHOOK,
        {
          outboxEventId:         eventId,
          webhookSubscriptionId: sub.id,
          tenantId,
          attemptNo:             1,
        } satisfies DeliverWebhookJobData,
        {
          jobId:    `wh-deliver:${eventId}:${sub.id}`,   // dedup key
          attempts: maxRetry,
          backoff:  { type: "exponential", delay: 2_000 },
          removeOnComplete: { count: 200 },
          removeOnFail:     { count: 500 },
        },
      );
    }

    // Mark event completed after all delivery jobs are enqueued.
    // Individual delivery outcomes are tracked in notification_delivery.
    await sql`
      UPDATE event.outbox
      SET    status       = 'completed',
             processed_at = now(),
             locked_at    = NULL,
             locked_by    = NULL,
             locked_until = NULL
      WHERE  id = ${eventId}::uuid
    `.execute(db);
  }

  logger.info("webhook_delivery_sweep_done", { swept: events.length });
}

// ── Deliver ───────────────────────────────────────────────────────────────────

async function deliverWebhook(
  db: Kysely<DB>,
  data: DeliverWebhookJobData,
  logger: JobLogger,
): Promise<void> {
  const { outboxEventId, webhookSubscriptionId, tenantId, attemptNo } = data;

  // Load event payload
  const eventRow = await db
    .selectFrom("event.outbox as o" as never)
    .select(["o.id" as never, "o.topic" as never, "o.payload" as never])
    .where("o.id" as never, "=", outboxEventId as never)
    .executeTakeFirst() as { id: string; topic: string; payload: unknown } | undefined;

  if (!eventRow) {
    logger.warn("webhook_deliver_event_not_found", { outboxEventId });
    return; // Event may have been purged — treat as success to stop retries
  }

  // Load subscription
  const subRow = await db
    .selectFrom("event.webhook_subscription as ws" as never)
    .select([
      "ws.id"             as never,
      "ws.target_url"     as never,
      "ws.signing_secret" as never,
      "ws.timeout_ms"     as never,
      "ws.is_active"      as never,
    ])
    .where("ws.id" as never, "=", webhookSubscriptionId as never)
    .where("ws.tenant_id" as never, "=", tenantId as never)
    .executeTakeFirst() as {
      id: string;
      target_url: string;
      signing_secret: string | null;
      timeout_ms: number | null;
      is_active: boolean;
    } | undefined;

  if (!subRow?.is_active) {
    logger.warn("webhook_deliver_sub_inactive", { webhookSubscriptionId });
    return; // Subscription deactivated after job was queued — skip silently
  }

  const { target_url: targetUrl, signing_secret: signingSecret, timeout_ms } = subRow;
  const timeoutMs  = Number(timeout_ms ?? DEFAULT_TIMEOUT_MS);
  const topic      = eventRow.topic;
  const deliveryId = `${outboxEventId}:${webhookSubscriptionId}:${attemptNo}`;

  // Build payload (cap at 1 MiB)
  const rawPayload = typeof eventRow.payload === "string"
    ? eventRow.payload
    : JSON.stringify(eventRow.payload ?? {});

  if (Buffer.byteLength(rawPayload, "utf8") > MAX_PAYLOAD_BYTES) {
    logger.warn("webhook_deliver_payload_too_large", { outboxEventId, bytes: Buffer.byteLength(rawPayload, "utf8") });
    return;
  }

  const headers = buildWebhookHeaders({
    topic,
    deliveryId,
    rawBody:       rawPayload,
    signingSecret,
  });

  const startMs = Date.now();
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const response = await fetch(targetUrl, {
        method:  "POST",
        headers,
        body:    rawPayload,
        signal:  ac.signal,
      });
      httpStatus = response.status;
      if (!response.ok) {
        errorMessage = `HTTP ${response.status} ${response.statusText}`;
      }
    } finally {
      clearTimeout(tid);
    }
  } catch (err) {
    errorMessage = String(err);
  }

  const durationMs = Date.now() - startMs;
  const succeeded  = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;

  // Record delivery outcome
  await db
    .insertInto("event.notification_delivery" as never)
    .values({
      tenant_id:      tenantId,
      channel:        "webhook",
      channel_detail: JSON.stringify({ targetUrl, subscriptionId: webhookSubscriptionId }),
      status:         succeeded ? "delivered" : "failed",
      attempt_no:     attemptNo,
      http_status:    httpStatus,
      duration_ms:    durationMs,
      error_message:  errorMessage,
      metadata:       JSON.stringify({ outboxEventId, topic, deliveryId }),
      created_at:     new Date(),
      created_by:     SYSTEM_ACTOR_ID,
    } as never)
    .execute()
    .catch((e: unknown) => logger.warn("webhook_deliver_log_error", { err: String(e) }));

  // Update subscription stats
  if (succeeded) {
    await db
      .updateTable("event.webhook_subscription" as never)
      .set({
        last_delivery_at:     new Date(),
        last_delivery_status: "success",
        failure_count:        0,
        updated_at:           new Date(),
      } as never)
      .where("id" as never, "=", webhookSubscriptionId as never)
      .execute()
      .catch(() => {});
  } else {
    await db
      .updateTable("event.webhook_subscription" as never)
      .set({
        last_delivery_at:     new Date(),
        last_delivery_status: "failure",
        failure_count:        sql`failure_count + 1`,
        updated_at:           new Date(),
      } as never)
      .where("id" as never, "=", webhookSubscriptionId as never)
      .execute()
      .catch(() => {});

    // Re-throw so BullMQ retries with backoff
    throw new Error(`Webhook delivery failed: ${errorMessage}`);
  }

  logger.info("webhook_delivered", {
    outboxEventId,
    webhookSubscriptionId,
    durationMs,
    httpStatus,
  });
}

// ── Worker factory ────────────────────────────────────────────────────────────

export interface WebhookDeliveryWorkerResult {
  worker: Worker;
  queue:  Queue;
}

export function createWebhookDeliveryWorker(
  db: Kysely<DB>,
  redis: ConnectionOptions,
  logger: JobLogger,
): WebhookDeliveryWorkerResult {
  const queue = new Queue(QUEUE_NAME.WEBHOOK_DELIVERY, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 200 },
      removeOnFail:     { count: 500 },
    },
  });

  // Register scheduled sweep
  void queue.upsertJobScheduler(
    SCHEDULER_ID.WEBHOOK_DELIVERY_SWEEP,
    { every: 30_000 },   // every 30 seconds
    { name: JOB_NAME.SWEEP_WEBHOOKS, data: {} satisfies SweepJobData },
  );

  const worker = new Worker<DeliverWebhookJobData | SweepJobData>(
    QUEUE_NAME.WEBHOOK_DELIVERY,
    async (job: Job) => {
      switch (job.name) {
        case JOB_NAME.SWEEP_WEBHOOKS:
          return sweepWebhooks(db, queue, logger);

        case JOB_NAME.DELIVER_WEBHOOK:
          return deliverWebhook(db, job.data as DeliverWebhookJobData, logger);

        default:
          logger.warn("webhook_delivery_unknown_job", { name: job.name });
      }
    },
    {
      connection:  redis,
      concurrency: 10,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error("webhook_delivery_job_failed", {
      jobName: job?.name,
      jobId:   job?.id,
      err:     String(err),
    });
  });

  return { worker, queue };
}
