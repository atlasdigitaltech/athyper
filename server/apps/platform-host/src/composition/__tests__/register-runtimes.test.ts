import { describe, expect, it, vi } from "vitest";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";

import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerRuntimes, startRuntimes } from "../register-runtimes.js";

describe("runtime composition", () => {
  it("constructs and starts workers only in worker mode", async () => {
    const previousMode = process.env["MODE"];
    const previousRedis = process.env["REDIS_BULLMQ_URL"];
    process.env["MODE"] = "worker";
    process.env["REDIS_BULLMQ_URL"] = "redis://queues:6379/1";
    try {
      const container = createContainer();
      const lifecycle = createLifecycle();
      const start = vi.fn(async () => undefined);
      const close = vi.fn(async () => undefined);
      registerRuntimes(container, loadConfig(), lifecycle, {
        createJobs: () => ({ register: vi.fn(), enqueue: vi.fn(), cancel: vi.fn(), retry: vi.fn(), start, close }),
      });
      await startRuntimes(container, "worker");
      expect(start).toHaveBeenCalledOnce();
      await lifecycle.shutdown("test");
      expect(close).toHaveBeenCalledOnce();
    } finally {
      restore("MODE", previousMode);
      restore("REDIS_BULLMQ_URL", previousRedis);
    }
  });

  it("requires queue Redis for worker and scheduler processes", () => {
    const config = loadConfig();
    const container = createContainer();
    expect(() => registerRuntimes(
      container,
      { ...config, mode: "worker", bullMq: { ...config.bullMq, url: undefined } },
      createLifecycle(),
    ))
      .toThrow("REDIS_BULLMQ_URL");
  });

  it("runs DDL schedule reconciliation at scheduler startup", async () => {
    const previousMode = process.env["MODE"];
    const previousRedis = process.env["REDIS_BULLMQ_URL"];
    process.env["MODE"] = "scheduler";
    process.env["REDIS_BULLMQ_URL"] = "redis://queues:6379/1";
    try {
      const container = createContainer();
      const lifecycle = createLifecycle();
      const upsert = vi.fn(async () => undefined);
      const reconcile = vi.fn(async () => ({ upserted: 1, removed: 0 }));
      registerRuntimes(container, loadConfig(), lifecycle, {
        createScheduler: () => ({ upsert, remove: vi.fn(), close: vi.fn(async () => undefined) }),
      });
      container.runtimes.scheduleReconcile = reconcile;
      container.runtimes.scheduledJobs.push({
        scheduleId: "compatibility",
        queue: "maintenance",
        name: "sweep",
        data: {},
        pattern: { kind: "interval", everyMs: 60_000 },
      });
      await startRuntimes(container, "scheduler");
      expect(upsert).toHaveBeenCalledOnce();
      expect(reconcile).toHaveBeenCalledOnce();
      await lifecycle.shutdown("test");
    } finally {
      restore("MODE", previousMode);
      restore("REDIS_BULLMQ_URL", previousRedis);
    }
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
