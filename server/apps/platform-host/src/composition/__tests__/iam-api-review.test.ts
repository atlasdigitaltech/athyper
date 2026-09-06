import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createHttpApplication,
  enforceContractResponses,
} from "@athyper/server-runtime-http";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";

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
const attemptId = "10000000-0000-4000-8000-000000000003";
const context = {
  planeKey: "studio",
  realmKey: "athyper",
  tenantId: "10000000-0000-4000-8000-000000000001",
  principalId: "10000000-0000-4000-8000-000000000002",
  authEpoch: 2,
  assurance: "elevated",
  authenticationMethods: ["otp"],
  requestId: "r",
  profileHash: "p",
  permissions: {
    planeKey: "studio",
    tenantId: "10000000-0000-4000-8000-000000000001",
    principalId: "10000000-0000-4000-8000-000000000002",
    allowed: [
      "studio.iam.application_projection.read",
      "studio.iam.application_projection.replay",
    ],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
  },
} as unknown as VerifiedRequestContext;
async function harness(status?: 401 | 503, principal = context) {
  const container = createContainer();
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  const run = vi.fn(async (work: (tx: typeof db) => Promise<unknown>) =>
    work(db),
  );
  container.adapters.athyperDatabase = {
    withTenantTransaction: run,
    database: db,
  } as never;
  registerPlatform(container, loadConfig(), {
    tokenVerifier: {
      verify: async () => {
        throw new Error("invalid token");
      },
    },
    createIam: () => ({
      authenticate: async () =>
        status
          ? {
              ok: false,
              status,
              code:
                status === 401
                  ? "AUTH_TOKEN_INVALID"
                  : "AUTH_AUTHORIZATION_UNAVAILABLE",
              message: "Unavailable",
            }
          : { ok: true, context: principal },
    }),
    auditSink: createInMemoryAuditSink(),
  });
  const app = createHttpApplication({
    configure(application) {
      enforceContractResponses(application);
      for (const register of container.platform.httpRegistrars)
        register(application);
    },
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  const call = (path: string, body?: unknown, authenticated = true) =>
    fetch(`http://127.0.0.1:${address.port}/api/iam/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(authenticated
          ? { authorization: "Bearer token", "x-plane": "studio" }
          : {}),
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { call, run };
}
const requests = [
  ["me", undefined],
  ["projection-health", undefined],
  [`identity-saga-attempts/${attemptId}/evidence`, undefined],
  [`identity-saga-attempts/${attemptId}/replay`, { approvedBy: attemptId }],
  [`projection-reconciliation-attempts/${attemptId}/replay`, {}],
  [
    "provisioning-requests",
    { identifier: "user@example.com", planes: ["neon"] },
  ],
  ["trusted-devices", { deviceTokenHash: "a".repeat(64), ttlSeconds: 60 }],
  ["trusted-devices/verify", { deviceTokenHash: "a".repeat(64) }],
] as const;
describe("IAM API review regressions", () => {
  it.each([401, 503] as const)(
    "preserves authentication status %s with response enforcement",
    async (status) => {
      const { call, run } = await harness(status);
      for (const [path, body] of requests)
        expect((await call(path, body)).status, path).toBe(status);
      expect(run).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed attempt IDs and empty provisioning planes before database access", async () => {
    const { call, run } = await harness();
    expect(
      (await call("identity-saga-attempts/not-a-uuid/evidence")).status,
    ).toBe(400);
    expect(
      (await call("projection-reconciliation-attempts/not-a-uuid/replay", {}))
        .status,
    ).toBe(400);
    expect(
      (
        await call("provisioning-requests", {
          identifier: "user@example.com",
          planes: [],
        })
      ).status,
    ).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects a caller-supplied approver without verified review evidence", async () => {
    const { call, run } = await harness();
    const response = await call(`identity-saga-attempts/${attemptId}/replay`, {
      approvedBy: attemptId,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "IAM_REPLAY_APPROVAL_REQUIRED",
    });
    expect(run).not.toHaveBeenCalled();
  });
  it("does not cache principal responses and rejects unauthenticated discovery", async () => {
    const { call } = await harness();
    expect((await call("me")).headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect((await call("contexts", undefined, false)).status).toBe(401);
  });
  it.each(["neon", "mesh"] as const)(
    "does not fall back to Studio trusted-device storage for %s",
    async (planeKey) => {
      const { call, run } = await harness(undefined, { ...context, planeKey });
      expect(
        (
          await call("trusted-devices", {
            deviceTokenHash: "a".repeat(64),
            ttlSeconds: 60,
          })
        ).status,
      ).toBe(503);
      expect(
        (
          await call("trusted-devices/verify", {
            deviceTokenHash: "a".repeat(64),
          })
        ).status,
      ).toBe(503);
      expect(run).not.toHaveBeenCalled();
    },
  );

  it("requires second-factor evidence for trusted-device enrollment", async () => {
    const { call, run } = await harness(undefined, {
      ...context,
      authenticationMethods: ["pwd"],
    });
    expect(
      (
        await call("trusted-devices", {
          deviceTokenHash: "a".repeat(64),
          ttlSeconds: 60,
        })
      ).status,
    ).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });
});
