import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ConnectorDraft, ConnectorRepository } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { enforceContractResponses, HttpError } from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectorControlService } from "./connector-control.js";
import { disabledControlServiceRouteFlags, registerControlServiceRoutes, type ControlServices } from "./control-service-routes.js";

const connector = { connectorTypeId: "type-1", code: "PAYMENTS", name: "Payments", baseUrl: "https://connector.test", secretReference: "vault://payments", config: { timeout: 10 }, endpoints: [{ code: "health", path: "/health", method: "GET" as const, kind: "health" }] };
const draft: ConnectorDraft = { ...connector, id: "connector-1", tenantId: "tenant-1", version: 1, status: "draft" };
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); })));
});
async function fixture(options: { status?: ConnectorDraft["status"]; denied?: boolean; enabled?: boolean; missing?: boolean } = {}) {
  let current: ConnectorDraft | undefined = options.missing ? undefined : { ...draft, status: options.status ?? "draft" };
  const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
  const repository = {
    get: vi.fn<ConnectorRepository["get"]>(async () => current),
    save: vi.fn<ConnectorRepository["save"]>(async ({ expectedVersion, ...value }) => (current = { ...value, version: expectedVersion + 1 })),
    transition: vi.fn<ConnectorRepository["transition"]>(async (_tenant, _id, status, version) => (current = { ...current!, status, version: version + 1 })),
  };
  const healthJobs = { enqueue: vi.fn(async () => "job-1") }, cache = { invalidate: vi.fn(async () => undefined) };
  const connectors = createConnectorControlService({ authorizer: { authorize: async () => options.denied ? { allowed: false, reason: "denied" } : { allowed: true } }, repositories: createExactPlaneRepositoryProvider({ neon: repository }), cache, healthJobs });
  const app = express(); app.use(express.json()); enforceContractResponses(app);
  registerControlServiceRoutes(app, {
    authenticate: (request, response, next) => { if (request.headers["x-unauthenticated"]) { response.status(401).json({ error: "unauthenticated" }); return; } next(); },
    readContext: () => context, services: { connectors } as ControlServices,
    flags: { ...disabledControlServiceRouteFlags, connectorLifecycle: options.enabled ?? true },
  });
  app.use(((error, _request, response, _next) => response.status(error instanceof HttpError ? error.statusCode : 500).json({ code: error instanceof HttpError ? error.code : "INTERNAL_ERROR" })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  return { repository, healthJobs, request: (path: string, body?: unknown, unauthenticated = false) => fetch(`http://127.0.0.1:${address.port}/api/control-admin/connectors${path}`, {
    method: path.endsWith("/draft") ? "PUT" : "POST", headers: { "content-type": "application/json", ...(unauthenticated ? { "x-unauthenticated": "1" } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) };
}
const routes = [["/connector-1/draft", { connector, expectedVersion: 1 }], ["/validate", connector], ["/connector-1/activate", { expectedVersion: 1 }], ["/connector-1/suspend", { expectedVersion: 1 }], ["/connector-1/deprecate", { expectedVersion: 1 }], ["/connector-1/health-checks", undefined]] as const;

describe("connector HTTP routes", () => {
  it("creates a tenant draft with version zero and an enforced response contract", async () => {
    const { request, repository } = await fixture({ missing: true });
    const response = await request("/connector-1/draft", { connector, expectedVersion: 0 });
    expect(response.status).toBe(200); expect(await response.json()).toEqual(draft);
    expect(repository.save).toHaveBeenCalledWith({ ...connector, id: "connector-1", status: "draft", tenantId: "tenant-1", expectedVersion: 0 }, "principal-1");
  });
  it("validates without saving", async () => {
    const { request, repository } = await fixture();
    const response = await request("/validate", connector);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ valid: true });
    expect(repository.get).not.toHaveBeenCalled(); expect(repository.save).not.toHaveBeenCalled();
  });
  it("executes the permitted lifecycle and cannot revive a deprecated connector", async () => {
    const { request } = await fixture();
    let version = 1;
    for (const action of ["activate", "suspend", "activate", "deprecate"]) {
      const response = await request(`/connector-1/${action}`, { expectedVersion: version });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ version: ++version });
    }
    expect((await request("/connector-1/activate", { expectedVersion: version })).status).toBe(409);
    expect((await request("/connector-1/draft", { connector, expectedVersion: version })).status).toBe(409);
    expect((await request("/connector-1/health-checks")).status).toBe(404);
  });
  it("returns 202 only after receiving a health job id with the verified plane", async () => {
    const { request, healthJobs } = await fixture();
    const response = await request("/connector-1/health-checks");
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ jobId: "job-1" });
    expect(healthJobs.enqueue).toHaveBeenCalledExactlyOnceWith({ planeKey: "neon", tenantId: "tenant-1", connectorId: "connector-1", requestedBy: "principal-1" });
  });
  it.each(routes)("requires authentication for %s", async (path, body) => {
    const { request, repository, healthJobs } = await fixture();
    expect((await request(path, body, true)).status).toBe(401);
    expect(repository.get).not.toHaveBeenCalled(); expect(healthJobs.enqueue).not.toHaveBeenCalled();
  });
  it.each(routes)("requires connector management permission for %s", async (path, body) => {
    const { request, repository, healthJobs } = await fixture({ denied: true });
    expect((await request(path, body)).status).toBe(403);
    expect(repository.get).not.toHaveBeenCalled(); expect(healthJobs.enqueue).not.toHaveBeenCalled();
  });
  it.each([undefined, null, true, "1", -1, 0.5])("rejects invalid or omitted expectedVersion %s", async expectedVersion => {
    const { request, repository } = await fixture();
    expect((await request("/connector-1/draft", { connector, expectedVersion })).status).toBe(400);
    expect((await request("/connector-1/activate", { expectedVersion })).status).toBe(400);
    expect(repository.save).not.toHaveBeenCalled(); expect(repository.transition).not.toHaveBeenCalled();
  });
  it.each([{ tenantId: "forged" }, { version: 22 }, { status: "active" }, { id: "other" }])("rejects forged draft fields %j", async fields => {
    const { request, repository } = await fixture();
    expect((await request("/connector-1/draft", { connector: { ...connector, ...fields }, expectedVersion: 1 })).status).toBe(400);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it.each([{ config: { apiToken: "plaintext" } }, { baseUrl: "https://user:pass@connector.test" }, { endpoints: [{ ...connector.endpoints[0], path: "/\\evil.test" }] }, { endpoints: [connector.endpoints[0], connector.endpoints[0]] }])("returns 400 for unsafe connector fields %j", async fields => {
    const { request, repository } = await fixture();
    expect((await request("/validate", { ...connector, ...fields })).status).toBe(400);
    expect((await request("/connector-1/draft", { connector: { ...connector, ...fields }, expectedVersion: 1 })).status).toBe(400);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it("rejects stale versions and missing connectors without a write", async () => {
    const { request, repository } = await fixture();
    expect((await request("/connector-1/activate", { expectedVersion: 2 })).status).toBe(409);
    repository.get.mockResolvedValue(undefined);
    expect((await request("/connector-1/activate", { expectedVersion: 1 })).status).toBe(404);
    expect(repository.transition).not.toHaveBeenCalled();
  });
  it("rejects malformed path ids", async () => {
    const { request, repository } = await fixture();
    expect((await request("/%20/activate", { expectedVersion: 1 })).status).toBe(400);
    expect(repository.get).not.toHaveBeenCalled();
  });
  it.each(["CONTROL_ADMIN_VERSION_CONFLICT", "CONTROL_ADMIN_LIFECYCLE_INVALID"])("maps commit-time conflict %s to 409", async code => {
    const { request, repository } = await fixture();
    repository.transition.mockRejectedValue(Object.assign(new Error("private row details"), { code }));
    const response = await request("/connector-1/activate", { expectedVersion: 1 });
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ code });
  });
  it("does not expose unexpected persistence error details", async () => {
    const { request, repository } = await fixture();
    repository.transition.mockRejectedValue(new Error("private SQL details"));
    const response = await request("/connector-1/activate", { expectedVersion: 1 });
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ code: "INTERNAL_ERROR" });
  });
  it("does not register any connector route when disabled", async () => {
    const { request } = await fixture({ enabled: false });
    for (const [path, body] of routes) expect((await request(path, body)).status).toBe(404);
  });
});
