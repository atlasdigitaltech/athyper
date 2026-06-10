// server/src/runtimes/probe.ts
//
// Minimal HTTP probe server for non-API runtimes (worker, scheduler).
//
// /livez is process liveness only: no DB, Redis, auth, or BullMQ checks.
// Docker Compose health checks should continue to use /livez so transient
// dependency flaps do not restart workers and amplify an outage.
//
// /readyz, /healthz, and /health run optional dependency checks for operators
// and monitors that need a Redis/BullMQ-aware readiness signal.

import { createServer, type Server, type ServerResponse } from "node:http";

export type ProbeCheck = () => Promise<unknown> | unknown;

/**
 * Phase 8: optional Prometheus text-format provider. When supplied, the probe
 * server responds to GET /metrics with the lines joined by "\n". This lets
 * non-API runtimes (worker, scheduler) surface their internal counters
 * without bringing the full api.ts metrics module into the worker process.
 */
export type MetricsProvider = () => Promise<string[]> | string[];

export interface ProbeServerOptions {
  port: number;
  mode: string;
  checks?: Record<string, ProbeCheck>;
  readinessTimeoutMs?: number;
  metricsProvider?: MetricsProvider;
}

interface ProbeCheckResult {
  status: "healthy" | "unhealthy";
  latencyMs?: number;
  message?: string;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function runCheck(check: ProbeCheck, timeoutMs: number): Promise<ProbeCheckResult> {
  const started = Date.now();
  try {
    await Promise.race([
      Promise.resolve(check()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return { status: "healthy", latencyMs: Date.now() - started };
  } catch (err) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - started,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Starts a minimal HTTP server on the given port.
 * /livez receives: 200 { status: "alive", mode, ts }
 * /readyz receives: 200/503 { status, mode, checks, ts }
 */
export function startProbeServer({
  port,
  mode,
  checks = {},
  readinessTimeoutMs = 2_000,
  metricsProvider,
}: ProbeServerOptions): Server {
  const server = createServer((req, res) => {
    const path = req.url?.split("?", 1)[0] ?? "/";
    if (path === "/metrics" && metricsProvider) {
      void (async () => {
        try {
          const lines = await metricsProvider();
          res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
          res.end(lines.join("\n") + "\n");
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`# metrics provider failed: ${err instanceof Error ? err.message : String(err)}\n`);
        }
      })();
      return;
    }
    if (path === "/readyz" || path === "/healthz" || path === "/health") {
      void (async () => {
        const results = Object.fromEntries(
          await Promise.all(
            Object.entries(checks).map(async ([name, check]) => [
              name,
              await runCheck(check, readinessTimeoutMs),
            ]),
          ),
        ) as Record<string, ProbeCheckResult>;
        const unhealthy = Object.values(results).some((r) => r.status === "unhealthy");

        writeJson(res, unhealthy ? 503 : 200, {
          status: unhealthy ? "unhealthy" : "healthy",
          mode,
          checks: results,
          ts: Date.now(),
        });
      })();
      return;
    }

    writeJson(res, 200, { status: "alive", mode, ts: Date.now() });
  });
  server.listen(port);
  return server;
}
