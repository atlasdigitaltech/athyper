import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { registerPublicationRoutes, type PublicationRouteOptions } from "../publication-routes.js";
import { PublicationOperationsError } from "../publication-operations.js";

const id = "11111111-1111-4111-8111-111111111111";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
async function setup(tenantId = "own") {
  const jobs = { enqueue: vi.fn(async () => "job") };
  const authority = {
    getRelease: vi.fn(async () => ({ id, tenantId })),
    getDeployment: vi.fn(async () => ({ deploymentId: id, sourceReleaseId: id, targetPlane: "neon" })),
  };
  const operations = {
    listDeadLetters: vi.fn(async () => ({ items: [] })),
    provenance: vi.fn(async () => { throw new PublicationOperationsError("PUBLICATION_PROVENANCE_NOT_FOUND"); }),
    replay: vi.fn(async () => { throw new PublicationOperationsError("PUBLICATION_DELIVERY_NOT_REPLAYABLE"); }),
  };
  const options = { authenticate: (_req: unknown, _res: unknown, next: () => void) => next(), readContext: () => ({ tenantId: "own", planeKey: "studio", principalId: id, requestId: id }), authorizer: { authorize: async () => ({ allowed: true }) }, audit: { record: vi.fn() }, authority, jobs, operations, apiEnabled: true } as unknown as PublicationRouteOptions;
  const app = createHttpApplication({ openApi: { title: "Review", version: "1", enforceResponses: true }, configure(app) { registerPublicationRoutes(app, options); } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
  return { url: `http://127.0.0.1:${address.port}`, jobs, authority, operations };
}
describe("publication runtime review", () => {
  it("hides another tenant's releases and deployments and does not enqueue work", async () => {
    const { url, jobs } = await setup("other");
    for (const [path, method] of [[`releases/${id}`, "GET"], [`deployments/${id}`, "GET"], [`releases/${id}/publish`, "POST"], [`deployments/${id}/retry`, "POST"]]) {
      const response = await fetch(`${url}/api/publication/${path}`, { method });
      expect(response.status).toBe(404);
      expect(await response.json()).toHaveProperty("error");
    }
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
  it("retains same-tenant reads and publish/retry", async () => {
    const { url, jobs } = await setup();
    for (const kind of ["releases", "deployments"]) {
      expect((await fetch(`${url}/api/publication/${kind}/${id}`)).status).toBe(200);
      expect((await fetch(`${url}/api/publication/${kind}/${id}/${kind === "releases" ? "publish" : "retry"}`, { method: "POST" })).status).toBe(202);
    }
    expect(jobs.enqueue).toHaveBeenCalledTimes(2);
  });
  it("returns JSON 400 for malformed IDs and ambiguous pagination before repository calls", async () => {
    const { url, authority, operations } = await setup();
    for (const path of ["releases/invalid", "operations/dead-letters?limit=1&limit=2", "operations/dead-letters?limit=0x10"]) {
      const response = await fetch(`${url}/api/publication/${path}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "PUBLICATION_INVALID_REQUEST" });
    }
    expect(authority.getRelease).not.toHaveBeenCalled();
    expect(operations.listDeadLetters).not.toHaveBeenCalled();
  });
  it("maps missing provenance and replay conflicts to their documented outcomes", async () => {
    const { url } = await setup();
    const missing = await fetch(`${url}/api/publication/deployments/${id}/provenance`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "PUBLICATION_PROVENANCE_NOT_FOUND" });
    const conflict = await fetch(`${url}/api/publication/operations/deliveries/${id}/replay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "retry" }) });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "PUBLICATION_DELIVERY_NOT_REPLAYABLE" });
  });
});
