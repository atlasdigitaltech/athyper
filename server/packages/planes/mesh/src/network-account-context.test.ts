import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { resolveMeshNetworkAccountContext } from "./network-account-context.js";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { registerBusinessPartnerNetworkExchangeRoutes } from "./business-partner-network-exchange-routes.js";

const accountId = "11111111-1111-4111-8111-111111111111";
const context = { planeKey: "mesh", tenantId: "tenant", principalId: "principal", permissions: { allowed: ["read"] } } as unknown as VerifiedRequestContext;
const catalog = { meshNetworkAccounts: vi.fn(async () => ({ revision: "1", accounts: [{ networkAccountId: accountId, code: "supplier", displayName: "Supplier", role: "supplier" as const }] })) };

it("binds only catalog-authorized account selections without changing the original authority", async () => {
  const result = await resolveMeshNetworkAccountContext(context, accountId, catalog);
  expect(result.permissions.networkAccountId).toBe(accountId);
  expect(result.permissions.allowed).toEqual(["read"]);
  expect(context.permissions.networkAccountId).toBeUndefined();
  expect(catalog.meshNetworkAccounts).toHaveBeenCalledWith(context);
});

it("rejects a valid but unauthorized account and invalid or missing selections", async () => {
  await expect(resolveMeshNetworkAccountContext(context, "22222222-2222-4222-8222-222222222222", catalog)).rejects.toMatchObject({ status: 403 });
  for (const requested of [undefined, "bad", [accountId], {}]) {
    await expect(resolveMeshNetworkAccountContext(context, requested, catalog)).rejects.toMatchObject({ status: 400 });
  }
  await expect(resolveMeshNetworkAccountContext({ ...context, planeKey: "neon" }, accountId, catalog)).rejects.toMatchObject({ status: 403 });
});

it("validates the browser coordinate before invoking network workspace or command handlers", async () => {
  const workspace = vi.fn(async ({ context }: { context: VerifiedRequestContext }) => ({ accountId: context.permissions.networkAccountId }));
  const requestRelationship = vi.fn(async ({ context }: { context: VerifiedRequestContext }) => ({ accountId: context.permissions.networkAccountId, replayed: false }));
  const app = createHttpApplication({ openApi: false, configure(app) {
    registerBusinessPartnerNetworkExchangeRoutes(app, {
      authenticate: (_req, _res, next) => next(),
      readContext: () => context,
      resolveAccountContext: (verified, requested) => resolveMeshNetworkAccountContext(verified, requested, catalog),
      service: { workspace, requestRelationship } as never,
    });
  } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test address");
    const origin = `http://127.0.0.1:${address.port}`;
    const path = "/api/mesh/business-partner-network-workspace";
    expect((await fetch(`${origin}${path}`)).status).toBe(400);
    expect((await fetch(`${origin}${path}?networkAccountId=22222222-2222-4222-8222-222222222222`)).status).toBe(403);
    expect(workspace).not.toHaveBeenCalled();
    const response = await fetch(`${origin}${path}?networkAccountId=${accountId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accountId });
    const command = await fetch(`${origin}/api/mesh/business-partner-network-relationships?networkAccountId=${accountId}`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "mesh-review-001" },
      body: JSON.stringify({ actorRole: "supplier", counterpartyTenantId: accountId, counterpartyAccountId: accountId, reason: "Requested" }),
    });
    expect(command.status).toBe(201);
    expect((await command.json()).accountId).toBe(accountId);
    expect(requestRelationship).toHaveBeenCalledOnce();
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
  }
});
