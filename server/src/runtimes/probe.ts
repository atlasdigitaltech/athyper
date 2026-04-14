// server/src/runtimes/probe.ts
//
// Minimal HTTP readiness probe for non-API runtimes (worker, scheduler).
//
// Exposes a single GET endpoint on config.port so Docker Compose health checks
// can confirm the process is running and past its startup phase. This is not
// a full health check (no DB/Redis probes) — it only signals liveness.
//
// Usage:
//   const probe = startProbeServer({ port: config.port, mode: "worker" });
//   lifecycle.onShutdown(() => new Promise<void>((resolve) => probe.close(() => resolve())));

import { createServer, type Server } from "node:http";

export interface ProbeServerOptions {
  port: number;
  mode: string;
}

/**
 * Starts a minimal HTTP server on the given port.
 * All requests receive: 200 { status: "ready", mode, ts }
 */
export function startProbeServer({ port, mode }: ProbeServerOptions): Server {
  const server = createServer((_req, res) => {
    const body = JSON.stringify({ status: "ready", mode, ts: Date.now() });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });
  server.listen(port);
  return server;
}
