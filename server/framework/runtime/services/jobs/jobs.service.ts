/**
 * Jobs Service — main factory
 *
 * Creates all BullMQ queues, attaches repeatable schedulers, and starts
 * all workers. Returns a { start, stop, queues } handle for lifecycle
 * management and the admin API.
 *
 * Usage in app.ts:
 *
 *   const jobs = createJobsService({ db: dbAdapter.kysely, redisUrl, logger });
 *   await jobs.start();
 *   lifecycle.onShutdown(() => jobs.stop());
 *
 * The `queues` map is exposed so the admin API can call .getJobCounts(),
 * .pause(), .resume(), and .getFailedJobs() on each queue.
 */

import { Queue, Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { sql, type Kysely } from "kysely";
import { cronRegistry } from "../../../../src/foundation/jobs/cron-registry.js";
import {
  QUEUE_NAME,
  JOB_NAME,
  SCHEDULER_ID,
  DEFAULT_INTERVALS,
  DRAIN_TOPICS,
  drainJobName,
  type SweepJobData,
  type FireTimerJobData,
  type SendNotificationJobData,
  type DrainOutboxJobData,
  type SlaCheckJobData,
  type DigestFlushJobData,
  type ProviderHealthJobData,
  type JobLogger,
} from "./jobs.types.js";
import { createLifecycleTimerWorker } from "./workers/lifecycle-timer.worker.js";
import { createNotificationWorker, type NotificationChannelHandler } from "./workers/notification.worker.js";
import { createDomainOutboxWorker, type OutboxTopicHandler } from "./workers/domain-outbox.worker.js";
import { createSlaCheckWorker } from "./workers/sla-check.worker.js";
import { createImportWorker, type ImportObjectStorage } from "./workers/import.worker.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface JobsServiceOptions {
  /** Milliseconds between lifecycle timer sweeps (default: 60 000) */
  lifecycleTimerSweepMs?: number;
  /** Milliseconds between notification sweeps (default: 300 000) */
  notificationSweepMs?: number;
  /** Milliseconds between domain outbox drain sweeps (default: 30 000) */
  domainOutboxDrainMs?: number;
  /** Milliseconds between SLA breach checks (default: 300 000) */
  slaBreachCheckMs?: number;
  /** Milliseconds between hourly digest flushes (default: 3 600 000) */
  notificationDigestHourlyMs?: number;
  /** Milliseconds between daily digest flushes (default: 86 400 000) */
  notificationDigestDailyMs?: number;
  /** Milliseconds between weekly digest flushes (default: 604 800 000) */
  notificationDigestWeeklyMs?: number;
  /** Milliseconds between provider health checks (default: 900 000) */
  notificationProviderHealthMs?: number;
}

export interface JobsServiceDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: DB;
  /** Full Redis URL: redis://:password@host:port/db */
  redisUrl: string;
  logger?: JobLogger;
  options?: JobsServiceOptions;
  /**
   * Per-channel notification dispatch handlers.
   * Keys: 'email' | 'in_app' | 'webhook' | 'sms'
   */
  channelHandlers?: Map<string, NotificationChannelHandler>;
  /**
   * Per-topic outbox event handlers.
   * Keys: 'fin' | 'wf' | 'audit'
   */
  topicHandlers?: Map<string, OutboxTopicHandler>;
  /** Object storage adapter for import file downloads. Optional — import worker inactive if absent. */
  objectStorage?: ImportObjectStorage;
}

// ─── Redis URL parser ─────────────────────────────────────────────────────────

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host:     u.hostname,
    port:     parseInt(u.port || "6379", 10),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db:       parseInt(u.pathname.replace(/^\//, "") || "0", 10),
  };
}

// ─── Queue name → queues key resolution ──────────────────────────────────────
// Maps BullMQ queue name strings (used in cron_schedule.target_queue and
// CronEntry.queue) to the JobsQueues property key.

const QUEUE_NAME_TO_KEY: Record<string, keyof JobsQueues> = {
  [QUEUE_NAME.LIFECYCLE_TIMERS]: "lifecycleTimers",
  [QUEUE_NAME.NOTIFICATIONS]:    "notifications",
  [QUEUE_NAME.DOMAIN_OUTBOX]:    "domainOutbox",
  [QUEUE_NAME.SLA_CHECK]:        "slaCheck",
  [QUEUE_NAME.IMPORT]:           "import",
};

// ─── Exported queue map type ──────────────────────────────────────────────────

export interface JobsQueues {
  lifecycleTimers: Queue<FireTimerJobData | SweepJobData>;
  notifications:   Queue<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>;
  domainOutbox:    Queue<DrainOutboxJobData>;
  slaCheck:        Queue<SlaCheckJobData>;
  import:          Queue;
}

// ─── Service factory ──────────────────────────────────────────────────────────

export interface JobsService {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly queues: JobsQueues;
  readonly isRunning: boolean;
}

export function createJobsService(deps: JobsServiceDeps): JobsService {
  const {
    db,
    redisUrl,
    logger,
    channelHandlers,
    topicHandlers,
    objectStorage,
    options = {},
  } = deps;

  const {
    lifecycleTimerSweepMs        = DEFAULT_INTERVALS.LIFECYCLE_TIMER_SWEEP_MS,
    notificationSweepMs          = DEFAULT_INTERVALS.NOTIFICATION_SWEEP_MS,
    domainOutboxDrainMs          = DEFAULT_INTERVALS.DOMAIN_OUTBOX_DRAIN_MS,
    slaBreachCheckMs             = DEFAULT_INTERVALS.SLA_BREACH_CHECK_MS,
    notificationDigestHourlyMs   = DEFAULT_INTERVALS.NOTIFICATION_DIGEST_HOURLY_MS,
    notificationDigestDailyMs    = DEFAULT_INTERVALS.NOTIFICATION_DIGEST_DAILY_MS,
    notificationDigestWeeklyMs   = DEFAULT_INTERVALS.NOTIFICATION_DIGEST_WEEKLY_MS,
    notificationProviderHealthMs = DEFAULT_INTERVALS.NOTIFICATION_PROVIDER_HEALTH_MS,
  } = options;

  // BullMQ recommends separate IORedis connections per Queue/Worker.
  // Passing ConnectionOptions (not an existing IORedis instance) causes BullMQ
  // to create a fresh connection per object — safe and correct.
  const conn = parseRedisUrl(redisUrl);

  // ── Queues (producers) ───────────────────────────────────────────────────

  const queues: JobsQueues = {
    lifecycleTimers: new Queue(QUEUE_NAME.LIFECYCLE_TIMERS, { connection: conn }),
    notifications:   new Queue(QUEUE_NAME.NOTIFICATIONS,    { connection: conn }),
    domainOutbox:    new Queue(QUEUE_NAME.DOMAIN_OUTBOX,    { connection: conn }),
    slaCheck:        new Queue(QUEUE_NAME.SLA_CHECK,        { connection: conn }),
    import:          new Queue(QUEUE_NAME.IMPORT,           { connection: conn }),
  };

  // ── Workers (consumers) ──────────────────────────────────────────────────

  const workers: Worker[] = [
    createLifecycleTimerWorker({
      db,
      queue:      queues.lifecycleTimers,
      connection: conn,
      logger,
    }),
    createNotificationWorker({
      db,
      queue:           queues.notifications,
      connection:      conn,
      channelHandlers,
      logger,
    }),
    createDomainOutboxWorker({
      db,
      queue:         queues.domainOutbox,
      connection:    conn,
      topicHandlers,
      logger,
    }),
    createSlaCheckWorker({
      db,
      connection: conn,
      logger,
    }),
    ...(objectStorage ? [createImportWorker({ db, objectStorage, connection: conn, logger })] : []),
  ];

  // ── Error handlers on workers ────────────────────────────────────────────

  for (const w of workers) {
    w.on("error", (err) => {
      logger?.error("jobs_worker_error", {
        queue: w.name,
        err:   err instanceof Error ? err.message : String(err),
      });
    });
    w.on("failed", (job, err) => {
      logger?.error("jobs_job_failed", {
        queue:    w.name,
        jobId:    job?.id,
        jobName:  job?.name,
        attempts: job?.attemptsMade,
        err:      err instanceof Error ? err.message : String(err),
      });
    });
  }

  let running = false;

  // ── Public interface ─────────────────────────────────────────────────────

  return {
    get isRunning() { return running; },
    queues,

    async start(): Promise<void> {
      if (running) return;
      running = true;

      // ── Lifecycle timer sweep ────────────────────────────────────────────
      await queues.lifecycleTimers.upsertJobScheduler(
        SCHEDULER_ID.LIFECYCLE_TIMER_SWEEP,
        { every: lifecycleTimerSweepMs },
        { name: JOB_NAME.SWEEP, data: {} as Record<string, never> },
      );

      // ── Notification sweep ───────────────────────────────────────────────
      await queues.notifications.upsertJobScheduler(
        SCHEDULER_ID.NOTIFICATION_SWEEP,
        { every: notificationSweepMs },
        { name: JOB_NAME.SWEEP, data: {} as Record<string, never> },
      );

      // ── Domain outbox drain (one scheduler per topic) ────────────────────
      for (const topic of DRAIN_TOPICS) {
        await queues.domainOutbox.upsertJobScheduler(
          `${SCHEDULER_ID.DOMAIN_OUTBOX_DRAIN}:${topic}`,
          { every: domainOutboxDrainMs },
          {
            name: drainJobName(topic),
            data: { topic } satisfies DrainOutboxJobData,
          },
        );
      }

      // ── SLA breach check ─────────────────────────────────────────────────
      await queues.slaCheck.upsertJobScheduler(
        SCHEDULER_ID.SLA_BREACH_CHECK,
        { every: slaBreachCheckMs },
        { name: JOB_NAME.CHECK, data: {} as Record<string, never> },
      );

      // ── Notification digest flushes (one scheduler per frequency) ────────
      for (const [schedulerId, every, frequency] of [
        [SCHEDULER_ID.NOTIFICATION_DIGEST_HOURLY,  notificationDigestHourlyMs,  "hourly_digest"],
        [SCHEDULER_ID.NOTIFICATION_DIGEST_DAILY,   notificationDigestDailyMs,   "daily_digest"],
        [SCHEDULER_ID.NOTIFICATION_DIGEST_WEEKLY,  notificationDigestWeeklyMs,  "weekly_digest"],
      ] as [string, number, DigestFlushJobData["frequency"]][]) {
        await queues.notifications.upsertJobScheduler(
          schedulerId,
          { every },
          {
            name: JOB_NAME.DIGEST_FLUSH,
            data: { frequency } satisfies DigestFlushJobData,
          },
        );
      }

      // ── Notification provider health check ───────────────────────────────
      await queues.notifications.upsertJobScheduler(
        SCHEDULER_ID.NOTIFICATION_PROVIDER_HEALTH,
        { every: notificationProviderHealthMs },
        { name: JOB_NAME.PROVIDER_HEALTH, data: {} satisfies ProviderHealthJobData },
      );

      // ── Code-based CronRegistry entries ──────────────────────────────────
      // Modules call cronRegistry.register() before start(); we apply them here.
      // upsertJobScheduler is idempotent — safe to call from every instance.
      for (const entry of cronRegistry.list()) {
        const queueKey = QUEUE_NAME_TO_KEY[entry.queue];
        if (!queueKey) {
          logger?.error("jobs_cron_registry_unknown_queue", { queue: entry.queue, name: entry.name });
          continue;
        }
        const schedule = entry.cron
          ? { pattern: entry.cron }
          : { every: entry.intervalMs! };
        await queues[queueKey].upsertJobScheduler(
          entry.schedulerId,
          schedule,
          { name: entry.jobName, data: entry.data ?? {} },
        );
        logger?.info("jobs_cron_registry_wired", { schedulerId: entry.schedulerId, queue: entry.queue });
      }

      // ── DB-driven cron schedules (control.cron_schedule) ─────────────────
      // Rows with is_enabled=true whose effective window covers now() are
      // loaded and registered as BullMQ repeatable jobs. Runtime admins can
      // add/edit rows in the UI without restarting the process (the scheduler
      // calls this path again via periodic reload — see recoverDbSchedules).
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dbSchedules = await (db as any)
          .selectFrom("control.cron_schedule as cs")
          .select([
            "cs.code", "cs.name", "cs.handler_type",
            "cs.cron_expression", "cs.timezone",
            "cs.target_queue", "cs.payload_template",
          ])
          .where("cs.is_enabled" as never, "=", true as never)
          .where(sql`(cs.effective_from IS NULL OR cs.effective_from <= now())`)
          .where(sql`(cs.effective_until IS NULL OR cs.effective_until > now())`)
          .execute() as Array<{
            code: string; name: string; handler_type: string;
            cron_expression: string; timezone: string;
            target_queue: string; payload_template: Record<string, unknown>;
          }>;

        for (const cs of dbSchedules) {
          const queueKey = QUEUE_NAME_TO_KEY[cs.target_queue];
          if (!queueKey) {
            logger?.error("jobs_db_schedule_unknown_queue", { code: cs.code, queue: cs.target_queue });
            continue;
          }
          // Code-registry entries take precedence — skip if same scheduler ID exists
          const dbSchedulerId = `sched:db:${cs.code}`;
          await queues[queueKey].upsertJobScheduler(
            dbSchedulerId,
            { pattern: cs.cron_expression, tz: cs.timezone },
            { name: cs.handler_type, data: cs.payload_template ?? {} },
          );
          logger?.info("jobs_db_schedule_wired", { schedulerId: dbSchedulerId, queue: cs.target_queue, code: cs.code });
        }
      } catch (err) {
        // DB unavailable at start — not fatal; schedules will be absent until next reload
        logger?.error("jobs_db_schedules_load_failed", { err: String(err) });
      }

      logger?.info("jobs_service_started", {
        queues:                      Object.keys(queues),
        lifecycleTimerSweepMs,
        notificationSweepMs,
        domainOutboxDrainMs,
        slaBreachCheckMs,
        notificationDigestHourlyMs,
        notificationDigestDailyMs,
        notificationDigestWeeklyMs,
        notificationProviderHealthMs,
      });
    },

    async stop(): Promise<void> {
      if (!running) return;
      running = false;

      // Close workers first (drain in-flight jobs), then queues
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all(Object.values(queues).map((q) => q.close()));

      logger?.info("jobs_service_stopped", {});
    },
  };
}
