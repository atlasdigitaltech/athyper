import { loadConfig } from "../../config/index.js";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { createContainer } from "../../composition/create-container.js";
import { registerAdapters } from "../../composition/register-adapters.js";
import { registerPlatform } from "../../composition/register-platform.js";
import { registerRuntimes, startRuntimes } from "../../composition/register-runtimes.js";
import { registerServices } from "../../composition/register-services.js";
import { startProcessHeartbeat } from "../process-heartbeat.js";
import { startProcessMetricsEndpoint } from "../process-metrics-endpoint.js";

// Governed DDL schedules and capability-owned repeatable work are registered
// through the shared composition root before reconciliation starts.

export async function start(): Promise<void> {
  const config = loadConfig();
  const lifecycle = createLifecycle();
  const container = createContainer();
  registerAdapters(container, config, lifecycle);
  registerRuntimes(container, config, lifecycle);
  registerPlatform(container, config);
  registerServices(container, {}, config);
  await startRuntimes(container, config.mode);
  const metrics=container.adapters.processMetrics?await startProcessMetricsEndpoint(container.adapters.processMetrics):undefined;
  if(metrics)lifecycle.onShutdown(()=>metrics.stop());
  const heartbeat = await startProcessHeartbeat("scheduler");
  lifecycle.onShutdown(() => heartbeat.stop());

  console.log(`[scheduler] started env=${config.env} pid=${process.pid}${metrics?` metricsPort=${metrics.port}`:""}`);
  await lifecycle.signalReady();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[scheduler] shutdown signal=${signal} pid=${process.pid}`);
    await Promise.race([
      lifecycle.shutdown(signal),
      new Promise<void>((resolve) => setTimeout(resolve, config.shutdownTimeoutMs)),
    ]);
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
