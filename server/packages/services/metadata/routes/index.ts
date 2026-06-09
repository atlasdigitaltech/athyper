/**
 * Metadata Routes — registration entry point
 *
 * Routes registered:
 *   GET /api/metadata/entities/:entity/compiled     — compiled entity descriptor
 *   GET /api/metadata/entities/:entity/flow         — active intake flow bundle
 *   GET /api/metadata/entities/:entity/operations   — entity action operations
 *   GET /api/metadata/entities/:entity/status-route — compiled status transition map
 *   GET /api/metadata/lookups/:domain               — lookup domain bundle (values)
 *   POST/PATCH /api/metadata/lookups/:domain/values — tenant value mutations
 *
 *   Admin CRUD (setup pages):
 *   GET/POST   /api/metadata/admin/lookup-domains
 *   PATCH      /api/metadata/admin/lookup-domains/:code
 *   GET/POST   /api/metadata/admin/lifecycle-bindings
 *   PATCH/DEL  /api/metadata/admin/lifecycle-bindings/:id
 *   GET/POST   /api/metadata/admin/entity-operations
 *   PATCH/DEL  /api/metadata/admin/entity-operations/:id
 *   GET/POST   /api/metadata/admin/field-groups
 *   PATCH/DEL  /api/metadata/admin/field-groups/:key
 *   GET        /api/metadata/admin/lifecycles   — catalogue picker
 *   GET        /api/metadata/admin/entities     — catalogue picker
 */

import type { Router } from "express";
import type { Kysely } from "kysely";
import { createCompiledEntityRoute, type DescriptorCache } from "./compiled-entity.route.js";
import { createEntityFlowRoute } from "./entity-flow.route.js";
import { createLookupRoute } from "./lookup.route.js";
import { createEntityOperationsRoute } from "./entity-operations.route.js";
import { createEntityPolicyRoute } from "./entity-policy.route.js";
import { createStatusRouteRoute } from "./status-route.route.js";
import { createMetadataAdminRoutes } from "./metadata-admin.route.js";

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
  cache?: DescriptorCache;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkPermissionBatch?: (db: Kysely<any>, tenantId: string, principalId: string, personaId: string) => Promise<Record<string, { decision: string } | undefined>>;
}

export function registerMetadataRoutes(router: Router, deps: MetadataRoutesDeps): Router {
  createCompiledEntityRoute(router, deps);
  createEntityFlowRoute(router, deps);
  createLookupRoute(router, deps);
  createEntityOperationsRoute(router, deps);
  createEntityPolicyRoute(router, deps);
  createStatusRouteRoute(router, deps);
  createMetadataAdminRoutes(router, deps);
  return router;
}
