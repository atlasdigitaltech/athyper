import { createServer } from "node:http";
import type { RequestHandler } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApplication, createOpenApiDocument, HttpError, sendProblem } from "@athyper/server-runtime-http";
import { registerAuditRoutes } from "../audit-routes.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function fixture(authenticate: RequestHandler = (_request, _response, next) => next()) {
  const app = createHttpApplication({
    openApi: { title: "Audit", version: "1", enforceContracts: true, enforceResponses: true },
    rateLimit: {
      scope: "tenant-principal", windowMs: 60_000, maxRequests: 1,
      identity: () => ({ tenantId: "tenant-1", principalId: "principal-1" }),
    },
    configure(application) { registerAuditRoutes(application, { authenticate }); },
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server address unavailable");
  return { app, url: `http://127.0.0.1:${address.port}/api/audit/status` };
}

describe("audit status route", () => {
  it("publishes an authenticated contract and returns uncached availability", async () => {
    const { app, url } = await fixture();
    expect(createOpenApiDocument(app, { title: "Audit", version: "1" })).toMatchObject({
      paths: { "/api/audit/status": { get: {
        operationId: "audit.getStatus", security: [{ bearerAuth: [] }],
        responses: { "200": { content: { "application/json": { schema: {
          required: ["status"], properties: { status: { const: "available" } }, additionalProperties: false,
        } } } } },
      } } },
    });
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ status: "available" });
  });

  it("applies tenant/principal rate limits after authentication", async () => {
    let authenticated = 0;
    const { url } = await fixture((_request, _response, next) => { authenticated++; next(); });
    expect((await fetch(url)).status).toBe(200);
    const limited = await fetch(url);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("private, no-store");
    expect(authenticated).toBe(2);
  });

  it.each([401, 403, 503])("preserves authentication failure %i without reporting availability", async (status) => {
    const { url } = await fixture((request, response) => {
      sendProblem(response, request, new HttpError(status, "AUTH_REJECTED", "Authentication rejected"));
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(url);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      await expect(response.json()).resolves.toMatchObject({ status, code: "AUTH_REJECTED" });
    }
  });

  it("propagates asynchronous authentication errors", async () => {
    const { url } = await fixture(async () => { throw new Error("internal failure"); });
    const response = await fetch(url);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("internal failure");
  });
});
