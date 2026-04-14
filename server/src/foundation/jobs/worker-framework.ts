/**
 * WorkerFramework — Phase 3.3
 *
 * Standard base interface for all BullMQ workers in the new architecture.
 * Wraps the existing BullMQ Worker pattern from domain-outbox.worker.ts and
 * notification.worker.ts with a consistent init/process/health/shutdown contract.
 *
 * The SIGTERM/graceful-shutdown guarantees from server/MIGRATION.md Phase 5
 * are already in place. This framework builds on top of them without reimplementing
 * SIGTERM handling.
 *
 * Interface contract:
 *   init()     — optional startup (load DB config, warm caches, etc.)
 *   process()  — handle one job — called inside the BullMQ Worker processor
 *   health()   — return health status for the /health endpoint
 *   shutdown() — gracefully drain and close (called from lifecycle.onShutdown)
 *
 * Usage:
 *   class MyWorker extends BaseWorker<MyJobData> {
 *     readonly queueName = "jobs-my-queue";
 *     readonly workerName = "my-worker";
 *
 *     async init(): Promise<void> {
 *       await this.loadConfig();
 *     }
 *
 *     async process(job: Job<MyJobData>): Promise<void> {
 *       await handleJob(job.data);
 *     }
 *   }
 *
 *   const worker = new MyWorker({ db, connection, logger });
 *   await worker.init();
 *   lifecycle.onShutdown(() => worker.shutdown());
 */

import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type { Kysely } from "kysely";
import type { JobLogger } from "../../../framework/runtime/services/jobs/jobs.types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkerHealth {
  name:      string;
  queue:     string;
  running:   boolean;
  processed: number;
  failed:    number;
  lastError: string | null;
}

export interface WorkerFrameworkDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:         Kysely<any>;
  connection: ConnectionOptions;
  logger?:    JobLogger;
}

// ── BaseWorker ────────────────────────────────────────────────────────────────

export abstract class BaseWorker<TData = Record<string, unknown>> {
  abstract readonly queueName: string;
  abstract readonly workerName: string;

  protected readonly db: Kysely<// eslint-disable-next-line @typescript-eslint/no-explicit-any
  any>;
  protected readonly logger?: JobLogger;

  private bullWorker: Worker<TData> | null = null;
  private readonly connection: ConnectionOptions;

  // Metrics
  private processedCount = 0;
  private failedCount    = 0;
  private lastError:     string | null = null;

  constructor(deps: WorkerFrameworkDeps) {
    this.db         = deps.db;
    this.connection = deps.connection;
    this.logger     = deps.logger;
  }

  /**
   * Optional startup hook. Called before the BullMQ Worker begins processing.
   * Override to load DB config, warm caches, validate dependencies, etc.
   */
  async init(): Promise<void> {
    // Default: no-op. Override in subclass if needed.
  }

  /**
   * Process a single job. Override this in subclass.
   * Throw an error to mark the job as failed.
   */
  abstract process(job: Job<TData>): Promise<void>;

  /**
   * Return health status for the /health endpoint.
   */
  health(): WorkerHealth {
    return {
      name:      this.workerName,
      queue:     this.queueName,
      running:   this.bullWorker !== null,
      processed: this.processedCount,
      failed:    this.failedCount,
      lastError: this.lastError,
    };
  }

  /**
   * Start the BullMQ Worker. Called after init().
   */
  start(concurrency = 5): void {
    if (this.bullWorker) return;

    this.bullWorker = new Worker<TData>(
      this.queueName,
      async (job) => {
        this.processedCount++;
        await this.process(job);
      },
      {
        connection:  this.connection,
        concurrency,
      },
    );

    this.bullWorker.on("error", (err) => {
      this.lastError = err.message;
      this.logger?.error("worker_error", {
        worker: this.workerName,
        queue:  this.queueName,
        err:    err.message,
      });
    });

    this.bullWorker.on("failed", (job, err) => {
      this.failedCount++;
      this.lastError = err.message;
      this.logger?.error("worker_job_failed", {
        worker:   this.workerName,
        queue:    this.queueName,
        jobId:    job?.id,
        jobName:  job?.name,
        attempts: job?.attemptsMade,
        err:      err.message,
      });
    });
  }

  /**
   * Drain in-flight jobs and close the worker.
   * Called from lifecycle.onShutdown().
   */
  async shutdown(): Promise<void> {
    if (!this.bullWorker) return;
    await this.bullWorker.close();
    this.bullWorker = null;
    this.logger?.info("worker_stopped", { worker: this.workerName, queue: this.queueName });
  }
}

// ── WorkerRegistry ────────────────────────────────────────────────────────────

/**
 * Registry of all active workers. Used for health aggregation and
 * coordinated shutdown.
 *
 * Usage:
 *   workerRegistry.register(myWorker);
 *   lifecycle.onShutdown(() => workerRegistry.shutdownAll());
 */
export class WorkerRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly workers = new Map<string, BaseWorker<any>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(worker: BaseWorker<any>): void {
    this.workers.set(worker.workerName, worker);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unregister(workerName: string): void {
    this.workers.delete(workerName);
  }

  healthAll(): WorkerHealth[] {
    return [...this.workers.values()].map((w) => w.health());
  }

  async shutdownAll(): Promise<void> {
    await Promise.all([...this.workers.values()].map((w) => w.shutdown()));
  }

  list(): string[] {
    return [...this.workers.keys()];
  }
}

export const workerRegistry = new WorkerRegistry();
