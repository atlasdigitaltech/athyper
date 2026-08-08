/**
 * CronRegistry — Phase 3.2
 *
 * Module-contributed cron schedule registry. Modules call
 * cronRegistry.register() at startup to contribute their schedules.
 * JobsService reads the registry on start() and calls
 * queue.upsertJobScheduler() for each entry.
 *
 * Design:
 *   - Registration is additive (modules call register before start()).
 *   - Schedules can be cron expressions ('0 2 * * *') or fixed intervals (ms).
 *   - Each entry gets a stable schedulerId derived from the queue + name.
 *   - Wire to the cron extension in JobsService (see createCronAwareJobsService).
 *
 * Usage:
 *   // In a module's initialization
 *   import { cronRegistry } from "server/packages/platform/jobs/cron-registry.js";
 *   cronRegistry.register({
 *     queue:    "jobs-domain-outbox",
 *     name:     "audit-archive",
 *     jobName:  "archive",
 *     cron:     "0 2 * * *",   // 02:00 UTC daily
 *     data:     { archiveType: "audit" },
 *   });
 *
 *   // In JobsService.start() (cron extension):
 *   for (const entry of cronRegistry.list()) {
 *     await queues[entry.queue].upsertJobScheduler(
 *       entry.schedulerId,
 *       entry.cron ? { pattern: entry.cron } : { every: entry.intervalMs! },
 *       { name: entry.jobName, data: entry.data },
 *     );
 *   }
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CronEntry {
  /** Target queue name. Must match a key in JobsQueues. */
  queue:      string;
  /** Human-readable schedule name (used to build schedulerId). */
  name:       string;
  /** BullMQ job name for matching in the worker processor. */
  jobName:    string;
  /**
   * Cron expression (standard 5-field POSIX cron).
   * If provided, `intervalMs` is ignored.
   */
  cron?:      string;
  /**
   * Fixed interval in milliseconds.
   * Used when `cron` is not set.
   */
  intervalMs?: number;
  /** Job payload data. */
  data?:      Record<string, unknown>;
}

export interface RegisteredCronEntry extends CronEntry {
  /** Stable BullMQ scheduler ID derived from queue+name. */
  schedulerId: string;
}

// ── CronRegistry ──────────────────────────────────────────────────────────────

export class CronRegistry {
  private readonly entries = new Map<string, RegisteredCronEntry>();

  /**
   * Register a cron schedule. Idempotent — re-registering the same
   * queue+name updates the entry.
   */
  register(entry: CronEntry): void {
    if (!entry.cron && !entry.intervalMs) {
      throw new Error(`CronRegistry.register: entry '${entry.name}' must have cron or intervalMs`);
    }
    const schedulerId = `sched:cron:${entry.queue}:${entry.name}`;
    this.entries.set(schedulerId, { ...entry, schedulerId });
  }

  /**
   * Unregister a schedule (e.g. when a module is disabled).
   */
  unregister(queue: string, name: string): void {
    const schedulerId = `sched:cron:${queue}:${name}`;
    this.entries.delete(schedulerId);
  }

  /**
   * List all registered entries (consumed by JobsService.start()).
   */
  list(): RegisteredCronEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Return entries for a specific queue.
   */
  listForQueue(queue: string): RegisteredCronEntry[] {
    return this.list().filter((e) => e.queue === queue);
  }

  /**
   * Clear all registrations (useful in tests).
   */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Singleton registry instance. Modules import this and call register().
 * JobsService imports this and calls list() on start().
 */
export const cronRegistry = new CronRegistry();
