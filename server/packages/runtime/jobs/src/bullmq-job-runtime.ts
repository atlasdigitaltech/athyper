import { createHash } from "node:crypto";
import { Queue, UnrecoverableError, Worker, type JobsOptions, type Processor } from "bullmq";
import type {
  EnqueueOptions,
  JobEnvelope,
  JobExecutionCoordinate,
  JobExecutionFailure,
  JobExecutionLifecycle,
  JobExecutionResult,
  JobHandler,
  JobHandlerRegistry,
  JobPayload,
  JobPublisher,
  JobTransportControl,
} from "@athyper/server-contract-jobs";
import { normalizePlaneKey, runWithJobContext, type PlaneKeyInput } from "@athyper/server-foundation/context";

import {
  createBullMqConnectionOptions,
  type BullMqConnectionOptions,
} from "./bullmq-connection.js";

import { createRedisJobCancellationTransport, type JobCancellationTransport } from "./job-cancellation.js";

const RESOURCE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export interface BullMqJobLike {
  readonly id?: string;
  readonly name: string;
  readonly data: unknown;
  readonly attemptsMade: number;
  readonly timestamp: number;
  readonly opts: { readonly attempts?: number; readonly jobId?: string };
  updateProgress(progress: number | Readonly<Record<string, unknown>>): Promise<unknown>;
}

export interface BullMqQueueLike {
  add(name: string, data: JobPayload, options: JobsOptions): Promise<{ readonly id?: string }>;
  close(): Promise<void>;
  getJob?(jobId: string): Promise<BullMqStoredJobLike | undefined>;
  getJobs?(types: "failed"[], start: number, end: number): Promise<readonly BullMqStoredJobLike[]>;
}

export interface BullMqStoredJobLike {
  readonly id?: string;
  readonly name?: string;
  readonly data?: unknown;
  readonly opts?: JobsOptions;
  readonly attemptsMade?: number;
  readonly failedReason?: string;
  remove(): Promise<void>;
  retry(state?: "failed" | "completed"): Promise<void>;
  getState?(): Promise<string>;
}

export interface BullMqWorkerLike {
  close(): Promise<void>;
}

export interface BullMqJobRuntimeFactories {
  readonly createQueue?: (
    queue: string,
    connection: BullMqConnectionOptions,
  ) => BullMqQueueLike;
  readonly createWorker?: (
    queue: string,
    processor: (job: BullMqJobLike) => Promise<JobExecutionResult | void>,
    options: { readonly connection: BullMqConnectionOptions; readonly concurrency: number },
  ) => BullMqWorkerLike;
}

export interface BullMqJobRuntimeOptions extends BullMqJobRuntimeFactories {
  readonly redisUrl: string;
  readonly concurrency?: number;
  readonly defaultJobOptions?: EnqueueOptions;
  readonly lifecycle?: JobExecutionLifecycle;
  /** Inject a transport for tests, or explicitly disable cross-process cancellation. */
  readonly cancellationTransport?: JobCancellationTransport | false;
}

export interface JobRuntime extends JobPublisher, JobHandlerRegistry, JobTransportControl {
  start(): Promise<void>;
  close(): Promise<void>;
  listDeadLetters(queue: string, input?: { readonly offset?: number; readonly limit?: number }): Promise<readonly BullMqDeadLetter[]>;
  replayDeadLetter(queue: string, jobId: string, replayKey: string): Promise<string | undefined>;
}

export interface BullMqDeadLetter {
  readonly jobId: string;
  readonly queue: string;
  readonly name: string;
  readonly attemptsMade: number;
  readonly failureReason?: string;
}

export function createBullMqJobRuntime(options: BullMqJobRuntimeOptions): JobRuntime {
  const connection = createBullMqConnectionOptions(options.redisUrl);
  const concurrency = options.concurrency ?? 10;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("BullMQ worker concurrency must be a positive integer");
  }

  const createQueue = options.createQueue ?? ((name, value) => new Queue(name, { connection: value }));
  const createWorker = options.createWorker ?? ((name, processor, workerOptions) =>
    new Worker(name, processor as Processor, workerOptions));
  const handlers = new Map<string, JobHandler>();
  const queues = new Map<string, BullMqQueueLike>();
  const workers = new Map<string, BullMqWorkerLike>();
  const shutdown = new AbortController();
  const cancellation = options.cancellationTransport === false ? undefined
    : options.cancellationTransport ?? createRedisJobCancellationTransport(options.redisUrl);
  const activeJobs = new Map<string, { abort: AbortController; attempt: number; result: Promise<boolean> }>();
  const cancelActive = async (queue: string, jobId: string, attempt?: number): Promise<boolean> => {
    const active = activeJobs.get(handlerKey(queue, jobId));
    if (!active || (attempt !== undefined && attempt !== active.attempt)) return false;
    active.abort.abort(new JobExecutionError("Job cancellation requested", "JOB_CANCELLED", "cancelled"));
    return active.result;
  };
  let started = false;
  let closed = false;

  const queueFor = (queue: string): BullMqQueueLike => {
    validateName("queue", queue);
    const existing = queues.get(queue);
    if (existing) return existing;
    const created = createQueue(queue, connection);
    queues.set(queue, created);
    return created;
  };

  return {
    register(queue, name, handler) {
      assertOpen(closed);
      if (started) throw new Error("Job handlers must be registered before the runtime starts");
      validateName("queue", queue);
      validateName("job", name);
      const key = handlerKey(queue, name);
      if (handlers.has(key)) throw new Error(`Job handler already registered for ${queue}/${name}`);
      handlers.set(key, handler);
    },

    async enqueue(queue, name, data, enqueueOptions = {}) {
      assertOpen(closed);
      validateName("queue", queue);
      validateName("job", name);
      const inferredExecution = isPayload(data)
        ? inferExecutionCoordinate(data as Record<string, unknown>)
        : undefined;
      const effectiveOptions = {
        ...options.defaultJobOptions,
        ...enqueueOptions,
        ...(enqueueOptions.execution
          ? { execution: enqueueOptions.execution }
          : inferredExecution ? { execution: inferredExecution } : {}),
      };
      if (effectiveOptions.jobId && effectiveOptions.enqueueKey) {
        throw new Error("enqueue options jobId and enqueueKey are mutually exclusive");
      }
      const resolvedJobId = effectiveOptions.jobId
        ?? (effectiveOptions.enqueueKey
          ? createDeterministicEnqueueId(queue, name, effectiveOptions.enqueueKey)
          : undefined);
      validateExecution(effectiveOptions.execution);
      const storedData = encodeBullMqJobData(data, effectiveOptions);
      const job = await queueFor(queue).add(
        name,
        storedData,
        toBullMqOptions(effectiveOptions, resolvedJobId),
      );
      if (!job.id) throw new Error(`BullMQ did not assign an id to ${queue}/${name}`);
      await options.lifecycle?.enqueued({
        jobId: job.id,
        queue,
        name,
        data,
        maxAttempts: effectiveOptions.maxAttempts ?? 1,
        // Match the worker envelope: semantic enqueue keys are transport inputs,
        // while queue plus resolved job ID identifies the durable execution.
        executionKey: `${queue}:${resolvedJobId ?? job.id}`,
        ...(effectiveOptions.execution ? { execution: effectiveOptions.execution } : {}),
        ...(effectiveOptions.subject ? { subject: effectiveOptions.subject } : {}),
        ...(effectiveOptions.payloadSchema ? { payloadSchema: effectiveOptions.payloadSchema } : {}),
        enqueuedAt: new Date().toISOString(),
      });
      return job.id;
    },

    async cancel(queue, jobId) {
      assertOpen(closed);
      validateName("queue", queue);
      if (activeJobs.has(handlerKey(queue, jobId))) return cancelActive(queue, jobId);
      const target = await queueFor(queue).getJob?.(jobId);
      if (!target) return false;
      const requestActive = () => cancellation?.request(queue, jobId, (target.attemptsMade ?? 0) + 1) ?? Promise.resolve(false);
      const state = await target.getState?.();
      if (state === "active") return requestActive();
      if (!state || !["waiting", "delayed", "prioritized"].includes(state)) return false;
      try {
        await target.remove();
        return true;
      } catch (error) {
        // A queued job can become active between the state read and removal.
        const current = await target.getState?.();
        if (current === "active") return requestActive();
        if (current === "unknown" || current === "completed" || current === "failed") return false;
        throw error;
      }
    },

    async retry(queue, jobId) {
      assertOpen(closed);
      validateName("queue", queue);
      const target = await queueFor(queue).getJob?.(jobId);
      if (!target) return false;
      if (target.getState && await target.getState() !== "failed") return false;
      try {
        await target.retry("failed");
        return true;
      } catch (error) {
        // Another operator or worker may have moved the job since the state read.
        if (target.getState && await target.getState() !== "failed") return false;
        throw error;
      }
    },

    async listDeadLetters(queue, input = {}) {
      assertOpen(closed);
      validateName("queue", queue);
      const offset = positiveOrZeroInteger("offset", input.offset ?? 0);
      const limit = boundedInteger("limit", input.limit ?? 50, 1, 200);
      const failed = await queueFor(queue).getJobs?.(["failed"], offset, offset + limit - 1) ?? [];
      return failed.flatMap((job): BullMqDeadLetter[] => {
        if (!job.id || !job.name) return [];
        return [{
          jobId: job.id,
          queue,
          name: job.name,
          attemptsMade: job.attemptsMade ?? 0,
          ...(job.failedReason ? { failureReason: job.failedReason } : {}),
        }];
      });
    },

    async replayDeadLetter(queue, jobId, replayKey) {
      assertOpen(closed);
      validateName("queue", queue);
      validateEnqueueKey(replayKey);
      const targetQueue = queueFor(queue);
      const source = await targetQueue.getJob?.(jobId);
      if (!source || !source.id || !source.name || !isPayload(source.data)) return undefined;
      if (source.getState && await source.getState() !== "failed") return undefined;
      const replayId = createDeterministicEnqueueId(queue, source.name, `replay:${jobId}:${replayKey}`);
      const replay = await targetQueue.add(source.name, source.data as JobPayload, {
        ...replayableOptions(source.opts),
        jobId: replayId,
      });
      if (!replay.id) throw new Error(`BullMQ did not assign an id to replay ${queue}/${source.name}`);
      return replay.id;
    },

    async start() {
      assertOpen(closed);
      if (started) return;
      await cancellation?.listen(cancelActive);
      started = true;
      const queueNames = new Set([...handlers.keys()].map((key) => key.slice(0, key.indexOf("\0"))));
      for (const queue of queueNames) {
        const processor = async (job: BullMqJobLike): Promise<JobExecutionResult | void> => {
          const handler = handlers.get(handlerKey(queue, job.name));
          if (!handler) throw new Error(`No job handler registered for ${queue}/${job.name}`);
          const stored = fromStoredData(job.data);
          if (!stored) throw new Error(`Job ${queue}/${job.name} has a non-object payload`);
          const envelope: JobEnvelope = {
            id: job.id ?? `${queue}:${job.name}:unknown`,
            name: job.name,
            queue,
            executionKey: `${queue}:${job.opts.jobId ?? job.id ?? `${queue}:${job.name}:unknown`}`,
            data: stored.data,
            attempt: job.attemptsMade + 1,
            // BullMQ manual retry preserves attemptsMade and admits one more run
            // after exhaustion. Keep that cumulative attempt valid in durable
            // evidence without resetting history or granting automatic retries.
            maxAttempts: Math.max(job.opts.attempts ?? 1, job.attemptsMade + 1),
            enqueuedAt: new Date(job.timestamp).toISOString(),
            ...(job.opts.jobId ? { idempotencyKey: job.opts.jobId } : {}),
            ...(stored.execution ? { execution: stored.execution } : {}),
            ...(stored.subject ? { subject: stored.subject } : {}),
            ...(stored.payloadSchema ? { payloadSchema: stored.payloadSchema } : {}),
            ...(stored.execution?.correlationId
              ? { correlationId: stored.execution.correlationId }
              : {}),
          };
          const jobAbort = new AbortController();
          const activeKey = handlerKey(queue, envelope.id);
          let acknowledge!: (accepted: boolean) => void;
          const cancellationResult = new Promise<boolean>((resolve) => { acknowledge = resolve; });
          activeJobs.set(activeKey, { abort: jobAbort, attempt: envelope.attempt, result: cancellationResult });
          const abortForShutdown = () => jobAbort.abort(shutdown.signal.reason);
          shutdown.signal.addEventListener("abort", abortForShutdown, { once: true });
          const timeout = stored.timeoutMs === undefined
            ? undefined
            : setTimeout(() => jobAbort.abort(new JobTimeoutError(stored.timeoutMs!)), stored.timeoutMs);
          try {
            return await runWithJobContext(
              {
                requestId: envelope.id,
                ...(envelope.correlationId ? { correlationId: envelope.correlationId } : {}),
                ...(envelope.execution?.planeKey ? { planeKey: envelope.execution.planeKey } : {}),
                ...(envelope.execution?.tenantId ? { tenantId: envelope.execution.tenantId } : {}),
                ...(envelope.execution?.principalId
                  ? { principalId: envelope.execution.principalId }
                  : {}),
              },
              async () => {
                try {
                  await options.lifecycle?.started(envelope);
                  const result = await runHandlerWithAbort(
                    () => handler.handle(envelope, {
                      signal: jobAbort.signal,
                      attempt: envelope.attempt,
                      reportProgress: async (progress) => { await job.updateProgress(progress); },
                    }),
                    jobAbort.signal,
                  );
                  await options.lifecycle?.completed(envelope, result);
                  return result;
                } catch (error) {
                  const failure = classifyFailure(error, envelope);
                  await options.lifecycle?.failed(envelope, failure);
                  if (failure.disposition === "cancelled") acknowledge(true);
                  if ((failure.disposition === "permanent" || failure.disposition === "cancelled") && !(error instanceof UnrecoverableError)) {
                    throw new UnrecoverableError(failure.message);
                  }
                  throw error;
                }
              },
            );
          } finally {
            if (timeout !== undefined) clearTimeout(timeout);
            shutdown.signal.removeEventListener("abort", abortForShutdown);
            acknowledge(false);
            activeJobs.delete(activeKey);
          }
        };
        workers.set(queue, createWorker(queue, processor, { connection, concurrency }));
      }
    },

    async close() {
      if (closed) return;
      closed = true;
      shutdown.abort();
      await Promise.all([...workers.values()].map((worker) => worker.close()));
      await cancellation?.close();
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      workers.clear();
      queues.clear();
      activeJobs.clear();
    },
  };
}

function toBullMqOptions(options: EnqueueOptions, resolvedJobId = options.jobId): JobsOptions {
  return {
    ...(resolvedJobId ? { jobId: resolvedJobId } : {}),
    ...(options.delayMs !== undefined ? { delay: positiveOrZero("delayMs", options.delayMs) } : {}),
    ...(options.maxAttempts !== undefined
      ? { attempts: positiveInteger("maxAttempts", options.maxAttempts) }
      : {}),
    ...(options.priority !== undefined ? { priority: positiveOrZero("priority", options.priority) } : {}),
    ...(options.backoff
      ? {
          backoff: {
            type: options.backoff.kind,
            delay: positiveOrZero("backoff.delayMs", options.backoff.delayMs),
            ...(options.backoff.kind === "exponential" && options.backoff.jitter !== undefined
              ? { jitter: boundedJitter(options.backoff.jitter) }
              : {}),
          },
        }
      : {}),
    ...(options.removeOnComplete !== undefined ? { removeOnComplete: options.removeOnComplete } : {}),
    ...(options.removeOnFail !== undefined ? { removeOnFail: options.removeOnFail } : {}),
  };
}

export function createDeterministicEnqueueId(queue: string, name: string, enqueueKey: string): string {
  validateName("queue", queue);
  validateName("job", name);
  validateEnqueueKey(enqueueKey);
  const digest = createHash("sha256")
    .update(queue).update("\0").update(name).update("\0").update(enqueueKey)
    .digest("hex");
  return `athyper-${digest}`;
}

function validateEnqueueKey(value: string): void {
  if (!value.trim() || value.length > 512 || /[\u0000-\u001f]/.test(value)) {
    throw new Error("enqueueKey is invalid");
  }
}

function replayableOptions(options: JobsOptions | undefined): JobsOptions {
  if (!options) return {};
  return {
    ...(options.attempts !== undefined ? { attempts: options.attempts } : {}),
    ...(options.priority !== undefined ? { priority: options.priority } : {}),
    ...(options.backoff !== undefined ? { backoff: options.backoff } : {}),
    ...(options.removeOnComplete !== undefined ? { removeOnComplete: options.removeOnComplete } : {}),
    ...(options.removeOnFail !== undefined ? { removeOnFail: options.removeOnFail } : {}),
  };
}

interface StoredJobData {
  readonly data: JobPayload;
  readonly execution?: JobExecutionCoordinate;
  readonly subject?: EnqueueOptions["subject"];
  readonly payloadSchema?: EnqueueOptions["payloadSchema"];
  readonly timeoutMs?: number;
}

const STORED_JOB_MARKER = "__athyperJobV1";

export function encodeBullMqJobData(data: JobPayload, options: EnqueueOptions): JobPayload {
  const governed = options.execution || options.subject || options.payloadSchema || options.timeoutMs;
  if (!governed) return data;
  if (options.timeoutMs !== undefined) positiveInteger("timeoutMs", options.timeoutMs);
  return {
    [STORED_JOB_MARKER]: true,
    data,
    ...(options.execution ? { execution: options.execution } : {}),
    ...(options.subject ? { subject: options.subject } : {}),
    ...(options.payloadSchema ? { payloadSchema: options.payloadSchema } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };
}

function fromStoredData(value: unknown): StoredJobData | undefined {
  if (!isPayload(value)) return undefined;
  const candidate = normalizeStoredPlane(value as Record<string, unknown>);
  if (candidate[STORED_JOB_MARKER] !== true) {
    const execution = inferExecutionCoordinate(candidate);
    return { data: candidate, ...(execution ? { execution } : {}) };
  }
  if (!isPayload(candidate["data"])) return undefined;
  return {
    data: normalizeStoredPlane(candidate["data"] as Record<string, unknown>),
    ...(candidate["execution"] ? { execution: candidate["execution"] as JobExecutionCoordinate } : {}),
    ...(candidate["subject"] ? { subject: candidate["subject"] as EnqueueOptions["subject"] } : {}),
    ...(candidate["payloadSchema"]
      ? { payloadSchema: candidate["payloadSchema"] as EnqueueOptions["payloadSchema"] }
      : {}),
    ...(typeof candidate["timeoutMs"] === "number" ? { timeoutMs: candidate["timeoutMs"] } : {}),
  };
}

/** Compatibility bridge for pending BullMQ payloads written before Studio was canonical. */
function normalizeStoredPlane(value: Record<string, unknown>): Record<string, unknown> {
  const planeKey = value["planeKey"];
  if (planeKey === "athyper") return { ...value, planeKey: "studio" };
  return value;
}

function inferExecutionCoordinate(data: Record<string, unknown>): JobExecutionCoordinate | undefined {
  const planeKey = data["planeKey"];
  const principalId = data["principalId"];
  const tenantId = data["tenantId"];
  if ((planeKey !== "studio" && planeKey !== "athyper" && planeKey !== "neon" && planeKey !== "mesh")
    || typeof principalId !== "string" || !principalId.trim()) return undefined;
  if (tenantId !== undefined && (typeof tenantId !== "string" || !tenantId.trim())) return undefined;
  return {
    planeKey: normalizePlaneKey(planeKey as PlaneKeyInput),
    scope: typeof tenantId === "string" ? "tenant" : "plane",
    ...(typeof tenantId === "string" ? { tenantId } : {}),
    principalId,
    ...(typeof data["correlationId"] === "string" ? { correlationId: data["correlationId"] } : {}),
  };
}

function validateExecution(value: JobExecutionCoordinate | undefined): void {
  if (!value) return;
  if (value.scope === "tenant" && !value.tenantId) {
    throw new Error("Tenant-scoped jobs require tenantId");
  }
  if (value.scope === "plane" && value.tenantId) {
    throw new Error("Plane-scoped jobs cannot carry tenantId");
  }
  if (!value.principalId.trim()) throw new Error("Governed jobs require principalId");
}

async function runHandlerWithAbort<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void work().then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function classifyFailure(error: unknown, job: JobEnvelope): JobExecutionFailure {
  if (error instanceof JobTimeoutError) {
    return { disposition: "timed_out", code: "JOB_TIMEOUT", message: error.message };
  }
  if (error instanceof JobExecutionError) {
    return {
      disposition: error.disposition,
      code: error.code,
      message: error.message,
      ...(error.detail ? { detail: error.detail } : {}),
    };
  }
  const governed = error && typeof error === "object" && !Array.isArray(error)
    ? error as Readonly<Record<string, unknown>>
    : undefined;
  const message = error instanceof Error ? error.message : "Unknown job execution failure";
  return {
    disposition: governed?.["retryable"] === false
      ? "permanent"
      : job.attempt < job.maxAttempts ? "retryable" : "permanent",
    code: typeof governed?.["code"] === "string" ? governed["code"] : "JOB_EXECUTION_FAILED",
    message,
  };
}

export class JobExecutionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly disposition: JobExecutionFailure["disposition"] = "permanent",
    readonly detail?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "JobExecutionError";
  }
}

class JobTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Job execution exceeded ${timeoutMs}ms`);
    this.name = "JobTimeoutError";
  }
}

function validateName(kind: string, value: string): void {
  if (!RESOURCE_NAME.test(value)) throw new Error(`Invalid ${kind} name: ${value}`);
}

function handlerKey(queue: string, name: string): string {
  return `${queue}\0${name}`;
}

function isPayload(value: unknown): value is JobPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOpen(closed: boolean): void {
  if (closed) throw new Error("Job runtime is closed");
}

function positiveOrZero(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
  return value;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function positiveOrZeroInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function boundedInteger(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function boundedJitter(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("backoff.jitter must be between 0 and 1");
  }
  return value;
}
