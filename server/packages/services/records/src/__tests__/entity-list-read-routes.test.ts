import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerEntityListRoutes } from "../entity-list-routes.js";
import { RecordServiceError } from "../errors.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});

const recordId = "0d6f2f4e-8c3a-4a57-9a52-2f1f6b3d8c11";
const base = "/api/entity-runtime/country";
const routes = [
  { name: "application descriptor", method: "applicationDescriptor", path: `${base}/application-descriptor` },
  { name: "list descriptor", method: "descriptor", path: `${base}/list-descriptor` },
  { name: "form descriptor", method: "formDescriptor", path: `${base}/form-descriptor?mode=create` },
  { name: "detail descriptor", method: "detailDescriptor", path: `${base}/detail-descriptor` },
  { name: "combined detail", method: "detailRead", path: `${base}/records/${recordId}/detail` },
  { name: "record", method: "record", path: `${base}/records/${recordId}` },
  { name: "list", method: "list", path: `${base}/list` },
] as const;

async function setup(failure?: unknown) {
  const service = Object.fromEntries(routes.map(route => [route.method, vi.fn(async () => {
    if (failure) throw failure;
    return { route: route.method };
  })]));
  const app = express();
  registerEntityListRoutes(app, {
    authenticate: (req, res, next) => { if (req.headers.authorization !== "Bearer test") { res.sendStatus(401); return; } next(); },
    readContext: () => ({ tenantId: "test", principalId: "test", planeKey: "neon" }) as never,
    lists: Object.assign({ applicationDescriptor() { return service["applicationDescriptor"]!(); } }, service) as never,
  });
  app.use((error: { statusCode?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ code: error.code ?? "INTERNAL_ERROR" });
  });
  const server = createServer(app); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("No address");
  return { service, get: (path: string, authenticated = true) => fetch(`http://127.0.0.1:${address.port}${path}`, { headers: authenticated ? { authorization: "Bearer test" } : {} }) };
}

describe.each(routes)("$name route", ({ method, path }) => {
  it("returns the service result with a private no-store header", async () => {
    const h = await setup();
    const response = await h.get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ route: method });
  });
  it("authenticates before calling the service", async () => {
    const h = await setup();
    expect((await h.get(path, false)).status).toBe(401);
    expect(h.service[method]).not.toHaveBeenCalled();
  });
  it("maps service errors to their HTTP status", async () => {
    const h = await setup(new RecordServiceError(403, "FORBIDDEN", "Forbidden"));
    const response = await h.get(path);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "FORBIDDEN" });
  });
  it("rejects an invalid entity code without calling the service", async () => {
    const h = await setup();
    const response = await h.get(path.replace("/country/", "/Bad_Code/"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_ENTITY_CODE" });
    expect(h.service[method]).not.toHaveBeenCalled();
  });
});

describe("request parameter validation", () => {
  it.each(["a.b", "x-y", "a", "1abc"])("rejects non-canonical entity code %s", async (code) => {
    const h = await setup();
    const response = await h.get(`/api/entity-runtime/${code}/list`);
    expect(response.status).toBe(400);
    expect(h.service["list"]).not.toHaveBeenCalled();
  });
  it("passes a dotted standard view key to the list service", async () => {
    const h = await setup();
    expect((await h.get(`${base}/list?standardView=my.view-1`)).status).toBe(200);
    expect(h.service["list"]).toHaveBeenCalledWith(expect.objectContaining({ entityCode: "country", standardViewKey: "my.view-1" }));
  });
  it("rejects an invalid standard view key at the contract boundary", async () => {
    const h = await setup();
    const response = await h.get(`${base}/list?standardView=Bad%20View`);
    expect(response.status).toBe(400);
    expect(h.service["list"]).not.toHaveBeenCalled();
  });
  it("requires a form mode", async () => {
    const h = await setup();
    const response = await h.get(`${base}/form-descriptor?mode=view`);
    expect(response.status).toBe(400);
  });
  it("rejects an over-long record id", async () => {
    const h = await setup();
    const response = await h.get(`${base}/records/${"a".repeat(201)}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_RECORD_ID" });
  });
});
