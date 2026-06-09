/**
 * Jobs Service — main factory
 *
 * Creates all BullMQ queues, attaches repeatable schedulers, and starts
 * all workers. Returns a { start, stop, queues } handle for lifecycle
 * management and the admin API.
 *
 * Usage in app.ts:
 *
 *   const jobs = createJobsService({ db: dbAdapter.kysely, connection, logger });
 *   await jobs.start();
 *   lifecycle.onShutdown(() => jobs.stop());
 *
 * `connection` is a BullMQ ConnectionOptions built by bootstrap with
 * `maxRetriesPerRequest: null` (required for BullMQ Workers). Passed as a
 * plain object so BullMQ spawns a fresh ioredis connection per Queue / Worker
 * — this keeps job coordination isolated from the shared cache client
 * (auth JWKS, feature flags, OAuth2, IAM session cache).
 *
 * The `queues` map is exposed so the admin API can call .getJobCounts(),
 * .pause(), .resume(), and .getFailedJobs() on each queue.
 */

import { Queue, Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { sql, type Kysely } from "kysely";
import { cronRegistry } from "./cron-registry.js";
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
  type DomainOutboxJobData,
  type OutboxPurgeJobData,
  type SlaCheckJobData,
  type DigestFlushJobData,
  type ProviderHealthJobData,
  type KcSyncJobData,
  type JobLogger,
  type JobHeartbeatHooks,
} from "./jobs.types.js";
import { createLifecycleTimerWorker } from "./workers/lifecycle-timer.worker.js";
import { createNotificationWorker, type NotificationChannelHandler } from "./workers/notification.worker.js";
import { createDomainOutboxWorker, type OutboxTopicHandler } from "./workers/domain-outbox.worker.js";
import { createSlaCheckWorker } from "./workers/sla-check.worker.js";
import { createImportWorker, type ImportObjectStorage } from "./workers/import.worker.js";
import { createCmsPreviewWorker } from "./workers/cms-preview.worker.js";
import { createRenderDocumentWorker, type RenderObjectStorage } from "./workers/render-document.worker.js";
import type { SyncPdfRenderer } from "./sync-pdf-renderer.js";
import { createKcSyncWorker, type KcAdminConfig, type KcSyncCacheClient } from "./workers/kc-sync.worker.js";
import { createEndpointHealthWorker } from "./workers/endpoint-health.worker.js";
import { createTikaExtractWorker, type TikaObjectStorage } from "./workers/tika-extract.worker.js";
import { createBackupWorker, type BackupObjectStorage } from "./workers/backup.worker.js";
import { createStaleLockWorker } from "./workers/stale-lock.worker.js";
import type { PreviewContentJobData, RenderDocumentJobData, ExtractTextJobData, DbBackupJobData } from "./jobs.types.js";

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
  /** Milliseconds between render document sweeps (default: 30 000) */
  renderDocumentSweepMs?: number;
  /** Milliseconds between KC user reconciliation runs (default: 900 000) */
  kcSyncMs?: number;
  /** Milliseconds between endpoint health sweeps (default: 300 000) */
  endpointHealthSweepMs?: number;
  /** Milliseconds between Tika extraction backfill sweeps (default: 600 000) */
  tikaExtractSweepMs?: number;
  /** Milliseconds between event.outbox purge runs (default: 3 600 000) */
  outboxPurgeSweepMs?: number;
  /** Milliseconds between stale edit-lock eviction sweeps (default: 300 000) */
  staleLockSweepMs?: number;
}

export interface JobsServiceDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: DB;
  /**
   * BullMQ ConnectionOptions. Built by bootstrap with `maxRetriesPerRequest: null`
   * (required for BullMQ Workers). Intentionally a plain ConnectionOptions (not
   * a shared ioredis instance) so BullMQ spawns fresh connections per Queue /
   * Worker — this keeps job coordination isolated from the cache client.
   */
  connection: ConnectionOptions;
  logger?: JobLogger;
  options?: JobsServiceOptions;
  /**
   * Per-channel notification dispatch handlers.
   * Keys: 'email' | 'in_app' | 'webhook' | 'sms'
   */
  channelHandlers?: Map<string, NotificationChannelHandler>;
  /** Per-plane FROM address overrides for the email channel. Keys: 'neon' | 'mesh' | 'admin'. */
  emailFromMap?: Map<string, string>;
  /**
   * Per-topic outbox event handlers.
   * Keys: 'fin' | 'wf' | 'audit'
   */
  topicHandlers?: Map<string, OutboxTopicHandler>;
  /** Object storage adapter for import file downloads. Optional — import worker inactive if absent. */
  objectStorage?: ImportObjectStorage;
  /** Object storage adapter for rendered document uploads (put + presignedUrl). Optional — render worker writes a permanent DLQ entry per job if absent. */
  renderStorage?: RenderObjectStorage;
  /** Gotenberg HTTP client for HTML→PDF conversion. Optional — render worker writes a permanent DLQ entry per job if absent (config error surface). */
  gotenberg?: SyncPdfRenderer | null;
  /**
   * Keycloak Admin API config for user reconciliation (single realm, legacy).
   * Optional — KC sync worker inactive when neither kcAdmin nor kcAdmins is provided.
   * @deprecated Prefer kcAdmins (array) for multi-realm support.
   */
  kcAdmin?: KcAdminConfig;
  /**
   * Keycloak Admin API configs — one entry per KC realm to sync.
   * Takes precedence over the single kcAdmin field when both are provided.
   * All realms are processed sequentially within a single job run.
   */
  kcAdmins?: KcAdminConfig[];
  /**
   * Redis client for mesh session invalidation during KC sync.
   * When provided, disabling a mesh user immediately deletes their Redis session
   * keys. Must be the same Redis instance used by the IAM session service.
   */
  kcSyncCache?: KcSyncCacheClient;
  /**
   * Apache Tika base URL (e.g. http://docparser:9998). When unset, the tika-extract
   * worker is NOT created and jobs enqueued to jobs-tika-extract will pile up
   * until either Tika is configured or the entries are manually drained.
   */
  tikaUrl?: string;
  /**
   * Object storage adapter for the tika-extract worker. Separate from
   * `objectStorage` (which is typed narrowly for the import worker) so callers
   * can reuse the same underlying adapter without coupling the two shapes.
   */
  attachmentStorage?: TikaObjectStorage;
  /**
   * Optional per-job hooks. The runtime wires these to push heartbeat/failure
   * signals to an external monitor (Healthchecks) without svc-jobs owning
   * any HTTP client. No-op when not provided.
   */
  hooks?: JobHeartbeatHooks;
  /** Object storage adapter for pg_dump backup uploads. Optional — backup worker inactive if absent. */
  backupStorage?: BackupObjectStorage;
  /**
   * Whether this process should construct BullMQ Worker consumers.
   *
   * API and scheduler runtimes need Queue handles for producers, BullBoard, and
   * repeatable scheduler upserts, but must not consume jobs. Worker runtime sets
   * this true. Defaults true for direct package consumers and legacy tests.
   */
  workersEnabled?: boolean;
}

// ─── Queue name → queues key resolution ──────────────────────────────────────
// Maps BullMQ queue name strings (used in cron_schedule.target_queue and
// CronEntry.queue) to the JobsQueues property key.

const QUEUE_NAME_TO_KEY: Record<string, keyof JobsQueues> = {
  [QUEUE_NAME.LIFECYCLE_TIMERS]:  "lifecycleTimers",
  [QUEUE_NAME.NOTIFICATIONS]:     "notifications",
  [QUEUE_NAME.DOMAIN_OUTBOX]:     "domainOutbox",
  [QUEUE_NAME.SLA_CHECK]:         "slaCheck",
  [QUEUE_NAME.IMPORT]:            "import",
  [QUEUE_NAME.CMS_PREVIEW]:       "cmsPreview",
  [QUEUE_NAME.RENDER_DOCUMENT]:   "renderDocument",
  [QUEUE_NAME.IAM_KC_SYNC]:       "iamKcSync",
  [QUEUE_NAME.ENDPOINT_HEALTH]:   "endpointHealth",
  [QUEUE_NAME.TIKA_EXTRACT]:      "tikaExtract",
  [QUEUE_NAME.BACKUP]:            "backup",
  [QUEUE_NAME.STALE_LOCK]:        "staleLock",
};

// ─── Exported queue map type ──────────────────────────────────────────────────

export interface JobsQueues {
  lifecycleTimers: Queue<FireTimerJobData | SweepJobData>;
  notifications:   Queue<SendNotificationJobData | SweepJobData | DigestFlushJobData | ProviderHealthJobData>;
  domainOutbox:    Queue<DomainOutboxJobData>;
  slaCheck:        Queue<SlaCheckJobData>;
  import:          Queue;
  cmsPreview:      Queue<PreviewContentJobData>;
  renderDocument:  Queue<RenderDocumentJobData | SweepJobData>;
  iamKcSync:       Queue<KcSyncJobData>;
  endpointHealth:  Queue<SweepJobData>;
  tikaExtract:     Queue<ExtractTextJobData | SweepJobData>;
  backup:          Queue<DbBackupJobData>;
  staleLock:       Queue;
}

// ─── Service factory ──────────────────────────────────────────────────────────

export interface JobsService {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly queues: JobsQueues;
  readonly isRunning: boolean;
  readonly tikaExtractEnabled: boolean;
  readonly workersEnabled: boolean;
}

export function createJobsService(deps: JobsServiceDeps): JobsService {
  const {
    db,
    connection,
    logger,
    channelHandlers,
    emailFromMap,
    topicHandlers,
    objectStorage,
    renderStorage,
    gotenberg,
    kcAdmin,
    kcAdmins,
    kcSyncCache,
    tikaUrl,
    attachmentStorage,
    hooks,
    backupStorage,
    workersEnabled = true,
    options = {},
  } = deps;

  // Resolve effective KC admin configs — kcAdmins (array) takes precedence over kcAdmin (single).
  const resolvedKcAdmins: KcAdminConfig[] | null =
    kcAdmins && kcAdmins.length > 0
      ? kcAdmins
      : kcAdmin
      ? [kcAdmin]
      : null;

  const {
    lifecycleTimerSweepMs        = DEFAULT_INTERVALS.LIFECYCLE_TIMER_SWEEP_MS,
    notificationSweepMs          = DEFAULT_INTERVALS.NOTIFICATION_SWEEP_MS,
    domainOutboxDrainMs          = DEFAULT_INTERVALS.DOMAIN_OUTBOX_DRAIN_MS,
    slaBreachCheckMs             = DEFAULT_INTERVALS.SLA_BREACH_CHECK_MS,
    notificationProviderHealthMs = DEFAULT_INTERVALS.NOTIFICATION_PROVIDER_HEALTH_MS,
    renderDocumentSweepMs        = DEFAULT_INTERVALS.RENDER_DOCUMENT_SWEEP_MS,
    kcSyncMs                     = DEFAULT_INTERVALS.IAM_KC_SYNC_MS,
    endpointHealthSweepMs        = DEFAULT_INTERVALS.ENDPOINT_HEALTH_SWEEP_MS,
    tikaExtractSweepMs           = DEFAULT_INTERVALS.TIKA_EXTRACT_SWEEP_MS,
    outboxPurgeSweepMs           = DEFAULT_INTERVALS.OUTBOX_PURGE_SWEEP_MS,
    staleLockSweepMs             = DEFAULT_INTERVALS.STALE_LOCK_SWEEP_MS,
  } = options;

  // BullMQ recommends separate IORedis connections per Queue/Worker.
  // Passing ConnectionOptions (not an existing IORedis instance) causes BullMQ
  // to create a fresh connection per object — safe and correct.
  const conn = connection;
  const tikaExtractEnabled = Boolean(tikaUrl && attachmentStorage);

  // ── Queues (producers) ───────────────────────────────────────────────────

  const queues: JobsQueues = {
    lifecycleTimers: new Queue(QUEUE_NAME.LIFECYCLE_TIMERS,  { connection: conn }),
    notifications:   new Queue(QUEUE_NAME.NOTIFICATIONS,     { connection: conn }),
    domainOutbox:    new Queue(QUEUE_NAME.DOMAIN_OUTBOX,     { connection: conn }),
    slaCheck:        new Queue(QUEUE_NAME.SLA_CHECK,         { connection: conn }),
    import:          new Queue(QUEUE_NAME.IMPORT,            { connection: conn }),
    cmsPreview:      new Queue(QUEUE_NAME.CMS_PREVIEW,       { connection: conn }),
    renderDocument:  new Queue(QUEUE_NAME.RENDER_DOCUMENT,   { connection: conn }),
    iamKcSync:       new Queue(QUEUE_NAME.IAM_KC_SYNC,       { connection: conn }),
    endpointHealth:  new Queue(QUEUE_NAME.ENDPOINT_HEALTH,   { connection: conn }),
    tikaExtract:     new Queue(QUEUE_NAME.TIKA_EXTRACT,      { connection: conn }),
    backup:          new Queue(QUEUE_NAME.BACKUP,             { connection: conn }),
    staleLock:       new Queue(QUEUE_NAME.STALE_LOCK,        { connection: conn }),
  };

  // ── Workers (consumers) ──────────────────────────────────────────────────

  const workers: Worker[] = workersEnabled ? [
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
      emailFromMap,
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
    createCmsPreviewWorker({ db, connection: conn, logger }),
    createRenderDocumentWorker({
      db,
      queue:         queues.renderDocument,
      connection:    conn,
      gotenberg,
      objectStorage: renderStorage,
      logger,
    }),
    ...(resolvedKcAdmins
      ? [createKcSyncWorker({ db, kcAdmins: resolvedKcAdmins, connection: conn, cache: kcSyncCache, logger })]
      : []),
    createEndpointHealthWorker({ db, connection: conn, logger }),
    ...(tikaExtractEnabled
      ? [createTikaExtractWorker({
          db,
          connection:    conn,
          objectStorage: attachmentStorage!,
          tikaUrl:       tikaUrl!,
          queue:         queues.tikaExtract,
          logger,
        })]
      : []),
    ...(backupStorage
      ? [createBackupWorker({ connection: conn, backupStorage, logger })]
      : []),
    createStaleLockWorker({ db, connection: conn, logger }),
  ] : [];

  // ── Error handlers on workers ────────────────────────────────────────────

  for (const w of workers) {
    w.on("error", (err) => {
      logger?.error("jobs_worker_error", {
        queue: w.name,
        err:   err instanceof Error ? err.message : String(err),
      });
    });
    w.on("failed", (job, err) => {
      const attemptsMade = job?.attemptsMade ?? 0;
      const maxAttempts  = job?.opts?.attempts ?? 1;
      const isTerminal   = Boolean(job) && attemptsMade >= maxAttempts;

      logger?.error("jobs_job_failed", {
        queue:    w.name,
        jobId:    job?.id,
        jobName:  job?.name,
        attempts: attemptsMade,
        maxAttempts,
        isTerminal,
        err:      err instanceof Error ? err.message : String(err),
      });
      if (hooks?.onFailed && job?.name) {
        try { hooks.onFailed(w.name, job.name, err); } catch { /* swallow */ }
      }
      if (isTerminal && hooks?.onTerminalFailure && job?.name) {
        try {
          hooks.onTerminalFailure(w.name, job.name, err, {
            jobId:        job.id,
            attemptsMade,
            maxAttempts,
            data:         job.data,
          });
        } catch { /* swallow */ }
      }
    });
    if (hooks?.onCompleted) {
      w.on("completed", (job) => {
        if (!job?.name) return;
        try { hooks.onCompleted!(w.name, job.name); } catch { /* swallow */ }
      });
    }
  }

  let running = false;

  // ── Public interface ─────────────────────────────────────────────────────

  return {
    get isRunning() { return running; },
    get tikaExtractEnabled() { return tikaExtractEnabled; },
    get workersEnabled() { return workersEnabled; },
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

      // ── Outbox purge (housekeeping — deletes completed rows past retention)
      await queues.domainOutbox.upsertJobScheduler(
        SCHEDULER_ID.OUTBOX_PURGE,
        { every: outboxPurgeSweepMs },
        { name: JOB_NAME.OUTBOX_PURGE, data: {} as OutboxPurgeJobData },
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

      // ── Notification digest flush — deferred to Phase 2 ─────────────────
      // Remove any schedulers left by prior deployments so stale digest jobs
      // stop firing. Replace these removes with upserts when Phase 2 lands.
      for (const schedulerId of [
        SCHEDULER_ID.NOTIFICATION_DIGEST_HOURLY,
        SCHEDULER_ID.NOTIFICATION_DIGEST_DAILY,
        SCHEDULER_ID.NOTIFICATION_DIGEST_WEEKLY,
      ]) {
        await queues.notifications.removeJobScheduler(schedulerId);
      }

      // ── Notification provider health check ───────────────────────────────
      await queues.notifications.upsertJobScheduler(
        SCHEDULER_ID.NOTIFICATION_PROVIDER_HEALTH,
        { every: notificationProviderHealthMs },
        { name: JOB_NAME.PROVIDER_HEALTH, data: {} satisfies ProviderHealthJobData },
      );

      // ── Render document sweep ─────────────────────────────────────────────
      await queues.renderDocument.upsertJobScheduler(
        SCHEDULER_ID.RENDER_DOCUMENT_SWEEP,
        { every: renderDocumentSweepMs },
        { name: JOB_NAME.SWEEP, data: {} as Record<string, never> },
      );

      // ── KC user sync (only when KC admin config is provided) ─────────────
      if (resolvedKcAdmins) {
        await queues.iamKcSync.upsertJobScheduler(
          SCHEDULER_ID.IAM_KC_SYNC,
          { every: kcSyncMs },
          { name: JOB_NAME.KC_SYNC, data: {} as KcSyncJobData },
        );
      }

      // ── Endpoint health sweep ─────────────────────────────────────────────
      await queues.endpointHealth.upsertJobScheduler(
        SCHEDULER_ID.ENDPOINT_HEALTH_SWEEP,
        { every: endpointHealthSweepMs },
        { name: JOB_NAME.ENDPOINT_HEALTH_SWEEP, data: {} as Record<string, never> },
      );

      // ── Tika extraction backfill sweep (only when Tika is configured) ─────
      // Picks up rows where text_extraction_status IS NULL — covers uploads
      // that missed the inline enqueue (S3 ack → Redis add race, restarts)
      // plus any pre-existing rows from before the column was added.
      if (tikaExtractEnabled) {
        await queues.tikaExtract.upsertJobScheduler(
          SCHEDULER_ID.TIKA_EXTRACT_SWEEP,
          { every: tikaExtractSweepMs },
          { name: JOB_NAME.SWEEP, data: {} as Record<string, never> },
        );
      } else {
        // B.9 guard: the tika-extract queue exists but has no consumer. If
        // prior runs (or out-of-band producers) left pending jobs in Redis,
        // they will accrete silently until DOCPARSER_URL is set. Surface the
        // backlog as a warning + ops alert rather than failing the boot —
        // Tika is optional (PDF ingest degrades, but the service still runs).
        try {
          const counts = await queues.tikaExtract.getJobCounts(
            "wait", "delayed", "active", "paused",
          );
          const pending =
            (counts.wait    ?? 0) +
            (counts.delayed ?? 0) +
            (counts.active  ?? 0) +
            (counts.paused  ?? 0);
          if (pending > 0) {
            logger?.warn("tika_queue_pending_no_consumer", {
              queue:                QUEUE_NAME.TIKA_EXTRACT,
              pending,
              counts,
              tikaUrlSet:           Boolean(tikaUrl),
              attachmentStorageSet: Boolean(attachmentStorage),
              hint:                 "Set DOCPARSER_URL and ensure object storage is configured, or drain the queue via the jobs admin API.",
            });
            if (hooks?.onQueueAlert) {
              try {
                hooks.onQueueAlert(
                  QUEUE_NAME.TIKA_EXTRACT,
                  "pending_jobs_no_consumer",
                  {
                    pending,
                    counts,
                    tikaUrlSet:           Boolean(tikaUrl),
                    attachmentStorageSet: Boolean(attachmentStorage),
                  },
                );
              } catch { /* swallow */ }
            }
          } else {
            logger?.info("tika_queue_idle_worker_inactive", {
              tikaUrlSet:           Boolean(tikaUrl),
              attachmentStorageSet: Boolean(attachmentStorage),
            });
          }
        } catch (err) {
          logger?.error("tika_queue_health_check_failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ── Stale edit-session lock eviction ─────────────────────────────────
      await queues.staleLock.upsertJobScheduler(
        SCHEDULER_ID.STALE_LOCK_SWEEP,
        { every: staleLockSweepMs },
        { name: JOB_NAME.STALE_LOCK_SWEEP, data: {} as Record<string, never> },
      );

      // ── Code-based CronRegistry entries ──────────────────────────────────
      // Modules call cronRegistry.register() before start(); we apply them here.
      // upsertJobScheduler is idempotent — safe to call from every instance.
      const codeEntries = cronRegistry.list();
      for (const entry of codeEntries) {
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
          { name: entry.jobName, data: entry.data ?? {} } as never,
        );
        logger?.info("jobs_cron_registry_wired", { schedulerId: entry.schedulerId, queue: entry.queue });
      }

      // Code wins on conflict (see control.cron_schedule DDL comment). Two
      // collision shapes are detected before the DB loop registers anything:
      //   1) Identifier collision: DB row `code` matches a code entry `name`
      //   2) Semantic collision:  DB row (target_queue, handler_type) matches
      //                           a code entry (queue, jobName)
      const reservedCodes = new Set<string>(codeEntries.map((e) => e.name));
      const reservedHandlers = new Map<string, typeof codeEntries[number]>();
      for (const e of codeEntries) {
        reservedHandlers.set(`${e.queue}\u0000${e.jobName}`, e);
      }

      // ── DB-driven cron schedules (control.cron_schedule) ─────────────────
      // Rows with is_enabled=true whose effective window covers now() are
      // loaded and registered as BullMQ repeatable jobs. Runtime admins can
      // add/edit rows in the UI without restarting the process (the scheduler
      // calls this path again via periodic reload — see recoverDbSchedules).
      let dbLoaded = 0;
      let dbSkipped = 0;
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
            dbSkipped += 1;
            continue;
          }
          if (reservedCodes.has(cs.code)) {
            logger?.warn("jobs_db_schedule_conflict", {
              reason:      "code_matches_code_registry_name",
              code:        cs.code,
              queue:       cs.target_queue,
              handlerType: cs.handler_type,
            });
            dbSkipped += 1;
            continue;
          }
          const shadowing = reservedHandlers.get(`${cs.target_queue}\u0000${cs.handler_type}`);
          if (shadowing) {
            logger?.warn("jobs_db_schedule_conflict", {
              reason:      "queue_handler_matches_code_registry",
              code:        cs.code,
              queue:       cs.target_queue,
              handlerType: cs.handler_type,
              shadowedBy:  shadowing.schedulerId,
            });
            dbSkipped += 1;
            continue;
          }
          const dbSchedulerId = `sched:db:${cs.code}`;
          await queues[queueKey].upsertJobScheduler(
            dbSchedulerId,
            { pattern: cs.cron_expression, tz: cs.timezone },
            { name: cs.handler_type, data: cs.payload_template ?? {} } as never,
          );
          logger?.info("jobs_db_schedule_wired", { schedulerId: dbSchedulerId, queue: cs.target_queue, code: cs.code });
          dbLoaded += 1;
        }
        logger?.info("jobs_db_schedules_loaded", {
          loaded:      dbLoaded,
          skipped:     dbSkipped,
          codeEntries: codeEntries.length,
        });

        // M7: dead-man's-switch guard — if the backup storage adapter is wired
        // but no enabled backup schedule was found in control.cron_schedule, the
        // scheduler process will never enqueue a pg-dump job. Alert early so ops
        // doesn't discover the gap after a recovery event requires a restore.
        if (backupStorage) {
          const backupScheduled = dbSchedules.some(
            (cs) => cs.target_queue === QUEUE_NAME.BACKUP,
          );
          if (!backupScheduled) {
            logger?.warn("backup_no_schedule", {
              queue:   QUEUE_NAME.BACKUP,
              message: "backupStorage is configured but no enabled backup schedule found in control.cron_schedule — pg_dump backups will not run",
              hint:    "Seed 013_platform_cron_backup.sql or add a row via the jobs admin UI",
            });
            if (hooks?.onQueueAlert) {
              try {
                hooks.onQueueAlert(
                  QUEUE_NAME.BACKUP,
                  "no_schedule_registered",
                  { message: "No enabled cron_schedule row for jobs-backup; pg_dump backups will not run" },
                );
              } catch { /* swallow */ }
            }
          }
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
        notificationProviderHealthMs,
        renderDocumentSweepMs,
        renderStorageEnabled:        renderStorage != null,
        kcSyncMs,
        kcSyncEnabled:               kcAdmin != null,
        endpointHealthSweepMs,
        tikaExtractEnabled,
        tikaExtractSweepMs,
        workersEnabled,
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
