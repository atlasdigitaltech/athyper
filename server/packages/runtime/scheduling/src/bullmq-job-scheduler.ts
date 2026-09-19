import { jobRetention } from "@athyper/server-runtime-jobs";
import { Queue, type JobsOptions, type RepeatOptions } from "bullmq";
import type {
  EnqueueOptions,
  JobPayload,
  JobScheduler,
  ScheduleDriftReport,
  ScheduledJobDefinition,
} from "@athyper/server-contract-jobs";
import {
  createBullMqConnectionOptions,
  encodeBullMqJobData,
  type BullMqConnectionOptions,
} from "@athyper/server-runtime-jobs";
import {
  createRedisSchedulerLeaderLease,
  SchedulerLeadershipError,
  type RedisSchedulerLeaderLeaseOptions,
  type SchedulerLeaderLease,
} from "./scheduler-leader-lease.js";
import {
  createRedisScheduleOwnerRegistry,
  type RedisScheduleOwnerRegistryOptions,
  type ScheduleOwnerRegistry,
} from "./schedule-owner-registry.js";

export interface BullMqJobSchedulerSnapshot {
  readonly name: string;
  readonly pattern?: string;
  readonly every?: number;
  readonly tz?: string;
  readonly next?: number;
}

export interface BullMqScheduleQueue {
  upsertJobScheduler(
    scheduleId: string,
    repeat: RepeatOptions,
    template: {
      readonly name: string;
      readonly data: JobPayload;
      readonly opts: JobsOptions;
    },
  ): Promise<unknown>;
  removeJobScheduler(scheduleId: string): Promise<boolean>;
  getJobScheduler?(
    scheduleId: string,
  ): Promise<BullMqJobSchedulerSnapshot | undefined>;
  close(): Promise<void>;
}

export interface BullMqJobSchedulerOptions {
  readonly redisUrl: string;
  readonly createQueue?: (
    queue: string,
    connection: BullMqConnectionOptions,
  ) => BullMqScheduleQueue;
  /** Enables Redis-backed single-leader fencing for all scheduler mutations. */
  readonly leaderElection?: RedisSchedulerLeaderLeaseOptions | false;
  readonly leaderLease?: SchedulerLeaderLease;
  /** Bounded acquisition wait for a source restart while the previous lease expires. */
  readonly leaderAcquireTimeoutMs?: number;
  readonly ownerRegistry?: ScheduleOwnerRegistry;
  readonly ownerRegistryOptions?: RedisScheduleOwnerRegistryOptions;
}

export interface ClosableJobScheduler extends JobScheduler {
  listScheduleIds(): Promise<readonly string[]>;
  close(): Promise<void>;
}

export function createBullMqJobScheduler(
  options: BullMqJobSchedulerOptions,
): ClosableJobScheduler {
  const connection = createBullMqConnectionOptions(options.redisUrl);
  const createQueue =
    options.createQueue ??
    ((name, value) => new Queue(name, { connection: value }));
  const queues = new Map<string, BullMqScheduleQueue>();
  const leaderLease =
    options.leaderLease ??
    (options.leaderElection === false
      ? undefined
      : createRedisSchedulerLeaderLease(
          options.redisUrl,
          options.leaderElection,
        ));
  if (!leaderLease && !options.ownerRegistry) {
    throw new Error(
      "Disabling scheduler leader fencing requires an explicit owner registry",
    );
  }
  const ownerRegistry =
    options.ownerRegistry ??
    createRedisScheduleOwnerRegistry(options.redisUrl, {
      ...options.ownerRegistryOptions,
      leaseKey: leaderLease!.leaseKey,
    });
  let closed = false;

  const acquireTimeoutMs = options.leaderAcquireTimeoutMs ?? 0;
  if (
    !Number.isInteger(acquireTimeoutMs) ||
    acquireTimeoutMs < 0 ||
    acquireTimeoutMs > 60_000
  )
    throw new Error("leaderAcquireTimeoutMs must be between 0 and 60000");
  const acquireMutationFence = async (): Promise<string> => {
    const deadline = Date.now() + acquireTimeoutMs;
    while (leaderLease && !(await leaderLease.acquire())) {
      if (closed || Date.now() >= deadline)
        throw new SchedulerLeadershipError();
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(250, deadline - Date.now())),
      );
    }
    const token = leaderLease?.fencingToken ?? "in-memory-test-fence";
    if (!token)
      throw new SchedulerLeadershipError(
        "Scheduler leader lease has no fencing token",
      );
    return token;
  };

  const assertMutationFence = async (): Promise<void> => {
    await leaderLease?.assertLeadership();
  };

  const queueFor = (name: string): BullMqScheduleQueue => {
    validateQueue(name);
    const existing = queues.get(name);
    if (existing) return existing;
    const created = createQueue(name, connection);
    queues.set(name, created);
    return created;
  };

  return {
    async listScheduleIds() {
      assertOpen(closed);
      return ownerRegistry.listScheduleIds();
    },

    async upsert(definition) {
      assertOpen(closed);
      const fencingToken = await acquireMutationFence();
      validateScheduleId(definition.scheduleId);
      const previousOwner = await ownerRegistry.get(definition.scheduleId);
      if (previousOwner && previousOwner !== definition.queue) {
        await assertMutationFence();
        await queueFor(previousOwner).removeJobScheduler(definition.scheduleId);
      }
      await ownerRegistry.claim(
        definition.scheduleId,
        definition.queue,
        fencingToken,
      );
      await assertMutationFence();
      await queueFor(definition.queue).upsertJobScheduler(
        definition.scheduleId,
        toRepeatOptions(definition),
        {
          name: definition.name,
          data: encodeBullMqJobData(definition.data, definition.options ?? {}),
          opts: toJobOptions(definition.options),
        },
      );
    },

    async remove(scheduleId) {
      assertOpen(closed);
      const fencingToken = await acquireMutationFence();
      validateScheduleId(scheduleId);
      const owner = await ownerRegistry.get(scheduleId);
      if (!owner) return false;
      await assertMutationFence();
      const removed = await queueFor(owner).removeJobScheduler(scheduleId);
      // Removal is idempotent: a prior process may have removed the scheduler
      // but crashed before releasing its durable owner entry.
      await ownerRegistry.release(scheduleId, owner, fencingToken);
      return removed;
    },

    async inspect(definition): Promise<ScheduleDriftReport> {
      assertOpen(closed);
      validateScheduleId(definition.scheduleId);
      const queue = queueFor(definition.queue);
      if (!queue.getJobScheduler) {
        return {
          scheduleId: definition.scheduleId,
          queue: definition.queue,
          status: "unknown",
          differences: ["BullMQ scheduler inspection is unavailable"],
        };
      }
      const observed = await queue.getJobScheduler(definition.scheduleId);
      if (!observed) {
        return {
          scheduleId: definition.scheduleId,
          queue: definition.queue,
          status: "missing",
          differences: ["schedule is absent from Redis"],
        };
      }
      const desired = toRepeatOptions(definition);
      const differences: string[] = [];
      if (observed.name !== definition.name)
        differences.push(`name:${observed.name}->${definition.name}`);
      if (
        desired.pattern !== undefined &&
        observed.pattern !== desired.pattern
      ) {
        differences.push(
          `pattern:${observed.pattern ?? "missing"}->${desired.pattern}`,
        );
      }
      if (desired.every !== undefined && observed.every !== desired.every) {
        differences.push(
          `every:${observed.every ?? "missing"}->${desired.every}`,
        );
      }
      if (desired.tz !== undefined && observed.tz !== desired.tz) {
        differences.push(`timezone:${observed.tz ?? "missing"}->${desired.tz}`);
      }
      return {
        scheduleId: definition.scheduleId,
        queue: definition.queue,
        status: differences.length ? "drifted" : "in_sync",
        differences,
        ...(observed.next !== undefined
          ? { observedNextRunAt: new Date(observed.next).toISOString() }
          : {}),
      };
    },

    async close() {
      if (closed) return;
      closed = true;
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      await Promise.all([ownerRegistry.close(), leaderLease?.close()]);
      queues.clear();
    },
  };
}

function toRepeatOptions(definition: ScheduledJobDefinition): RepeatOptions {
  if (definition.pattern.kind === "interval") {
    if (
      !Number.isInteger(definition.pattern.everyMs) ||
      definition.pattern.everyMs < 1
    ) {
      throw new Error("Schedule interval must be a positive integer");
    }
    return { every: definition.pattern.everyMs };
  }
  const pattern = definition.pattern.expression.trim();
  if (!pattern) throw new Error("Schedule cron expression cannot be empty");
  if (pattern.split(/\s+/).length < 5 || pattern.split(/\s+/).length > 6)
    throw new Error("Schedule cron expression must contain five or six fields");
  if (definition.pattern.timezone)
    validateTimeZone(definition.pattern.timezone);
  return {
    pattern,
    ...(definition.pattern.timezone ? { tz: definition.pattern.timezone } : {}),
  };
}

function validateTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new Error(`Invalid schedule timezone: ${value}`);
  }
}

function toJobOptions(options: EnqueueOptions | undefined): JobsOptions {
  options ??= {};
  if (
    options.delayMs !== undefined &&
    (!Number.isFinite(options.delayMs) || options.delayMs < 0)
  ) {
    throw new Error("Schedule delayMs must be non-negative");
  }
  if (
    options.maxAttempts !== undefined &&
    (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1)
  ) {
    throw new Error("Schedule maxAttempts must be a positive integer");
  }
  return {
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.delayMs !== undefined ? { delay: options.delayMs } : {}),
    ...(options.maxAttempts !== undefined
      ? { attempts: options.maxAttempts }
      : {}),
    ...(options.priority !== undefined
      ? { priority: positiveOrZero("priority", options.priority) }
      : {}),
    ...(options.backoff
      ? {
          backoff: {
            type: options.backoff.kind,
            delay: positiveOrZero("backoff.delayMs", options.backoff.delayMs),
            ...(options.backoff.kind === "exponential" &&
            options.backoff.jitter !== undefined
              ? { jitter: boundedJitter(options.backoff.jitter) }
              : {}),
          },
        }
      : {}),
    ...jobRetention(options),
  };
}

function positiveOrZero(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be non-negative`);
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
