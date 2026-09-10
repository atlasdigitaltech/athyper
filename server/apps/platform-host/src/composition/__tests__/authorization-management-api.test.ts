import { createServer } from "node:http";
import { expect, it } from "vitest";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerServices } from "../register-services.js";

it("registers configured authorization status without injected management dependencies and keeps writes disabled", async () => {
  const config = loadConfig();
  config.wave0.authorizationManagementRoutesEnabled = true;
  config.wave0.authorizationManagementMutationsEnabled = false;
  const container = createContainer();
  registerPlatform(
    container,
    {
      ...config,
      env: "production",
      iam: { ...config.iam, claimContextMode: "on" },
    },
    {
      tokenVerifier: {
        verify: async () => ({
          issuer: "https://iam.example/realms/athyper",
          subject: "subject",
          audience: ["athyper-api"],
          claims: {
            iss: "https://iam.example/realms/athyper",
            sub: "subject",
            aud: "athyper-api",
            tenant_id: "tenant",
            principal_id: "principal",
            auth_epoch: 1,
            azp: "studio-web",
            permissions: [
              "authorization.management.read",
              "authorization.management.manage",
            ],
            resource_access: { "studio-web": { roles: ["AUTHORIZED"] } },
          },
        }),
      },
      resolveIdentityContext: async () => ({
        tenantId: "tenant",
        principalId: "principal",
        authEpoch: 1,
      }),
    },
  );
  registerServices(container, { metadata: { getEntityDescriptor: async () => null } }, config);
  const app = createHttpApplication({
    configure(application) {
      for (const register of container.platform.httpRegistrars)
        register(application);
    },
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing listener");
    const url = `http://127.0.0.1:${address.port}/api/control-admin/authorization`;
    const headers = {
      authorization: "Bearer fixture",
      "x-plane": "studio",
      "content-type": "application/json",
    };
    const status = await fetch(url, { headers });
    expect(status.status, await status.clone().text()).toBe(200);
    expect(await status.json()).toMatchObject({
      mutationsEnabled: false,
      writerSwitch: { approved: false, targetWritable: false },
    });
    const mutation = await fetch(`${url}/manage`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "role.create",
        commandId: "fixture-command",
        idempotencyKey: "fixture-idempotency",
        payload: { code: "fixture" },
      }),
    });
    expect(mutation.status).toBe(403);
    expect(await mutation.json()).toMatchObject({
      code: "AUTHZ_MUTATIONS_DISABLED",
    });
    expect((await fetch(url)).status).toBe(401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
