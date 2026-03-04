// framework/runtime/kernel/container.defaults.ts
import {
    GracefulShutdown,
    HealthCheckRegistry,
    MetricsRegistry,
    RequestContextStorage,
} from "@athyper/core";

import { JobRegistry } from "../services/platform/foundation/registries/jobs.registry.js";
import { RouteRegistry } from "../services/platform/foundation/registries/routes.registry.js";
import { ServiceRegistry } from "../services/platform/foundation/registries/services.registry.js";

import { createConsoleAuditWriter, makeAuditEvent, type AuditWriter } from "./audit";
import { Lifecycle } from "./lifecycle";
import { createPinoLogger, type LogLevel } from "./logger";
import { TOKENS } from "./tokens";

import type { RuntimeConfig } from "./config.schema";
import type { Container } from "./container";




export interface KernelDefaultsOptions {
    /**
     * Env snapshot provided by kernel bootstrap/config loader.
     * Do NOT read process.env directly in container defaults.
     */
    envSnapshot?: Record<string, string | undefined>;

    /**
     * Boot ID provided by bootstrap() for correlation.
     */
    bootId?: string;
}

/**
 * Registers baseline runtime capabilities into the container.
 *
 * IMPORTANT:
 * - Do NOT resolve dependencies here (keep this sync + deterministic).
 * - Boot/side-effects happen in bootstrap() after registration.
 */
export function registerKernelDefaults(container: Container, config: RuntimeConfig, options?: KernelDefaultsOptions) {
    // Kernel primitives
    container.register(TOKENS.config, async () => config, "singleton");
    container.register(TOKENS.lifecycle, async () => new Lifecycle(), "singleton");

    // Env snapshot (sanitized/minimal). No direct process.env reads here.
    const snapshot = Object.freeze({ ...(options?.envSnapshot ?? {}) });
    container.register(TOKENS.env, async () => snapshot, "singleton");

    container.register(TOKENS.clock, async () => ({ now: () => new Date() }), "singleton");

    // Boot ID for correlation
    container.register(TOKENS.bootId, async () => options?.bootId ?? "boot-unknown", "singleton");

    // Logger: Pino-based structured logging
    container.register(
        TOKENS.logger,
        async () => {
            return createPinoLogger({
                level: (config.logLevel ?? "info") as LogLevel,
                serviceName: config.serviceName,
                env: config.env,
                pretty: config.env === "local", // Pretty print in local dev
            });
        },
        "singleton",
    );

    // Audit: console writer for development (replace with DB/stream writer in production)
    container.register(TOKENS.auditWriter, async () => createConsoleAuditWriter(), "singleton");

    // Observability
    container.register(TOKENS.healthRegistry, async () => new HealthCheckRegistry(), "singleton");
    container.register(TOKENS.metricsRegistry, async () => new MetricsRegistry(), "singleton");
    container.register(TOKENS.requestContextStorage, async () => new RequestContextStorage(), "singleton");
    container.register(TOKENS.gracefulShutdown, async () => new GracefulShutdown(), "singleton");

    // Registries (definition buckets)
    container.register(TOKENS.serviceRegistry, async () => new ServiceRegistry(), "singleton");
    container.register(TOKENS.routeRegistry, async () => new RouteRegistry(), "singleton");
    container.register(TOKENS.jobRegistry, async () => new JobRegistry(), "singleton");
}

/**
 * Install signal handlers AFTER kernel defaults are registered.
 *
 * Called from bootstrap() so we can resolve lifecycle/logger/audit safely.
 */
export async function installSignalHandlers(container: Container) {
    const config = await container.resolve<RuntimeConfig>(TOKENS.config);
    const lifecycle = await container.resolve<Lifecycle>(TOKENS.lifecycle);
    const logger = await container.resolve<any>(TOKENS.logger);
    const audit = await container.resolve<AuditWriter>(TOKENS.auditWriter);
    const bootId = await container.resolve<string>(TOKENS.bootId);

    const shutdown = async (reason: string) => {
        logger.info?.({ reason, bootId }, "[kernel] shutdown requested");

        await audit.write(
            makeAuditEvent({
                type: "runtime.shutdown",
                level: "info",
                actor: { kind: "system" },
                meta: { reason, bootId },
            }),
        );

        const timeout = config.shutdownTimeoutMs ?? 15_000;

        await Promise.race([
            lifecycle.shutdown(reason),
            new Promise<void>((resolve) => setTimeout(resolve, timeout)),
        ]);
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}