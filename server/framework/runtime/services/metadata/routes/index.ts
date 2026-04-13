/**
 * Metadata Routes — registration entry point
 *
 * Routes registered:
 *   GET /api/metadata/entities/:entity/compiled    — compiled entity descriptor
 *   GET /api/metadata/entities/:entity/operations  — entity action operations
 *   GET /api/metadata/lookups/:domain              — lookup domain bundle
 */

import type { Router } from "express";
import type { Kysely } from "kysely";
import { createCompiledEntityRoute } from "./compiled-entity.route.js";
import { createLookupRoute } from "./lookup.route.js";
import { createEntityOperationsRoute } from "./entity-operations.route.js";

export interface MetadataRoutesDeps {
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

export function registerMetadataRoutes(router: Router, deps: MetadataRoutesDeps): Router {
  createCompiledEntityRoute(router, deps);
  createLookupRoute(router, deps);
  createEntityOperationsRoute(router, deps);
  return router;
}
