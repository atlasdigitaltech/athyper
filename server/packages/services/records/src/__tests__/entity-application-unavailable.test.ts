import { createServer } from "node:http";
import express from "express";
import { afterEach, expect, it, vi } from "vitest";
import { registerEntityListRoutes } from "../entity-list-routes.js";
import { RecordServiceError } from "../errors.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});
async function setup(error?: Error) {
  const applicationDescriptor = vi.fn(async () => {
    if (error) throw error;
    return { schemaVersion: 1 };
  });
  const app = express();
  registerEntityListRoutes(app, {
    authenticate: (req, res, next) => { if (req.headers.authorization !== "Bearer test") { res.sendStatus(401); return; } next(); },
    readContext: () => ({ tenantId: "test", principalId: "test", planeKey: "neon" }) as never,
    lists: {} as never,
    applicationDescriptor: applicationDescriptor as never,
  });
  app.use((error: { statusCode?: number; code?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ code: error.code ?? "INTERNAL_ERROR", ...(error.statusCode ? { detail: error.message } : {}) });
  });
  const server = createServer(app); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("No address");
  return { applicationDescriptor, get: (authenticated = true) => fetch(`http://127.0.0.1:${address.port}/api/entity-runtime/business_partner/application-descriptor`, { headers: authenticated ? { authorization: "Bearer test" } : {} }) };
}
it("returns an actionable non-cacheable 503 for a missing compiled release", async () => {
  const h = await setup(new Error("COMPILED_ENTITY_APPLICATION_RELEASE_UNAVAILABLE"));
  const response = await h.get();
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ code: "ENTITY_APPLICATION_UNAVAILABLE", detail: expect.stringContaining("publish and activate") });
});
it("authenticates before revealing configuration availability", async () => {
  const h = await setup(new Error("COMPILED_ENTITY_APPLICATION_RELEASE_UNAVAILABLE"));
  expect((await h.get(false)).status).toBe(401);
  expect(h.applicationDescriptor).not.toHaveBeenCalled();
});
it("keeps unexpected integrity failures as internal errors", async () => {
  const h = await setup(new Error("COMPILED_ENTITY_ARTIFACT_TYPE_MISMATCH"));
  const response = await h.get();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ code: "INTERNAL_ERROR" });
});
it("preserves authorization failures", async () => {
  const h = await setup(new RecordServiceError(403, "FORBIDDEN", "Forbidden"));
  expect((await h.get()).status).toBe(403);
});
it("leaves successful descriptors unchanged", async () => {
  const h = await setup(); const response = await h.get();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ schemaVersion: 1 });
});
