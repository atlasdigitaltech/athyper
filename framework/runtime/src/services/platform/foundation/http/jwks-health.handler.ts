// framework/runtime/src/services/platform/foundation/http/jwks-health.handler.ts
//
// GET /health/jwks — surfaces per-realm JWKS key status for readiness checks.

import { TOKENS } from "../../../../kernel/tokens.js";

import type { HttpHandlerContext, RouteHandler } from "./types";
import type { Request, Response } from "express";

export class JwksHealthHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const auth = await ctx.container.resolve<any>(TOKENS.auth);

            // getJwksHealth returns Record<string, JwksHealthStatus>
            const health = typeof auth.getJwksHealth === "function" ? auth.getJwksHealth() : {};

            const allHealthy = Object.values(health).every((h: any) => h.healthy);

            res.status(allHealthy ? 200 : 503).json({
                status: allHealthy ? "healthy" : "degraded",
                realms: health,
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
            res.status(503).json({
                status: "unhealthy",
                error: err instanceof Error ? err.message : "Unknown error",
                timestamp: new Date().toISOString(),
            });
        }
    }
}
