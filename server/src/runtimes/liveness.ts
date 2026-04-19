// server/src/runtimes/liveness.ts
//
// F4 (infra review April 2026): liveness probe handler.
//
// Deliberately isolated in its own module so it has NO access to the
// ServerDeps bag — no db, no redis, no auth, no service health checks.
// This is structural: /livez exists to report that the Node event loop
// is responsive, so a transient dependency flap cannot cause Docker to
// restart the container. If a future change needs dependency signals,
// that belongs in /readyz (see runtimes/api.ts readinessHandler), not here.
//
// Tested by: server/src/runtimes/__tests__/liveness.test.ts

import type { Request, Response } from "express";

export function livenessHandler(_req: Request, res: Response): void {
  res.status(200).json({ status: "alive", ts: Date.now() });
}
