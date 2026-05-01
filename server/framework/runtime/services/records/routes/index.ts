/**
 * Records Routes — registration entry point
 *
 * Routes registered:
 *   GET    /api/records/:entity                — list master records (paginated, ?q=, ?filters=)
 *   GET    /api/records/:entity/:id            — single record detail
 *   POST   /api/records/:entity                — create record
 *   PUT    /api/records/:entity/:id            — update record
 *   DELETE /api/records/:entity/:id            — delete record
 *
 *   POST   /api/records/:entity/import/upload  — upload file, return uploadToken + preview
 *   POST   /api/records/:entity/import         — dry-run validate OR execute (enqueue chunks)
 *   GET    /api/records/:entity/import/:jobId  — poll import status
 *   GET    /api/records/:entity/import         — recent import history
 *
 *   POST   /api/records/:entity/bulk-preflight  — dry-run eligibility check (call before confirm)
 *   POST   /api/records/:entity/bulk-action    — bulk status_transition or set_field (post-preflight)
 *   PATCH  /api/records/:entity/bulk           — bulk multi-field patch
 *   DELETE /api/records/:entity/bulk           — bulk soft-delete
 *
 *   POST   /api/records/:entity/export         — mint export token (CSV/XLSX)
 *   GET    /api/records/:entity/export/download — stream export file via token
 *
 *   POST   /api/records/:entity/:id/action/:code — execute entity operation (ActionBar)
 *
 *   GET    /api/activity/:entity/:id           — per-record activity log
 *
 * Composite intake (registered before generic :entity routes):
 *   POST   /api/records/supplier/check-duplicates — pre-submit duplicate check
 *   POST   /api/records/supplier/intake            — composite transactional create
 */

import type { Router } from "express";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";
import { createRecordsRoute }         from "./records.route.js";
import { createImportRoutes }         from "./import.route.js";
import type { ImportObjectStorage }   from "./import.route.js";
import { createBulkPreflightRoute }   from "./bulk-preflight.route.js";
import { createBulkActionRoute }      from "./bulk-action.route.js";
import { createBulkCrudRoutes }       from "./bulk-crud.route.js";
import { createExportRoutes }         from "./export.route.js";
import { createActionDispatcherRoute } from "./action-dispatcher.route.js";
import { createActivityRoute }        from "./activity.route.js";
import { createSupplierIntakeRoute }  from "./supplier-intake.route.js";

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
  createRecordsRoute(router,           deps);
  createBulkPreflightRoute(router,     deps);
  createBulkActionRoute(router,        deps);
  createBulkCrudRoutes(router,         deps);
  createExportRoutes(router,           deps);
  createActionDispatcherRoute(router,  deps);
  createActivityRoute(router,          deps);
  // Composite intake — must register before generic :entity/* to avoid shadowing
  createSupplierIntakeRoute(router,    deps);

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
