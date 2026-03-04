/**
 * Redis-backed job queue implementation using BullMQ
 * Production-ready job queue with persistence and reliability
 */

import { type Job as BullJob, Queue, QueueEvents, Worker } from "bullmq";

import type {
  Job,
  JobData,
  JobEventHandlers,
  JobHandler,
  JobOptions,
  JobQueue,
  JobStatus,
  ProcessOptions,
  QueueMetrics,
} from "@athyper/core";
import type { Redis } from "ioredis";

export interface RedisQueueConfig {
  redis: Redis;
  queueName: string;
  defaultJobOptions?: JobOptions;
}

/**
 * Convert BullMQ job to our Job type
 * Infers status from job properties since getState() is async
 */
function toJob<T>(bullJob: BullJob<JobData<T>>): Job<T> {
  const priorityMap: Record<number, number> = {
    1: 4, // critical
    2: 3, // high
    3: 2, // normal
    4: 1, // low
  };

  // Infer status from job properties
  let status: JobStatus = "pending";
  if (bullJob.finishedOn) {
    status = bullJob.failedReason ? "failed" : "completed";
  } else if (bullJob.processedOn) {
    status = "active";
  }

  return {
    id: bullJob.id!,
    data: bullJob.data,
    status,
    attempts: bullJob.attemptsMade,
    maxAttempts: bullJob.opts.attempts ?? 1,
    priority: priorityMap[bullJob.opts.priority ?? 3] ?? 2,
    createdAt: new Date(bullJob.timestamp),
    processedAt: bullJob.processedOn ? new Date(bullJob.processedOn) : undefined,
    completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : undefined,
    failedAt: bullJob.failedReason ? new Date(bullJob.finishedOn ?? Date.now()) : undefined,
    error: bullJob.failedReason,
  };
}

/**
 * Convert priority to BullMQ priority
 */
function toBullPriority(priority?: string): number {
  switch (priority) {
    case "critical":
      return 1;
    case "high":
      return 2;
    case "normal":
      return 3;
    case "low":
      return 4;
    default:
      return 3;
  }
}

export class RedisJobQueue implements JobQueue {
  private queue: Queue<JobData>;
  private workers: Map<string, Worker<any, any>> = new Map();
  private queueEvents: QueueEvents;
  private eventHandlers: JobEventHandlers = {};

  constructor(private config: RedisQueueConfig) {
    this.queue = new Queue(config.queueName, {
      connection: config.redis,
      defaultJobOptions: {
        attempts: config.defaultJobOptions?.attempts ?? 3,
        backoff: config.defaultJobOptions?.backoff ?? {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: config.defaultJobOptions?.removeOnComplete ?? false,
        removeOnFail: config.defaultJobOptions?.removeOnFail ?? false,
      },
    });

    this.queueEvents = new QueueEvents(config.queueName, {
      connection: config.redis,
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.queueEvents.on("completed", async ({ jobId }) => {
      if (this.eventHandlers.onComplete) {
        const bullJob = await this.queue.getJob(jobId);
        if (bullJob) {
          const job = toJob(bullJob);
          await this.eventHandlers.onComplete(job, bullJob.returnvalue);
        }
      }
    });

    this.queueEvents.on("failed", async ({ jobId, failedReason }) => {
      if (this.eventHandlers.onFail) {
        const bullJob = await this.queue.getJob(jobId);
        if (bullJob) {
          const job = toJob(bullJob);
          await this.eventHandlers.onFail(job, new Error(failedReason));
        }
      }
    });

    this.queueEvents.on("progress", async ({ jobId, data }) => {
      if (this.eventHandlers.onProgress) {
        const bullJob = await this.queue.getJob(jobId);
        if (bullJob) {
          const job = toJob(bullJob);
          await this.eventHandlers.onProgress(job, data as number);
        }
      }
    });
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: JobEventHandlers): void {
    this.eventHandlers = handlers;
  }

  /**
   * Add a job to the queue
   */
  async add<T>(data: JobData<T>, options?: JobOptions): Promise<Job<T>> {
    const bullJob = await this.queue.add(data.type, data, {
      priority: toBullPriority(options?.priority),
      attempts: options?.attempts,
      delay: options?.delay,
      removeOnComplete: options?.removeOnComplete,
      removeOnFail: options?.removeOnFail,
      backoff: options?.backoff,
    });

    return toJob(bullJob) as Job<T>;
  }

  /**
   * Add multiple jobs in bulk
   */
  async addBulk<T>(
    jobs: Array<{ data: JobData<T>; options?: JobOptions }>
  ): Promise<Job<T>[]> {
    const bullJobs = await this.queue.addBulk(
      jobs.map((job) => ({
        name: job.data.type,
        data: job.data,
        opts: {
          priority: toBullPriority(job.options?.priority),
          attempts: job.options?.attempts,
          delay: job.options?.delay,
          removeOnComplete: job.options?.removeOnComplete,
          removeOnFail: job.options?.removeOnFail,
          backoff: job.options?.backoff,
        },
      }))
    );

    return bullJobs.map((bullJob) => toJob(bullJob)) as Job<T>[];
  }

  /**
   * Process jobs with a handler
   */
  async process<TInput, TOutput>(
    jobType: string,
    concurrency: number,
    handler: JobHandler<TInput, TOutput>,
    processOptions?: ProcessOptions,
  ): Promise<void> {
    // Check if worker already exists
    if (this.workers.has(jobType)) {
      throw new Error(`Worker already exists for job type: ${jobType}`);
    }

    const worker = new Worker<JobData<TInput>, TOutput>(
      this.config.queueName,
      async (bullJob) => {
        // Only process jobs of this type
        if (bullJob.data.type !== jobType) {
          return undefined as any;
        }

        const job = toJob<TInput>(bullJob);

        // Call onStart handler
        if (this.eventHandlers.onStart) {
          await this.eventHandlers.onStart(job);
        }

        // Execute job handler
        return await handler(job);
      },
      {
        connection: this.config.redis,
        concurrency,
        ...(processOptions?.lockDuration ? { lockDuration: processOptions.lockDuration } : {}),
        ...(processOptions?.lockRenewTime ? { lockRenewTime: processOptions.lockRenewTime } : {}),
      }
    );

    this.workers.set(jobType, worker);
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job | undefined> {
    const bullJob = await this.queue.getJob(jobId);
    return bullJob ? toJob(bullJob) : undefined;
  }

  /**
   * Get jobs by status
   */
  async getJobs(status: JobStatus): Promise<Job[]> {
    let bullJobs: BullJob[] = [];

    switch (status) {
      case "pending":
        bullJobs = await this.queue.getWaiting();
        break;
      case "active":
        bullJobs = await this.queue.getActive();
        break;
      case "completed":
        bullJobs = await this.queue.getCompleted();
        break;
      case "failed":
        bullJobs = await this.queue.getFailed();
        break;
      case "delayed":
        bullJobs = await this.queue.getDelayed();
        break;
    }

    return bullJobs.map((bullJob) => toJob(bullJob));
  }

  /**
   * Remove a job
   */
  async removeJob(jobId: string): Promise<void> {
    const bullJob = await this.queue.getJob(jobId);
    if (bullJob) {
      await bullJob.remove();
    }
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
  }

  /**
   * Close the queue and cleanup
   */
  async close(): Promise<void> {
    // Close all workers
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    this.workers.clear();

    // Close queue events
    await this.queueEvents.close();

    // Close queue
    await this.queue.close();
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    const counts = await this.queue.getJobCounts();
    const isPaused = await this.queue.isPaused();

    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: isPaused,
    };
  }

  /**
   * Get the number of registered worker types (job types with active processors).
   */
  getRegisteredWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Get underlying BullMQ queue (for advanced usage)
   */
  getQueue(): Queue<JobData> {
    return this.queue;
  }
}
