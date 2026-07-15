import { describe, expect, it } from "vitest";

import {
  observeFrameworkPhase,
  observeFrameworkInfrastructure,
  collectFrameworkInfrastructureMetrics,
  observeFrameworkPoolWait,
  observeFrameworkRedis,
  observeFrameworkSql,
  observeFrameworkTransaction,
  runWithFrameworkPerformance,
  setFrameworkCacheState,
  setFrameworkResponseBytes,
  snapshotFrameworkPerformance,
} from "../framework-performance.js";

describe("framework performance context", () => {
  it("collects request-local infrastructure and phase measurements", async () => {
    await runWithFrameworkPerformance({
      route: "/api/records/:entity",
      entityCode: "supplier",
      operation: "list",
      rolloutCohort: "internal",
      tenantClass: "large",
    }, async () => {
      observeFrameworkSql(4);
      observeFrameworkSql(6);
      observeFrameworkRedis(2);
      observeFrameworkPoolWait(3);
      observeFrameworkTransaction(8);
      observeFrameworkPhase("query", 9);
      setFrameworkCacheState("l2_hit");
      setFrameworkResponseBytes(512);
      observeFrameworkInfrastructure("lock_contention", 1, { entity: "supplier" });
      observeFrameworkInfrastructure("queue_latency_ms", 12, { topic: "entity_mutation" });

      const snapshot = snapshotFrameworkPerformance();
      expect(snapshot).toMatchObject({
        route: "/api/records/:entity",
        entityCode: "supplier",
        operation: "list",
        rolloutCohort: "internal",
        tenantClass: "large",
        cacheState: "l2_hit",
        sqlCount: 2,
        sqlDurationMs: 10,
        redisCount: 1,
        redisDurationMs: 2,
        poolAcquireCount: 1,
        poolWaitMs: 3,
        transactionCount: 1,
        transactionDurationMs: 8,
        responseBytes: 512,
        phases: { query: 9 },
      });
      expect(snapshot?.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  it("exports infrastructure degradation and queue metrics", () => {
    observeFrameworkInfrastructure("redis_degradation", 1, { component: "descriptor" });
    const output = collectFrameworkInfrastructureMetrics().join("\n");
    expect(output).toContain("athyper_framework_redis_degradation_total");
    expect(output).toContain("athyper_framework_queue_latency_ms_count");
  });

  it("does nothing outside a request performance context", () => {
    observeFrameworkSql(1);
    expect(snapshotFrameworkPerformance()).toBeUndefined();
  });
});
