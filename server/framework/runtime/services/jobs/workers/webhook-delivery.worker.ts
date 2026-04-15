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
 *     Scans event.outbox WHERE status = 'pending' and claims each row.
 *     For each pending event, finds all active webhook subscriptions whose
 *     topics array contains the event's topic (or '*' for all-topics).
 *     Enqueues one `deliver-webhook` job per (event, subscription) pair
 *     with a dedupe key to prevent double-delivery on retry.
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Redis = any;
import { sql, type Kysely } from "kysely";
import {
  QUEUE_NAME, JOB_NAME, SCHEDULER_ID,
  type DeliverWebhookJobData, type SweepJobData, type JobLogger,
} from "../jobs.types.js";
import { buildWebhookHeaders } from "../../integration/webhook-signing.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const SWEEP_BATCH_SIZE   = 50;   // outbox rows per sweep
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_BYTES  = 1_024 * 1024; // 1 MiB hard cap per delivery

// ── Sweep ─────────────────────────────────────────────────────────────────────

async function sweepWebhooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  queue: Queue,
  logger: JobLogger,
): Promise<void> {
  // Claim a batch of pending outbox events (claim-and-lock pattern)
  const events = await db
    .selectFrom("event.outbox as o" as never)
    .select(["o.id" as never, "o.tenant_id" as never, "o.topic" as never])
    .where("o.status" as never, "=", "pending" as never)
    .where((eb: any) =>
      eb.or([
        eb("o.locked_until" as never, "is" as never, null as never),
        eb("o.locked_until" as never, "<" as never, new Date() as never),
      ])
    )
    .orderBy("o.created_at" as never, "asc")
    .limit(SWEEP_BATCH_SIZE)
    .execute() as Record<string, unknown>[];

  if (events.length === 0) return;

  for (const event of events) {
    const eventId  = event["id"]        as string;
    const tenantId = event["tenant_id"] as string;
    const topic    = event["topic"]     as string;

    // Find active subscriptions matching this topic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subs = await (db as any)
      .selectFrom("event.webhook_subscription as ws")
      .select(["ws.id", "ws.max_retries"])
      .where("ws.tenant_id", "=", tenantId)
      .where("ws.is_active", "=", true)
      .where((eb: any) =>
        // topics @> ARRAY[topic] OR topics @> ARRAY['*']
        eb.or([
          eb("ws.topics", "@>", JSON.stringify([topic])),
          eb("ws.topics", "@>", JSON.stringify(["*"])),
        ])
      )
      .execute() as Record<string, unknown>[];

    for (const sub of subs) {
      const subId    = sub["id"]          as string;
      const maxRetry = Number(sub["max_retries"] ?? 3);

      await queue.add(
        JOB_NAME.DELIVER_WEBHOOK,
        {
          outboxEventId:         eventId,
          webhookSubscriptionId: subId,
          tenantId,
          attemptNo:             1,
        } satisfies DeliverWebhookJobData,
        {
          jobId:    `wh-deliver:${eventId}:${subId}`,   // dedup key
          attempts: maxRetry,
          backoff:  { type: "exponential", delay: 2_000 },
          removeOnComplete: { count: 200 },
          removeOnFail:     { count: 500 },
        },
      );
    }

    // Claim the event so it isn't re-swept until lock expires (10 min)
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.updateTable("event.outbox") as any)
      .set({ locked_until: lockedUntil, status: "processing" })
      .where("id", "=", eventId)
      .execute();
  }

  logger.info("webhook_delivery_sweep_done", { swept: events.length });
}

// ── Deliver ───────────────────────────────────────────────────────────────────

async function deliverWebhook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  data: DeliverWebhookJobData,
  logger: JobLogger,
): Promise<void> {
  const { outboxEventId, webhookSubscriptionId, tenantId, attemptNo } = data;

  // Load event payload
  const eventRow = await db
    .selectFrom("event.outbox as o" as never)
    .select(["o.id" as never, "o.topic" as never, "o.payload" as never])
    .where("o.id" as never, "=", outboxEventId as never)
    .executeTakeFirst() as Record<string, unknown> | undefined;

  if (!eventRow) {
    logger.warn("webhook_deliver_event_not_found", { outboxEventId });
    return; // Event may have been purged — treat as success to stop retries
  }

  // Load subscription
  const subRow = await db
    .selectFrom("event.webhook_subscription as ws" as never)
    .select([
      "ws.id" as never,
      "ws.target_url" as never,
      "ws.signing_secret" as never,
      "ws.timeout_ms" as never,
      "ws.is_active" as never,
    ])
    .where("ws.id" as never, "=", webhookSubscriptionId as never)
    .where("ws.tenant_id" as never, "=", tenantId as never)
    .executeTakeFirst() as Record<string, unknown> | undefined;

  if (!subRow || !subRow["is_active"]) {
    logger.warn("webhook_deliver_sub_inactive", { webhookSubscriptionId });
    return; // Subscription deactivated after job was queued — skip silently
  }

  const targetUrl    = subRow["target_url"]    as string;
  const signingSecret = subRow["signing_secret"] as string | null;
  const timeoutMs    = Number(subRow["timeout_ms"] ?? DEFAULT_TIMEOUT_MS);
  const topic        = eventRow["topic"]        as string;
  const deliveryId   = `${outboxEventId}:${webhookSubscriptionId}:${attemptNo}`;

  // Build payload (cap at 1 MiB)
  const rawPayload = typeof eventRow["payload"] === "string"
    ? eventRow["payload"]
    : JSON.stringify(eventRow["payload"] ?? {});

  if (Buffer.byteLength(rawPayload, "utf8") > MAX_PAYLOAD_BYTES) {
    logger.warn("webhook_deliver_payload_too_large", { outboxEventId, bytes: Buffer.byteLength(rawPayload, "utf8") });
    return;
  }

  const headers = buildWebhookHeaders({
    topic,
    deliveryId,
    rawBody: rawPayload,
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

  // Record delivery
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
      created_by:     "00000000-0000-7000-a000-000000000001",
    } as never)
    .execute()
    .catch((e: unknown) => logger.warn("webhook_deliver_log_error", { err: String(e) }));

  // Update subscription stats
  if (succeeded) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.updateTable("event.webhook_subscription") as any)
      .set({
        last_delivery_at:     new Date(),
        last_delivery_status: "success",
        failure_count:        0,
        updated_at:           new Date(),
      })
      .where("id", "=", webhookSubscriptionId)
      .execute()
      .catch(() => {});
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.updateTable("event.webhook_subscription") as any)
      .set({
        last_delivery_at:     new Date(),
        last_delivery_status: "failure",
        failure_count:        sql`failure_count + 1`,
        updated_at:           new Date(),
      })
      .where("id", "=", webhookSubscriptionId)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  redis: Redis,
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
