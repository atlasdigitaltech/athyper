import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  LookupDomainRevision,
  LookupDesiredState,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import {
  enforceContractResponses,
  HttpError,
} from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLookupService } from "./lookup-control.js";
import {
  registerControlServiceRoutes,
  disabledControlServiceRouteFlags,
  type ControlServices,
} from "./control-service-routes.js";
const domain: LookupDomainRevision = {
  id: "domain-1",
  version: 1,
  code: "reason",
  name: "Reason",
  sourceSchema: "control",
  extensible: true,
  status: "active",
  values: [
    {
      id: "v1",
      code: "custom",
      name: "Custom",
      tenantId: "tenant-1",
      sortOrder: 0,
      metadata: {},
      status: "active",
    },
  ],
};
const state: LookupDesiredState = {
  desiredStateId: "receipt",
  targetPlane: "neon",
  sourceRevision: 1,
  domain: { ...domain, values: [] },
};
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((e) => (e ? reject(e) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});
async function fixture(denied = false, enabled = true) {
  const context = {
    tenantId: "tenant-1",
    principalId: "actor-1",
    planeKey: "neon",
  } as VerifiedRequestContext;
  const repository = {
    getDomain: vi.fn(async () => domain),
    listDomains: vi.fn(async () => [domain]),
    publishDesiredState: vi.fn(async (s: LookupDesiredState) => s.domain),
    isValueReferenced: vi.fn(async () => false),
    retireValue: vi.fn(async () => ({ ...domain, version: 2 })),
  };
  const lookups = createLookupService({
    authorizer: {
      authorize: async () =>
        denied
          ? { allowed: false as const, reason: "denied" }
          : { allowed: true as const },
    },
    repositories: createExactPlaneRepositoryProvider({ neon: repository }),
    cache: { invalidate: async () => {} },
  });
  const app = express();
  app.use(express.json());
  enforceContractResponses(app);
  registerControlServiceRoutes(app, {
    authenticate: (req, res, next) => {
      if (req.headers["x-unauthenticated"]) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      next();
    },
    readContext: () => context,
    services: { lookups } as ControlServices,
    flags: {
      ...disabledControlServiceRouteFlags,
      localCatalogReads: enabled,
      lookupAndRoundingConfiguration: enabled,
    },
  });
  app.use(((error, _req, res, _next) =>
    res
      .status(error instanceof HttpError ? error.statusCode : 500)
      .json({
        code: error instanceof HttpError ? error.code : "INTERNAL_ERROR",
      })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  return {
    repository,
    request: (path: string, body?: unknown, unauthenticated = false) =>
      fetch(
        `http://127.0.0.1:${address.port}/api/control-admin/lookups${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "content-type": "application/json",
            ...(unauthenticated ? { "x-unauthenticated": "1" } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      ),
  };
}
describe("lookup HTTP contracts", () => {
  it("returns typed list and versioned domain responses", async () => {
    const f = await fixture();
    const list = await f.request("");
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([domain]);
    const read = await f.request("/reason?version=1");
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(domain);
    expect(f.repository.getDomain).toHaveBeenCalledWith(
      "reason",
      1,
      "tenant-1",
    );
    expect((await f.request("/reason?version=2")).status).toBe(404);
  });
  it("applies state and retires with verified tenant, actor and revision", async () => {
    const f = await fixture();
    const applied = await f.request("/desired-state/apply", state);
    expect(applied.status).toBe(200);
    expect(await applied.json()).toEqual(state.domain);
    expect(f.repository.publishDesiredState).toHaveBeenCalledWith(
      state,
      "actor-1",
      "tenant-1",
    );
    expect(
      (await f.request("/reason/values/custom/retire", { expectedVersion: 1 }))
        .status,
    ).toBe(200);
    expect(f.repository.retireValue).toHaveBeenCalledWith(
      {
        domainCode: "reason",
        valueCode: "custom",
        tenantId: "tenant-1",
        expectedVersion: 1,
      },
      "actor-1",
    );
  });
  it.each([
    "0",
    "-1",
    "1.5",
    "1e0",
    "0x1",
    "01",
    "",
    "NaN",
    "9007199254740992",
    "1&version=2",
  ])("rejects malformed version query %s", async (version) => {
    const f = await fixture();
    expect((await f.request(`/reason?version=${version}`)).status).toBe(400);
    expect(f.repository.getDomain).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { expectedVersion: "1" },
    { expectedVersion: 0 },
    { expectedVersion: 1.5 },
    { expectedVersion: 1, tenantId: "forged" },
    { expectedVersion: 1, actorId: "forged" },
  ])("rejects invalid retirement %j", async (body) => {
    const f = await fixture();
    expect((await f.request("/reason/values/custom/retire", body)).status).toBe(
      400,
    );
    expect(f.repository.retireValue).not.toHaveBeenCalled();
  });
  it.each([
    { sourceRevision: 0 },
    { sourceRevision: 1.5 },
    { extra: true },
    { domain: { ...state.domain, sourceSchema: "../control" } },
  ])("rejects malformed publication %j", async (fields) => {
    const f = await fixture();
    expect(
      (await f.request("/desired-state/apply", { ...state, ...fields })).status,
    ).toBe(400);
    expect(f.repository.publishDesiredState).not.toHaveBeenCalled();
  });
  it("returns conflict when value is referenced", async () => {
    const f = await fixture();
    f.repository.isValueReferenced.mockResolvedValue(true);
    expect(
      (await f.request("/reason/values/custom/retire", { expectedVersion: 1 }))
        .status,
    ).toBe(409);
    expect(f.repository.retireValue).not.toHaveBeenCalled();
  });
  it("returns target mismatch as 403", async () => {
    const f = await fixture();
    expect(
      (
        await f.request("/desired-state/apply", {
          ...state,
          targetPlane: "mesh",
        })
      ).status,
    ).toBe(403);
  });
  it.each([
    ["", undefined],
    ["/reason", undefined],
    ["/desired-state/apply", state],
    ["/reason/values/custom/retire", { expectedVersion: 1 }],
  ] as const)("authenticates and authorizes %s", async (path, body) => {
    const f = await fixture(true);
    expect((await f.request(path, body, true)).status).toBe(401);
    expect((await f.request(path, body)).status).toBe(403);
    expect(f.repository.getDomain).not.toHaveBeenCalled();
    expect(f.repository.publishDesiredState).not.toHaveBeenCalled();
    expect(f.repository.retireValue).not.toHaveBeenCalled();
  });
  it("keeps capability-disabled routes unregistered", async () => {
    const f = await fixture(false, false);
    expect((await f.request("")).status).toBe(404);
    expect((await f.request("/desired-state/apply", state)).status).toBe(404);
  });
});
