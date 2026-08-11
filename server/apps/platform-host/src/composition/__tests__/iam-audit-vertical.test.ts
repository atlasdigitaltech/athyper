import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { createHttpApplication } from "@athyper/server-runtime-http";

import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe("IAM plus Audit vertical", () => {
  it("authenticates through the host route and emits an audit event", async () => {
    const container = createContainer();
    const sink = createInMemoryAuditSink();
    const token: VerifiedToken = {
      issuer: "https://iam.example/realms/athyper",
      subject: "subject-1",
      audience: ["athyper-api"],
      claims: {
        iss: "https://iam.example/realms/athyper", sub: "subject-1", aud: "athyper-api",
        tenant_id: "tenant-1", principal_id: "principal-1", auth_epoch: 2,
        azp: "neon-web", permissions: ["iam.profile.read"],
        resource_access: { "neon-web": { roles: ["AUTHORIZED"] } },
      },
    };
    const config = loadConfig();
    registerPlatform(container, {
      ...config,
      env: "production",
      iam: { ...config.iam, defaultRealmKey: "athyper", claimContextMode: "on" },
    }, {
      tokenVerifier: { verify: async (value) => {
        if (value !== "signed-token") throw new Error("invalid");
        return token;
      } },
      auditSink: sink,
    });
    const app = createHttpApplication({
      configure(application) {
        for (const register of container.platform.httpRegistrars) register(application);
      },
    });
    const baseUrl = await listen(app);
    const response = await fetch(`${baseUrl}/api/iam/me`, {
      headers: { authorization: "Bearer signed-token", "x-plane": "neon", "x-request-id": "request-1" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1",
      permissions: ["iam.profile.read"], requestId: "request-1",
    });
    const auditStatus = await fetch(`${baseUrl}/api/audit/status`, {
      headers: { authorization: "Bearer signed-token", "x-plane": "neon", "x-request-id": "request-2" },
    });
    expect(auditStatus.status).toBe(200);
    await expect(auditStatus.json()).resolves.toEqual({ status: "available" });
    expect(sink.events).toHaveLength(2);
    expect(sink.events[0]).toMatchObject({
      eventCode: "iam.authentication.succeeded", tenantId: "tenant-1", requestId: "request-1",
    });
  });

  it("exposes the authenticated provisioning request contract", async () => {
    const container = createContainer();
    const request = vi.fn(async (input: { idempotencyKey?: string }) => input.idempotencyKey ? ({ kind: "Created" as const, request: {
      id: "10000000-0000-4000-8000-000000000003", idempotencyKey: "iam-provision-0001",
      requestFingerprint: "a".repeat(64), tenantId: "tenant-1", realmKey: "athyper",
      normalizedIdentifier: "user@example.com", displayIdentifier: "user@example.com",
      planes: ["neon"] as const, state: "requested" as const, version: 1,
    } }) : ({ kind: "IdempotencyConflict" as const, reason: "required" as const }));
    const token: VerifiedToken = { issuer: "https://iam.example/realms/athyper", subject: "subject-1", audience: ["athyper-api"], claims: {
      iss: "https://iam.example/realms/athyper", sub: "subject-1", aud: "athyper-api", tenant_id: "tenant-1",
      principal_id: "principal-1", azp: "studio-web", permissions: ["iam.provisioning.create"], resource_access: { "studio-web": { roles: ["AUTHORIZED"] } },
    } };
    const config = loadConfig();
    registerPlatform(container, { ...config, env: "production", iam: { ...config.iam, defaultRealmKey: "athyper", claimContextMode: "enforce" } }, {
      tokenVerifier: { verify: async () => token }, auditSink: createInMemoryAuditSink(), provisioning: { request } as never,
    });
    const app = createHttpApplication({ configure(application) { for (const register of container.platform.httpRegistrars) register(application); } });
    const baseUrl = await listen(app);
    const response = await fetch(`${baseUrl}/api/iam/provisioning-requests`, { method: "POST", headers: {
      authorization: "Bearer signed-token", "x-plane": "studio", "content-type": "application/json", "idempotency-key": "iam-provision-0001",
    }, body: JSON.stringify({ identifier: "user@example.com", planes: ["neon"] }) });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ kind: "Created", request: { normalizedIdentifier: "user@example.com" } });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "iam-provision-0001", identifier: "user@example.com", planes: ["neon"] }));
    const missingKey = await fetch(`${baseUrl}/api/iam/provisioning-requests`, { method: "POST", headers: {
      authorization: "Bearer signed-token", "x-plane": "studio", "content-type": "application/json",
    }, body: JSON.stringify({ identifier: "user@example.com", planes: ["neon"] }) });
    expect(missingKey.status).toBe(428);
  });
});

async function listen(app: ReturnType<typeof createHttpApplication>): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}
