/**
 * Job queue types and interfaces
 * Core abstractions for background job processing
 */

export type JobStatus = "pending" | "active" | "completed" | "failed" | "delayed";

export type JobPriority = "critical" | "high" | "normal" | "low";

export interface JobData<T = unknown> {
  type: string;
  payload: T;
  metadata?: Record<string, unknown>;
}

export interface JobOptions {
  /**
   * Job priority (higher priority jobs are processed first)
   */
  priority?: JobPriority;

  /**
   * Number of retry attempts on failure
   */
  attempts?: number;

  /**
   * Delay before processing (milliseconds)
   */
  delay?: number;

  /**
   * Remove job after completion
   */
  removeOnComplete?: boolean;

  /**
   * Remove job after failure
   */
  removeOnFail?: boolean;

  /**
   * Backoff strategy for retries
   */
  backoff?: {
    type: "exponential" | "fixed";
    delay: number;
  };

  /**
   * Job timeout (milliseconds)
   */
  timeout?: number;
}

export interface Job<T = unknown> {
  id: string;
  data: JobData<T>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  priority: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface JobResult<T = unknown> {
  jobId: string;
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
}

export type JobHandler<TInput = unknown, TOutput = unknown> = (
  job: Job<TInput>
) => Promise<TOutput>;

export interface ProcessOptions {
  /** Lock duration in milliseconds (how long a worker holds a job before it's considered stalled) */
  lockDuration?: number;
  /** Lock renew time in milliseconds (how often to extend the lock while processing) */
  lockRenewTime?: number;
}

export interface JobQueue {
  /**
   * Add a job to the queue
   */
  add<T>(data: JobData<T>, options?: JobOptions): Promise<Job<T>>;

  /**
   * Add multiple jobs in bulk
   */
  addBulk<T>(jobs: Array<{ data: JobData<T>; options?: JobOptions }>): Promise<Job<T>[]>;

  /**
   * Process jobs with a handler
   */
  process<TInput, TOutput>(
    jobType: string,
    concurrency: number,
    handler: JobHandler<TInput, TOutput>,
    processOptions?: ProcessOptions,
  ): Promise<void>;

  /**
   * Get job by ID
   */
  getJob(jobId: string): Promise<Job | undefined>;

  /**
   * Get jobs by status
   */
  getJobs(status: JobStatus): Promise<Job[]>;

  /**
   * Remove a job
   */
  removeJob(jobId: string): Promise<void>;

  /**
   * Pause the queue
   */
  pause(): Promise<void>;

  /**
   * Resume the queue
   */
  resume(): Promise<void>;

  /**
   * Close the queue and cleanup
   */
  close(): Promise<void>;

  /**
   * Get queue metrics
   */
  getMetrics(): Promise<QueueMetrics>;
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface JobEventHandlers {
  onStart?: (job: Job) => void | Promise<void>;
  onComplete?: (job: Job, result: unknown) => void | Promise<void>;
  onFail?: (job: Job, error: Error) => void | Promise<void>;
  onProgress?: (job: Job, progress: number) => void | Promise<void>;
}
