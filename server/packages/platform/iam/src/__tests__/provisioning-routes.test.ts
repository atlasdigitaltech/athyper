import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { registerIamRoutes } from "../iam-routes.js";
import { ProvisioningValidationError } from "../provisioning.js";
import type { ProvisioningVertical } from "../provisioning-vertical.js";

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
async function harness(error: Error) {
  const request = vi.fn<ProvisioningVertical["request"]>(async () => {
    throw error;
  });
  const context = {
    planeKey: "studio",
    tenantId: "tenant",
    principalId: "principal",
    requestId: "request",
  } as VerifiedRequestContext;
  const app = createHttpApplication({
    configure(application) {
      registerIamRoutes(application, {
        authenticator: { authenticate: async () => ({ ok: true, context }) },
        provisioning: { request },
      });
    },
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  const call = (realmKey?: string) =>
    fetch(`http://127.0.0.1:${address.port}/api/iam/provisioning-requests`, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "x-plane": "studio",
        "content-type": "application/json",
        "idempotency-key": "iam-provision-0001",
      },
      body: JSON.stringify({
        identifier: "user@example.com",
        planes: ["neon"],
        ...(realmKey === undefined ? {} : { realmKey }),
      }),
    });
  return { call, request };
}
describe("provisioning HTTP error boundary", () => {
  it("returns known validation failures as 400", async () => {
    const { call } = await harness(
      new ProvisioningValidationError("Identity identifier is invalid"),
    );
    const response = await call();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "IAM_PROVISIONING_REQUEST_INVALID",
    });
  });
  it("keeps internal TypeErrors as sanitized 500 responses", async () => {
    const { call } = await harness(
      new TypeError("private database adapter details"),
    );
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(
      "private database adapter details",
    );
  });
  it("does not silently drop an explicitly empty realm", async () => {
    const { call, request } = await harness(
      new ProvisioningValidationError("realmKey is invalid"),
    );
    expect((await call("")).status).toBe(400);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ realmKey: "" }),
    );
  });
});
