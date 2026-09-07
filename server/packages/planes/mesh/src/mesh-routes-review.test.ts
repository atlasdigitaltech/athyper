import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { afterEach, expect, it, vi } from "vitest";
import { registerBusinessPartnerBankDisclosureRoutes } from "./business-partner-bank-disclosure-routes.js";
import { registerBusinessPartnerNetworkExchangeRoutes } from "./business-partner-network-exchange-routes.js";
import { registerBusinessPartnerProfilePublicationRoutes } from "./business-partner-profile-publication-routes.js";

const id = "11111111-1111-4111-8111-111111111111";
const base = "/api/mesh/business-partner-";
const key = "review-key-001";
const context = {
  planeKey: "mesh",
  tenantId: id,
  principalId: id,
} as VerifiedRequestContext;
const cases: [string, string, Record<string, unknown> | undefined][] = [
  [
    "POST",
    "bank-disclosures",
    {
      ownerAccountId: id,
      bankAccountId: id,
      networkRelationshipId: id,
      purpose: "settlement",
    },
  ],
  ["GET", `bank-disclosures/${id}`, undefined],
  [
    "POST",
    `bank-disclosures/${id}/decisions`,
    { decision: "approve", secureRetrievalReference: "vault://bank/1" },
  ],
  ["POST", `bank-disclosures/${id}/revocations`, { reason: "Retired" }],
  [
    "POST",
    `network-capabilities/${id}/decisions`,
    { action: "accept", expectedVersion: 1, reason: "Reviewed" },
  ],
  [
    "POST",
    "network-relationships",
    {
      actorRole: "buyer",
      counterpartyTenantId: id,
      counterpartyAccountId: id,
      reason: "Reviewed",
    },
  ],
  [
    "POST",
    `network-relationships/${id}/capabilities`,
    {
      capabilityCode: "profile_exchange",
      effectiveFrom: "2026-09-07",
      reason: "Reviewed",
    },
  ],
  [
    "POST",
    `network-relationships/${id}/decisions`,
    { action: "accept", expectedVersion: 1, reason: "Reviewed" },
  ],
  ["GET", "network-workspace", undefined],
  ["GET", `profile-publications?networkRelationshipId=${id}`, undefined],
  [
    "POST",
    "profile-publications",
    { ownerAccountId: id, networkRelationshipId: id },
  ],
  ["GET", `profile-publications/${id}`, undefined],
  ["POST", `profile-publications/${id}/withdrawals`, { reason: "Retired" }],
  [
    "POST",
    "registration-exchanges",
    {
      counterpartyTenantId: id,
      counterpartyAccountId: id,
      intentKind: "buyer_request",
      contractName: "mesh.registration",
      contractVersion: 1,
      contractHash: "a".repeat(64),
      invitationTokenHash: "b".repeat(64),
      expiresAt: "2099-01-01T00:00:00Z",
      reason: "Reviewed",
    },
  ],
  [
    "POST",
    `registration-exchanges/${id}/decisions`,
    { action: "accept", expectedVersion: 1, reason: "Reviewed" },
  ],
];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});
async function fixture(replayed = false) {
  const call = vi.fn(async (_input: unknown) => ({ replayed }));
  const service = new Proxy({}, { get: () => call });
  const app = createHttpApplication({
    openApi: false,
    configure(app) {
      const options = {
        authenticate: ((req, res, next) => {
          if (req.get("x-deny")) {
            res.status(401).json({ code: "UNAUTHENTICATED" });
            return;
          }
          next();
        }) as import("@athyper/server-runtime-http").RequestHandler,
        readContext: () => context,
      };
      registerBusinessPartnerBankDisclosureRoutes(app, {
        ...options,
        service: service as never,
      });
      registerBusinessPartnerNetworkExchangeRoutes(app, {
        ...options,
        service: service as never,
      });
      registerBusinessPartnerProfilePublicationRoutes(app, {
        ...options,
        service: service as never,
      });
    },
  });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  return {
    call,
    request: (method: string, path: string, body?: unknown, deny = false) =>
      fetch(`http://127.0.0.1:${address.port}${base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
          ...(deny ? { "x-deny": "1" } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}
it.each(cases)(
  "authenticates and dispatches %s %s",
  async (method, path, body) => {
    const { call, request } = await fixture();
    expect((await request(method, path, body, true)).status).toBe(401);
    expect(call).not.toHaveBeenCalled();
    const response = await request(method, path, body);
    const created =
      method === "POST" &&
      (!path.endsWith("/decisions") || path.startsWith("bank-disclosures"));
    expect(response.status).toBe(created ? 201 : 200);
    expect(call).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        context,
        ...(method === "POST" ? { idempotencyKey: key } : {}),
      }),
    );
  },
);
it.each(cases.filter(([method]) => method === "POST"))(
  "returns 200 for replay of %s %s",
  async (method, path, body) => {
    const { request } = await fixture(true);
    expect((await request(method, path, body)).status).toBe(200);
  },
);
it.each([
  [0, { idempotencyKey: { injected: true } }],
  [0, { purpose: ["settlement"] }],
  [0, { expiresAt: false }],
  [0, { expiresAt: "2026-02-30T00:00:00Z" }],
  [2, { secureRetrievalReference: { injected: true } }],
  [3, { reason: 42 }],
  [4, { expectedVersion: true }],
  [4, { expectedVersion: "1" }],
  [4, { expectedVersion: [1] }],
  [5, { effectiveFrom: "tomorrow" }],
  [5, { effectiveUntil: false }],
  [6, { effectiveFrom: "2026-02-30" }],
  [13, { contractVersion: true }],
  [13, { expiresAt: "2026-09-07" }],
] as [number, Record<string, unknown>][])(
  "rejects malformed input at route %s: %j",
  async (index, overrides) => {
    const { call, request } = await fixture();
    const [method, path, body] = cases[index]!;
    const response = await request(method, path, { ...body, ...overrides });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(call).not.toHaveBeenCalled();
  },
);
it("rejects repeated list limits instead of coercing query arrays", async () => {
  const { call, request } = await fixture();
  expect(
    (
      await request(
        "GET",
        `profile-publications?networkRelationshipId=${id}&limit=1&limit=2`,
      )
    ).status,
  ).toBe(400);
  expect(call).not.toHaveBeenCalled();
});
it("canonicalizes UUID case before dispatching replay coordinates", async () => {
  const { call, request } = await fixture();
  const uppercase = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  expect((await request("GET", `bank-disclosures/${uppercase}`)).status).toBe(
    200,
  );
  expect(call).toHaveBeenCalledWith({
    context,
    disclosureId: uppercase.toLowerCase(),
  });
});
