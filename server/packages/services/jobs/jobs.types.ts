/**
 * Automation & Jobs — shared types
 *
 * Queue names, job name constants, scheduler IDs, and job payload interfaces.
 * All workers and the service factory import from here.
 */

// ─── Queue names ─────────────────────────────────────────────────────────────

export const QUEUE_NAME = {
  /** Lifecycle timer sweep + individual timer fire jobs */
  LIFECYCLE_TIMERS: "jobs-lifecycle-timers",
  /** Notification message dispatch (pending → delivering) */
  NOTIFICATIONS:    "jobs-notifications",
  /** Drains event.outbox WHERE topic IN ('fin', 'wf', 'audit', 'search', 'lifecycle') */
  DOMAIN_OUTBOX:    "jobs-domain-outbox",
  /** SLA breach detection across governance.cycle_task and event.work_item */
  SLA_CHECK:        "jobs-sla-check",
  /** Bulk import chunk processing — isolated for volume separation */
  IMPORT:           "jobs-import",
  /** Document render jobs — PDF/HTML generation via render worker */
  RENDER_DOCUMENT:  "jobs-render-document",
  /** Monthly log partition archive: detach, compress, move to cold storage */
  PARTITION_ARCHIVE: "jobs-partition-archive",
  /** Webhook delivery: fan-out outbox events to matching webhook subscriptions */
  WEBHOOK_DELIVERY: "jobs-webhook-delivery",
  /** CMS preview generation: extract preview_text + preview_html from body_json */
  CMS_PREVIEW: "jobs-cms-preview",
  /** Keycloak user reconciliation: sync KC user state → master.principal */
  IAM_KC_SYNC: "jobs-iam-kc-sync",
  /** Integration endpoint health probing: HEAD each active endpoint with health_check_url */
  ENDPOINT_HEALTH: "jobs-endpoint-health",
  /** Apache Tika attachment text extraction — fetches blob, POSTs to Tika, writes extracted_text */
  TIKA_EXTRACT:    "jobs-tika-extract",
  /** PostgreSQL backup — pg_dump | gzip → object storage; schedule driven by control.cron_schedule */
  BACKUP:          "jobs-backup",
  /** Stale edit-session lock cleanup — DELETE control.record_edit_lock WHERE expires_at < now() */
  STALE_LOCK:      "jobs-stale-lock",
} as const;

export type QueueName = (typeof QUEUE_NAME)[keyof typeof QUEUE_NAME];

// ─── Job name constants ───────────────────────────────────────────────────────
// All workers match on job.name — using constants prevents silent typo mismatches.

export const JOB_NAME = {
  /** sweep jobs: scan DB and self-enqueue action jobs */
  SWEEP:                "sweep",
  /** stale-lock sweep: delete expired control.record_edit_lock rows */
  STALE_LOCK_SWEEP:     "stale-lock-sweep",
  /** lifecycle timer: execute one timer action */
  FIRE:            "fire",
  /** notification: dispatch one message */
  SEND:            "send",
  /** SLA check: escalate overdue tasks/work-items */
  CHECK:           "check",
  /** digest flush: batch staged rows into digest message and dispatch */
  DIGEST_FLUSH:    "digest-flush",
  /** provider health check: test connectivity and update health column */
  PROVIDER_HEALTH: "provider-health",
  /** import: process one chunk of rows from a bulk import request */
  PROCESS_CHUNK:   "process-chunk",
  /** render: process one document.render_output row */
  RENDER:          "render",
  /** cms preview: extract preview text + HTML from a content version's body_json */
  PREVIEW:         "preview",
  /** partition archive: detach one old log partition to cold storage */
  ARCHIVE_PARTITION: "archive-partition",
  /** webhook delivery sweep: discover pending outbox events and fan-out */
  SWEEP_WEBHOOKS: "sweep-webhooks",
  /** webhook delivery: deliver one outbox event to one webhook subscription */
  DELIVER_WEBHOOK: "deliver-webhook",
  /** kc-sync: reconcile Keycloak user state with master.principal */
  KC_SYNC: "kc-sync",
  /** endpoint-health-sweep: probe all active endpoints with health_check_url */
  ENDPOINT_HEALTH_SWEEP: "endpoint-health-sweep",
  /** tika extract: pull one attachment, POST to Tika, write extracted_text */
  EXTRACT_TEXT: "extract-text",
  /** outbox purge: delete completed event.outbox rows older than the retention window */
  OUTBOX_PURGE: "outbox-purge",
  /** pg-dump backup: run pg_dump, gzip, upload to object storage, prune old files */
  DB_BACKUP: "pg-dump",
} as const;

/**
 * Build the job name for a domain-outbox drain job.
 * Format: "drain:{topic}" — kept as a function to enforce the naming convention.
 */
export function drainJobName(topic: string): string {
  return `drain:${topic}`;
}

// ─── Domain outbox topics ─────────────────────────────────────────────────────

export const DRAIN_TOPICS = ["fin", "wf", "audit", "search"] as const;
export type DrainTopic = (typeof DRAIN_TOPICS)[number];

// ─── Scheduler IDs (BullMQ upsertJobScheduler keys) ──────────────────────────

export const SCHEDULER_ID = {
  LIFECYCLE_TIMER_SWEEP:       "sched:lifecycle-timer-sweep",
  NOTIFICATION_SWEEP:          "sched:notification-sweep",
  DOMAIN_OUTBOX_DRAIN:         "sched:domain-outbox-drain",
  SLA_BREACH_CHECK:            "sched:sla-breach-check",
  NOTIFICATION_DIGEST_HOURLY:  "sched:notification-digest-hourly",
  NOTIFICATION_DIGEST_DAILY:   "sched:notification-digest-daily",
  NOTIFICATION_DIGEST_WEEKLY:  "sched:notification-digest-weekly",
  NOTIFICATION_PROVIDER_HEALTH: "sched:notification-provider-health",
  PARTITION_ARCHIVE_SWEEP:     "sched:partition-archive-sweep",
  WEBHOOK_DELIVERY_SWEEP:      "sched:webhook-delivery-sweep",
  RENDER_DOCUMENT_SWEEP:       "sched:render-document-sweep",
  IAM_KC_SYNC:                 "sched:iam-kc-sync",
  ENDPOINT_HEALTH_SWEEP:       "sched:endpoint-health-sweep",
  TIKA_EXTRACT_SWEEP:          "sched:tika-extract-sweep",
  OUTBOX_PURGE:                "sched:outbox-purge",
  STALE_LOCK_SWEEP:            "sched:stale-lock-sweep",
} as const;

// ─── Job payload types ────────────────────────────────────────────────────────

/** Sweep / check job: no data — worker scans DB and self-enqueues action jobs */
export type SweepJobData = Record<string, never>;

/** Individual lifecycle timer execution */
export interface FireTimerJobData {
  timerId:    string;
  tenantId:   string;
  timerType:  "auto_close" | "auto_cancel" | "reminder" | "auto_transition";
  entityName: string;
  entityId:   string;
}

/** Individual notification message dispatch */
export interface SendNotificationJobData {
  messageId: string;
  tenantId:  string;
}

/** Drain a batch from event.outbox for a specific topic */
export interface DrainOutboxJobData {
  topic: DrainTopic;
}

/** Purge completed event.outbox rows older than retention — no payload */
export type OutboxPurgeJobData = Record<string, never>;

/** Domain outbox queue accepts both drain and purge jobs */
export type DomainOutboxJobData = DrainOutboxJobData | OutboxPurgeJobData;

/** SLA check sweep — no payload; worker queries all tenants */
export type SlaCheckJobData = Record<string, never>;

/** Digest flush job — flush staged rows for one frequency bucket */
export interface DigestFlushJobData {
  frequency: "hourly_digest" | "daily_digest" | "weekly_digest";
}

/** Provider health check — no payload; worker checks all enabled providers */
export type ProviderHealthJobData = Record<string, never>;

/** Import chunk processor — processes one batch of rows from a bulk import */
export interface ImportChunkJobData {
  importRequestId: string;
  chunkId:         string;
  tenantId:        string;
}

/** Document render — process one render_output row (QUEUED → RENDERING → RENDERED) */
export interface RenderDocumentJobData {
  outputId:  string;
  tenantId:  string;
  jobId:     string;
}

/** Partition archive sweep — no payload; worker scans candidate partitions per tenant */
export type PartitionArchiveSweepData = Record<string, never>;

/** Archive one log partition to cold storage (after legal hold check) */
export interface ArchivePartitionJobData {
  partitionSchema: string;
  partitionTable:  string;
  /** ISO string of partition range start — used for hold overlap check */
  rangeLo:         string;
  /** ISO string of partition range end */
  rangeHi:         string;
}

/** CMS preview generation — extract preview_text/preview_html from a content version */
export interface PreviewContentJobData {
  /** master.content_item.id */
  contentItemId: string;
  /** snapshot.content_item_version.id — the version whose body_json should be rendered */
  versionId:     string;
  tenantId:      string;
}

/** Webhook delivery: deliver one durable event.notification_delivery row */
export interface DeliverWebhookJobData {
  /** event.notification_delivery.id — durable child row for one subscription */
  deliveryId: string;
  tenantId:   string;
}

/** KC sync — no payload; worker fetches all realms from config */
export type KcSyncJobData = Record<string, never>;

/** Attachment text extraction — Tika POSTs the blob, worker writes extracted_text back */
export interface ExtractTextJobData {
  attachmentId: string;
  tenantId:     string;
}

/** PostgreSQL backup: override the default env-based connection URL or target bucket */
export interface DbBackupJobData {
  databaseUrl?: string;
  bucket?:      string;
}

// ─── Shared logger interface ──────────────────────────────────────────────────

export interface JobLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * Optional hooks invoked by createJobsService on worker completion/failure.
 * Used by the runtime to wire monitoring (e.g. Healthchecks cron heartbeat)
 * without coupling svc-jobs to a specific monitoring backend.
 *
 * Handlers must be synchronous and non-throwing — the service wraps them
 * in try/catch and swallows errors, but keeping them cheap avoids blocking
 * the BullMQ event loop.
 */
export interface JobHeartbeatHooks {
  onCompleted?: (queue: string, jobName: string) => void;
  onFailed?: (queue: string, jobName: string, err: unknown) => void;
  /**
   * Fires only when a job exhausts all retry attempts (terminal failure).
   * Used to surface unrecoverable jobs to an error tracker (Sentry/GlitchTip)
   * — distinct from onFailed, which fires on every retry attempt.
   */
  onTerminalFailure?: (
    queue:    string,
    jobName:  string,
    err:      unknown,
    meta: {
      jobId?:        string;
      attemptsMade?: number;
      maxAttempts?:  number;
      data?:         unknown;
    },
  ) => void;
  /**
   * Fires from the service's boot-time health checks when a queue is in
   * an alertable state (e.g. pending jobs with no worker to consume them).
   * Distinct from job-level failures — this is a configuration/operational
   * anomaly detected at startup.
   */
  onQueueAlert?: (
    queue:    string,
    reason:   string,
    details:  Record<string, unknown>,
  ) => void;
}

// ─── Well-known constants ─────────────────────────────────────────────────────

/** System actor UUID used as created_by for all job-initiated inserts */
export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Default sweep intervals (milliseconds).
 * Overridable via createJobsService() options.
 */
export const DEFAULT_INTERVALS = {
  LIFECYCLE_TIMER_SWEEP_MS:       60_000,       // 1 min — time-sensitive for lifecycle timers
  NOTIFICATION_SWEEP_MS:          300_000,      // 5 min — batch dispatch is not latency-critical
  DOMAIN_OUTBOX_DRAIN_MS:         30_000,       // 30 s  — domain events processed near-real-time
  SLA_BREACH_CHECK_MS:            300_000,      // 5 min — SLA escalation acceptable delay
  NOTIFICATION_DIGEST_HOURLY_MS:  3_600_000,    // 1 h   — hourly digest window
  NOTIFICATION_DIGEST_DAILY_MS:   86_400_000,   // 24 h  — daily digest window
  NOTIFICATION_DIGEST_WEEKLY_MS:  604_800_000,  // 7 d   — weekly digest window
  NOTIFICATION_PROVIDER_HEALTH_MS: 300_000,     // 5 min — provider health polling
  RENDER_DOCUMENT_SWEEP_MS:        30_000,       // 30 s   — render sweep matches domain outbox cadence
  IAM_KC_SYNC_MS:                  900_000,      // 15 min — KC reconciliation runs infrequently to reduce KC load
  ENDPOINT_HEALTH_SWEEP_MS:        300_000,      // 5 min  — endpoint health probe cadence per task spec
  TIKA_EXTRACT_SWEEP_MS:           600_000,      // 10 min — catches rows missed by the inline enqueue (upload race, worker restarts, backfill)
  OUTBOX_PURGE_SWEEP_MS:           3_600_000,    // 1 h    — housekeeping; deletes completed rows older than retention (function default 7d)
  STALE_LOCK_SWEEP_MS:             300_000,      // 5 min  — evicts expired edit-session locks; matches default lock TTL
} as const;
