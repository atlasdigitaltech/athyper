import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { createIamAuthenticationMiddleware } from "../iam-routes.js";
import { registerIdentityReplayRoutes } from "../identity-replay-routes.js";
import {
  createIdentityReplayAuthorizer,
  IdentityReplayApprovalService,
  IdentityReplayError,
  type IdentityReplayApprovalRepository,
} from "../identity-replay-approval.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const principalId = "10000000-0000-4000-8000-000000000002";
const id = "10000000-0000-4000-8000-000000000003";
const read = "studio.iam.application_projection.read";
const write = "studio.iam.application_projection.replay";
const routes = [
  { method: "GET", path: `identity-replay-approvals/${id}`, operation: "read" },
  {
    method: "POST",
    path: `identity-saga-attempts/${id}/replay-approvals`,
    operation: "create",
  },
  {
    method: "POST",
    path: `identity-replay-approvals/${id}/approve`,
    operation: "decide",
  },
  {
    method: "POST",
    path: `identity-replay-approvals/${id}/revoke`,
    operation: "decide",
  },
] as const;
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
async function harness(
  options: {
    authenticated?: boolean;
    planeKey?: "studio" | "neon";
    assurance?: "baseline" | "elevated";
    allowed?: string[];
    error?: Error;
  } = {},
) {
  const planeKey = options.planeKey ?? "studio";
  const context = {
    planeKey,
    tenantId,
    principalId,
    assurance: options.assurance ?? "elevated",
    requestId: "replay-test",
    permissions: {
      tenantId,
      principalId,
      planeKey,
      allowed: options.allowed ?? [read, write],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      authorizationScopes: [],
      requirements: [
        {
          permissionCode: write,
          entitled: true,
          requiresMfa: true,
          requiresSod: true,
          riskTier: "critical",
        },
      ],
    },
  } as unknown as VerifiedRequestContext;
  const result = { id, status: "pending", reason: "review" };
  const invoke = async () => {
    if (options.error) throw options.error;
    return result;
  };
  const repository = {
    create: vi.fn(invoke),
    read: vi.fn(invoke),
    decide: vi.fn(invoke),
    consume: vi.fn(),
  } as unknown as IdentityReplayApprovalRepository;
  const app = createHttpApplication({
    configure(application) {
      registerIdentityReplayRoutes(
        application,
        createIamAuthenticationMiddleware({
          authenticate: async () =>
            options.authenticated === false
              ? {
                  ok: false,
                  status: 401,
                  code: "AUTH_TOKEN_INVALID",
                  message: "Authentication required",
                }
              : { ok: true, context },
        }),
        new IdentityReplayApprovalService(
          repository,
          createIdentityReplayAuthorizer(),
        ),
      );
    },
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  const call = (
    route: { path: string; method: string },
    body: unknown = { reason: "review" },
  ) =>
    fetch(`http://127.0.0.1:${address.port}/api/iam/${route.path}`, {
      method: route.method,
      headers: {
        authorization: "Bearer token",
        "x-plane": planeKey,
        "content-type": "application/json",
      },
      ...(route.method === "GET" ? {} : { body: JSON.stringify(body) }),
    });
  return { call, repository, context };
}
describe("identity replay approval HTTP routes", () => {
  it.each(routes)(
    "dispatches $method $path with verified context",
    async (route) => {
      const test = await harness();
      const response = await test.call(route, { reason: "  review  " });
      expect(response.status).toBe(route.operation === "create" ? 201 : 200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toMatchObject({ id });
      const input =
        route.operation === "read"
          ? id
          : route.operation === "create"
            ? { attemptId: id, reason: "review", ttlSeconds: 900 }
            : {
                approvalId: id,
                decision: route.path.endsWith("/approve")
                  ? "approve"
                  : "revoke",
                reason: "review",
              };
      expect(test.repository[route.operation]).toHaveBeenCalledWith(
        test.context,
        input,
      );
    },
  );
  it.each(routes)("requires authentication for $path", async (route) => {
    const test = await harness({ authenticated: false });
    expect((await test.call(route)).status).toBe(401);
    expect(test.repository[route.operation]).not.toHaveBeenCalled();
  });
  it.each(routes)(
    "rejects wrong plane and missing permission for $path",
    async (route) => {
      for (const options of [{ planeKey: "neon" as const }, { allowed: [] }]) {
        const test = await harness(options);
        expect((await test.call(route)).status).toBe(403);
        expect(test.repository[route.operation]).not.toHaveBeenCalled();
      }
    },
  );
  it.each(routes)("enforces read/write assurance for $path", async (route) => {
    const test = await harness({
      assurance: "baseline",
      allowed: [read, write],
    });
    expect((await test.call(route)).status).toBe(
      route.method === "GET" ? 200 : 403,
    );
  });
  it.each(routes)("rejects invalid UUIDs for $path", async (route) => {
    const test = await harness();
    expect(
      (await test.call({ ...route, path: route.path.replace(id, "bad-id") }))
        .status,
    ).toBe(400);
    expect(test.repository[route.operation]).not.toHaveBeenCalled();
  });
  it.each(routes.filter((route) => route.method === "POST"))(
    "validates reasons and forbids forged actors for $path",
    async (route) => {
      const test = await harness();
      for (const body of [
        null,
        {},
        { reason: 1 },
        { reason: " " },
        { reason: "x".repeat(1001) },
        { reason: "review\0" },
        { reason: "review", approvedBy: principalId },
      ]) {
        expect((await test.call(route, body)).status).toBe(400);
      }
      expect(test.repository[route.operation]).not.toHaveBeenCalled();
    },
  );
  it.each(routes.filter((route) => route.method === "POST"))(
    "accepts 1000 Unicode characters for $path",
    async (route) => {
      const test = await harness();
      expect(
        (await test.call(route, { reason: "😀".repeat(1000) })).status,
      ).toBe(route.operation === "create" ? 201 : 200);
      expect(
        (await test.call(route, { reason: "😀".repeat(1001) })).status,
      ).toBe(400);
    },
  );
  it("enforces TTL bounds and types", async () => {
    const test = await harness();
    for (const ttlSeconds of [null, "60", 59, 3601, 60.5])
      expect(
        (await test.call(routes[1], { reason: "review", ttlSeconds })).status,
      ).toBe(400);
    for (const ttlSeconds of [60, 3600])
      expect(
        (await test.call(routes[1], { reason: "review", ttlSeconds })).status,
      ).toBe(201);
  });
  it.each(routes)(
    "preserves domain failures and sanitizes internal errors for $path",
    async (route) => {
      for (const status of [403, 404, 409, 503] as const) {
        const test = await harness({
          error: new IdentityReplayError(status, "IAM_REPLAY_TEST"),
        });
        const response = await test.call(route);
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({
          code: "IAM_REPLAY_TEST",
        });
      }
      const test = await harness({
        error: new Error("private database details"),
      });
      const response = await test.call(route);
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("private database details");
    },
  );
});
