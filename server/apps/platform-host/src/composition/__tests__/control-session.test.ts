import express from "express";
import type { Server } from "node:http";
import { expect, it, vi } from "vitest";
import { registerControlSession } from "../control-plane/session.js";

const authority = { tenantId: "11111111-1111-4111-8111-111111111111", realmKey: "platform-control",
  issuer: "https://iam.dev.athyper.test/realms/platform-control", audience: "athyper-platform-control-api" };
async function fixture(override: Record<string, unknown> = {}) {
  const context = { tenantId: authority.tenantId, realmKey: authority.realmKey, planeKey: "studio", principalId: "verified-principal",
    assurance: "elevated", authenticationMethods: ["pwd", "otp"], permissions: { allowed: [] }, requestId: "test", ...override };
  const authenticate = vi.fn(async () => ({ ok: true, context }));
  const app = express();
  registerControlSession(app, { authenticate } as never, authority);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? error.statusCode ?? 500).json({ code: error.code }));
  const server = await new Promise<Server>(resolve => { const s=app.listen(0,"127.0.0.1",()=>resolve(s)); });
  const port = (server.address() as {port:number}).port;
  return { authenticate, request: (headers: Record<string,string> = {authorization:"Bearer test-only", "x-plane":"studio"}) => fetch(`http://127.0.0.1:${port}/api/platform-control/session`, {headers}),
    close: () => new Promise<void>(resolve => server.close(()=>resolve())) };
}
it("requires authentication before disclosing the control session", async () => {
  const f=await fixture(); try { expect((await f.request({})).status).toBe(401); expect(f.authenticate).not.toHaveBeenCalled(); } finally {await f.close();}
});
it.each([{assurance:"standard"},{tenantId:"customer"},{realmKey:"athyper"},{planeKey:"neon"}])("denies insufficient or foreign authority: %j", async override => {
  const f=await fixture(override);try { expect((await f.request()).status).toBe(403); } finally {await f.close();}
});
it("returns only verified identity and effective permissions without granting authority", async () => {
  const f=await fixture();try {
    const response=await f.request();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({principalId:"verified-principal",tenantId:authority.tenantId,plane:"studio",realm:authority.realmKey,
      assurance:"elevated",authenticationMethods:["pwd","otp"],allowedPermissions:[]});
  }finally{await f.close();}
});
