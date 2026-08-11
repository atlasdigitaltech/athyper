import { describe, expect, it, vi } from "vitest";
import type { MetricsRegistry } from "@athyper/server-foundation/observability";
import { createPrometheusMetricsRegistry } from "../prometheus-metrics.js";

describe("Prometheus OTel view", () => {
  it("forwards recordings and renders exposition", () => {
    const incrementBy = vi.fn();
    const delegate: MetricsRegistry = {
      counter: () => ({ increment: vi.fn(), incrementBy }),
      gauge: () => ({ set: vi.fn() }), histogram: () => ({ record: vi.fn() }),
    };
    const registry = createPrometheusMetricsRegistry(delegate);
    registry.counter("athyper_job_retries_total").incrementBy(2, { queue: "publication", capability: "jobs" });
    expect(incrementBy).toHaveBeenCalledWith(2, { queue: "publication", capability: "jobs" });
    expect(registry.render()).toContain('athyper_job_retries_total{capability="jobs",queue="publication"} 2');
  });

  it("rejects identity-bearing labels", () => {
    const noop: MetricsRegistry = { counter: () => ({ increment() {}, incrementBy() {} }), gauge: () => ({ set() {} }), histogram: () => ({ record() {} }) };
    const counter = createPrometheusMetricsRegistry(noop).counter("athyper_http_errors_total");
    expect(() => counter.increment({ tenant_id: "secret" })).toThrow(/forbidden/);
  });
});
