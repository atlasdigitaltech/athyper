import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMasterDataRoutes } from "../master-data-routes.js";

const context = { tenantId: "tenant", principalId: "principal", planeKey: "neon" } as VerifiedRequestContext;
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});
async function fixture(allowed = true) {
  const services = {
    contacts: { create: vi.fn(async () => ({ id: "contact" })), changeVerification: vi.fn(async () => ({ id: "contact" })), deactivate: vi.fn(async () => undefined) },
    addresses: { create: vi.fn(async () => ({ id: "address" })), deactivate: vi.fn(async () => undefined) },
    ownerProfile: { get: vi.fn(async () => ({ contacts: [], addresses: [] })) },
  };
  const app = express();
  app.use(express.json());
  registerMasterDataRoutes(app, {
    authenticate: (_req, res, next) => { if (allowed) next(); else res.sendStatus(401); },
    readContext: () => context,
    services: services as unknown as Parameters<typeof registerMasterDataRoutes>[1]["services"],
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: "internal" });
  });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  return { services, request: (path: string, method = "POST", body?: unknown) => fetch(`http://127.0.0.1:${address.port}/api/master/${path}`, {
    method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  }) };
}
const id = "11111111-1111-4111-8111-111111111111";
const owner = `owners/party/${id}/${id}`;
const routes = [
  [`contacts/${id}/deactivate`, "POST", undefined],
  [`addresses/${id}/deactivate`, "POST", undefined],
  [`contacts/${id}/verification`, "PATCH", { verified: true, evidence: { provider: "p", evidenceId: "e", issuedAt: "2026-09-01T00:00:00Z", payloadHash: "h", signature: "s", keyId: "k" } }],
  [`${owner}/contacts`, "POST", { channelType: "email", value: "a@example.com" }],
  [`${owner}/addresses`, "POST", { address: { city: "KL" } }],
  [`${owner}/profile`, "GET", undefined],
] as const;
describe("master data HTTP boundary", () => {
  it.each(routes)("authenticates %s", async (path, method, body) => {
    const f = await fixture(false);
    expect((await f.request(path, method, body)).status).toBe(401);
    for (const group of Object.values(f.services)) for (const fn of Object.values(group)) expect(fn).not.toHaveBeenCalled();
  });
  it.each(routes)("accepts valid %s", async (path, method, body) => {
    const f = await fixture();
    expect((await f.request(path, method, body)).status).toBe(path.endsWith("deactivate") ? 204 : 200);
    const calls = Object.values(f.services).flatMap((group) => Object.values(group).flatMap((fn) => fn.mock.calls));
    expect(calls).toEqual([ [expect.objectContaining({ context })] ]);
  });
  it.each([
    [`${owner}/contacts`, { channelType: "email", value: "a@example.com", purpose: 42 }],
    [`${owner}/contacts`, { channelType: "email", value: "a@example.com", effectiveFrom: "2026-02-30T00:00:00Z" }],
    [`${owner}/addresses`, { address: { city: "KL", latitude: "north", longitude: 0 } }],
    [`${owner}/addresses`, { address: { city: 123 } }],
    [`contacts/${id}/deactivate`, { effectiveUntil: [] }],
    [`addresses/${id}/deactivate`, { effectiveUntil: "tomorrow" }],
  ])("rejects invalid input for %s before calling services", async (path, body) => {
    const f = await fixture();
    const res = await f.request(path as string, "POST", body);
    expect(res.status).toBe(400);
    for (const group of Object.values(f.services)) for (const fn of Object.values(group)) expect(fn).not.toHaveBeenCalled();
  });
  it.each(["contacts/not-a-uuid/deactivate", "addresses/not-a-uuid/deactivate", "owners/party/not-a-uuid/not-a-uuid/contacts"])("rejects invalid database IDs at %s", async (path) => {
    const f = await fixture();
    expect((await f.request(path, "POST", { channelType: "email", value: "a@example.com" })).status).toBe(400);
    for (const group of Object.values(f.services)) for (const fn of Object.values(group)) expect(fn).not.toHaveBeenCalled();
  });
  it("rejects repeated asOf query parameters", async () => {
    const f = await fixture();
    expect((await f.request(`${owner}/profile?asOf=a&asOf=b`, "GET")).status).toBe(400);
    expect(f.services.ownerProfile.get).not.toHaveBeenCalled();
  });
  it("forwards internal TypeErrors to the server error handler", async () => {
    const f = await fixture();
    f.services.ownerProfile.get.mockRejectedValue(new TypeError("private implementation detail"));
    const res = await f.request(`${owner}/profile`, "GET");
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("private implementation detail");
  });
});
