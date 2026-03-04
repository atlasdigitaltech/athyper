import { HealthCheckRegistry } from "@athyper/core";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ReadinessHandler } from "../readiness.handler";

import type { HttpHandlerContext } from "../types";
import type { Request, Response } from "express";

function mockRes(): Response {
    const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return res as Response;
}

function mockReq(): Request {
    return {} as Request;
}

function makeCtx(registry: HealthCheckRegistry): HttpHandlerContext {
    return {
        container: {
            resolve: vi.fn().mockImplementation(async (token: string) => {
                if (token === "observability.health") return registry;
                throw new Error(`Unknown token: ${token}`);
            }),
        },
        request: { requestId: "test-123", source: "http", method: "GET", path: "/health/readiness" },
        tenant: { realmKey: "default", tenantKey: "t1" },
        auth: { authenticated: false, realmKey: "default", roles: [], groups: [] },
    } as any;
}

describe("ReadinessHandler", () => {
    let handler: ReadinessHandler;
    let registry: HealthCheckRegistry;

    beforeEach(() => {
        handler = new ReadinessHandler();
        registry = new HealthCheckRegistry();
    });

    it("returns 200 with ready: true when all required dependencies are healthy", async () => {
        registry.register("database", async () => ({ status: "healthy", timestamp: new Date() }), { type: "database", required: true });
        registry.register("auth_jwks", async () => ({ status: "healthy", timestamp: new Date() }), { type: "auth", required: true });
        registry.register("cache", async () => ({ status: "unhealthy", timestamp: new Date() }), { type: "cache", required: false });

        const res = mockRes();
        await handler.handle(mockReq(), res, makeCtx(registry));

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.ready).toBe(true);
        expect(body.timestamp).toBeDefined();
    });

    it("returns 503 with ready: false and failing list when a required dependency fails", async () => {
        registry.register("database", async () => ({ status: "unhealthy", message: "Connection refused", timestamp: new Date() }), { type: "database", required: true });
        registry.register("auth_jwks", async () => ({ status: "healthy", timestamp: new Date() }), { type: "auth", required: true });

        const res = mockRes();
        await handler.handle(mockReq(), res, makeCtx(registry));

        expect(res.status).toHaveBeenCalledWith(503);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.ready).toBe(false);
        expect(body.failing).toEqual([
            { name: "database", status: "unhealthy", message: "Connection refused" },
        ]);
    });

    it("non-required unhealthy dependencies do not cause failure", async () => {
        registry.register("database", async () => ({ status: "healthy", timestamp: new Date() }), { type: "database", required: true });
        registry.register("cache", async () => ({ status: "unhealthy", message: "Redis down", timestamp: new Date() }), { type: "cache", required: false });

        const res = mockRes();
        await handler.handle(mockReq(), res, makeCtx(registry));

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.ready).toBe(true);
    });

    it("returns 503 when the health check throws", async () => {
        const ctx = {
            container: {
                resolve: vi.fn().mockRejectedValue(new Error("Registry failed")),
            },
            request: { requestId: "x", source: "http", method: "GET", path: "/health/readiness" },
            tenant: { realmKey: "default" },
            auth: { authenticated: false, realmKey: "default", roles: [], groups: [] },
        } as any;

        const res = mockRes();
        await handler.handle(mockReq(), res, ctx);

        expect(res.status).toHaveBeenCalledWith(503);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.ready).toBe(false);
        expect(body.error).toBe("Registry failed");
    });
});
