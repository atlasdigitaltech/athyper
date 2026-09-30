import { parseInstant } from "@athyper/platform-temporal";
import type { JobExecutionLifecycle } from "@athyper/server-contract-jobs";
import type { MetricsRegistry } from "@athyper/server-foundation/observability";
import { ATHYPER_METRIC_CATALOG, JOB_QUEUE_LABELS } from "./prometheus-metrics.js";

export function metricQueue(queue: string): typeof JOB_QUEUE_LABELS[number] {
  const value = queue.toLowerCase();
  if (value.includes("publication")) return "publication";
  if (value.includes("document")) return "documents";
  if (value.includes("notification")) return "notifications";
  if (value.includes("integration")) return "integrations";
  if (value.includes("maintenance") || value.includes("invalidation")) return "maintenance";
  return "unknown";
}

export function createMetricJobExecutionLifecycle(delegate: JobExecutionLifecycle, metrics: MetricsRegistry, now: () => number = Date.now): JobExecutionLifecycle {
  const latency = metrics.histogram(ATHYPER_METRIC_CATALOG.jobLatency, "Time from job enqueue to execution start");
  const retries = metrics.counter(ATHYPER_METRIC_CATALOG.jobRetries, "Job execution retries");
  const dlq = metrics.counter(ATHYPER_METRIC_CATALOG.jobDlq, "Jobs exhausted or permanently discarded");
  const integration = metrics.histogram(ATHYPER_METRIC_CATALOG.integrationDelivery, "Integration delivery end-to-end latency");
  const scheduleLag = metrics.histogram(ATHYPER_METRIC_CATALOG.scheduleLag, "Scheduled or queued execution lag");
  return {
    enqueued: (input) => delegate.enqueued(input),
    async started(job) {
      const lagSeconds = Math.max(0, now() - parseInstant(job.enqueuedAt)) / 1000;
      latency.record(lagSeconds, { queue: metricQueue(job.queue), capability: "jobs" });
      scheduleLag.record(lagSeconds, { queue: metricQueue(job.queue), capability: "scheduling" });
      if (job.attempt > 1) retries.increment({ queue: metricQueue(job.queue), capability: "jobs" });
      await delegate.started(job);
    },
    async completed(job, result) {
      if (metricQueue(job.queue) === "integrations") integration.record(Math.max(0, now() - parseInstant(job.enqueuedAt)) / 1000, { outcome: "delivered", capability: "integration" });
      await delegate.completed(job, result);
    },
    async failed(job, failure) {
      if (failure.disposition === "permanent" || job.attempt >= job.maxAttempts) dlq.increment({ queue: metricQueue(job.queue), capability: "jobs" });
      if (metricQueue(job.queue) === "integrations") integration.record(Math.max(0, now() - parseInstant(job.enqueuedAt)) / 1000, { outcome: failure.disposition === "permanent" || job.attempt >= job.maxAttempts ? "dead_letter" : "retry", capability: "integration" });
      await delegate.failed(job, failure);
    },
  };
}

export function createOperationalMetrics(metrics: MetricsRegistry) {
  return {
    dbPool: metrics.gauge(ATHYPER_METRIC_CATALOG.dbPool, "PostgreSQL pool connections by state"),
    redis: metrics.counter(ATHYPER_METRIC_CATALOG.redis, "Redis operations by operation and outcome"),
    scheduleLag: metrics.histogram(ATHYPER_METRIC_CATALOG.scheduleLag, "Scheduled execution lag"),
    outboxLag: metrics.gauge(ATHYPER_METRIC_CATALOG.outboxLag, "Oldest pending outbox item age"),
    cacheInvalidation: metrics.counter(ATHYPER_METRIC_CATALOG.cacheInvalidation, "Cache invalidation outcomes"),
    integrationDelivery: metrics.histogram(ATHYPER_METRIC_CATALOG.integrationDelivery, "Integration delivery duration"),
  } as const;
}
