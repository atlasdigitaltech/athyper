// framework/runtime/src/runtimes/api/startApiRuntime.ts

import { TOKENS } from "../../kernel/tokens";

import type { AuditEvent, AuditWriter } from "../../kernel/audit";
import type { RuntimeConfig } from "../../kernel/config.schema";
import type { Container } from "../../kernel/container";
import type { HttpServer } from "../../kernel/httpServer";
import type { Lifecycle } from "../../kernel/lifecycle";
import type { Logger } from "../../kernel/logger";
import type { RouteRegistry } from "../../services/platform/foundation/registries/routes.registry.js";

export async function startApiRuntime(container: Container) {
    const config = await container.resolve<RuntimeConfig>(TOKENS.config);
    const logger = await container.resolve<Logger>(TOKENS.logger);
    const lifecycle = await container.resolve<Lifecycle>(TOKENS.lifecycle);
    const audit = await container.resolve<AuditWriter>(TOKENS.auditWriter);

    const startedEvent: AuditEvent = {
        ts: new Date().toISOString(),
        type: "runtime.started",
        level: "info",
        actor: { kind: "system" },
        meta: { mode: "api", service: config.serviceName },
    };

    await audit.write(startedEvent);

    // Warm adapters
    await container.resolve(TOKENS.telemetry);
    await container.resolve(TOKENS.auth);
    await container.resolve(TOKENS.db);
    await container.resolve(TOKENS.cache);
    await container.resolve(TOKENS.objectStorage);

    const routes = await container.resolve<RouteRegistry>(TOKENS.routeRegistry);
    logger.info({ routes: routes.list().length }, "[api] routes loaded");

    const httpServer = await container.resolve<HttpServer>(TOKENS.httpServer);

    // ✅ Mount routes BEFORE listen
    httpServer.mountRoutes(routes.list());
    await httpServer.listen(config.port);

    logger.info({ service: config.serviceName, port: config.port }, "[api] listening");

    lifecycle.onShutdown(async () => {
        const stoppingEvent: AuditEvent = {
            ts: new Date().toISOString(),
            type: "runtime.stopping",
            level: "info",
            actor: { kind: "system" },
            meta: { mode: "api" },
        };

        await audit.write(stoppingEvent);
        await httpServer.close();
    });
}