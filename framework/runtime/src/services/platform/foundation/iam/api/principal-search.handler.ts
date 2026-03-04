/**
 * Principal Search Handler
 *
 * Search principals by principal_code or display name for autocomplete features.
 *
 * Schema: core.principal has principal_code (not username), display_name, email, is_active
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type { HttpHandlerContext, RouteHandler } from "../../http/types.js";
import type { Request, Response } from "express";
import type { Kysely } from "kysely";

/**
 * GET /api/iam/principals/search?search=...
 *
 * Search active principals for autocomplete (e.g., @mentions)
 *
 * Query params:
 * - search: string (required, min 2 chars)
 * - limit: number (optional, default 10, max 50)
 */
export class SearchPrincipalsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const search = req.query.search as string | undefined;
    const limit = req.query.limit as string | undefined;
    const tenantId = ctx.tenant.tenantKey ?? "default";

    // Validate search query
    if (!search || typeof search !== "string") {
      res.status(400).json({
        ok: false,
        error: "Missing required parameter: search",
      });
      return;
    }

    const searchTerm = search.trim();
    if (searchTerm.length < 2) {
      res.status(400).json({
        ok: false,
        error: "Search term must be at least 2 characters",
      });
      return;
    }

    // Validate limit
    const parsedLimit = Math.min(Math.max(parseInt(String(limit ?? "10"), 10) || 10, 1), 50);

    // Execute search
    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);
    const searchPattern = `%${searchTerm}%`;

    const results = await db
      .selectFrom("core.principal")
      .select([
        "id",
        "principal_code",
        "display_name",
        "email",
      ])
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .where((eb: any) =>
        eb.or([
          eb("principal_code", "ilike", searchPattern),
          eb("display_name", "ilike", searchPattern),
          eb("email", "ilike", searchPattern),
        ])
      )
      .orderBy("principal_code", "asc")
      .limit(parsedLimit)
      .execute();

    res.status(200).json({
      ok: true,
      data: results.map((p: any) => ({
        id: p.id,
        username: p.principal_code,
        displayName: p.display_name || p.principal_code,
        email: p.email,
      })),
      meta: {
        total: results.length,
        limit: parsedLimit,
        query: searchTerm,
      },
    });
  }
}
