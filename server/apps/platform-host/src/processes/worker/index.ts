import { bootstrap } from "../../kernel/bootstrap.js";
import { startProcessHeartbeat } from "../process-heartbeat.js";
import { startProcessMetricsEndpoint } from "../process-metrics-endpoint.js";

// Capability-owned BullMQ handlers are registered through the shared
// composition root before the worker runtime starts consuming queues.

export async function start(): Promise<void> {
  const { config, lifecycle, container } = await bootstrap("worker");
  const { startRuntimes } = await import("../../composition/register-runtimes.js");
  const { registerInvalidationWorkers } = await import("../../composition/register-invalidation-workers.js");
  registerInvalidationWorkers(container, config, lifecycle);
  await startRuntimes(container, config.mode);
  const metrics = container.adapters.processMetrics
    ? await startProcessMetricsEndpoint(container.adapters.processMetrics)
    : undefined;
  if (metrics) lifecycle.onShutdown(() => metrics.stop());
  const heartbeat = await startProcessHeartbeat("worker");
  lifecycle.onShutdown(() => heartbeat.stop());

  console.log(
    `[worker] started env=${config.env} pid=${process.pid}${metrics ? ` metricsPort=${metrics.port}` : ""}`,
  );
  await lifecycle.signalReady();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] shutdown signal=${signal} pid=${process.pid}`);
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
