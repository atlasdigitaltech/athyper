/**
 * GET /api/metadata/permission-aliases
 *
 * Returns the active alias map from control.permission_alias as a flat
 * object: `{ alias_code: canonical_code, ... }`. Tenant scope is irrelevant —
 * the alias table is platform-wide.
 *
 * The BFF (apps/{neon,admin,mesh}/lib/server/meta-entity-runtime.ts) calls this
 * once and threads the map into compileMetaEntityRuntimeDescriptor() as
 * `permissionAliasMap`. The compiler's hasOperation() consults the map so
 * entity_operation rows that still reference legacy codes (e.g. `edit`) resolve
 * to their canonical action (`update` per D6).
 *
 * Phase 4 — Three-Plane Permission Stack.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { RequestHandler, Router } from "express";

import { verifyBearer } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface PermissionAliasRouteDeps {
  db: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

interface AliasRow {
  alias_code: string;
  canonical_code: string;
}

export function createPermissionAliasRoute(router: Router, deps: PermissionAliasRouteDeps): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const rows = await sql<AliasRow>`
        SELECT alias_code, canonical_code
          FROM control.permission_alias
         WHERE (hard_fail_after IS NULL OR hard_fail_after > now())
         ORDER BY alias_code
      `.execute(db);

      const aliasMap: Record<string, string> = {};
      for (const row of rows.rows) {
        aliasMap[row.alias_code] = row.canonical_code;
      }

      // Set a longer cache header — alias map changes are rare and tenant-wide.
      res.setHeader("Cache-Control", "private, max-age=300");
      res.json(aliasMap);
    } catch (err) {
      logger?.error("permission_alias_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/permission-aliases", handler);
  return router;
}
