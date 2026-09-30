import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import { afterEach, it, expect, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  RoundingAggregate,
  RoundingRepository,
} from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import {
  HttpError,
  enforceContractResponses,
} from "@athyper/server-runtime-http";
import { createRoundingService } from "./rounding-control.js";
import {
  registerControlServiceRoutes,
  disabledControlServiceRouteFlags,
  type ControlServices,
} from "./control-service-routes.js";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
          s.closeAllConnections();
        }),
    ),
  );
});
const aggregate = {
  code: "cash",
  name: "Cash",
  method: "ROUND_HALF_UP",
  precisionDigits: 2,
  contexts: [{}],
  status: "active",
} as const;
async function fixture(planeKey: "neon" | "studio" = "neon", denied = false) {
  let current: RoundingAggregate | undefined;
  const repo: RoundingRepository = {
    getCurrencyDefaults: async () => undefined,
    list: async () => (current ? [current] : []),
    get: async (_t, id) => (current?.id === id ? current : undefined),
    save: vi.fn(
      async ({ expectedVersion, ...r }) =>
        (current = { ...r, version: (expectedVersion ?? 0) + 1 }),
    ),
    retire: vi.fn(
      async () =>
        (current = {
          ...current!,
          status: "retired",
          version: current!.version + 1,
        }),
    ),
  };
  const rounding = createRoundingService({
    authorizer: {
      authorize: async () =>
        denied
          ? { allowed: false as const, reason: "denied" }
          : { allowed: true as const },
    },
    repositories: createExactPlaneRepositoryProvider({
      neon: repo,
      studio: repo,
    }),
    cache: { invalidate: async () => {} },
  });
  const app = express();
  app.use(express.json());
  enforceContractResponses(app);
  registerControlServiceRoutes(app, {
    authenticate: (req, res, next) => {
      if (req.headers["x-deny"]) res.sendStatus(401);
      else next();
    },
    readContext: () =>
      ({
        planeKey,
        tenantId: "tenant",
        principalId: "actor",
      }) as VerifiedRequestContext,
    services: { rounding } as ControlServices,
    flags: {
      ...disabledControlServiceRouteFlags,
      localCatalogReads: true,
      lookupAndRoundingConfiguration: true,
    },
  });
  app.use(((e, _r, res, _n) =>
    res
      .status(e instanceof HttpError ? e.statusCode : (e.status ?? 500))
      .json({ code: e.code })) as ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("address");
  return {
    repo,
    call: (path: string, method = "GET", body?: unknown, deny = false) =>
      fetch(
        `http://127.0.0.1:${address.port}/api/control-admin/rounding${path}`,
        {
          method,
          headers: {
            "content-type": "application/json",
            ...(deny ? { "x-deny": "true" } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      ),
  };
}
it("serves typed list/save/simulation/retirement responses and stale conflicts", async () => {
  const f = await fixture();
  expect(await (await f.call("")).json()).toEqual([]);
  const save = await f.call("/rule", "PUT", { aggregate, expectedVersion: 0 });
  expect(save.status).toBe(200);
  expect(await save.json()).toMatchObject({
    id: "rule",
    tenantId: "tenant",
    version: 1,
  });
  expect(
    (await f.call("/rule", "PUT", { aggregate, expectedVersion: 0 })).status,
  ).toBe(409);
  const simulation = await f.call("/simulate", "POST", { amount: "-1.005" });
  expect(simulation.status).toBe(200);
  expect(await simulation.json()).toMatchObject({
    output: "-1.01",
    ruleId: "rule",
  });
  expect(
    (await f.call("/rule/retire", "POST", { expectedVersion: 1 })).status,
  ).toBe(200);
  expect((await f.call("/simulate", "POST", { amount: "1" })).status).toBe(404);
});
it.each([
  { aggregate },
  { aggregate, expectedVersion: "0" },
  { aggregate, expectedVersion: -1 },
  { aggregate, expectedVersion: 0.5 },
  { aggregate, expectedVersion: 9007199254740992 },
  { aggregate: { ...aggregate, tenantId: "foreign" }, expectedVersion: 0 },
  { aggregate: { ...aggregate, id: "different" }, expectedVersion: 0 },
  {
    aggregate: { ...aggregate, contexts: [{ extra: "x" }] },
    expectedVersion: 0,
  },
])("rejects malformed save contract %j", async (body) => {
  const f = await fixture();
  expect((await f.call("/rule", "PUT", body)).status).toBe(400);
  expect(f.repo.save).not.toHaveBeenCalled();
});
it.each([
  { amount: 1 },
  { amount: "1", currencyCode: 12 },
  { amount: "1", slot: "" },
  { amount: "1", extra: true },
])("does not silently discard malformed simulation fields %j", async (body) => {
  expect((await (await fixture()).call("/simulate", "POST", body)).status).toBe(
    400,
  );
});
it("enforces authentication, authorization and Neon-only writes", async () => {
  expect(
    (await (await fixture()).call("", "GET", undefined, true)).status,
  ).toBe(401);
  expect((await (await fixture("neon", true)).call("")).status).toBe(403);
  expect(
    (
      await (
        await fixture("studio")
      ).call("/rule", "PUT", { aggregate, expectedVersion: 0 })
    ).status,
  ).toBe(403);
});
