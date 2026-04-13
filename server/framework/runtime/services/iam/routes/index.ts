/**
 * IAM Routes — registration entry point
 *
 * Registers all IAM-related Express routes onto the provided router.
 *
 * Routes registered:
 *   GET /api/session/bootstrap  — full tenant/entity tree for the logged-in user
 *   GET /api/session            — resolved runtime session for a specific entity
 *
 * Usage (from server/src/app.ts):
 *   const router = Router();
 *   registerIamRoutes(router, { db, cache, auth, logger });
 *   app.use("/api", router);
 */

import type { Router } from "express";
import type { CacheClient, CacheMetrics } from "../session/session.service.js";
import { createSessionRoutes } from "./session.routes.js";
import { createBootstrapRoutes } from "./bootstrap.routes.js";

export interface IamRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  /** Optional tenant-level cache metrics. No-op when omitted. */
  sessionMetrics?: CacheMetrics;
  bootstrapMetrics?: CacheMetrics;
}

export function registerIamRoutes(router: Router, deps: IamRoutesDeps): Router {
  // Bootstrap must be registered BEFORE session so /session/bootstrap is
  // matched before the Express catch-all /session route.
  createBootstrapRoutes(router, { ...deps, metrics: deps.bootstrapMetrics });
  createSessionRoutes(router, { ...deps, metrics: deps.sessionMetrics });
  return router;
}
