import {
    resolveContextFromJobPayload,
    resolveContextFromRequest,
    type RequestLike,
    type TenantContext,
} from "./tenantContext";
import { TOKENS } from "./tokens";

import type { RuntimeConfig } from "./config.schema";
import type { Container } from "./container";

export type RequestContext = {
    requestId: string;
    source: "http" | "job" | "scheduler" | "worker";
    method?: string;
    path?: string;
    headers?: Record<string, string | string[] | undefined>;
};

// Extend RequestLike with the optional fields we actually use in scope creation.
// No `any` needed.
export type HttpRequestLike = RequestLike & {
    id?: string;
    method?: string;
    path?: string;
};

export function createHttpScope(root: Container, req: HttpRequestLike): Container {
    const scope = root.createScope();

    scope.register(
        TOKENS.requestContext,
        async () =>
            ({
                requestId: req.id ?? `req-${Math.random().toString(36).slice(2)}`,
                source: "http",
                method: req.method,
                path: req.path,
                headers: req.headers,
            }) satisfies RequestContext,
        "scoped",
    );

    scope.register(
        TOKENS.tenantContext,
        async (c) => {
            const cfg = await c.resolve<RuntimeConfig>(TOKENS.config);
            return resolveContextFromRequest(cfg, req) satisfies TenantContext;
        },
        "scoped",
    );

    return scope;
}

export function createJobScope(
    root: Container,
    payload?: { realmKey?: string; tenantKey?: string; orgKey?: string },
    requestId?: string,
): Container {
    const scope = root.createScope();

    scope.register(
        TOKENS.requestContext,
        async () =>
            ({
                requestId: requestId ?? `job-${Math.random().toString(36).slice(2)}`,
                source: "job",
            }) satisfies RequestContext,
        "scoped",
    );

    scope.register(
        TOKENS.tenantContext,
        async (c) => {
            const cfg = await c.resolve<RuntimeConfig>(TOKENS.config);
            return resolveContextFromJobPayload(cfg, payload) satisfies TenantContext;
        },
        "scoped",
    );

    return scope;
}