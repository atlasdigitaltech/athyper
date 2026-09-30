import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntitlementPlan, EntitlementRepository, TenantEntitlementOverride } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { enforceContractResponses, HttpError } from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEntitlementControlService } from "./entitlement-control.js";
import { disabledControlServiceRouteFlags, registerControlServiceRoutes, type ControlServices } from "./control-service-routes.js";

const plan: EntitlementPlan = { code: "BASE", version: 1, modules: ["core"], limits: { users: 10, storage: null }, effectiveFrom: "2026-01-01T00:00:00Z" };
const override = { planCode: "BASE", limitCode: "users", limitValue: 20, reason: "Capacity", effectiveFrom: "2026-09-01T00:00:00Z" };
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }))); });
async function fixture(options: { denied?: boolean; enabled?: boolean } = {}) {
  let current: TenantEntitlementOverride | undefined;
  const repository = {
    listPlans: vi.fn(async () => [plan]), listModules: vi.fn(async () => ["core", "analytics"]), getPlan: vi.fn<EntitlementRepository["getPlan"]>(async () => plan), getOverride: vi.fn<EntitlementRepository["getOverride"]>(async () => current),
    saveOverride: vi.fn<EntitlementRepository["saveOverride"]>(async ({ expectedVersion, ...value }) => (current = { ...value, status: "active", version: expectedVersion + 1 })),
    expireOverride: vi.fn<EntitlementRepository["expireOverride"]>(async (_tenant, _id, expectedVersion) => (current = { ...current!, status: "expired", version: expectedVersion + 1 })),
  };
  const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
  const entitlements = createEntitlementControlService({ authorizer: { authorize: async () => options.denied ? { allowed: false, reason: "denied" } : { allowed: true } }, repositories: createExactPlaneRepositoryProvider({ neon: repository }), cache: { invalidate: async () => undefined } });
  const app = express(); app.use(express.json()); enforceContractResponses(app);
  registerControlServiceRoutes(app, { authenticate: (request, response, next) => { if (request.headers["x-unauthenticated"]) { response.status(401).json({ code: "UNAUTHENTICATED" }); return; } next(); }, readContext: () => context, services: { entitlements } as ControlServices, flags: { ...disabledControlServiceRouteFlags, localCatalogReads: options.enabled ?? true, tenantOverrides: options.enabled ?? true } });
  app.use(((error, _request, response, _next) => response.status(error instanceof HttpError ? error.statusCode : 500).json({ code: error instanceof HttpError ? error.code : "INTERNAL_ERROR" })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1"); servers.push(server); await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  return { repository, request: (path: string, body?: unknown, unauthenticated = false) => fetch(`http://127.0.0.1:${address.port}/api/control-admin/entitlements${path}`, { method: body === undefined ? "GET" : path.endsWith("/expire") ? "POST" : "PUT", headers: { "content-type": "application/json", ...(unauthenticated ? { "x-unauthenticated": "1" } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) };
}
const routes = [["/plans", undefined], ["/modules", undefined], ["/overrides/override-1", { override, expectedVersion: 0 }], ["/overrides/override-1/expire", { expectedVersion: 1 }]] as const;
describe("entitlement HTTP routes", () => {
  it("returns plan and module arrays with response validation enabled", async () => {
    const { request } = await fixture(); const plans = await request("/plans"), modules = await request("/modules");
    expect(plans.status).toBe(200); expect(await plans.json()).toEqual([plan]); expect(modules.status).toBe(200); expect(await modules.json()).toEqual(["core", "analytics"]);
  });
  it("creates, updates, and expires a tenant override", async () => {
    const { request, repository } = await fixture();
    const created = await request("/overrides/override-1", { override, expectedVersion: 0 });
    expect(created.status).toBe(200); expect(await created.json()).toMatchObject({ ...override, id: "override-1", tenantId: "tenant-1", version: 1, status: "active" });
    expect(repository.saveOverride).toHaveBeenCalledWith({ ...override, id: "override-1", tenantId: "tenant-1", expectedVersion: 0 }, "principal-1");
    expect((await request("/overrides/override-1", { override: { ...override, limitValue: 0 }, expectedVersion: 1 })).status).toBe(200);
    const expired = await request("/overrides/override-1/expire", { expectedVersion: 2 });
    expect(expired.status).toBe(200); expect(await expired.json()).toMatchObject({ status: "expired", version: 3, limitValue: 0 });
    expect(repository.expireOverride).toHaveBeenCalledExactlyOnceWith("tenant-1", "override-1", 2, "principal-1");
    expect((await request("/overrides/override-1/expire", { expectedVersion: 3 })).status).toBe(200);
    expect(repository.expireOverride).toHaveBeenCalledOnce();
    expect((await request("/overrides/override-1", { override, expectedVersion: 3 })).status).toBe(409);
  });
  it("supports a module-only exception outside the base plan", async () => {
    const { request } = await fixture(); const { limitCode: _code, limitValue: _value, ...module } = override;
    const response = await request("/overrides/override-1", { override: { ...module, moduleCode: "analytics" }, expectedVersion: 0 });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ moduleCode: "analytics" });
  });
  it.each(routes)("requires authentication for %s", async (path, body) => {
    const { request, repository } = await fixture(); expect((await request(path, body, true)).status).toBe(401); expect(repository.getOverride).not.toHaveBeenCalled(); expect(repository.listPlans).not.toHaveBeenCalled(); expect(repository.listModules).not.toHaveBeenCalled();
  });
  it.each(routes)("requires permission for %s", async (path, body) => {
    const { request, repository } = await fixture({ denied: true }); expect((await request(path, body)).status).toBe(403); expect(repository.getOverride).not.toHaveBeenCalled(); expect(repository.listPlans).not.toHaveBeenCalled(); expect(repository.listModules).not.toHaveBeenCalled();
  });
  it.each([{ moduleCode: "core" }, { limitValue: undefined }, { limitValue: -1 }, { limitValue: 0.5 }, { limitValue: Number.MAX_SAFE_INTEGER + 1 }, { limitValue: "20" }, { reason: " " }, { effectiveFrom: "bad" }, { effectiveUntil: override.effectiveFrom }, { tenantId: "other" }, { status: "expired" }, { version: 9 }, { id: "other" }])("rejects malformed/forged override %j", async fields => {
    const { request, repository } = await fixture(); expect((await request("/overrides/override-1", { override: { ...override, ...fields }, expectedVersion: 0 })).status).toBe(400); expect(repository.saveOverride).not.toHaveBeenCalled();
  });
  it.each([undefined, null, true, "0", -1, 0.5])("rejects invalid expected version %s", async expectedVersion => {
    const { request, repository } = await fixture(); expect((await request("/overrides/override-1", { override, expectedVersion })).status).toBe(400); expect(repository.saveOverride).not.toHaveBeenCalled();
  });
  it("returns 404 for unknown targets and missing overrides", async () => {
    const { request, repository } = await fixture();
    expect((await request("/overrides/override-1", { override: { ...override, limitCode: "unknown" }, expectedVersion: 0 })).status).toBe(404);
    expect((await request("/overrides/override-1/expire", { expectedVersion: 1 })).status).toBe(404); expect(repository.saveOverride).not.toHaveBeenCalled();
  });
  it("returns 409 for stale and commit-time version conflicts", async () => {
    const { request, repository } = await fixture();
    expect((await request("/overrides/override-1", { override, expectedVersion: 1 })).status).toBe(409);
    repository.saveOverride.mockRejectedValue(Object.assign(new Error("private conflict detail"), { code: "CONTROL_ADMIN_VERSION_CONFLICT" }));
    const response = await request("/overrides/override-1", { override, expectedVersion: 0 }); expect(response.status).toBe(409); expect(await response.json()).toEqual({ code: "CONTROL_ADMIN_VERSION_CONFLICT" });
  });
  it("rejects malformed ids and unexpected expiration fields", async () => {
    const { request } = await fixture(); expect((await request("/overrides/%20", { override, expectedVersion: 0 })).status).toBe(400); expect((await request("/overrides/override-1/expire", { expectedVersion: 1, tenantId: "other" })).status).toBe(400);
  });
  it("does not expose unexpected persistence error details", async () => {
    const { request, repository } = await fixture(); repository.saveOverride.mockRejectedValue(new Error("private database details"));
    const response = await request("/overrides/override-1", { override, expectedVersion: 0 }); expect(response.status).toBe(500); expect(await response.json()).toEqual({ code: "INTERNAL_ERROR" });
  });
  it("does not register entitlement routes when disabled", async () => {
    const { request } = await fixture({ enabled: false }); for (const [path, body] of routes) expect((await request(path, body)).status).toBe(404);
  });
});
