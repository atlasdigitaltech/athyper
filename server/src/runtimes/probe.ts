// server/src/runtimes/probe.ts
//
// Minimal HTTP liveness probe for non-API runtimes (worker, scheduler).
//
// F4: Exposes /livez on config.port so Docker Compose health checks can
// confirm the process is running and the event loop is responsive. This is
// NOT a readiness check — it has no DB/Redis probes. Worker and scheduler
// runtimes do not need full readiness gates because they are not
// load-balancer targets.
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
 * All requests receive: 200 { status: "alive", mode, ts }
 */
export function startProbeServer({ port, mode }: ProbeServerOptions): Server {
  const server = createServer((_req, res) => {
    const body = JSON.stringify({ status: "alive", mode, ts: Date.now() });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });
  server.listen(port);
  return server;
}
