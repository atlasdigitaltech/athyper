/**
 * Search Routes — cross-entity full-text search.
 *
 *   GET /api/search?q=<term>&entity_type=<t1,t2>&page=<n>&page_size=<n>&sort=<mode>
 *
 * All queries are scoped to the caller's tenant via a Meilisearch tenant
 * token minted per request. The token expires after 1 hour; queries longer
 * than that are impossible by construction.
 *
 * Response:
 *   {
 *     hits: [ { id, entity_type, entity_id, title, summary?, ... } ],
 *     total: number,         // estimatedTotalHits
 *     page: number,
 *     page_size: number,
 *     processing_ms: number
 *   }
 *
 * 503 when Meilisearch is not configured (MEILISEARCH_URL unset) or
 * unreachable — the frontend should degrade to per-entity records search.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { verifyBearer, resolveTenantId } from "@athyper/svc-shared";
import { SearchService } from "../client/search.service.js";

export interface SearchRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  /** Null when MEILISEARCH_URL/KEY are unset — route returns 503. */
  search: SearchService | null;
  logger?: {
    info(event: string,  fields?: Record<string, unknown>): void;
    warn(event: string,  fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

export function createSearchRoute(router: Router, deps: SearchRouteDeps): Router {
  const { db, auth, search, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      if (!search) {
        res.status(503).json({
          error:   "SEARCH_UNAVAILABLE",
          message: "Meilisearch is not configured on this server",
        });
        return;
      }

      if (!search.isReady()) {
        res.status(503).json({
          error:   "SEARCH_WARMING",
          message: "Search index is provisioning — retry shortly",
        });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(401).json({ error: "TENANT_UNRESOLVED" });
        return;
      }

      const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
      if (!q) {
        res.json({ hits: [], total: 0, page: 1, page_size: 20, processing_ms: 0 });
        return;
      }

      // ?entity_type=invoice,purchase_order → ["invoice", "purchase_order"]
      const entityTypesParam = typeof req.query["entity_type"] === "string"
        ? req.query["entity_type"].split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const page     = Math.max(1, parseInt(String(req.query["page"]      ?? "1"),  10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query["page_size"] ?? "20"), 10) || 20));

      const sortParam = req.query["sort"];
      const sort: "relevance" | "updated_desc" | "title_asc" =
        sortParam === "updated_desc" || sortParam === "title_asc" ? sortParam : "relevance";

      const result = await search.search({
        tenantId,
        q,
        entityTypes: entityTypesParam.length ? entityTypesParam : undefined,
        limit:       pageSize,
        offset:      (page - 1) * pageSize,
        sort,
      });

      res.json({
        hits:          result.hits,
        total:         result.estimatedTotalHits ?? result.hits.length,
        page,
        page_size:     pageSize,
        processing_ms: result.processingTimeMs,
      });
    } catch (err) {
      logger?.error("search_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  };

  router.get("/api/search", handler);
  return router;
}
