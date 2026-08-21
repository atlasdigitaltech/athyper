import { describe, expect, it, vi } from "vitest";
import type { JobExecutionLifecycle } from "@athyper/server-contract-jobs";
import type { MetricsRegistry } from "@athyper/server-foundation/observability";
import { createMetricJobExecutionLifecycle, metricQueue } from "../operational-metrics.js";

describe("operational metrics", () => {
  it("maps arbitrary runtime queues into a fixed catalog", () => {
    expect(metricQueue("integration.delivery")).toBe("integrations");
    expect(metricQueue("tenant-specific-secret")).toBe("unknown");
  });

  it("records queue lag, retries, DLQ, and integration delivery without identity labels", async () => {
    const record = vi.fn(); const increment = vi.fn();
    const metrics: MetricsRegistry = { histogram: () => ({ record }), counter: () => ({ increment, incrementBy: vi.fn() }), gauge: () => ({ set: vi.fn() }) };
    const delegate: JobExecutionLifecycle = { enqueued: vi.fn(), started: vi.fn(), completed: vi.fn(), failed: vi.fn() };
    const lifecycle = createMetricJobExecutionLifecycle(delegate, metrics, () => 2_000);
    const job = { id: "private-id", queue: "integration.delivery", name: "integration.deliver", data: {}, attempt: 2, maxAttempts: 2, enqueuedAt: new Date(1_000).toISOString() };
    await lifecycle.started(job);
    await lifecycle.failed(job, { disposition: "permanent", code: "FAILED", message: "safe" });
    expect(record).toHaveBeenCalledWith(1, expect.objectContaining({ queue: "integrations" }));
    expect(increment).toHaveBeenCalledWith({ queue: "integrations", capability: "jobs" });
    expect(JSON.stringify([...record.mock.calls, ...increment.mock.calls])).not.toContain("private-id");
  });
});
