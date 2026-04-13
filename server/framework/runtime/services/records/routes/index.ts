/**
 * Records Routes — registration entry point
 *
 * Routes registered:
 *   GET  /api/records/:entity          — list master records (paginated)
 *   GET  /api/records/:entity/:id      — single record detail
 *   POST /api/records/:entity          — create record
 *   PUT  /api/records/:entity/:id      — update record
 *   DELETE /api/records/:entity/:id    — delete record
 */

import type { Router } from "express";
import type { Kysely } from "kysely";
import { createRecordsRoute } from "./records.route.js";

export interface RecordsRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

export function registerRecordsRoutes(router: Router, deps: RecordsRoutesDeps): Router {
  createRecordsRoute(router, deps);
  return router;
}
