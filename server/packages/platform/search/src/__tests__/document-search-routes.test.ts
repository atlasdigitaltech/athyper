import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentSearchService, registerDocumentSearchRoutes, SearchError } from "../index.js";
import { context } from "./fixtures.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); })));
});
async function setup() {
  const indexSearch = vi.fn(async () => ({ hits: [], total: 0, processingMs: 1 }));
  const authorize = vi.fn(async () => ({ allowed: true as const }));
  const service = createDocumentSearchService({ authorizer: { authorize }, index: { search: indexSearch, upsert: async () => undefined, remove: async () => undefined } });
  const search = vi.spyOn(service, "search");
  const app = express();
  app.set("query parser", "extended");
  registerDocumentSearchRoutes(app, {
    authenticate: (req, res, next) => { if (req.headers.authorization !== "Bearer test") { res.sendStatus(401); return; } next(); },
    readContext: context,
    search: service,
  });
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: "INTERNAL_ERROR" }); });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const get = (query: string, authenticated = true) => fetch(`http://127.0.0.1:${address.port}/api/search/documents?${query}`, { headers: authenticated ? { authorization: "Bearer test" } : {} });
  return { get, search, indexSearch, authorize };
}

describe("document search HTTP route", () => {
  it("requires authentication", async () => {
    const { get, search } = await setup();
    expect((await get("q=invoice", false)).status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });
  it("uses verified scope, applies defaults and prevents caching", async () => {
    const { get, indexSearch } = await setup();
    const response = await get("q=invoice&tenant_id=attacker&plane_key=neon");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ hits: [], total: 0, processingMs: 1, page: 1, pageSize: 20 });
    expect(indexSearch).toHaveBeenCalledWith(expect.objectContaining({ tenantId: context().tenantId, planeKey: "mesh" }));
  });
  it("passes explicit pagination and comma-separated filters", async () => {
    const { get, search } = await setup();
    expect((await get("q=invoice&entity_type=invoice,order&page=2&page_size=10")).status).toBe(200);
    expect(search).toHaveBeenCalledWith({ context: context(), text: "invoice", entityTypes: ["invoice", "order"], page: 2, pageSize: 10 });
  });
  it.each([
    ["q=x&q=y", "INVALID_SEARCH_QUERY"], ["q[nested]=x", "INVALID_SEARCH_QUERY"], ["", "INVALID_SEARCH_QUERY"],
    ["q=x&entity_type=invoice&entity_type=order", "INVALID_ENTITY_TYPE"], ["q=x&entity_type[nested]=invoice", "INVALID_ENTITY_TYPE"],
    ["q=x&entity_type=", "INVALID_ENTITY_TYPE"], ["q=x&entity_type=invoice,", "INVALID_ENTITY_TYPE"],
    ...["page", "page_size"].flatMap((field) => ["", "-1", "1.5", "0", "1e2", "0x10", "%20", "Infinity", "9007199254740993"].map((value) => [`q=x&${field}=${value}`, "INVALID_PAGINATION"])),
    ["q=x&page=1&page=2", "INVALID_PAGINATION"], ["q=x&page_size[nested]=10", "INVALID_PAGINATION"],
    ["q=x&page=10001", "INVALID_PAGINATION"], ["q=x&page_size=101", "INVALID_PAGINATION"],
  ])("rejects invalid query %s", async (query, code) => {
    const { get, indexSearch } = await setup();
    const response = await get(query!);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: code });
    expect(indexSearch).not.toHaveBeenCalled();
  });
  it("maps domain errors and forwards unexpected failures", async () => {
    const { get, search } = await setup();
    search.mockRejectedValueOnce(new SearchError(403, "FORBIDDEN", "Denied"));
    const denied = await get("q=x");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "FORBIDDEN", message: "Denied" });
    search.mockRejectedValueOnce(new Error("private backend detail"));
    const failed = await get("q=x");
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "INTERNAL_ERROR" });
  });
});
