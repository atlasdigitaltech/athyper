import { loadDeploymentEntityReleaseReview } from "../../composition/entity-release-review-deployment.js";
import type { Kysely } from "kysely";
import { loadConfig } from "../../config/index.js";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { createContainer } from "../../composition/create-container.js";
import { registerAdapters } from "../../composition/register-adapters.js";
import { registerPlatform } from "../../composition/register-platform.js";
import { registerRuntimes, startRuntimes } from "../../composition/register-runtimes.js";
import { registerServices } from "../../composition/register-services.js";
import { startProcessHeartbeat } from "../process-heartbeat.js";
import { registerInvalidationWorkers } from "../../composition/register-invalidation-workers.js";
import { startProcessMetricsEndpoint } from "../process-metrics-endpoint.js";

// Capability-owned BullMQ handlers are registered through the shared
// composition root before the worker runtime starts consuming queues.

export async function start(): Promise<void> {
  const config = loadConfig();
  const lifecycle = createLifecycle();
  const container = createContainer();
  registerAdapters(container, config, lifecycle);
  registerRuntimes(container, config, lifecycle);
  registerPlatform(container, config);
  const reviewConfigPath=process.env.ENTITY_RELEASE_REVIEW_CONFIG_PATH;
  if(reviewConfigPath&&(!container.adapters.neonDatabase||!container.adapters.athyperDatabase))throw Error("RELEASE_REVIEW_DATABASES_REQUIRED");
  const releaseReview=reviewConfigPath?loadDeploymentEntityReleaseReview(reviewConfigPath,{
    neon:container.adapters.neonDatabase!.database as unknown as Kysely<Record<string,never>>,
    studio:container.adapters.athyperDatabase!.database as unknown as Kysely<Record<string,never>>,
  }):undefined;
  registerServices(container, releaseReview?{entityAuthorizationReleaseReview:releaseReview}:{}, config);
  registerInvalidationWorkers(container, config, lifecycle);
  await startRuntimes(container, config.mode);
  const metrics=container.adapters.processMetrics?await startProcessMetricsEndpoint(container.adapters.processMetrics):undefined;
  if(metrics)lifecycle.onShutdown(()=>metrics.stop());
  const heartbeat = await startProcessHeartbeat("worker");
  lifecycle.onShutdown(() => heartbeat.stop());

  console.log(`[worker] started env=${config.env} pid=${process.pid}${metrics?` metricsPort=${metrics.port}`:""}`);
  await lifecycle.signalReady();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] shutdown signal=${signal} pid=${process.pid}`);
    await Promise.race([
      lifecycle.shutdown(signal),
      new Promise<void>((resolve) => setTimeout(resolve, config.shutdownTimeoutMs)),
    ]);
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
