
import type { Container } from "../../../../kernel/container";
import type { TenantContext } from "../../../../kernel/tenantContext";
import type { Request, Response } from "express";

export type RequestContext = {
    requestId: string;
    source: "http";
    method: string;
    path: string;
    ip?: string;
    userAgent?: string;
};

export type AuthContext = {
    authenticated: boolean;

    realmKey: string;
    tenantKey?: string;
    orgKey?: string;

    subject?: string;
    userId?: string;
    email?: string;
    name?: string;

    roles: string[];
    groups: string[];

    claims?: Record<string, unknown>;

    /** Effective persona resolved from roles (e.g., "manager", "agent", "viewer") */
    effectivePersona?: string;
    /** All personas this user qualifies for */
    qualifiedPersonas?: string[];
};

export type HttpHandlerContext = {
    container: Container; // scoped container
    request: RequestContext;
    tenant: TenantContext;
    auth: AuthContext;
};

export interface RouteHandler {
    handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void>;
}

export interface RoutePolicy {
    assertAllowed(ctx: HttpHandlerContext): Promise<void>;
}