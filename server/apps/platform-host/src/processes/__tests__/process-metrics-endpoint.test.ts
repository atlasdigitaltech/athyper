import { afterEach,describe,expect,it } from "vitest";
import { createOpenTelemetryMetricsRegistry,createPrometheusMetricsRegistry } from "@athyper/server-adapter-telemetry-otel";
import { startProcessMetricsEndpoint,type ProcessMetricsEndpoint } from "../process-metrics-endpoint.js";

const endpoints:ProcessMetricsEndpoint[]=[];
afterEach(async()=>{await Promise.all(endpoints.splice(0).map(endpoint=>endpoint.stop()));});

describe("process metrics endpoint",()=>{
  it("serves private process metrics and liveness without an application API",async()=>{const registry=createPrometheusMetricsRegistry(createOpenTelemetryMetricsRegistry("test"));registry.counter("athyper_record_transfer_operations_total").increment({plane:"neon",kind:"import",outcome:"completed"});const endpoint=await startProcessMetricsEndpoint(registry,{port:0,host:"127.0.0.1"});endpoints.push(endpoint);const metrics=await fetch(`http://127.0.0.1:${endpoint.port}/metrics`),body=await metrics.text();expect(metrics.status).toBe(200);expect(body).toContain('athyper_record_transfer_operations_total{kind="import",outcome="completed",plane="neon"} 1');expect((await fetch(`http://127.0.0.1:${endpoint.port}/livez`)).status).toBe(200);expect((await fetch(`http://127.0.0.1:${endpoint.port}/other`)).status).toBe(404);});
});
