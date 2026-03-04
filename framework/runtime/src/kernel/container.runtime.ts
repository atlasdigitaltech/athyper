// framework/runtime/src/kernel/container.runtime.ts
//
// Registers runtime execution engine tokens: jobQueue, workerPool, scheduler.
// Called during bootstrap BEFORE module loading (modules resolve jobQueue during register()).

import { CronScheduler } from "../services/platform/automation-jobs/cron-scheduler.js";
import { RedisJobQueue } from "../services/platform/automation-jobs/redis-queue.js";
import { WorkerPool } from "../services/platform/automation-jobs/worker-pool.js";

import { TOKENS } from "./tokens";

import type { RuntimeConfig } from "./config.schema";
import type { Container } from "./container";
import type { Logger } from "./logger";
import type { JobRegistry } from "../services/platform/foundation/registries/jobs.registry.js";
import type { JobQueue } from "@athyper/core";

/**
 * Registers runtime execution tokens into the container.
 *
 * Called after registerAdapters() / registerMetaServices() during bootstrap,
 * but BEFORE loadServices() — because modules resolve TOKENS.jobQueue during
 * their register() phase.
 */
export async function registerRuntimeServices(
  container: Container,
  config: RuntimeConfig,
) {
  const healthRegistry = await container.resolve<any>(TOKENS.healthRegistry);
  const logger = await container.resolve<Logger>(TOKENS.logger);

  // ── Job Queue (BullMQ via dedicated ioredis connection) ──────────────
  //
  // BullMQ requires maxRetriesPerRequest: null on ioredis.
  // We create a dedicated connection here rather than reusing the cache adapter's client.
  container.register(
    TOKENS.jobQueue,
    async () => {
      const { default: Redis } = await import("ioredis");
      const redis = new Redis(config.redis.url, {
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
      });

      const queue = new RedisJobQueue({
        redis,
        queueName: config.jobQueue?.queueName ?? "athyper-jobs",
        defaultJobOptions: {
          attempts: config.jobQueue?.defaultRetries ?? 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: false,
          removeOnFail: false,
        },
      });

      // Health check
      healthRegistry.register(
        "job-queue",
        async () => {
          try {
            const metrics = await queue.getMetrics();
            return {
              status: "healthy" as const,
              message: `Queue: waiting=${metrics.waiting} active=${metrics.active} failed=${metrics.failed}`,
              timestamp: new Date(),
            };
          } catch (error) {
            return {
              status: "unhealthy" as const,
              message:
                error instanceof Error ? error.message : "Queue unreachable",
              timestamp: new Date(),
            };
          }
        },
        { type: "queue", required: config.mode !== "api" },
      );

      logger.info(
        { queueName: config.jobQueue?.queueName ?? "athyper-jobs" },
        "[runtime] job queue registered",
      );

      return queue;
    },
    "singleton",
  );

  // ── Worker Pool (lifecycle wrapper) ──────────────────────────────────
  //
  // Modules register workers directly on jobQueue via jobQueue.process() during contribute().
  // WorkerPool manages lifecycle (event logging, start/stop) with an empty workers array.
  container.register(
    TOKENS.workerPool,
    async (c) => {
      const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
      const poolLogger = await c.resolve<Logger>(TOKENS.logger);

      return new WorkerPool({
        queue: jobQueue,
        logger: poolLogger,
        workers: [], // Workers are registered by modules during contribute()
      });
    },
    "singleton",
  );

  // ── Scheduler (BullMQ repeatable jobs) ───────────────────────────────
  //
  // Reads ScheduleDef entries from JobRegistry (contributed by modules during contribute())
  // and creates BullMQ repeatable jobs at start() time.
  container.register(
    TOKENS.scheduler,
    async (c) => {
      const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
      const jobRegistry = await c.resolve<JobRegistry>(TOKENS.jobRegistry);
      const schedulerLogger = await c.resolve<Logger>(TOKENS.logger);

      return new CronScheduler({
        jobQueue,
        jobRegistry,
        logger: schedulerLogger,
      });
    },
    "singleton",
  );
}
