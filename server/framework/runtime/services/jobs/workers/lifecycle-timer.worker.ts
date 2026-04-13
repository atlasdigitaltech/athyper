/**
 * Lifecycle Timer Worker
 *
 * Queue: jobs:lifecycle-timers
 *
 * Two job names:
 *
 *   JOB_NAME.SWEEP  — runs every LIFECYCLE_TIMER_SWEEP_MS (default 60 s).
 *                     Scans event.lifecycle_timer_schedule WHERE status='scheduled'
 *                     AND fire_at <= now(). For each due timer enqueues a FIRE job
 *                     with jobId=`timer:{id}` so BullMQ deduplicates concurrent sweeps.
 *
 *   JOB_NAME.FIRE   — executes one timer action. Uses a single UPDATE...RETURNING to
 *                     atomically claim the row (status='fired') and read the payload,
 *                     avoiding a separate SELECT. If the timer was already fired or
 *                     cancelled (0 rows updated), the job exits early — idempotent.
 *
 *                     Actions:
 *                       reminder         → INSERT into event.notification_message
 *                       auto_transition
 *                       auto_close       → INSERT into event.outbox (topic='lifecycle')
 *                       auto_cancel        for the lifecycle event consumer
 *
 * Concurrency: 10 — fire jobs are short DB writes; sweep produces up to 200 jobs/run.
 */

import { Worker, Queue } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import {
  QUEUE_NAME,
  JOB_NAME,
  SYSTEM_ACTOR_ID,
  type FireTimerJobData,
  type SweepJobData,
  type JobLogger,
} from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

interface DueTimer {
  id:              string;
  tenant_id:       string;
  timer_type:      string;
  entity_name:     string;
  entity_id:       string;
  policy_snapshot: Record<string, unknown> | null;
}

// ─── Sweep ────────────────────────────────────────────────────────────────────

async function sweep(
  db: DB,
  queue: Queue<FireTimerJobData | SweepJobData>,
  logger?: JobLogger,
): Promise<void> {
  const BATCH = 200;

  const result = await sql<DueTimer>`
    SELECT id, tenant_id, timer_type, entity_name, entity_id, policy_snapshot
    FROM   event.lifecycle_timer_schedule
    WHERE  status  = 'scheduled'
      AND  fire_at <= now()
    ORDER  BY fire_at ASC
    LIMIT  ${BATCH}
  `.execute(db);

  if (result.rows.length === 0) return;

  await queue.addBulk(
    result.rows.map((row) => ({
      name: JOB_NAME.FIRE,
      data: {
        timerId:    row.id,
        tenantId:   row.tenant_id,
        timerType:  row.timer_type as FireTimerJobData["timerType"],
        entityName: row.entity_name,
        entityId:   row.entity_id,
      },
      opts: {
        jobId:            `timer:${row.id}`, // BullMQ dedup: skip if already queued
        attempts:         3,
        backoff:          { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 200 },
      },
    })),
  );

  logger?.info("lifecycle_timer_sweep", { found: result.rows.length });
}

// ─── Fire ─────────────────────────────────────────────────────────────────────

async function fire(db: DB, data: FireTimerJobData, logger?: JobLogger): Promise<void> {
  const { timerId, tenantId, timerType, entityName, entityId } = data;

  // Atomically claim the timer row: mark fired and read payload in one UPDATE...RETURNING.
  // If the timer was already fired or cancelled (0 rows), the job exits — idempotent.
  const claimed = await sql<{ policy_snapshot: Record<string, unknown> | null }>`
    UPDATE event.lifecycle_timer_schedule
    SET    status     = 'fired',
           updated_at = now(),
           job_id     = ${timerId}
    WHERE  id        = ${timerId}::uuid
      AND  tenant_id = ${tenantId}::uuid
      AND  status    = 'scheduled'
    RETURNING policy_snapshot
  `.execute(db);

  if (claimed.rows.length === 0) {
    logger?.info("lifecycle_timer_skip", { timerId, reason: "already_fired_or_cancelled" });
    return;
  }

  const snapshot     = (claimed.rows[0]!.policy_snapshot ?? {}) as Record<string, unknown>;
  const tplKey       = snapshot["message_template_key"] as string | undefined;
  const transitionTo = snapshot["transition_to"] as string | undefined;

  switch (timerType) {
    case "reminder":
      await insertNotification(db, { tenantId, entityName, entityId, tplKey });
      break;

    case "auto_transition":
    case "auto_close":
    case "auto_cancel": {
      const newState =
        timerType === "auto_transition" ? (transitionTo ?? "CLOSED")
        : timerType === "auto_close"   ? "CLOSED"
        :                                "CANCELLED";
      await insertLifecycleOutboxEvent(db, { tenantId, timerId, entityName, entityId, timerType, newState });
      break;
    }
  }

  logger?.info("lifecycle_timer_fired", { timerId, timerType, entityName, entityId });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function insertNotification(
  db: DB,
  opts: { tenantId: string; entityName: string; entityId: string; tplKey?: string },
): Promise<void> {
  if (!opts.tplKey) return;
  const { tenantId, entityName, entityId, tplKey } = opts;
  const payloadJson = JSON.stringify({ entityName, entityId });

  await sql`
    INSERT INTO event.notification_message
      (tenant_id,       event_id,             event_code,
       template_key,    template_version,     entity_type,
       payload,         status,               created_by)
    VALUES
      (${tenantId}::uuid, shared.uuidv7()::text, 'lifecycle.timer.reminder',
       ${tplKey},          1,                    ${entityName},
       ${payloadJson}::jsonb, 'pending',          ${SYSTEM_ACTOR_ID}::uuid)
  `.execute(db);
}

async function insertLifecycleOutboxEvent(
  db: DB,
  opts: {
    tenantId: string; timerId: string; entityName: string;
    entityId: string; timerType: string; newState: string;
  },
): Promise<void> {
  const { tenantId, timerId, entityName, entityId, timerType, newState } = opts;
  const payload = JSON.stringify({ timerId, entityName, entityId, newState, triggeredBy: "timer" });

  await sql`
    INSERT INTO event.outbox
      (tenant_id,        topic,       event_type,
       event_key,        aggregate_type, payload,          status,    created_by)
    VALUES
      (${tenantId}::uuid, 'lifecycle', ${"lifecycle." + timerType},
       ${timerId},         ${entityName},  ${payload}::jsonb, 'pending', ${SYSTEM_ACTOR_ID}::uuid)
  `.execute(db);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface LifecycleTimerWorkerDeps {
  db:         DB;
  queue:      Queue<FireTimerJobData | SweepJobData>;
  connection: ConnectionOptions;
  logger?:    JobLogger;
}

export function createLifecycleTimerWorker(deps: LifecycleTimerWorkerDeps): Worker {
  const { db, queue, connection, logger } = deps;

  return new Worker<FireTimerJobData | SweepJobData>(
    QUEUE_NAME.LIFECYCLE_TIMERS,
    async (job: Job) => {
      if (job.name === JOB_NAME.SWEEP)      await sweep(db, queue, logger);
      else if (job.name === JOB_NAME.FIRE)  await fire(db, job.data as FireTimerJobData, logger);
      else logger?.warn("lifecycle_timer_unknown_job", { name: job.name });
    },
    { connection, concurrency: 10 },
  );
}
