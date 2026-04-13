/**
 * Metadata Routes — GET /api/metadata/entities/:entity/operations
 *
 * Returns entity operations (action bar buttons) for the given entity.
 * Currently returns an empty array until control.entity_operation is populated.
 */

import type { RequestHandler, Router } from "express";

export interface EntityOperationsRoutesDeps {
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

export function createEntityOperationsRoute(router: Router, deps: EntityOperationsRoutesDeps): Router {
  const { auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
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

      // No operations defined yet — return empty array
      res.json([]);
      return;
    } catch (err) {
      logger?.error("entity_operations_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/operations", handler);
  return router;
}
