import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import { runWithJobContext } from "@athyper/server-foundation/context";
import { createCronwatchJobLifecycle, createMetricJobExecutionLifecycle } from "@athyper/server-adapter-telemetry-otel";
import {
  createJobExecutionLifecycle,
  createKyselyJobExecutionStore,
  type JobTransaction,
  type JobTransactionCoordinator,
} from "@athyper/server-service-jobs";
import {
  createBullMqJobRuntime,
  type BullMqJobRuntimeOptions,
  type JobRuntime,
} from "@athyper/server-runtime-jobs";
import {
  createBullMqJobScheduler,
  createSchedulingRuntime,
  type BullMqJobSchedulerOptions,
  type ClosableJobScheduler,
} from "@athyper/server-runtime-scheduling";

import type { HostConfig } from "../config/index.js";
import type { Container } from "./create-container.js";
import { captureOperationalError } from "../monitoring/error-collector.js";

export interface RuntimeRegistrationDependencies {
  createJobs(options: BullMqJobRuntimeOptions): JobRuntime;
  createScheduler(options: BullMqJobSchedulerOptions): ClosableJobScheduler;
}

const DEFAULT_DEPENDENCIES: RuntimeRegistrationDependencies = {
  createJobs: createBullMqJobRuntime,
  createScheduler: createBullMqJobScheduler,
};

export function registerRuntimes(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<RuntimeRegistrationDependencies> = {},
): void {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  if ((config.mode === "worker" || config.mode === "scheduler") && !config.bullMq.url) {
    throw new Error(
      `${config.mode} mode requires REDIS_BULLMQ_URL (or explicitly approved shared Redis)`,
    );
  }

  if (config.bullMq.url && (config.mode === "api" || config.mode === "worker")) {
    const jobTransactions = createJobTransactionCoordinator(container);
    container.runtimes.jobTransactions = jobTransactions;
    const executionStore = createKyselyJobExecutionStore(jobTransactions);
    const executionLifecycle = createJobExecutionLifecycle({ store: executionStore });
    const metricLifecycle = container.adapters.openTelemetry
      ? createMetricJobExecutionLifecycle(executionLifecycle, container.adapters.openTelemetry.metrics)
      : executionLifecycle;
    const monitoredLifecycle = createCronwatchJobLifecycle({
      delegate: {
        enqueued: (input) => metricLifecycle.enqueued(input),
        started: (job) => metricLifecycle.started(job),
        completed: (job, result) => metricLifecycle.completed(job, result),
        async failed(job, failure) {
          await metricLifecycle.failed(job, failure);
          captureOperationalError(new Error(failure.message), {
            "job.queue": job.queue,
            "job.name": job.name,
            "job.failure_code": failure.code,
            "job.disposition": failure.disposition,
          });
        },
      },
      baseUrl: config.jobs.cronwatchBaseUrl,
      pingKey: config.jobs.cronwatchPingKey,
      warn: (message) => console.warn(`[jobs] cronwatch_ping_failed ${message}`),
    });
    const jobs = dependencies.createJobs({
      redisUrl: config.bullMq.url,
      concurrency: config.bullMq.concurrency,
      lifecycle: monitoredLifecycle,
    });
    container.runtimes.jobs = jobs;
    lifecycle.onShutdown(() => jobs.close());
  }

  if (config.bullMq.url && config.mode === "scheduler") {
    const scheduler = dependencies.createScheduler({ redisUrl: config.bullMq.url });
    container.runtimes.scheduler = scheduler;
    lifecycle.onShutdown(() => scheduler.close());
    container.runtimes.scheduleReconcileMs = config.jobs.scheduleReconcileMs;
    lifecycle.onShutdown(() => {
      if (container.runtimes.scheduleReconcileTimer) {
        clearInterval(container.runtimes.scheduleReconcileTimer);
      }
    });
  }
}

export async function startRuntimes(container: Container, mode: string): Promise<void> {
  if (mode === "worker") await container.runtimes.jobs?.start();
  if (mode === "scheduler" && container.runtimes.scheduler) {
    await createSchedulingRuntime({
      scheduler: container.runtimes.scheduler,
      definitions: container.runtimes.scheduledJobs,
    }).start();
    if (container.runtimes.scheduleReconcile) {
      await container.runtimes.scheduleReconcile();
      let running = false;
      const timer = setInterval(() => {
        if (running) return;
        running = true;
        void container.runtimes.scheduleReconcile?.()
          .catch((error: unknown) => console.error(
            "[scheduler] reconciliation_failed",
            error instanceof Error ? error.message : String(error),
          ))
          .finally(() => { running = false; });
      }, container.runtimes.scheduleReconcileMs ?? 60_000);
      timer.unref();
      container.runtimes.scheduleReconcileTimer = timer;
    }
  }
}

function createJobTransactionCoordinator(container: Container): JobTransactionCoordinator {
  const adapterFor = (planeKey: "studio" | "neon" | "mesh") => {
    const adapter = planeKey === "studio"
      ? container.adapters.athyperDatabase
      : planeKey === "neon" ? container.adapters.neonDatabase : container.adapters.meshDatabase;
    if (!adapter) throw new Error(`Jobs database is not configured for ${planeKey}`);
    return adapter;
  };
  const systemAdapterFor = (planeKey: "studio" | "neon" | "mesh") => {
    const adapter = planeKey === "studio"
      ? container.adapters.jobAthyperDatabase
      : planeKey === "neon" ? container.adapters.jobNeonDatabase : container.adapters.jobMeshDatabase;
    return adapter ?? adapterFor(planeKey);
  };
  return {
    runTenant(planeKey, actor, work) {
      return runWithJobContext(
        { requestId: `job-store:${planeKey}:${actor.tenantId}`, planeKey, ...actor },
        () => adapterFor(planeKey).withTenantTransaction(
          (transaction) => work(transaction as unknown as JobTransaction),
        ),
      );
    },
    runSystem(planeKey, work) {
      return systemAdapterFor(planeKey).withSystemTransaction(
        (transaction) => work(transaction as unknown as JobTransaction),
      );
    },
  };
}
