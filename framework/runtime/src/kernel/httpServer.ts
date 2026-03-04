// framework/runtime/src/kernel/httpServer.ts

import type { RouteDef } from "../services/platform/foundation/registries/routes.registry.js";

export interface HttpServer {
    mountRoutes(routes: readonly RouteDef[]): void;
    listen(port: number): Promise<void>;
    close(): Promise<void>;
}