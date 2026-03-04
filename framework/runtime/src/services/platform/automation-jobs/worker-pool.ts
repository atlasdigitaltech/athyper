/**
 * Worker pool for distributed job processing
 * Manages multiple workers for different job types
 */

import type { Logger } from "../../../kernel/logger.js";
import type { JobEventHandlers, JobHandler, JobQueue } from "@athyper/core";

export interface WorkerConfig {
  jobType: string;
  concurrency: number;
  handler: JobHandler;
}

export interface WorkerPoolConfig {
  queue: JobQueue;
  logger: Logger;
  workers: WorkerConfig[];
}

export class WorkerPool {
  private isRunning: boolean = false;

  constructor(private config: WorkerPoolConfig) {}

  /**
   * Start all workers
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Worker pool is already running");
    }

    this.config.logger.info({ msg: "worker_pool_starting", workerCount: this.config.workers.length });

    // Setup event handlers
    const eventHandlers: JobEventHandlers = {
      onStart: async (job) => {
        this.config.logger.info({
          msg: "job_started",
          jobId: job.id,
          jobType: job.data.type,
        });
      },
      onComplete: async (job, _result) => {
        this.config.logger.info({
          msg: "job_completed",
          jobId: job.id,
          jobType: job.data.type,
          duration: job.completedAt && job.processedAt
            ? job.completedAt.getTime() - job.processedAt.getTime()
            : undefined,
        });
      },
      onFail: async (job, error) => {
        this.config.logger.error({
          msg: "job_failed",
          jobId: job.id,
          jobType: job.data.type,
          error: error.message,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
        });
      },
      onProgress: async (job, progress) => {
        this.config.logger.debug({
          msg: "job_progress",
          jobId: job.id,
          jobType: job.data.type,
          progress,
        });
      },
    };

    if ("setEventHandlers" in this.config.queue) {
      (this.config.queue as any).setEventHandlers(eventHandlers);
    }

    // Start all workers
    for (const worker of this.config.workers) {
      await this.config.queue.process(
        worker.jobType,
        worker.concurrency,
        worker.handler
      );

      this.config.logger.info({
        msg: "worker_started",
        jobType: worker.jobType,
        concurrency: worker.concurrency,
      });
    }

    this.isRunning = true;
    this.config.logger.info({ msg: "worker_pool_started" });
  }

  /**
   * Stop all workers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.config.logger.info({ msg: "worker_pool_stopping" });

    await this.config.queue.close();

    this.isRunning = false;
    this.config.logger.info({ msg: "worker_pool_stopped" });
  }

  /**
   * Get worker pool metrics
   */
  async getMetrics() {
    const queueMetrics = await this.config.queue.getMetrics();

    return {
      isRunning: this.isRunning,
      workerCount: this.config.workers.length,
      queue: queueMetrics,
    };
  }

  /**
   * Get underlying job queue
   */
  getQueue(): JobQueue {
    return this.config.queue;
  }
}
