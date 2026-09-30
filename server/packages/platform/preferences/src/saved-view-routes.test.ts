import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createSavedViewService, type SavedView, type SavedViewRepository } from "./index.js";
import { registerSavedViewRoutes } from "./saved-view-routes.js";

const id = "00000000-0000-4000-8000-000000000001";
const scope = { planeKey: "neon" as const, tenantId: "00000000-0000-4000-8000-000000000002", principalId: "00000000-0000-4000-8000-000000000003" };
const source: SavedView = { id, ...scope, ownerPrincipalId: scope.principalId, createdBy: scope.principalId, scope: "personal", surfaceCode: "entity_list", entityCode: "supplier", code: "all", name: "All", state: {}, metadata: {}, status: "active", version: 321 };
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }))); });
async function createFixture(view = source, base = "/api/me/saved-views",sharedAllowed=true) {
  const preferences = new Map<string, unknown>();
  const repo: SavedViewRepository = {
    list: vi.fn(async () => [view]), get: vi.fn(async () => view), create: vi.fn(async () => {}), replace: vi.fn(async () => 322),
    archive: vi.fn(async () => true), setScope: vi.fn(async () => true),
    clone: vi.fn(async (_scope, _source, clone) => ({ ...clone, version: 765 })),
    getPreference: async (_scope, code) => preferences.get(code),
    setPreference: vi.fn(async (_scope, code, _surface, value) => { preferences.set(code, value); }),
    clearPreference: vi.fn(async (_scope, code) => { preferences.delete(code); }),
  };
  const app = express(); app.use(express.json());
  registerSavedViewRoutes(app, { authenticate: (req, res, next) => { if (req.headers["x-test-unauthenticated"]) { res.status(401).end(); return; } res.locals["authenticated"] = true; next(); }, readContext: res => { expect(res.locals["authenticated"]).toBe(true); return scope as VerifiedRequestContext; }, savedViews: createSavedViewService(repo,undefined,async()=>sharedAllowed) });
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No address");
  return { repo, request: (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}${base}${path}`, { method, headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) };
}

describe("/api/me/saved-views", () => {
  const fixture = (view = source) => createFixture(view);
  it("lists with verified scope, filters, and presentation flags", async () => {
    const { request, repo } = await fixture();
    await request(`/${id}/pin`, "PATCH");
    const response = await request("?entity=supplier&surface=entity_list&includeArchived=true");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([expect.objectContaining({ id, isPinned: true, isStarred: false, isDefault: false })]);
    expect(repo.list).toHaveBeenCalledWith({ ...scope, entityCode: "supplier", surfaceCode: "entity_list", includeArchived: true });
  });
  it.each(["pin", "star"])("DELETE %s stays disabled on repeated requests while PATCH toggles", async action => {
    const { request } = await fixture();
    for (const method of ["DELETE", "DELETE", "PATCH", "DELETE", "DELETE"]) {
      const response = await request(`/${id}/${action}`, method);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, enabled: method === "PATCH" });
    }
  });
  it.each(["archive", "delete", "share"])("blocks another principal's shared-view %s mutation", async action => {
    const { request, repo } = await createFixture({ ...source, scope: "shared", ownerPrincipalId: undefined, createdBy: "another-principal" },"/api/me/saved-views",false);
    for (const method of ["PATCH", "DELETE"]) expect((await request(`/${id}/${action}`, method)).status).toBe(403);
    expect(repo.archive).not.toHaveBeenCalled(); expect(repo.setScope).not.toHaveBeenCalled();
  });
  it("allows the creator to unshare a shared view", async () => {
    const { request, repo } = await fixture({ ...source, scope: "shared", ownerPrincipalId: undefined });
    expect((await request(`/${id}/share`, "DELETE")).status).toBe(200);
    expect(repo.setScope).toHaveBeenCalledWith({...scope,sharedWrite:true}, id, "personal");
  });
  it("clones a shared view personally and returns the persisted version", async () => {
    const { request, repo } = await fixture({ ...source, scope: "shared", ownerPrincipalId: undefined, createdBy: "someone-else", code: "a".repeat(127), name: "😀".repeat(160) });
    const response = await request(`/${id}/clone`, "POST");
    expect(response.status).toBe(201); expect(response.headers.get("etag")).toBe('"765"');
    const clone = await response.json();
    expect(clone).toMatchObject({ scope: "personal", ownerPrincipalId: scope.principalId, createdBy: scope.principalId, version: 765 });
    expect(clone.code.length).toBeLessThanOrEqual(127); expect(Array.from(clone.name).length).toBeLessThanOrEqual(160);
    expect(repo.clone).toHaveBeenCalledOnce();
  });
  it.each([[], { name: 42 }, { name: " " }, { name: "x".repeat(161) }])("rejects invalid clone bodies: %j", async value => {
    const { request, repo } = await fixture();
    expect((await request(`/${id}/clone`, "POST", value)).status).toBe(400);
    expect(repo.clone).not.toHaveBeenCalled();
  });
  it.each([["PATCH", "/invalid/pin"], ["DELETE", "/invalid/share"], ["POST", "/invalid/clone"], ["PATCH", `/${id}/unknown`]])("rejects invalid path %s %s", async (method, path) => {
    const { request } = await fixture(); expect((await request(path, method)).status).toBe(400);
  });
  it.each([["23505", 409], ["23514", 400]] as const)("maps database constraint %s to %s", async (code, status) => {
    const { request, repo } = await fixture();
    vi.mocked(repo.clone!).mockRejectedValue(Object.assign(new Error("private database detail"), { code }));
    const response = await request(`/${id}/clone`, "POST");
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private database detail");
  });
  it("uses the repository's atomic flag mutation", async () => {
    const { request, repo } = await fixture();
    repo.updateFlag = vi.fn(async () => ({ enabled: false }));
    expect((await request(`/${id}/pin`, "DELETE")).status).toBe(200);
    expect(repo.updateFlag).toHaveBeenCalledWith(scope, id, "pinned", false);
  });
  it.each(["archive", "share"])("keeps system views read-only for %s", async action => {
    const { request } = await fixture({ ...source, scope: "system", ownerPrincipalId: undefined });
    expect((await request(`/${id}/${action}`, "PATCH")).status).toBe(403);
  });
  it("returns 404 for an inaccessible or missing view", async () => {
    const { request, repo } = await fixture(); vi.mocked(repo.get).mockResolvedValue(undefined);
    expect((await request(`/${id}/clone`, "POST")).status).toBe(404);
    expect((await request(`/${id}/pin`, "PATCH")).status).toBe(404);
  });
});

const canonical = "/api/platform/preferences/saved-views";
const entityBase = "/api/platform/saved-views";
const validInput = { entityCode: "supplier", name: "My suppliers", state: { filters: ["active"] } };
const versionHeader = { "if-match": '"321"' };
describe("platform saved-view routes", () => {
  it.each([canonical, `${entityBase}/supplier`, "/api/me/saved-views"])("lists the same views with the expected envelope at %s", async base => {
    const { request } = await createFixture(source, base);
    const response = await request("");
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(base === canonical ? data.savedViews : data).toEqual([expect.objectContaining({ id, entityCode: "supplier" })]);
  });
  it.each([canonical, entityBase, `${entityBase}/supplier`])("creates personal views with valid unique generated codes at %s", async base => {
    const { request, repo } = await createFixture(source, base);
    vi.spyOn(Date, "now").mockReturnValue(12345);
    try {
      const results = await Promise.all(["2026 suppliers", "2026-suppliers"].map(name => request("", "POST", { ...validInput, name, scope: "system", tenantId: "spoof", ownerPrincipalId: "spoof" })));
      const views = await Promise.all(results.map(async response => { expect(response.status).toBe(201); return response.json(); }));
      for (const view of views) {
        expect(view.code).toMatch(/^[a-z][a-z0-9_.-]{1,126}$/);
        expect(view).toMatchObject({ scope: "personal", tenantId: scope.tenantId, ownerPrincipalId: scope.principalId });
      }
      expect(views[0].code).not.toBe(views[1].code); expect(repo.create).toHaveBeenCalledTimes(2);
    } finally { vi.mocked(Date.now).mockRestore(); }
  });
  it("routes clear-default before generic view deletion", async () => {
    const { request, repo } = await createFixture(source, entityBase);
    expect((await request(`/supplier/${id}/default`, "PATCH")).status).toBe(200);
    expect(repo.setPreference).toHaveBeenCalledWith(scope, "saved_view.default", "supplier", { viewId: id });
    expect((await request("/supplier/default", "DELETE")).status).toBe(200);
    expect(repo.clearPreference).toHaveBeenCalledWith(scope, "saved_view.default", "supplier");
    expect(repo.archive).not.toHaveBeenCalled();
  });
  it.each(["PATCH", "DELETE"])("rejects mismatched entities for %s without writing", async method => {
    const { request, repo } = await createFixture(source, entityBase);
    const response = await request(`/customer/${id}`, method, method === "PATCH" ? { name: "Changed" } : undefined, versionHeader);
    expect(response.status).toBe(409);
    expect(repo.replace).not.toHaveBeenCalled(); expect(repo.archive).not.toHaveBeenCalled();
  });
  it("rejects a default view from another entity", async () => {
    const { request, repo } = await createFixture(source, entityBase);
    expect((await request(`/customer/${id}/default`, "PATCH")).status).toBe(409);
    expect(repo.setPreference).not.toHaveBeenCalled();
  });
  it("preserves configuration and description on a rename-only PATCH", async () => {
    const state = { filters: ["active"], columns: ["name"] };
    const { request, repo } = await createFixture({ ...source, state, description: "Keep me" }, entityBase);
    const response = await request(`/supplier/${id}`, "PATCH", { name: "Renamed" }, versionHeader);
    expect(response.status).toBe(200); expect(response.headers.get("etag")).toBe('"322"');
    expect(await response.json()).toMatchObject({ name: "Renamed", state, description: "Keep me" });
    expect(repo.replace).toHaveBeenCalledWith("neon", expect.objectContaining({ state, description: "Keep me" }), 321,expect.objectContaining({principalId:scope.principalId,sharedWrite:false}));
  });
  it("allows state-only PATCH and explicit description clearing", async () => {
    const { request } = await createFixture({ ...source, description: "Remove me" }, entityBase);
    const response = await request(`/supplier/${id}`, "PATCH", { config: { columns: ["code"] }, description: null }, versionHeader);
    expect(response.status).toBe(200);
    const view = await response.json(); expect(view).toMatchObject({ name: source.name, state: { columns: ["code"] } }); expect(view.description).toBeUndefined();
  });
  it("PUT replaces editable fields and clears an omitted description", async () => {
    const { request } = await createFixture({ ...source, description: "Remove me" }, canonical);
    const response = await request(`/${id}`, "PUT", { name: "New", state: {} }, versionHeader);
    expect(response.status).toBe(200); expect((await response.json()).description).toBeUndefined();
  });
  it.each([{}, { name: "Only name" }, { state: {} }, { name: "New", state: [] }, { name: "New", state: null }])("rejects incomplete or malformed PUT %j", async value => {
    const { request, repo } = await createFixture(source, canonical);
    expect((await request(`/${id}`, "PUT", value, versionHeader)).status).toBe(400); expect(repo.replace).not.toHaveBeenCalled();
  });
  it.each([{ state: [] }, { config: "bad" }, { metadata: null }, { metadata: [] }, { code: 123 }, { description: 12 }])("rejects invalid create input %j", async value => {
    const { request, repo } = await createFixture(source, canonical);
    const input = { ...validInput, ...value }; if ("config" in value) Reflect.deleteProperty(input, "state");
    expect((await request("", "POST", input)).status).toBe(400); expect(repo.create).not.toHaveBeenCalled();
  });
  it.each(['W/"321"', '"321', '321"', '0', '4294967296', '9007199254740993', '*', '"321", "322"'])("rejects invalid version %s", async token => {
    const { request, repo } = await createFixture(source, canonical);
    expect((await request(`/${id}`, "PUT", validInput, { "if-match": token })).status).toBe(400); expect(repo.replace).not.toHaveBeenCalled();
  });
  it("returns a conflict for stale edits", async () => {
    const { request, repo } = await createFixture(source, canonical); vi.mocked(repo.replace).mockResolvedValue(undefined);
    expect((await request(`/${id}`, "PUT", validInput, versionHeader)).status).toBe(409);
  });
  it.each([canonical, "/api/me/saved-views"])("requires authentication at %s", async base => {
    const { request, repo } = await createFixture(source, base);
    expect((await request("", "GET", undefined, { "x-test-unauthenticated": "true" })).status).toBe(401); expect(repo.list).not.toHaveBeenCalled();
  });
  it("supports platform action and clone aliases", async () => {
    const { request } = await createFixture(source, canonical);
    for (const action of ["pin", "star", "share"]) {
      expect((await request(`/${id}/actions/${action}`, "PATCH")).status).toBe(200);
      expect((await request(`/${id}/actions/${action}`, "DELETE")).status).toBe(200);
    }
    expect((await request(`/${id}/clone`, "POST")).status).toBe(201);
    expect((await request(`/${id}`, "DELETE")).status).toBe(204);
  });
  it.each([canonical, "/api/me/saved-views"])("normalizes UUID case for flags at %s", async base => {
    const lowerId = "abcdefab-0000-4000-8000-000000000001";
    const { request } = await createFixture({ ...source, id: lowerId }, base);
    const action = base === canonical ? "actions/pin" : "pin";
    expect((await request(`/${lowerId.toUpperCase()}/${action}`, "PATCH")).status).toBe(200);
    const data = await (await request("")).json();
    expect((base === canonical ? data.savedViews : data)[0].isPinned).toBe(true);
  });
  it.each(["?entity=supplier&entity=customer", "?includeArchived=invalid", "?surface="])("rejects malformed list filters %s", async query => {
    const { request, repo } = await createFixture(source, canonical);
    expect((await request(query)).status).toBe(400); expect(repo.list).not.toHaveBeenCalled();
  });
  it("uses conditional default cleanup when archiving", async () => {
    const { request, repo } = await createFixture(source, canonical);
    repo.clearDefaultIfMatches = vi.fn(async () => {});
    expect((await request(`/${id}`, "DELETE")).status).toBe(204);
    expect(repo.clearDefaultIfMatches).toHaveBeenCalledWith(scope, "supplier", id);
    expect(repo.clearPreference).not.toHaveBeenCalled();
  });
});
