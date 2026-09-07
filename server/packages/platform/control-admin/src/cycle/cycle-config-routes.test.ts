import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CycleTemplateRepository } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { enforceContractResponses, HttpError, routeContracts } from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCycleConfigRoutes } from "./cycle-config-routes.js";
import { createCycleConfigService } from "./cycle-config-service.js";
import { desiredState, validTemplate } from "./cycle-test-fixtures.js";

const context = { tenantId: "00000000-0000-4000-8000-000000000001", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }))); });
async function fixture(denied = false) {
  const repository = {
    externalPhaseExists: vi.fn(async () => false), cycleTypeExists: vi.fn(async () => false), getPublished: vi.fn<CycleTemplateRepository["getPublished"]>(async () => undefined),
    publish: vi.fn<CycleTemplateRepository["publish"]>(async input => ({ kind: "published", value: { ...input.preview, id: "revision-1", version: 1, tenantId: input.tenantId, publishedBy: input.principalId, publishedAt: "2026-09-07T00:00:00Z" } })),
  };
  const service = createCycleConfigService({ authorizer: { authorize: async () => denied ? { allowed: false, reason: "denied" } : { allowed: true } }, repositories: createExactPlaneRepositoryProvider({ neon: repository }), desiredStateVerifier: { verify: async () => true } });
  const app = express(); app.use(express.json()); enforceContractResponses(app);
  registerCycleConfigRoutes(app, { authenticate: (request, response, next) => { if (request.headers["x-unauthenticated"]) { response.status(401).json({ code: "UNAUTHENTICATED" }); return; } next(); }, readContext: () => context, service });
  app.use(((error, _request, response, _next) => response.status(error instanceof HttpError ? error.statusCode : 500).json({ code: error instanceof HttpError ? error.code : "INTERNAL_ERROR" })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1"); servers.push(server); await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  return { repository, contracts: routeContracts(app), request: (path: string, body?: unknown, unauthenticated = false) => fetch(`http://127.0.0.1:${address.port}/api/control-admin/cycle-config${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(unauthenticated ? { "x-unauthenticated": "1" } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) };
}
const typeId = validTemplate().cycleType.id;
const cases = [["/preview", validTemplate()], ["/validate", validTemplate()], ["/publish", { template: validTemplate(), idempotencyKey: "one" }], ["/desired-state/apply", { revision: desiredState() }], [`/${typeId}/revisions/latest`, undefined], [`/${typeId}/revisions/1`, undefined]] as const;
describe("cycle-config HTTP routes", () => {
  it("declares read/manage permissions for all six contracts", async () => {
    const { contracts } = await fixture(); expect(contracts).toHaveLength(6);
    for (const contract of contracts) expect(contract.permission).toBe(contract.method === "get" ? "control.catalog.read" : "control.cycle_template.manage");
  });
  it.each(cases)("authenticates %s", async (path, body) => {
    const { request, repository } = await fixture(); expect((await request(path, body, true)).status).toBe(401); expect(repository.publish).not.toHaveBeenCalled(); expect(repository.getPublished).not.toHaveBeenCalled();
  });
  it.each(cases)("checks permissions for %s", async (path, body) => {
    const { request, repository } = await fixture(true); expect((await request(path, body)).status).toBe(403); expect(repository.publish).not.toHaveBeenCalled(); expect(repository.getPublished).not.toHaveBeenCalled();
  });
  it("previews and validates the same normalized snapshot without publishing", async () => {
    const { request, repository } = await fixture(); const preview = await request("/preview", validTemplate()), validation = await request("/validate", validTemplate());
    expect(preview.status).toBe(200); expect(validation.status).toBe(200); expect(await preview.json()).toEqual(await validation.json()); expect(repository.publish).not.toHaveBeenCalled();
  });
  it("publishes and applies signed revisions with optional expected versions", async () => {
    const { request, repository } = await fixture();
    expect((await request("/publish", { template: validTemplate(), idempotencyKey: "one" })).status).toBe(200);
    expect((await request("/desired-state/apply", { revision: desiredState(), expectedLatestVersion: 0 })).status).toBe(200);
    expect(repository.publish).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId: context.tenantId, principalId: context.principalId, expectedLatestVersion: 0 }));
  });
  it("returns HTTP 409 for version conflicts on both publishing routes", async () => {
    const { request, repository } = await fixture(); const conflict = { kind: "version_conflict" as const, expectedVersion: 0, actualVersion: 2 };
    repository.publish.mockResolvedValue(conflict);
    for (const [path, body] of [["/publish", { template: validTemplate(), idempotencyKey: "one", expectedLatestVersion: 0 }], ["/desired-state/apply", { revision: desiredState(), expectedLatestVersion: 0 }]] as const) {
      const response = await request(path, body); expect(response.status).toBe(409); expect(await response.json()).toEqual(conflict);
    }
  });
  it.each([null, true, "0", -1, 0.5, 2147483648])("rejects malformed expected version %s", async expectedLatestVersion => {
    const { request, repository } = await fixture(); expect((await request("/publish", { template: validTemplate(), idempotencyKey: "one", expectedLatestVersion })).status).toBe(400); expect(repository.publish).not.toHaveBeenCalled();
  });
  it.each([{ tasks: [null] }, { phases: [{}] }, { cycleType: {} }, { carryForwardRules: [{ action: "unknown" }] }])("rejects malformed nested templates %j", async fields => {
    const { request } = await fixture(); expect((await request("/preview", { ...validTemplate(), ...fields })).status).toBe(400);
  });
  it("rejects unsigned/forged envelopes and wrong targets", async () => {
    const { request, repository } = await fixture();
    expect((await request("/desired-state/apply", { revision: null })).status).toBe(400);
    expect((await request("/desired-state/apply", { revision: { ...desiredState(), signature: {} } })).status).toBe(400);
    expect((await request("/desired-state/apply", { revision: { ...desiredState(), targetPlane: "mesh" } })).status).toBe(403);
    expect((await request("/publish", { template: validTemplate(), idempotencyKey: "one", context: { tenantId: "forged" } })).status).toBe(400);
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it.each(["0", "01", "1.5", "-1", "1e1", "2147483648", "99999999999999999999"])("rejects invalid revision path %s", async version => {
    const { request, repository } = await fixture(); expect((await request(`/${typeId}/revisions/${version}`)).status).toBe(400); expect(repository.getPublished).not.toHaveBeenCalled();
  });
  it("returns 404 for missing revisions and passes explicit/latest versions correctly", async () => {
    const { request, repository } = await fixture();
    expect((await request(`/${typeId}/revisions/latest`)).status).toBe(404); expect(repository.getPublished).toHaveBeenLastCalledWith(context.tenantId, typeId, undefined);
    expect((await request(`/${typeId}/revisions/2`)).status).toBe(404); expect(repository.getPublished).toHaveBeenLastCalledWith(context.tenantId, typeId, 2);
  });
});
