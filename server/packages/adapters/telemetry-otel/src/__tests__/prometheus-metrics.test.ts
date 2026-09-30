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

  it("renders bounded cumulative histogram buckets for quantile queries",()=>{
    const noop:MetricsRegistry={counter:()=>({increment(){},incrementBy(){}}),gauge:()=>({set(){}}),histogram:()=>({record(){}})};
    const registry=createPrometheusMetricsRegistry(noop),histogram=registry.histogram("athyper_record_transfer_queue_delay_ms");
    histogram.record(10,{plane:"neon",kind:"import"});histogram.record(300,{plane:"neon",kind:"import"});
    const output=registry.render();
    expect(output).toContain('athyper_record_transfer_queue_delay_ms_bucket{kind="import",le="10",plane="neon"} 1');
    expect(output).toContain('athyper_record_transfer_queue_delay_ms_bucket{kind="import",le="500",plane="neon"} 2');
    expect(output).toContain('athyper_record_transfer_queue_delay_ms_bucket{kind="import",le="+Inf",plane="neon"} 2');
    expect(output).toContain('athyper_record_transfer_queue_delay_ms_count{kind="import",plane="neon"} 2');
    expect(output).toContain('athyper_record_transfer_queue_delay_ms_sum{kind="import",plane="neon"} 310');
  });
});
