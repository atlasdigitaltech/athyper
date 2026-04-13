/**
 * Metadata Routes — GET /api/metadata/lookups/:domain
 *
 * Returns a LookupDomainBundle (domain header + active values) for a single
 * domain code. Used by enum field renderers in the entity form/detail pages.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";

export interface LookupRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

export function createLookupRoute(router: Router, deps: LookupRoutesDeps): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const authHeader = req.headers.authorization ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) {
        res.status(401).json({ error: "MISSING_TOKEN", message: "Authorization: Bearer <token> required" });
        return;
      }
      try {
        await auth.verifyToken(match[1]!);
      } catch {
        res.status(401).json({ error: "INVALID_TOKEN", message: "Token verification failed" });
        return;
      }

      const domainCode = decodeURIComponent(req.params["domain"] as string);

      // ── Domain header ─────────────────────────────────────────────────────
      const domainRow = await db
        .selectFrom("control.lookup_domain as ld")
        .select(["ld.id", "ld.code", "ld.name", "ld.description", "ld.source_schema", "ld.is_extensible", "ld.status"])
        .where("ld.code", "=", domainCode)
        .executeTakeFirst();

      if (!domainRow) {
        res.status(404).json({ error: "NOT_FOUND", message: `Lookup domain '${domainCode}' not found` });
        return;
      }

      // ── Values (system + tenant for the requesting org, if any) ───────────
      const valueRows = await db
        .selectFrom("control.lookup_value as lv")
        .select([
          "lv.id", "lv.code", "lv.name", "lv.domain_code",
          "lv.description", "lv.sort_order", "lv.is_system",
          "lv.metadata", "lv.status",
        ])
        .where("lv.domain_code", "=", domainCode)
        .where("lv.tenant_id", "is", null)
        .where("lv.status", "=", "active")
        .orderBy("lv.sort_order", "asc")
        .execute();

      const values = valueRows.map((v) => ({
        id: v.id as string,
        code: v.code as string,
        name: v.name as string,
        domain_code: v.domain_code as string,
        description: (v.description ?? null) as string | null,
        sort_order: Number(v.sort_order ?? 0),
        is_system: Boolean(v.is_system),
        is_default: false,
        parent_code: null,
        metadata: (v.metadata && typeof v.metadata === "object" && Object.keys(v.metadata as object).length > 0)
          ? v.metadata as Record<string, unknown>
          : null,
        status: v.status as "active" | "deprecated",
      }));

      res.json({
        domain: {
          id: domainRow.id as string,
          code: domainRow.code as string,
          name: domainRow.name as string,
          description: (domainRow.description ?? null) as string | null,
          source_schema: domainRow.source_schema as string,
          is_extensible: Boolean(domainRow.is_extensible),
          status: domainRow.status as "active" | "deprecated",
        },
        values,
      });
      return;
    } catch (err) {
      logger?.error("lookup_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/lookups/:domain", handler);
  return router;
}
