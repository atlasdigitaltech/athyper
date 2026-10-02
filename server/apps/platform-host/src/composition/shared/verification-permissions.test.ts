import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { createContainer } from "../../kernel/container.js";
import type { HostConfig } from "../../config/environment.js";
import { registerVerification } from "./verification.js";

// Stub only authentication: exercise the actual registered HTTP handlers and
// verify denied callers never reach the privileged verification dependencies.
const identity = vi.hoisted(() => ({
  planeKey: "neon",
  tenantId: "tenant",
  principalId: "principal",
  authEpoch: 1,
  requestId: "request",
  permissions: { allowed: [] as string[] },
}));
vi.mock("@athyper/server-platform-iam", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createIamAuthenticationMiddleware:
    () => (_request: unknown, _response: unknown, next: () => void) =>
      next(),
  readVerifiedRequestContext: () => identity,
}));

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  identity.permissions.allowed = [];
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

async function setup(permissions: string[]) {
  identity.permissions.allowed = permissions;
  const container = createContainer();
  container.platform.iam = {} as never;
  const health = vi.fn(async () => ({ healthy: true }));
  container.adapters.neonDatabase = { health } as never;
  registerVerification(container, {
    env: "test",
    bullMq: {},
    verification: { enabled: true },
  } as HostConfig);
  const app = createHttpApplication({
    openApi: {
      title: "Verification permissions",
      version: "1",
      enforceResponses: true,
    },
    configure(application) {
      for (const registrar of container.platform.httpRegistrars)
        registrar(application);
    },
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing listener");
  return { origin: `http://127.0.0.1:${address.port}`, health };
}

it.each([{ permissions: [] }, { permissions: ["platform.verification.read"] }])(
  "denies functional runs without run authority: $permissions",
  async ({ permissions }) => {
    const { origin, health } = await setup(permissions);
    const response = await fetch(`${origin}/api/platform/verification/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "functional" }),
    });
    expect(response.status).toBe(403);
    expect(health).not.toHaveBeenCalled();
  },
);

it("denies snapshots without read authority before accessing adapters", async () => {
  const { origin, health } = await setup(["platform.verification.run"]);
  expect((await fetch(`${origin}/api/platform/verification`)).status).toBe(403);
  expect(health).not.toHaveBeenCalled();
});

it("allows the registered snapshot handler with explicit read authority", async () => {
  const { origin, health } = await setup(["platform.verification.read"]);
  const response = await fetch(`${origin}/api/platform/verification`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(health).toHaveBeenCalledOnce();
});
