import {
  assertDedicatedJobStore,
  createQueueMaintenance,
} from "@athyper/server-runtime-jobs";
import { loadConfig } from "../../config/index.js";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { createContainer } from "../../composition/create-container.js";
import { registerAdapters } from "../../composition/register-adapters.js";
import { registerPlatform } from "../../composition/register-platform.js";
import {
  registerRuntimes,
  startRuntimes,
} from "../../composition/register-runtimes.js";
import { registerServices } from "../../composition/register-services.js";
import { startProcessHeartbeat } from "../process-heartbeat.js";
import { startProcessMetricsEndpoint } from "../process-metrics-endpoint.js";

// Governed DDL schedules and capability-owned repeatable work are registered
// through the shared composition root before reconciliation starts.

export async function start(): Promise<void> {
  const config = loadConfig();
  if (config.bullMq.url)
    assertDedicatedJobStore(config.bullMq.url, config.redis.url);
  const lifecycle = createLifecycle();
  const container = createContainer();
  registerAdapters(container, config, lifecycle);
  registerRuntimes(container, config, lifecycle);
  registerPlatform(container, config);
  registerServices(container, {}, config, lifecycle);
  await startRuntimes(container, config.mode);
  const registry = container.adapters.processMetrics;
  const lastSuccess = registry?.gauge(
    "athyper_scheduler_last_success_timestamp_seconds",
    "Last successful job-store maintenance and connectivity check",
  );
  const queueSize = registry?.gauge(
    "athyper_job_queue_size",
    "Application jobs by state across all queues",
  );
  const maintenance = createQueueMaintenance(config.bullMq.url!, (counts) => {
    for (const [state, count] of Object.entries(counts))
      queueSize?.set(count, { state });
  });
  let sweep: Promise<void> | undefined;
  const runMaintenance = () => {
    if (sweep) return;
    sweep = maintenance
      .run()
      .then(() => {
        lastSuccess?.set(Date.now() / 1000);
      })
      .catch(() => console.error("[scheduler] queue_maintenance_failed"))
      .finally(() => {
        sweep = undefined;
      });
  };
  lastSuccess?.set(0);
  runMaintenance();
  const maintenanceTimer = setInterval(runMaintenance, 60_000);
  maintenanceTimer.unref();
  lifecycle.onShutdown(async () => {
    clearInterval(maintenanceTimer);
    await sweep;
    await maintenance.close();
  });
  const metrics = container.adapters.processMetrics
    ? await startProcessMetricsEndpoint(container.adapters.processMetrics)
    : undefined;
  if (metrics) lifecycle.onShutdown(() => metrics.stop());
  const heartbeat = await startProcessHeartbeat("scheduler");
  lifecycle.onShutdown(() => heartbeat.stop());

  console.log(
    `[scheduler] started env=${config.env} pid=${process.pid}${metrics ? ` metricsPort=${metrics.port}` : ""}`,
  );
  await lifecycle.signalReady();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[scheduler] shutdown signal=${signal} pid=${process.pid}`);
    await Promise.race([
      lifecycle.shutdown(signal),
      new Promise<void>((resolve) =>
        setTimeout(resolve, config.shutdownTimeoutMs),
      ),
    ]);
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
