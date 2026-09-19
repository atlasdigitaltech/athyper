import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import type { PushPlatform } from "@athyper/server-contract-notifications";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerServices } from "../register-services.js";

const servers: ReturnType<typeof createServer>[] = [];
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

describe("notification host composition", () => {
  it.each([
    [[], "key", false],
    [["android", "ios"], "key", false],
    [["web"], undefined, false],
    [["web"], "key", true],
  ] as const)(
    "reports web push for transports %j and public key %s",
    async (platforms, publicKey, available) => {
      const tenantId = "11111111-1111-4111-8111-111111111111";
      const principalId = "22222222-2222-4222-8222-222222222222";
      const issuer = "https://iam.example/realms/athyper";
      const token: VerifiedToken = {
        issuer,
        subject: principalId,
        audience: ["athyper-api"],
        claims: {
          iss: issuer,
          sub: principalId,
          aud: "athyper-api",
          tenant_id: tenantId,
          principal_id: principalId,
          auth_epoch: 1,
          azp: "studio-web",
          resource_access: { "studio-web": { roles: ["AUTHORIZED"] } },
        },
      };
      const container = createContainer();
      const config = loadConfig();
      if (platforms.length)
        container.adapters.pushTransports.push({
          platforms: platforms as readonly PushPlatform[],
          send: vi.fn(),
        });
      registerPlatform(
        container,
        {
          ...config,
          env: "production",
          iam: {
            ...config.iam,
            defaultRealmKey: "athyper",
            claimContextMode: "on",
          },
        },
        {
          tokenVerifier: { verify: async () => token },
          resolveIdentityContext: async () => ({
            tenantId,
            principalId,
            authEpoch: 1,
          }),
          auditSink: createInMemoryAuditSink(),
        },
      );
      registerServices(
        container,
        {
          metadata: { getEntityDescriptor: vi.fn() },
        },
        {
          ...config,
          webPush: { subject: undefined, privateKey: undefined, publicKey },
          wave0: { ...config.wave0, controlAdminRuntimeCommandsEnabled: false },
        },
      );
      const app = createHttpApplication({
        configure(application) {
          for (const register of container.platform.httpRegistrars)
            register(application);
        },
      });
      const server = createServer(app);
      servers.push(server);
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No server address");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/notifications/push-configuration`,
        {
          headers: {
            authorization: "Bearer signed-token",
            "x-plane": "studio",
          },
        },
      );
      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body).toEqual({
        webPush: { available, ...(available ? { publicKey } : {}) },
      });
    },
  );
});
