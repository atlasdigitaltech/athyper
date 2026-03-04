import { HealthCheckRegistry } from "@athyper/core";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { HealthHandler } from "../health.handler";

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

function makeCtx(
  registry: HealthCheckRegistry,
  config?: any,
): HttpHandlerContext {
  return {
    container: {
      resolve: vi.fn().mockImplementation(async (token: string) => {
        if (token === "observability.health") return registry;
        if (token === "kernel.config")
          return config ?? { serviceName: "test-svc" };
        throw new Error(`Unknown token: ${token}`);
      }),
    },
    request: {
      requestId: "test-123",
      source: "http",
      method: "GET",
      path: "/health",
    },
    tenant: { realmKey: "default", tenantKey: "t1" },
    auth: { authenticated: false, realmKey: "default", roles: [], groups: [] },
  } as any;
}

describe("HealthHandler", () => {
  let handler: HealthHandler;
  let registry: HealthCheckRegistry;

  beforeEach(() => {
    handler = new HealthHandler();
    registry = new HealthCheckRegistry();
  });

  it("returns 200 with status healthy when all dependencies pass", async () => {
    registry.register(
      "database",
      async () => ({ status: "healthy", timestamp: new Date() }),
      { type: "database", required: true },
    );
    registry.register(
      "cache",
      async () => ({ status: "healthy", timestamp: new Date() }),
      { type: "cache", required: false },
    );

    const res = mockRes();
    await handler.handle(mockReq(), res, makeCtx(registry));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "healthy",
        version: "test-svc",
      }),
    );

    const body = (res.json as any).mock.calls[0][0];
    expect(body.dependencies).toHaveLength(2);
    expect(body.dependencies[0]).toMatchObject({
      name: "database",
      status: "healthy",
      required: true,
    });
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThan(0);
  });

  it("returns 200 with status degraded when a non-required dependency is degraded", async () => {
    registry.register(
      "database",
      async () => ({ status: "healthy", timestamp: new Date() }),
      { type: "database", required: true },
    );
    registry.register(
      "cache",
      async () => ({
        status: "degraded",
        message: "Slow",
        timestamp: new Date(),
      }),
      { type: "cache", required: false },
    );

    const res = mockRes();
    await handler.handle(mockReq(), res, makeCtx(registry));

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.status).toBe("degraded");
  });

  it("returns 503 with status unhealthy when a required dependency is unhealthy", async () => {
    registry.register(
      "database",
      async () => ({
        status: "unhealthy",
        message: "Connection refused",
        timestamp: new Date(),
      }),
      { type: "database", required: true },
    );

    const res = mockRes();
    await handler.handle(mockReq(), res, makeCtx(registry));

    expect(res.status).toHaveBeenCalledWith(503);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.status).toBe("unhealthy");
    expect(body.dependencies[0]).toMatchObject({
      name: "database",
      status: "unhealthy",
      message: "Connection refused",
    });
  });

  it("includes dependency details in response body", async () => {
    registry.register(
      "database",
      async () => ({
        status: "healthy",
        message: "Connected",
        details: { canConnect: true, pool: { total: 5, active: 2 } },
        timestamp: new Date(),
      }),
      { type: "database", required: true },
    );

    const res = mockRes();
    await handler.handle(mockReq(), res, makeCtx(registry));

    const body = (res.json as any).mock.calls[0][0];
    expect(body.dependencies[0].details).toEqual({
      canConnect: true,
      pool: { total: 5, active: 2 },
    });
    expect(body.dependencies[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns 503 when the registry itself throws", async () => {
    const ctx = {
      container: {
        resolve: vi.fn().mockRejectedValue(new Error("Container explosion")),
      },
      request: {
        requestId: "x",
        source: "http",
        method: "GET",
        path: "/health",
      },
      tenant: { realmKey: "default" },
      auth: {
        authenticated: false,
        realmKey: "default",
        roles: [],
        groups: [],
      },
    } as any;

    const res = mockRes();
    await handler.handle(mockReq(), res, ctx);

    expect(res.status).toHaveBeenCalledWith(503);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.status).toBe("unhealthy");
    expect(body.error).toBe("Container explosion");
  });
});
