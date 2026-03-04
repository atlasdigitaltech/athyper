import { TOKENS } from "../../kernel/tokens";

import type { RuntimeConfig } from "../../kernel/config";
import type { Container } from "../../kernel/container";

/**
 * Start Scheduler Runtime
 *
 * Responsibilities:
 * - Resolve kernel primitives (config/logger/lifecycle)
 * - Warm required adapters (telemetry/db)
 * - Start scheduler engine (cron/event schedules)
 * - Register shutdown hook(s) to stop schedules gracefully
 */
export async function startSchedulerRuntime(container: Container) {
    const config = await container.resolve<RuntimeConfig>(TOKENS.config);

    // Keep logger flexible (structured logger preferred). Fall back to console-like log().
    const logger = await container.resolve<any>(TOKENS.logger);

    // Lifecycle is required so we can stop schedulers cleanly during shutdown.
    const lifecycle = await container.resolve<any>(TOKENS.lifecycle);

    // Warm adapters needed by scheduling + persistence
    await container.resolve(TOKENS.telemetry);
    await container.resolve(TOKENS.db);

    // Start scheduler engine (capability-based)
    const scheduler = await container.resolve<any>(TOKENS.scheduler);
    await scheduler.start?.();

    if (logger.info) {
        logger.info({ service: config.serviceName }, "[scheduler] started");
    } else {
        logger.log?.(`[scheduler] ${config.serviceName} started`);
    }

    // Graceful shutdown: stop triggering schedules and wait for in-flight tasks if needed
    lifecycle.onShutdown?.(async () => {
        if (logger.info) {
            logger.info("[scheduler] shutdown requested");
        } else {
            logger.log?.("[scheduler] shutdown requested");
        }
        await scheduler.stop?.();
    });
}