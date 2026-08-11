import { Queue, type JobsOptions, type RepeatOptions } from "bullmq";
import type {
  EnqueueOptions,
  JobPayload,
  JobScheduler,
  ScheduledJobDefinition,
} from "@athyper/server-contract-jobs";
import {
  createBullMqConnectionOptions,
  encodeBullMqJobData,
  type BullMqConnectionOptions,
} from "@athyper/server-runtime-jobs";

export interface BullMqScheduleQueue {
  upsertJobScheduler(
    scheduleId: string,
    repeat: RepeatOptions,
    template: { readonly name: string; readonly data: JobPayload; readonly opts: JobsOptions },
  ): Promise<unknown>;
  removeJobScheduler(scheduleId: string): Promise<boolean>;
  close(): Promise<void>;
}

export interface BullMqJobSchedulerOptions {
  readonly redisUrl: string;
  readonly createQueue?: (
    queue: string,
    connection: BullMqConnectionOptions,
  ) => BullMqScheduleQueue;
}

export interface ClosableJobScheduler extends JobScheduler {
  close(): Promise<void>;
}

export function createBullMqJobScheduler(
  options: BullMqJobSchedulerOptions,
): ClosableJobScheduler {
  const connection = createBullMqConnectionOptions(options.redisUrl);
  const createQueue = options.createQueue ?? ((name, value) => new Queue(name, { connection: value }));
  const queues = new Map<string, BullMqScheduleQueue>();
  const owners = new Map<string, string>();
  let closed = false;

  const queueFor = (name: string): BullMqScheduleQueue => {
    validateQueue(name);
    const existing = queues.get(name);
    if (existing) return existing;
    const created = createQueue(name, connection);
    queues.set(name, created);
    return created;
  };

  return {
    async upsert(definition) {
      assertOpen(closed);
      validateScheduleId(definition.scheduleId);
      const previousOwner = owners.get(definition.scheduleId);
      if (previousOwner && previousOwner !== definition.queue) {
        throw new Error(
          `Schedule ${definition.scheduleId} is already owned by queue ${previousOwner}`,
        );
      }
      await queueFor(definition.queue).upsertJobScheduler(
        definition.scheduleId,
        toRepeatOptions(definition),
        {
          name: definition.name,
          data: encodeBullMqJobData(definition.data, definition.options ?? {}),
          opts: toJobOptions(definition.options),
        },
      );
      owners.set(definition.scheduleId, definition.queue);
    },

    async remove(scheduleId) {
      assertOpen(closed);
      validateScheduleId(scheduleId);
      const owner = owners.get(scheduleId);
      if (!owner) return false;
      const removed = await queueFor(owner).removeJobScheduler(scheduleId);
      if (removed) owners.delete(scheduleId);
      return removed;
    },

    async close() {
      if (closed) return;
      closed = true;
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      queues.clear();
      owners.clear();
    },
  };
}

function toRepeatOptions(definition: ScheduledJobDefinition): RepeatOptions {
  if (definition.pattern.kind === "interval") {
    if (!Number.isInteger(definition.pattern.everyMs) || definition.pattern.everyMs < 1) {
      throw new Error("Schedule interval must be a positive integer");
    }
    return { every: definition.pattern.everyMs };
  }
  const pattern = definition.pattern.expression.trim();
  if (!pattern) throw new Error("Schedule cron expression cannot be empty");
  if (pattern.split(/\s+/).length < 5 || pattern.split(/\s+/).length > 6) throw new Error("Schedule cron expression must contain five or six fields");
  if (definition.pattern.timezone) validateTimeZone(definition.pattern.timezone);
  return {
    pattern,
    ...(definition.pattern.timezone ? { tz: definition.pattern.timezone } : {}),
  };
}

function validateTimeZone(value: string): void {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); }
  catch { throw new Error(`Invalid schedule timezone: ${value}`); }
}

function toJobOptions(options: EnqueueOptions | undefined): JobsOptions {
  if (!options) return {};
  if (options.delayMs !== undefined && (!Number.isFinite(options.delayMs) || options.delayMs < 0)) {
    throw new Error("Schedule delayMs must be non-negative");
  }
  if (options.maxAttempts !== undefined
    && (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1)) {
    throw new Error("Schedule maxAttempts must be a positive integer");
  }
  return {
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.delayMs !== undefined ? { delay: options.delayMs } : {}),
    ...(options.maxAttempts !== undefined ? { attempts: options.maxAttempts } : {}),
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

function positiveOrZero(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
  return value;
}

function boundedJitter(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("backoff.jitter must be between 0 and 1");
  }
  return value;
}

function validateQueue(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`Invalid schedule queue name: ${value}`);
  }
}

function validateScheduleId(value: string): void {
  if (!value.trim() || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw new Error("Schedule id is invalid");
  }
}

function assertOpen(closed: boolean): void {
  if (closed) throw new Error("Job scheduler is closed");
}
