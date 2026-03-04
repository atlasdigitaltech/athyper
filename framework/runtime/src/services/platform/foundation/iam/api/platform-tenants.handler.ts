/**
 * Platform Tenants Handler
 *
 * Returns the list of all tenants for platform admin operations.
 * Only accessible from the platform-control realm.
 *
 * Security:
 *   - Verifies request comes from the platform-control realm
 *   - Returns tenant metadata only (id, code, name, status, region)
 *   - Does NOT expose tenant secrets or internal config
 */

import { isPlatformControlRealm } from "../../../../../kernel/platform-admin.js";
import { TOKENS } from "../../../../../kernel/tokens.js";

import type { RuntimeConfig } from "../../../../../kernel/config.schema.js";
import type { HttpHandlerContext, RouteHandler } from "../../http/types.js";
import type { Request, Response } from "express";
import type { Kysely } from "kysely";

/**
 * GET /api/platform/tenants
 *
 * Returns all tenants (id, code, name, status, region) from core.tenant.
 * Requires platform-control realm.
 */
export class ListPlatformTenantsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const cfg = await ctx.container.resolve<RuntimeConfig>(TOKENS.config);

    // Verify this is a platform-control realm request
    if (!ctx.tenant.platformAdmin) {
      if (!isPlatformControlRealm(cfg, ctx.tenant.realmKey)) {
        res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
          message:
            "This endpoint is only accessible from the platform-control realm",
        });
        return;
      }
    }

    const db = await ctx.container.resolve<Kysely<any>>(TOKENS.db);

    // Query all tenants — no tenant_id filter (platform-wide view)
    const tenants = await db
      .selectFrom("core.tenant")
      .select([
        "id",
        "code",
        "name",
        "status",
        "region",
        "subscription_tier",
        "created_at",
      ])
      .orderBy("name", "asc")
      .execute();

    res.status(200).json({
      ok: true,
      tenants: tenants.map((t: any) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        status: t.status,
        region: t.region,
        subscriptionTier: t.subscription_tier,
        createdAt: t.created_at,
      })),
    });
  }
}
