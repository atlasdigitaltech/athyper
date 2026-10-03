import express from "express";
import type { Server } from "node:http";
import { expect, it, vi } from "vitest";
import { registerPublicationPolicyEnrollmentRoutes } from "../policy-enrollment-routes.js";

async function fixture() {
  const context = { principalId: "verified-actor", tenantId: "verified-tenant", planeKey: "studio" };
  const propose = vi.fn(async () => ({ status: "pending_approval" }));
  const activate = vi.fn(async () => ({ status: "active" }));
  const replace = vi.fn(async () => ({ status: "active" }));
  const app = express(); app.use(express.json({ limit: "32kb" }));
  registerPublicationPolicyEnrollmentRoutes(app, {
    authenticate: (req, res, next) => { if (req.get("Authorization") !== "Bearer test-only") { res.sendStatus(401); return; } next(); },
    readContext: () => context as never, service: { propose, activate, replace } as never,
  });
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? error.statusCode ?? 500).json({ code: error.code }));
  const server = await new Promise<Server>(resolve => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
  const address = server.address() as { port: number };
  const request = (path: string, body: unknown, authenticated = true) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer test-only" } : {}) }, body: JSON.stringify(body),
  });
  const close = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return { request, close, context, propose, activate, replace };
}
it("requires authentication and passes only the trusted request context", async () => {
  const f = await fixture();
  try {
    expect((await f.request("/api/studio/publication-policies", {}, false)).status).toBe(401);
    expect(f.propose).not.toHaveBeenCalled();
    const body = { principalId: "forged", policyId: "test" };
    expect((await f.request("/api/studio/publication-policies", body)).status).toBe(200);
    expect(f.propose).toHaveBeenCalledWith(f.context, body);
  } finally { await f.close(); }
});
it("rejects activation without an exact pin or with additional caller coordinates", async () => {
  const f = await fixture();
  try {
    const path = "/api/studio/publication-policies/policy/activate";
    expect((await f.request(path, {})).status).toBe(400);
    expect((await f.request(path, { expectedHash: "a".repeat(64), tenantId: "forged" })).status).toBe(400);
    expect(f.activate).not.toHaveBeenCalled();
    expect((await f.request(path, { expectedHash: "a".repeat(64) })).status).toBe(200);
    expect(f.activate).toHaveBeenCalledWith(f.context, "policy", "a".repeat(64));
  } finally { await f.close(); }
});

it("requires exact replacement pins and authenticated Owner context", async () => {
  const f=await fixture();
  try {
    const path="/api/studio/publication-policies/policy/replace";
    const body={expectedHash:"a".repeat(64),predecessors:[{id:"old",hash:"b".repeat(64)}]};
    expect((await f.request(path,body,false)).status).toBe(401);
    expect((await f.request(path,{...body,tenantId:"forged"})).status).toBe(400);
    expect((await f.request(path,{expectedHash:body.expectedHash})).status).toBe(400);
    expect(f.replace).not.toHaveBeenCalled();
    expect((await f.request(path,body)).status).toBe(200);
    expect(f.replace).toHaveBeenCalledWith(f.context,"policy",body.expectedHash,body.predecessors);
    f.replace.mockRejectedValueOnce(Error("PUBLICATION_REPLACEMENT_EXECUTION_IN_PROGRESS"));
    expect((await f.request(path,body)).status).toBe(409);
    f.replace.mockRejectedValueOnce(Error("PUBLICATION_REPLACEMENT_INDEPENDENT_ACTOR_REQUIRED"));
    expect((await f.request(path,body)).status).toBe(403);
  }finally{await f.close();}
});
