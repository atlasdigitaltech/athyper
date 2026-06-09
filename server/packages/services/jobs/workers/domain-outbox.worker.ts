/**
 * Domain Outbox Worker
 *
 * Queue: jobs:domain-outbox
 *
 * Job names: "drain:{topic}" (constructed via drainJobName())
 *
 * Drains event.outbox WHERE topic = {topic} in batches using the same
 * claim-and-lock pattern as the IAM outbox worker (FOR UPDATE SKIP LOCKED).
 *
 * Topics handled:
 *   fin    — Finance domain events (balance updates, accrual triggers, etc.)
 *   wf     — Workflow webhook / callback events
 *   audit  — Audit log drain
 *
 * Per-topic handlers are plugged in via OutboxTopicHandler. Unhandled events
 * are acknowledged without processing — add a handler when domain logic is ready.
 *
 * Concurrency: 3 — one per active topic drain (fin / wf / audit run in parallel).
 */

import { Worker, Queue } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import {
  QUEUE_NAME,
  JOB_NAME,
  DRAIN_TOPICS,
  drainJobName,
  type DrainTopic,
  type DrainOutboxJobData,
  type DomainOutboxJobData,
  type JobLogger,
} from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

// ─── Topic handler interface ──────────────────────────────────────────────────

export interface OutboxEvent {
  id:           string;
  tenant_id:    string;
  topic:        string;
  event_type:   string | null;
  event_key:    string | null;
  entity_type:  string | null;
  entity_id:    string | null;
  aggregate_id: string | null;
  payload:      Record<string, unknown>;
  actor_id:     string | null;
}

export interface OutboxTopicHandler {
  /**
   * Process a single outbox event for this topic.
   * Must be idempotent — BullMQ provides at-least-once delivery.
   * Throw to put the event back to 'pending' with retry backoff.
   */
  handle(event: OutboxEvent): Promise<void>;
}

// ─── Drain ────────────────────────────────────────────────────────────────────

const LOCK_OWNER_PREFIX = `domain-outbox-${process.pid}`;
const BATCH_SIZE        = 50;
const RETRY_DELAY_MS    = 30_000;

async function drain(
  db:      DB,
  topic:   DrainTopic,
  handlers: Map<string, OutboxTopicHandler>,
  logger?: JobLogger,
): Promise<void> {
  const lockOwner = `${LOCK_OWNER_PREFIX}-${topic}`;

  const claimed = await sql<OutboxEvent>`
    UPDATE event.outbox
    SET    status    = 'processing',
           locked_at = now(),
           locked_by = ${lockOwner},
           locked_until = now() + interval '5 minutes',
           attempts  = attempts + 1
    WHERE  id IN (
      SELECT id
      FROM   event.outbox
      WHERE  topic        = ${topic}
        AND  status       = 'pending'
        AND  available_at <= now()
      ORDER  BY available_at ASC
      LIMIT  ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id, tenant_id, topic, event_type, event_key,
      entity_type, entity_id::text AS entity_id,
      aggregate_id::text AS aggregate_id,
      payload, actor_id::text AS actor_id
  `.execute(db);

  if (claimed.rows.length === 0) return;

  logger?.info("domain_outbox_batch_claimed", { topic, count: claimed.rows.length });

  const handler = handlers.get(topic);

  for (const event of claimed.rows) {
    if (!handler) {
      // No handler registered — release the lock and leave status 'pending' so the
      // event is not lost. It will retry on the next drain cycle.
      logger?.warn("domain_outbox_no_handler", { topic, eventType: event.event_type, id: event.id });
      await sql`
        UPDATE event.outbox
        SET    status    = 'pending',
               locked_at = NULL,
               locked_by = NULL,
               locked_until = NULL
        WHERE  id = ${event.id}::uuid
      `.execute(db);
      continue;
    }

    try {
      await handler.handle(event);

      await sql`
        UPDATE event.outbox
        SET    status       = 'completed',
               processed_at = now(),
               locked_at    = NULL,
               locked_by    = NULL,
               locked_until = NULL
        WHERE  id = ${event.id}::uuid
      `.execute(db);
    } catch (err) {
      logger?.error("domain_outbox_event_error", { topic, id: event.id, err: String(err) });

      await sql`
        UPDATE event.outbox
        SET    status       = 'pending',
               available_at = ${new Date(Date.now() + RETRY_DELAY_MS).toISOString()},
               locked_at    = NULL,
               locked_by    = NULL,
               locked_until = NULL,
               last_error   = ${String(err).slice(0, 500)}
        WHERE  id = ${event.id}::uuid
      `.execute(db);
    }
  }

  logger?.info("domain_outbox_batch_done", { topic, processed: claimed.rows.length });
}

// ─── Purge ────────────────────────────────────────────────────────────────────
// Batch-deletes completed event.outbox rows older than the retention window via
// event.fn_outbox_purge_completed(). The SQL function defaults (7 days, 1000
// rows/batch) are intentionally used — retention policy lives with the schema,
// not the worker. Loops until a batch deletes fewer than MAX_BATCH, bounded by
// MAX_ITERATIONS to avoid monopolising the worker on a pathological backlog.

const PURGE_MAX_ITERATIONS = 10;

async function purge(db: DB, logger?: JobLogger): Promise<void> {
  let totalDeleted = 0;
  for (let i = 0; i < PURGE_MAX_ITERATIONS; i++) {
    const result = await sql<{ fn_outbox_purge_completed: number }>`
      SELECT event.fn_outbox_purge_completed() AS fn_outbox_purge_completed
    `.execute(db);
    const deleted = result.rows[0]?.fn_outbox_purge_completed ?? 0;
    totalDeleted += deleted;
    if (deleted === 0) break;
  }
  logger?.info("domain_outbox_purge_done", { totalDeleted });
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface DomainOutboxWorkerDeps {
  db:            DB;
  queue:         Queue<DomainOutboxJobData>;
  connection:    ConnectionOptions;
  /**
  * Per-topic event handlers. Register a handler for 'fin', 'wf', 'audit',
  * 'search', or 'lifecycle'.
   * Unregistered topics are acknowledged without processing.
   */
  topicHandlers?: Map<string, OutboxTopicHandler>;
  logger?:       JobLogger;
}

export function createDomainOutboxWorker(deps: DomainOutboxWorkerDeps): Worker {
  const { db, connection, logger } = deps;
  const handlers = deps.topicHandlers ?? new Map<string, OutboxTopicHandler>();

  return new Worker<DomainOutboxJobData>(
    QUEUE_NAME.DOMAIN_OUTBOX,
    async (job: Job<DomainOutboxJobData>) => {
      if (job.name === JOB_NAME.OUTBOX_PURGE) {
        await purge(db, logger);
        return;
      }

      const topic = (job.data as DrainOutboxJobData).topic;

      if (!DRAIN_TOPICS.includes(topic)) {
        logger?.warn("domain_outbox_unknown_topic", { topic, jobId: job.id });
        return;
      }

      await drain(db, topic, handlers, logger);
    },
    {
      connection,
      concurrency: 5, // one per active topic drain
    },
  );
}
