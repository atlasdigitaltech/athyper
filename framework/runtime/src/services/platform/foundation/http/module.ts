import { createExpressHttpServer } from "../../../../adapters/http/express.httpServer";
import { TOKENS } from "../../../../kernel/tokens";

import { HealthHandler } from "./health.handler";
import { JwksHealthHandler } from "./jwks-health.handler";
import { LivenessHandler } from "./liveness.handler";
import { ReadinessHandler } from "./readiness.handler";

import type { Container } from "../../../../kernel/container";
import type { RuntimeModule } from "../../../types.js";
import type { RouteRegistry } from "../registries/routes.registry.js";

export const module: RuntimeModule = {
    name: "platform.foundation.http",

    async register(c: Container) {
        // Express-backed server
        c.register(TOKENS.httpServer, async () => createExpressHttpServer(c), "singleton");

        // Handlers
        c.register("http.handler.health", async () => new HealthHandler(), "singleton");
        c.register("http.handler.jwks-health", async () => new JwksHealthHandler(), "singleton");
        c.register("http.handler.readiness", async () => new ReadinessHandler(), "singleton");
        c.register("http.handler.liveness", async () => new LivenessHandler(), "singleton");
    },

    async contribute(c: Container) {
        const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

        routes.add({
            method: "GET",
            path: "/health",
            handlerToken: "http.handler.health",
            authRequired: false,
            tags: ["foundation"],
        });

        routes.add({
            method: "GET",
            path: "/health/jwks",
            handlerToken: "http.handler.jwks-health",
            authRequired: false,
            tags: ["foundation", "auth"],
        });

        routes.add({
            method: "GET",
            path: "/health/readiness",
            handlerToken: "http.handler.readiness",
            authRequired: false,
            tags: ["foundation", "k8s"],
        });

        routes.add({
            method: "GET",
            path: "/health/liveness",
            handlerToken: "http.handler.liveness",
            authRequired: false,
            tags: ["foundation", "k8s"],
        });
    },
};