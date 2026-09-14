import { afterEach, describe, expect, it } from "vitest";
import {
  createOpenTelemetryMetricsRegistry,
  createPrometheusMetricsRegistry,
} from "@athyper/server-adapter-telemetry-otel";
import {
  startProcessMetricsEndpoint,
  type ProcessMetricsEndpoint,
} from "../process-metrics-endpoint.js";

const endpoints: ProcessMetricsEndpoint[] = [];
afterEach(async () => {
  await Promise.all(endpoints.splice(0).map((endpoint) => endpoint.stop()));
});

describe("process metrics endpoint", () => {
  it("serves private process metrics and liveness without an application API", async () => {
    const registry = createPrometheusMetricsRegistry(
      createOpenTelemetryMetricsRegistry("test"),
    );
    registry
      .counter("athyper_record_transfer_operations_total")
      .increment({ plane: "neon", kind: "import", outcome: "completed" });
    const endpoint = await startProcessMetricsEndpoint(registry, {
      port: 0,
      host: "127.0.0.1",
    });
    endpoints.push(endpoint);
    const metrics = await fetch(`http://127.0.0.1:${endpoint.port}/metrics`),
      body = await metrics.text();
    expect(metrics.status).toBe(200);
    expect(body).toContain(
      'athyper_record_transfer_operations_total{kind="import",outcome="completed",plane="neon"} 1',
    );
    expect(
      (await fetch(`http://127.0.0.1:${endpoint.port}/livez`)).status,
    ).toBe(200);
    expect(
      (await fetch(`http://127.0.0.1:${endpoint.port}/other`)).status,
    ).toBe(404);
  });
});

it("exports API counters on the dedicated listener without serving application routes", async () => {
  const registry = createPrometheusMetricsRegistry(
    createOpenTelemetryMetricsRegistry("api-test"),
  );
  const duration = registry.histogram("athyper_http_request_duration_seconds");
  duration.record(0.1, {
    method: "GET",
    route: "/records",
    status_class: "2xx",
  });
  duration.record(0.2, {
    method: "GET",
    route: "/records",
    status_class: "5xx",
  });
  registry
    .counter("athyper_http_errors_total")
    .increment({ method: "GET", route: "/records", status_class: "5xx" });
  const endpoint = await startProcessMetricsEndpoint(registry, {
    port: 0,
    host: "127.0.0.1",
  });
  endpoints.push(endpoint);
  const base = `http://127.0.0.1:${endpoint.port}`;
  const text = await (await fetch(`${base}/metrics`)).text();
  expect(text).toContain("athyper_http_request_duration_seconds_count");
  expect(text).toContain("athyper_http_errors_total");
  expect((await fetch(`${base}/api/records`)).status).toBe(404);
});
