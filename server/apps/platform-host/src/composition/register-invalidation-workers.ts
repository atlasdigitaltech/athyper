import { createPostgresNotificationListener } from "@athyper/server-adapter-db-core";
import { createRedisInvalidationGenerationStore } from "@athyper/server-adapter-cache-redis";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import { createInvalidationWorker } from "@athyper/server-platform-jobs";
import { createKyselyInvalidationRepository } from "@athyper/server-platform-metadata";
import type { Kysely } from "kysely";
import type { HostConfig } from "../config/index.js";
import type { Container } from "./create-container.js";

export function registerInvalidationWorkers(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
): void {
  if (config.mode !== "worker" || !container.adapters.redisCache) return;
  const planes = ["studio", "neon", "mesh"] as const;
  for (const plane of planes) {
    const invalidations = container.adapters.openTelemetry?.metrics.counter(
      "athyper_cache_invalidation_total",
      "Cache invalidation outcomes",
    );
    const lag = container.adapters.openTelemetry?.metrics.gauge(
      "athyper_outbox_lag_seconds",
      "Oldest pending outbox item age",
    );
    const adapter =
      plane === "studio"
        ? (container.adapters.jobAthyperDatabase ??
          container.adapters.athyperDatabase)
        : plane === "neon"
          ? (container.adapters.jobNeonDatabase ??
            container.adapters.neonDatabase)
          : (container.adapters.jobMeshDatabase ??
            container.adapters.meshDatabase);
    if (!adapter) continue;
    const listenerUrl = config.jobs.invalidationListenerDatabaseUrls[plane];
    const listener = listenerUrl
      ? createPostgresNotificationListener({
          connectionString: listenerUrl,
          channel: "athyper_invalidation",
          connectionMode: "direct",
          onError: (error) =>
            console.warn(
              `[invalidation] plane=${plane} listener_error=${sanitize(error.message)}`,
            ),
        })
      : undefined;
    const worker = createInvalidationWorker({
      onError: (error) =>
        console.error(
          `[invalidation] plane=${plane} drain_failed=1 code=${sanitize(error instanceof Error ? error.message : String(error))}`,
        ),
      workerId: `${plane}:${process.pid}`,
      repository: createKyselyInvalidationRepository(
        adapter.database as unknown as Kysely<Record<string, never>>,
        plane,
      ),
      generations: createRedisInvalidationGenerationStore(
        container.adapters.redisCache.client,
        { prefix: "invalidation" },
      ),
      ...(listener ? { listener } : {}),
      metrics: {
        processed(kind, lagMs) {
          invalidations?.increment({
            plane,
            kind,
            outcome: "processed",
            capability: "cache",
          });
          lag?.set(lagMs / 1000, {
            plane,
            source: "cache_invalidation",
            capability: "outbox",
          });
        },
        failed(kind, errorCode, deadLetter) {
          invalidations?.increment({
            plane,
            kind,
            outcome: deadLetter ? "dead_letter" : "failed",
            capability: "cache",
          });
          console.error(
            `[invalidation] plane=${plane} kind=${kind} failed=1 dlq=${deadLetter ? 1 : 0} code=${sanitize(errorCode)}`,
          );
        },
        reconnect() {
          invalidations?.increment({
            plane,
            kind: "transport",
            outcome: "reconnect",
            capability: "cache",
          });
        },
        backlog(_count, oldestLagMs) {
          lag?.set(oldestLagMs / 1000, {
            plane,
            source: "cache_invalidation",
            capability: "outbox",
          });
        },
      },
    });
    lifecycle.onReady(() => worker.start());
    lifecycle.onShutdown(() => worker.close());
  }
}
function sanitize(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^A-Za-z0-9_.: -]/g, "_")
    .slice(0, 160);
}
