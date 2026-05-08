/**
 * Records route registration entry point.
 *
 * Specialized BP/supplier intake routes are registered before generic
 * /records/:entity handlers so action words such as "extend" are not treated
 * as record ids.
 */

import type { Router } from "express";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";
import { createRecordsRoute } from "./records.route.js";
import { createImportRoutes } from "./import.route.js";
import type { ImportObjectStorage } from "./import.route.js";
import { createBulkPreflightRoute } from "./bulk-preflight.route.js";
import { createBulkActionRoute } from "./bulk-action.route.js";
import { createBulkCrudRoutes } from "./bulk-crud.route.js";
import { createExportRoutes } from "./export.route.js";
import { createActionDispatcherRoute } from "./action-dispatcher.route.js";
import { createActivityRoute } from "./activity.route.js";
import { createSupplierIntakeRoute } from "./supplier-intake.route.js";
import { createBusinessPartnerManagementRoute } from "./business-partner-management.route.js";
import type { CacheClient } from "../../iam/session/session.service.js";

export interface RecordsRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  importQueue?: Queue;
  objectStorage?: ImportObjectStorage;
  cache?: CacheClient;
}

export function registerRecordsRoutes(router: Router, deps: RecordsRoutesDeps): Router {
  createBusinessPartnerManagementRoute(router, deps);
  createSupplierIntakeRoute(router, deps);

  createRecordsRoute(router, deps);
  createBulkPreflightRoute(router, deps);
  createBulkActionRoute(router, deps);
  createBulkCrudRoutes(router, deps);
  createExportRoutes(router, deps);
  createActionDispatcherRoute(router, deps);
  createActivityRoute(router, deps);

  if (deps.importQueue && deps.objectStorage) {
    createImportRoutes(router, {
      db: deps.db,
      auth: deps.auth,
      importQueue: deps.importQueue,
      objectStorage: deps.objectStorage,
      logger: deps.logger,
    });
  }

  return router;
}
