import { describe, it, expect, vi } from "vitest";

import { LivenessHandler } from "../liveness.handler";

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

function makeCtx(): HttpHandlerContext {
    return {
        container: {
            resolve: vi.fn().mockRejectedValue(new Error("Should not be called")),
        },
        request: { requestId: "test-123", source: "http", method: "GET", path: "/health/liveness" },
        tenant: { realmKey: "default", tenantKey: "t1" },
        auth: { authenticated: false, realmKey: "default", roles: [], groups: [] },
    } as any;
}

describe("LivenessHandler", () => {
    it("returns 200 with alive: true under normal conditions", async () => {
        const handler = new LivenessHandler();
        const res = mockRes();

        await handler.handle(mockReq(), res, makeCtx());

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.alive).toBe(true);
        expect(body.eventLoopLagMs).toBeGreaterThanOrEqual(0);
        expect(body.eventLoopLagMs).toBeLessThan(5000); // Sanity: should be well under threshold
        expect(body.uptimeMs).toBeGreaterThan(0);
        expect(body.timestamp).toBeDefined();
    });

    it("does not resolve any DI tokens (no external dependencies)", async () => {
        const handler = new LivenessHandler();
        const ctx = makeCtx();
        const res = mockRes();

        await handler.handle(mockReq(), res, ctx);

        // container.resolve should never be called — liveness must be local-only
        expect(ctx.container.resolve).not.toHaveBeenCalled();
    });

    it("response shape matches K8s expectations", async () => {
        const handler = new LivenessHandler();
        const res = mockRes();

        await handler.handle(mockReq(), res, makeCtx());

        const body = (res.json as any).mock.calls[0][0];
        expect(body).toEqual(
            expect.objectContaining({
                alive: expect.any(Boolean),
                uptimeMs: expect.any(Number),
                eventLoopLagMs: expect.any(Number),
                timestamp: expect.any(String),
            }),
        );
    });
});
