import { TOKENS } from "../../../../kernel/tokens.js";

import type { HttpHandlerContext, RouteHandler } from "./types";
import type { HealthCheckRegistry, SystemHealth } from "@athyper/core";
import type { Request, Response } from "express";

/**
 * GET /health — aggregated system health with component breakdown.
 *
 * Returns HTTP 503 when overall status is "unhealthy" (load balancers drain).
 * Returns HTTP 200 for "healthy" and "degraded" (informational, not a routing signal).
 */
export class HealthHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext) {
        try {
            const healthRegistry = await ctx.container.resolve<HealthCheckRegistry>(TOKENS.healthRegistry);
            const config = await ctx.container.resolve<any>(TOKENS.config);

            const systemHealth: SystemHealth = await healthRegistry.getSystemHealth({
                version: config.serviceName,
            });

            const httpStatus = systemHealth.status === "unhealthy" ? 503 : 200;

            res.status(httpStatus).json({
                status: systemHealth.status,
                version: systemHealth.version,
                uptime: systemHealth.uptime,
                timestamp: systemHealth.timestamp.toISOString(),
                dependencies: systemHealth.dependencies.map((dep) => ({
                    name: dep.name,
                    type: dep.type,
                    required: dep.required,
                    status: dep.result.status,
                    message: dep.result.message,
                    durationMs: dep.result.duration,
                    details: dep.result.details,
                })),
            });
        } catch (err) {
            res.status(503).json({
                status: "unhealthy",
                error: err instanceof Error ? err.message : "Health check failed",
                timestamp: new Date().toISOString(),
            });
        }
    }
}
