import type { HttpHandlerContext, RouteHandler } from "./types";
import type { Request, Response } from "express";

/**
 * GET /health/liveness — K8s livenessProbe semantics.
 *
 * 200: process is alive, keep it running.
 * 503: process is wedged, restart it.
 *
 * MUST be extremely lightweight:
 * - No external calls (no DB, no Redis, no HTTP)
 * - Checks only process-internal state
 * - Measures event loop lag to detect stuck processes
 */

const BOOT_TIME = Date.now();

/** If the event loop is delayed by more than this, the process is considered stuck. */
const EVENT_LOOP_LAG_THRESHOLD_MS = 5000;

export class LivenessHandler implements RouteHandler {
    async handle(_req: Request, res: Response, _ctx: HttpHandlerContext) {
        const lag = await measureEventLoopLag();
        const uptimeMs = Date.now() - BOOT_TIME;

        if (lag > EVENT_LOOP_LAG_THRESHOLD_MS) {
            res.status(503).json({
                alive: false,
                reason: `Event loop lag: ${lag}ms exceeds threshold ${EVENT_LOOP_LAG_THRESHOLD_MS}ms`,
                uptimeMs,
                eventLoopLagMs: lag,
                timestamp: new Date().toISOString(),
            });
            return;
        }

        res.status(200).json({
            alive: true,
            uptimeMs,
            eventLoopLagMs: lag,
            timestamp: new Date().toISOString(),
        });
    }
}

function measureEventLoopLag(): Promise<number> {
    const start = Date.now();
    return new Promise<number>((resolve) => {
        setImmediate(() => {
            resolve(Date.now() - start);
        });
    });
}
