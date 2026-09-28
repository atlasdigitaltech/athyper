import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import type { VerifiedToken, EffectivePermissionSnapshot } from "@athyper/server-contract-auth";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerContactVerification, type ContactVerificationFactory, type ContactVerificationAdapter } from "../register-contact-verification.js";

const id = "11111111-1111-4111-8111-111111111111";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
});
const routes = [
  ["POST", `contacts/${id}/verification-challenges`, 202],
  ["POST", `verification-challenges/${id}/complete`, 200],
  ["PATCH", `contacts/${id}/verification`, 200],
] as const;

async function fixture(factory?: ContactVerificationFactory) {
  const container = createContainer(), config = loadConfig();
  const permissions = { planeKey: "neon", tenantId: id, principalId: id, profileHash: "test",
    allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } as unknown as EffectivePermissionSnapshot;
  const token: VerifiedToken = {
    issuer: "https://iam.example/realms/athyper", subject: id, audience: ["athyper-api"],
    claims: { iss: "https://iam.example/realms/athyper", sub: id, aud: "athyper-api",
      tenant_id: id, principal_id: id, auth_epoch: 1, azp: "neon-web",
      resource_access: { "neon-web": { roles: ["AUTHORIZED"] } } },
  };
  registerPlatform(container, { ...config, env: "production",
    iam: { ...config.iam, defaultRealmKey: "athyper", claimContextMode: "on" } }, {
    tokenVerifier: { verify: async value => { if (value !== "signed-token") throw Error("invalid"); return token; } },
    resolveIdentityContext: async () => ({ tenantId: id, principalId: id, authEpoch: 1, permissions }),
    auditSink: createInMemoryAuditSink(),
  });
  const before = container.runtimes.health.list();
  registerContactVerification(container, { status: "configured", keys: [] }, factory);
  expect(container.runtimes.health.list()).toEqual(before);
  const app = createHttpApplication({ configure(app) {
    for (const register of container.platform.httpRegistrars) register(app);
  } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { container, request: (method: string, path: string, authenticated = true) =>
    fetch(`http://127.0.0.1:${port}/api/master/${path}`, {
      method, headers: { "content-type": "application/json", "x-plane": "neon",
        ...(authenticated ? { authorization: "Bearer signed-token" } : {}) },
      body: JSON.stringify({ tenantId: "untrusted", principalId: "untrusted" }),
    }) };
}

it("requires authentication before reporting optional service unavailability", async () => {
  const f = await fixture();
  for (const [method, path] of routes) {
    expect((await f.request(method, path, false)).status).toBe(401);
    const response = await f.request(method, path);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "CONTACT_VERIFICATION_UNAVAILABLE" });
  }
});

it("keeps IAM available when adapter initialization fails", async () => {
  const f = await fixture(() => { throw Error("private configuration"); });
  expect(f.container.services.contactVerificationStatus).toEqual({ available: false, reason: "ADAPTER_INITIALIZATION_FAILED" });
  expect((await f.request(routes[0][0], routes[0][1])).status).toBe(503);
});

it("never executes an operation denied by its resource owner", async () => {
  const execute = vi.fn(), authorize = vi.fn(async () => false);
  const f = await fixture(() => ({ authorize, execute }));
  for (const [method, path] of routes) expect((await f.request(method, path)).status).toBe(403);
  expect(execute).not.toHaveBeenCalled();
});

it("passes verified identity and exact operation targets to the adapter", async () => {
  const execute = vi.fn<ContactVerificationAdapter["execute"]>(async () => ({ accepted: true }));
  const authorize = vi.fn<ContactVerificationAdapter["authorize"]>(async () => true);
  const f = await fixture(() => ({ authorize, execute }));
  for (const [method, path, status] of routes) expect((await f.request(method, path)).status).toBe(status);
  expect(execute.mock.calls.map(call => call[1])).toEqual([
    { operation: "request", id }, { operation: "complete", id }, { operation: "verify", id },
  ]);
  for (const [context] of authorize.mock.calls) expect(context).toMatchObject({ tenantId: id, principalId: id, planeKey: "neon" });
});

it("rejects malformed targets before owner authorization", async () => {
  const authorize = vi.fn(async () => true), execute = vi.fn();
  const f = await fixture(() => ({ authorize, execute }));
  expect((await f.request("PATCH", "contacts/not-a-uuid/verification")).status).toBe(400);
  expect(authorize).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});
