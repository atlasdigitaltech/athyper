import { createPrometheusMetricsRegistry } from "@athyper/server-adapter-telemetry-otel";
import { createServer } from "node:http";
import { Kysely, PostgresDialect } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KyselyTransactionRunner } from "@athyper/server-adapter-db-core";
import { getRequestContext } from "@athyper/server-foundation/context";
import { HealthRegistry, type MetricsRegistry } from "@athyper/server-foundation/observability";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { createBusinessPartnerMetricsCollector, parseBusinessPartnerMetricsTargets } from "../business-partner-metrics.js";
import { registerBusinessPartnerMetrics } from "../../composition/register-business-partner-metrics.js";
import type { Container } from "../../composition/create-container.js";

vi.mock("../error-collector.js", () => ({ captureOperationalError: vi.fn() }));
const targets = [
  { tenantId: "10000000-0000-4000-8000-000000000001", principalId: "20000000-0000-4000-8000-000000000001" },
  { tenantId: "10000000-0000-4000-8000-000000000002", principalId: "20000000-0000-4000-8000-000000000002" },
];
afterEach(() => vi.useRealTimers());

function fixture() {
  const values = new Map<string, number>();
  const metrics = { gauge: (name: string) => ({ set: (value: number, labels?: Record<string, string>) => values.set(`${name}:${labels?.tenant_id ?? "all"}`, value) }) } as MetricsRegistry;
  const calls: { sql: string; parameters: readonly unknown[]; tenant?: string }[] = [];
  const rejected = new Set<string>();
  const unauthorized = new Set<string>();
  const pool = {
    async connect() {
      let tenant: string | undefined;
      let principal: string | undefined;
      return {
        release() {},
        async query(text: string, parameters: readonly unknown[] = []) {
          if (text.includes("set_config('app.current_tenant_id'")) {
            tenant = parameters[0] as string;
            principal = parameters[1] as string;
          }
          calls.push({ sql: text, parameters, tenant });
          let rows: object[] = [];
          if (text.includes("FROM master.principal")) {
            expect(tenant).toBe(parameters[0]);
            expect(principal).toBe(parameters[1]);
            rows = [{ allowed: !unauthorized.has(tenant!) }];
          }
          if (text.includes("FROM document.entity_case") || text.includes("FROM event.notification_outbox_state")) {
            // Fail if either transaction actor stamping or explicit tenant filtering is missing.
            expect(tenant).toBeTruthy();
            expect(parameters).toEqual([tenant]);
            if (rejected.has(tenant!)) throw new Error("collection query failed");
            const offset = tenant === targets[0]!.tenantId ? 10 : 100;
            rows = text.includes("document.entity_case") ? [{ oldest_open_seconds: offset }]
              : [{ oldest_pending_seconds: offset + 1, dead_letters: offset + 2 }];
          }
          if (text === "commit" || text === "rollback") { tenant = undefined; principal = undefined; }
          return { rows, rowCount: rows.length, command: "SELECT" };
        },
      };
    },
    async end() {},
  };
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: pool as never }) });
  const runner = new KyselyTransactionRunner(db);
  const database = {
    withTenantTransaction: vi.fn((work, signal) => {
      const context = getRequestContext();
      return runner.run(work, { tenantId: context.tenantId!, principalId: context.principalId! }, signal);
    }),
  };
  const onError = vi.fn();
  const collector = createBusinessPartnerMetricsCollector({ database, metrics, targets, onError, intervalMs: 100 });
  return { collector, database, metrics, values, calls, onError, rejected, unauthorized };
}
const metric = (values: Map<string, number>, name: string) => values.get(`athyper_business_partner_${name}:all`);

describe("tenant-scoped Business Partner metrics", () => {
  it("uses separate stamped transactions and preserves all three metrics for two tenants", async () => {
    const f = fixture();
    await f.collector.collectNow();
    expect(f.database.withTenantTransaction).toHaveBeenCalledTimes(2);
    expect(metric(f.values, "case_oldest_open_seconds")).toBe(100);
    expect(metric(f.values, "request_oldest_open_seconds")).toBe(100);
    expect(metric(f.values, "notification_oldest_pending_seconds")).toBe(101);
    expect(metric(f.values, "notification_dead_letters")).toBe(114);
    expect(metric(f.values, "metrics_collection_success")).toBe(1);
    expect(f.calls.filter(call => call.sql === "commit")).toHaveLength(2);
    expect(f.calls.filter(call => call.sql.includes("statement_timeout"))).toHaveLength(2);
    expect(f.onError).not.toHaveBeenCalled();
    await f.collector.close();
  });

  it("continues collecting other tenants after failure and recovers without false zero samples", async () => {
    const f = fixture();
    f.rejected.add(targets[0]!.tenantId);
    await f.collector.collectNow();
    expect(metric(f.values, "case_oldest_open_seconds")).toBeUndefined();
    expect(metric(f.values, "request_oldest_open_seconds")).toBeUndefined();
    expect(metric(f.values, "metrics_collection_success")).toBe(0);
    expect(f.onError).toHaveBeenCalledWith(expect.any(Error), targets[0]);
    expect(metric(f.values, "metrics_failed_tenants")).toBe(1);
    expect(f.calls.some(call => call.tenant === targets[1]!.tenantId && call.sql.includes("FROM document.entity_case"))).toBe(true);
    expect(f.calls.some(call => call.sql === "rollback")).toBe(true);
    f.rejected.clear();
    await f.collector.collectNow();
    expect(metric(f.values, "metrics_collection_success")).toBe(1);
    expect(metric(f.values, "case_oldest_open_seconds")).toBe(100);
    await f.collector.close();
  });

  it("rejects an inactive or mismatched service account before accessing business data", async () => {
    const f = fixture();
    f.unauthorized.add(targets[0]!.tenantId);
    await f.collector.collectNow();
    expect(f.calls.filter(call => call.tenant === targets[0]!.tenantId && call.sql.includes("FROM document.entity_case"))).toHaveLength(0);
    expect(metric(f.values, "metrics_collection_success")).toBe(0);
    expect(f.calls.some(call => call.tenant === targets[1]!.tenantId && call.sql.includes("FROM document.entity_case"))).toBe(true);
    await f.collector.close();
  });

  it("shares concurrent sweeps and stops scheduling on shutdown", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await Promise.all([f.collector.collectNow(), f.collector.collectNow()]);
    expect(f.database.withTenantTransaction).toHaveBeenCalledTimes(2);
    f.collector.start();
    f.collector.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.database.withTenantTransaction).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(100);
    expect(f.database.withTenantTransaction).toHaveBeenCalledTimes(6);
    await f.collector.close();
    await vi.advanceTimersByTimeAsync(1000);
    await f.collector.collectNow();
    expect(f.database.withTenantTransaction).toHaveBeenCalledTimes(6);
  });

  it("registers as background work and leaves readiness available when collection fails", async () => {
    const f = fixture();
    f.rejected.add(targets[0]!.tenantId);
    f.rejected.add(targets[1]!.tenantId);
    const health = new HealthRegistry();
    health.register("database.neon", async () => ({ status: "healthy" }));
    const lifecycle = createLifecycle();
    registerBusinessPartnerMetrics({ adapters: { neonDatabase: f.database, processMetrics: f.metrics }, runtimes: { health } } as unknown as Container, lifecycle, targets);
    const server = createServer(createHttpApplication({ healthRegistry: health }));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      await lifecycle.signalReady({ failOnError: true });
      await vi.waitFor(() => expect(f.database.withTenantTransaction).toHaveBeenCalledTimes(2));
      const address = server.address() as { port: number };
      for (const path of ["/readyz", "/healthz", "/health"]) {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "healthy", checks: { "database.neon": { status: "healthy" } } });
      }
      health.register("database.neon", async () => ({ status: "unhealthy" }));
      expect((await fetch(`http://127.0.0.1:${address.port}/readyz`)).status).toBe(503);
    } finally {
      await lifecycle.shutdown("test");
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("exports aggregate metrics without identity labels and retains the last complete snapshot on failure", async () => {
    const f = fixture();
    const metrics = createPrometheusMetricsRegistry(f.metrics);
    const collector = createBusinessPartnerMetricsCollector({ database: f.database, metrics, targets, onError: f.onError });
    await collector.collectNow();
    expect(metrics.render()).toContain('athyper_business_partner_notification_dead_letters{plane="neon"} 114');
    expect(metrics.render()).not.toContain(targets[0]!.tenantId);
    f.rejected.add(targets[0]!.tenantId);
    await collector.collectNow();
    expect(metrics.render()).toContain('athyper_business_partner_notification_dead_letters{plane="neon"} 114');
    expect(metrics.render()).toContain('athyper_business_partner_metrics_collection_success{plane="neon"} 0');
    await collector.close();
  });

  it("performs no queries and reports unconfigured collection when the allowlist is empty", async () => {
    const f = fixture();
    const collector = createBusinessPartnerMetricsCollector({ database: f.database, metrics: f.metrics, targets: [], onError: f.onError });
    await collector.collectNow();
    expect(f.database.withTenantTransaction).not.toHaveBeenCalled();
    expect(metric(f.values, "metrics_configured_tenants")).toBe(0);
    expect(metric(f.values, "metrics_collection_success")).toBe(0);
    expect(metric(f.values, "case_oldest_open_seconds")).toBeUndefined();
    await collector.close();
  });

  it("requires explicit valid unique tenant and principal pairs", () => {
    expect(parseBusinessPartnerMetricsTargets(undefined)).toEqual([]);
    expect(parseBusinessPartnerMetricsTargets(JSON.stringify(targets))).toEqual(targets);
    for (const input of ["{}", '[{"tenantId":"bad","principalId":"bad"}]', JSON.stringify([targets[0], targets[0]])]) {
      expect(() => parseBusinessPartnerMetricsTargets(input)).toThrow();
    }
  });
});
