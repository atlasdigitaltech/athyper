import {
  createHttpApplication,
  createOpenApiDocument,
} from "@athyper/server-runtime-http";
import { createServer } from "node:http";
import { type ErrorRequestHandler } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PolicyDecision } from "@athyper/server-contract-policy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPolicyRoutes } from "../policy-routes.js";

const context = {
  tenantId: "tenant",
  principalId: "principal",
  planeKey: "neon",
} as VerifiedRequestContext;
const decision: PolicyDecision = {
  action: "none",
  permitted: true,
  outcomes: [],
  evaluatedPolicyIds: [],
  evaluatedPolicies: [],
};
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});
async function fixture(
  settings: {
    authenticated?: boolean;
    allowed?: boolean;
    simulation?: boolean;
    failure?: boolean;
    rateLimited?: boolean;
  } = {},
) {
  const evaluate = vi.fn(async () => {
    if (settings.failure) throw new Error("private database detail");
    return decision;
  });
  const simulate = vi.fn(async () => {
    if (settings.failure) throw new Error("private database detail");
    return {
      decision,
      trace: [],
      effectiveOn: "2026-09-06",
      audited: false as const,
    };
  });
  const authorize = vi.fn(async () =>
    settings.allowed === false
      ? { allowed: false as const, reason: "denied" }
      : { allowed: true as const },
  );
  const app = createHttpApplication({
    openApi: { title: "Policy", version: "1", enforceResponses: true },
    ...(settings.rateLimited
      ? {
          rateLimit: {
            scope: "tenant-principal" as const,
            windowMs: 60_000,
            maxRequests: 1,
            identity: () => ({
              tenantId: context.tenantId,
              principalId: context.principalId,
            }),
          },
        }
      : {}),
    configure(application) {
      registerPolicyRoutes(application, {
        authenticate: (_req, res, next) => {
          if (settings.authenticated === false) res.sendStatus(401);
          else next();
        },
        readContext: () => context,
        authorizer: { authorize },
        policy: {
          evaluate,
          ...(settings.simulation === false ? {} : { simulate }),
        },
      });
      application.use(((_error, _req, res, _next) => {
        res.status(500).json({ error: "INTERNAL_ERROR" });
      }) satisfies ErrorRequestHandler);
    },
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  return {
    app,
    evaluate,
    simulate,
    authorize,
    post: (route: string, body: unknown) =>
      fetch(`http://127.0.0.1:${address.port}/api/policy/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

for (const route of ["evaluate", "simulate"] as const)
  describe(route, () => {
    it("uses verified context and normalizes the requested policy selection", async () => {
      const f = await fixture();
      const id = "ABCDEFAB-1234-4123-8123-ABCDEFABCDEF";
      const response = await f.post(route, {
        entityType: " order ",
        entityId: " record-1 ",
        pipelineId: " pipeline-1 ",
        facts: { amount: 10 },
        policyDefinitionIds: [id, id.toLowerCase()],
        context: { tenantId: "attacker" },
      });
      expect(response.status).toBe(200);
      expect(f.authorize).toHaveBeenCalledWith({
        context,
        permissionCode: `policy.${route}`,
      });
      expect(f[route]).toHaveBeenCalledWith({
        context,
        entityType: "order",
        entityId: "record-1",
        pipelineId: "pipeline-1",
        facts: { amount: 10 },
        policyDefinitionIds: [id.toLowerCase()],
      });
    });
    it.each([
      { facts: {} },
      { entityType: " ", facts: {} },
      { entityType: 12, facts: {} },
      { entityType: "order" },
      { entityType: "order", facts: [] },
      ...["entityId", "pipelineId"].flatMap((key) =>
        [null, 12, false, {}, [], " "].map((value) => ({
          entityType: "order",
          facts: {},
          [key]: value,
        })),
      ),
      ...[
        { entityType: "order", facts: null },
        null,
        "id",
        ["invalid"],
        Array(101).fill("abcdefab-1234-4123-8123-abcdefabcdef"),
      ].map((policyDefinitionIds) => ({
        entityType: "order",
        facts: {},
        policyDefinitionIds,
      })),
      { entityType: "order", facts: null },
    ])(
      "rejects malformed input before invoking the service: %j",
      async (body) => {
        const f = await fixture();
        expect((await f.post(route, body)).status).toBe(400);
        expect(f.evaluate).not.toHaveBeenCalled();
        expect(f.simulate).not.toHaveBeenCalled();
      },
    );
    it.each([
      { authenticated: false, status: 401 },
      { allowed: false, status: 403 },
    ])("enforces access control: %j", async (settings) => {
      const f = await fixture(settings);
      expect(
        (await f.post(route, { entityType: "order", facts: {} })).status,
      ).toBe(settings.status);
      expect(f.evaluate).not.toHaveBeenCalled();
      expect(f.simulate).not.toHaveBeenCalled();
      if (settings.authenticated === false)
        expect(f.authorize).not.toHaveBeenCalled();
    });
    it("publishes an authenticated contract and applies the tenant/principal limit", async () => {
      const f = await fixture({ rateLimited: true });
      expect(
        createOpenApiDocument(f.app, { title: "Policy", version: "1" }),
      ).toMatchObject({
        paths: {
          [`/api/policy/${route}`]: {
            post: {
              operationId: `policy.${route}`,
              security: [{ bearerAuth: [] }],
            },
          },
        },
      });
      const first = await f.post(route, { entityType: "order", facts: {} });
      expect(first.status).toBe(200);
      expect(first.headers.get("cache-control")).toBe("private, no-store");
      const limited = await f.post(route, { entityType: "order", facts: {} });
      expect(limited.status).toBe(429);
      expect(limited.headers.get("cache-control")).toBe("private, no-store");
      expect(f[route]).toHaveBeenCalledTimes(1);
    });
    it("forwards service failures to the error middleware", async () => {
      const f = await fixture({ failure: true });
      const response = await f.post(route, { entityType: "order", facts: {} });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
    });
  });
it("reports unavailable simulation without evaluating or auditing", async () => {
  const f = await fixture({ simulation: false });
  const response = await f.post("simulate", { entityType: "order", facts: {} });
  expect(response.status).toBe(501);
  expect(await response.json()).toEqual({
    error: "POLICY_SIMULATION_UNAVAILABLE",
  });
  expect(f.evaluate).not.toHaveBeenCalled();
});
