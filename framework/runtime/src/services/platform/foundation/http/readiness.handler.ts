import { TOKENS } from "../../../../kernel/tokens.js";

import type { HttpHandlerContext, RouteHandler } from "./types";
import type { HealthCheckRegistry } from "@athyper/core";
import type { Request, Response } from "express";

/**
 * GET /health/readiness — K8s readinessProbe semantics.
 *
 * 200: pod should receive traffic (all required dependencies healthy).
 * 503: pod should be removed from service endpoints.
 *
 * Checks all required dependencies (DB, auth_jwks, object_storage,
 * and job-queue when mode !== "api").
 */
export class ReadinessHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext) {
        try {
            const healthRegistry = await ctx.container.resolve<HealthCheckRegistry>(TOKENS.healthRegistry);

            const dependencies = await healthRegistry.checkAll();
            const failing = dependencies
                .filter((d) => d.required && d.result.status !== "healthy")
                .map((d) => ({
                    name: d.name,
                    status: d.result.status,
                    message: d.result.message,
                }));

            const isReady = failing.length === 0;

            if (isReady) {
                res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
            } else {
                res.status(503).json({
                    ready: false,
                    failing,
                    timestamp: new Date().toISOString(),
                });
            }
        } catch (err) {
            res.status(503).json({
                ready: false,
                error: err instanceof Error ? err.message : "Readiness check failed",
                timestamp: new Date().toISOString(),
            });
        }
    }
}
