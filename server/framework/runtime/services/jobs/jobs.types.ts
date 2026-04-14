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
  /** Drains event.outbox WHERE topic IN ('fin', 'wf', 'audit') */
  DOMAIN_OUTBOX:    "jobs-domain-outbox",
  /** SLA breach detection across governance.cycle_task and event.work_item */
  SLA_CHECK:        "jobs-sla-check",
  /** Bulk import chunk processing — isolated for volume separation */
  IMPORT:           "jobs-import",
} as const;

export type QueueName = (typeof QUEUE_NAME)[keyof typeof QUEUE_NAME];

// ─── Job name constants ───────────────────────────────────────────────────────
// All workers match on job.name — using constants prevents silent typo mismatches.

export const JOB_NAME = {
  /** sweep jobs: scan DB and self-enqueue action jobs */
  SWEEP:           "sweep",
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
} as const;

/**
 * Build the job name for a domain-outbox drain job.
 * Format: "drain:{topic}" — kept as a function to enforce the naming convention.
 */
export function drainJobName(topic: string): string {
  return `drain:${topic}`;
}

// ─── Domain outbox topics ─────────────────────────────────────────────────────

export const DRAIN_TOPICS = ["fin", "wf", "audit"] as const;
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

// ─── Shared logger interface ──────────────────────────────────────────────────

export interface JobLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

// ─── Well-known constants ─────────────────────────────────────────────────────

/** System actor UUID used as created_by for all job-initiated inserts */
export const SYSTEM_ACTOR_ID = "00000000-0000-7000-a000-000000000001";

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
  NOTIFICATION_PROVIDER_HEALTH_MS: 900_000,     // 15 min — provider health polling
} as const;
