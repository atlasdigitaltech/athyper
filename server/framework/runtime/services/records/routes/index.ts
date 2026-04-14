/**
 * Records Routes — registration entry point
 *
 * Routes registered:
 *   GET    /api/records/:entity                — list master records (paginated)
 *   GET    /api/records/:entity/:id            — single record detail
 *   POST   /api/records/:entity                — create record
 *   PUT    /api/records/:entity/:id            — update record
 *   DELETE /api/records/:entity/:id            — delete record
 *
 *   POST   /api/records/:entity/import/upload  — upload file, return uploadToken + preview
 *   POST   /api/records/:entity/import         — dry-run validate OR execute (enqueue chunks)
 *   GET    /api/records/:entity/import/:jobId  — poll import status
 *   GET    /api/records/:entity/import         — recent import history
 */

import type { Router } from "express";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";
import { createRecordsRoute } from "./records.route.js";
import { createImportRoutes } from "./import.route.js";
import type { ImportObjectStorage } from "./import.route.js";

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
  /** Optional: enables /records/:entity/import/* routes when provided */
  importQueue?:   Queue;
  objectStorage?: ImportObjectStorage;
}

export function registerRecordsRoutes(router: Router, deps: RecordsRoutesDeps): Router {
  createRecordsRoute(router, deps);

  if (deps.importQueue && deps.objectStorage) {
    createImportRoutes(router, {
      db:            deps.db,
      auth:          deps.auth,
      importQueue:   deps.importQueue,
      objectStorage: deps.objectStorage,
      logger:        deps.logger,
    });
  }

  return router;
}
