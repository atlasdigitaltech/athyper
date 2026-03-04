import { TOKENS } from "../../kernel/tokens";

import type { RuntimeConfig } from "../../kernel/config";
import type { Container } from "../../kernel/container";

/**
 * Start Worker Runtime
 *
 * Responsibilities:
 * - Resolve kernel primitives (config/logger/lifecycle)
 * - Warm required adapters (telemetry/db/cache)
 * - Start worker engines (jobQueue/workerPool)
 * - Register shutdown hook(s) to stop workers gracefully
 */
export async function startWorkerRuntime(container: Container) {
    const config = await container.resolve<RuntimeConfig>(TOKENS.config);

    // Keep logger flexible (pino/winston/etc). Fall back to console-like log().
    const logger = await container.resolve<any>(TOKENS.logger);

    // Lifecycle is required so workers can shutdown cleanly.
    const lifecycle = await container.resolve<any>(TOKENS.lifecycle);

    // Warm adapters needed by most background jobs
    await container.resolve(TOKENS.telemetry);
    await container.resolve(TOKENS.db);
    await container.resolve(TOKENS.cache);

    // Start worker execution engine(s)
    // You can implement either:
    // - runtime.workerPool (recommended)
    // - runtime.jobQueue + workers (also fine)
    const workerPool = await container.resolve<any>(TOKENS.workerPool);
    await workerPool.start?.();

    // If you rely on a queue manager to attach consumers, resolve it too.
    const jobQueue = await container.resolve<any>(TOKENS.jobQueue);
    await jobQueue.start?.();

    const workerCount = (jobQueue as any).getRegisteredWorkerCount?.() ?? "unknown";
    if (logger.info) {
        logger.info({ service: config.serviceName, registeredWorkers: workerCount }, "[worker] started");
    } else {
        logger.log?.(`[worker] ${config.serviceName} started — registered workers: ${workerCount}`);
    }

    // Graceful shutdown: stop pulling jobs, finish in-flight tasks, close resources
    lifecycle.onShutdown?.(async () => {
        if (logger.info) {
            logger.info("[worker] shutdown requested");
        } else {
            logger.log?.("[worker] shutdown requested");
        }

        // Stop consuming new jobs first
        await jobQueue.stop?.();
        await workerPool.stop?.();
    });
}