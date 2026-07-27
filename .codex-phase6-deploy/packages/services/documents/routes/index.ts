/**
 * Documents Routes — registration entry point
 *
 * Routes registered:
 *   GET    /api/documents/:docType                                    — list documents (paginated)
 *   GET    /api/documents/:docType/:id                                — document detail (header + lines)
 *   POST   /api/documents/:docType                                    — create document
 *   POST   /api/documents/:docType/:id/transition                     — status transition
 *   GET    /api/documents/:docType/:id/attachments                    — list file attachments
 *   POST   /api/documents/:docType/:id/attachments                    — upload file attachment (base64 JSON)
 *   DELETE /api/documents/:docType/:id/attachments/:attachmentId      — delete attachment
 *   GET    /api/documents/:docType/:id/attachments/:attachmentId/download — stream file download
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";
import type { ObjectStorageAdapter } from "@athyper/adapter-object-storage";
import type { ExtractTextJobData, SweepJobData } from "@athyper/svc-jobs";
import { createDocumentsRoute } from "./documents.route.js";

export interface DocumentsRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  /** Reads the tenant identity established by the authenticated host boundary. */
  readAuthenticatedContext?: (req: Parameters<RequestHandler>[0]) => {
    tenantId?: string;
  } | undefined;
  objectStorage?: {
    adapter:     ObjectStorageAdapter;
    bucket:      string;
    maxUploadMb?: number;
  };
  /** BullMQ queue for Tika text extraction; forwarded to attachment upload. */
  tikaQueue?: Queue<ExtractTextJobData | SweepJobData>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

export function registerDocumentsRoutes(router: Router, deps: DocumentsRoutesDeps): Router {
  createDocumentsRoute(router, deps);
  return router;
}
