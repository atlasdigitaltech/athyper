/**
 * Lifecycle Timer Worker
 *
 * Queue: jobs:lifecycle-timers
 *
 * Two job names:
 *
 *   JOB_NAME.SWEEP  â€” runs every LIFECYCLE_TIMER_SWEEP_MS (default 60 s).
 *                     Scans event.lifecycle_timer_schedule WHERE status='scheduled'
 *                     AND fire_at <= now(). For each due timer enqueues a FIRE job
 *                     with jobId=`timer:{id}` so BullMQ deduplicates concurrent sweeps.
 *
 *   JOB_NAME.FIRE   â€” executes one timer action. Uses a single UPDATE...RETURNING to
 *                     atomically claim the row (status='fired') and read the payload,
 *                     avoiding a separate SELECT. If the timer was already fired or
 *                     cancelled (0 rows updated), the job exits early â€” idempotent.
 *
 *                     Actions:
 *                       reminder         â†’ INSERT into event.notification_message
 *                       auto_transition
 *                       auto_close       â†’ INSERT into event.outbox (topic='lifecycle')
 *                       auto_cancel        for the lifecycle event consumer
 *
 * Concurrency: 10 â€” fire jobs are short DB writes; sweep produces up to 200 jobs/run.
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
  type OrphanCleanupJobData,
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

// â”€â”€â”€ Sweep â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function sweep(
  db: DB,
  queue: Queue<FireTimerJobData | SweepJobData | OrphanCleanupJobData>,
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

// â”€â”€â”€ Fire â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fire(db: DB, data: FireTimerJobData, logger?: JobLogger): Promise<void> {
  const { timerId, tenantId, timerType, entityName, entityId } = data;

  // Atomically claim the timer row: mark fired and read payload in one UPDATE...RETURNING.
  // If the timer was already fired or cancelled (0 rows), the job exits â€” idempotent.
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

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function insertNotification(
  db: DB,
  opts: { tenantId: string; entityName: string; entityId: string; tplKey?: string },
): Promise<void> {
  if (!opts.tplKey) return;
  const { tenantId, entityName, entityId, tplKey } = opts;
  const payloadJson = JSON.stringify({ entityName, entityId });

  await sql`
    INSERT INTO event.notification_message
      (tenant_id,       plane_key,            event_id,             event_code,
       template_key,    template_version,     entity_type,
       payload,         status,               created_by)
    VALUES
      (${tenantId}::uuid, 'neon',               shared.uuidv7()::text, 'lifecycle.timer.reminder',
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

// â”€â”€â”€ Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


type OrphanCleanupCandidate = {
  attachmentId: string;
  tenantId: string;
  storageKey: string | null;
  status: "quarantined" | "failed";
  scanAttempts: number | null;
};

const ORPHAN_CLEANUP_BATCH_SIZE = 100;
const ORPHAN_CLEANUP_GRACE_HOURS = 1;
const SCAN_RETRY_EXHAUSTED = 3;

async function cleanOrphans(args: {
  db: DB;
  attachmentStorage?: {
    delete: (key: string) => Promise<void>;
  };
  logger?: JobLogger;
}): Promise<void> {
  const { db, attachmentStorage, logger } = args;

  const rows = await sql<OrphanCleanupCandidate>`
    SELECT
      a.id AS "attachmentId",
      a.tenant_id AS "tenantId",
      a.storage_key AS "storageKey",
      a.status AS "status",
      (a.metadata -> 'scan' ->> 'attempts')::int AS "scanAttempts"
    FROM master.attachment AS a
    WHERE a.status IN ('quarantined', 'failed')
      AND COALESCE(a.reference_count, 0) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM master.entity_document_link AS l
        WHERE l.attachment_id = a.id
          AND l.tenant_id = a.tenant_id
      )
      AND COALESCE(a.status_changed_at, a.created_at, now()) < (now() - interval '${ORPHAN_CLEANUP_GRACE_HOURS} hours')
      AND (
        a.text_extraction_status = 'failed'
        OR a.metadata IS NULL
        OR a.metadata = '{}'::jsonb
        OR a.metadata -> 'scan' IS NULL
        OR COALESCE((a.metadata -> 'scan' ->> 'attempts')::int, 0) >= ${SCAN_RETRY_EXHAUSTED}
      )
    ORDER BY COALESCE(a.status_changed_at, a.created_at, now()) ASC
    LIMIT ${ORPHAN_CLEANUP_BATCH_SIZE}
  `.execute(db);

  if (rows.rows.length === 0) {
    logger?.info("lifecycle_orphan_cleanup_noop", {});
    return;
  }

  for (const row of rows.rows) {
    const updated = await sql<{ attachment_id: string }>`
      UPDATE master.attachment
      SET status            = 'orphaned',
          status_changed_at  = now(),
          status_changed_by  = ${SYSTEM_ACTOR_ID}::uuid,
          is_active         = false,
          updated_at         = now()
      WHERE id = ${row.attachmentId}::uuid
        AND tenant_id = ${row.tenantId}::uuid
        AND status IN ('quarantined', 'failed')
      RETURNING id
    `.execute(db);

    if (updated.rows.length === 0) continue;

    logger?.warn("lifecycle_attachment_marked_orphan", {
      attachmentId: row.attachmentId,
      tenantId: row.tenantId,
      status: row.status,
      scanAttempts: row.scanAttempts,
    });

    if (!attachmentStorage || !row.storageKey) {
      continue;
    }

    try {
      await attachmentStorage.delete(row.storageKey);
      logger?.info("lifecycle_orphan_attachment_object_deleted", {
        attachmentId: row.attachmentId,
        tenantId: row.tenantId,
      });
    } catch (err) {
      logger?.error("lifecycle_orphan_attachment_object_delete_failed", {
        attachmentId: row.attachmentId,
        tenantId: row.tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
export interface LifecycleTimerWorkerDeps {
  db:         DB;
  queue:      Queue<FireTimerJobData | SweepJobData | OrphanCleanupJobData>;
  connection: ConnectionOptions;
  attachmentStorage?: {
    delete: (key: string) => Promise<void>;
  };
  logger?:    JobLogger;
}

export function createLifecycleTimerWorker(deps: LifecycleTimerWorkerDeps): Worker {
  const { db, queue, connection, attachmentStorage, logger } = deps;

  return new Worker<FireTimerJobData | SweepJobData | OrphanCleanupJobData>(
    QUEUE_NAME.LIFECYCLE_TIMERS,
    async (job: Job) => {
      if (job.name === JOB_NAME.SWEEP)      await sweep(db, queue, logger);
      else if (job.name === JOB_NAME.FIRE)  await fire(db, job.data as FireTimerJobData, logger);
      else if (job.name === JOB_NAME.CLEAN_ORPHANS) await cleanOrphans({ db, attachmentStorage, logger });
      else logger?.warn("lifecycle_timer_unknown_job", { name: job.name });
    },
    { connection, concurrency: 10 },
  );
}
