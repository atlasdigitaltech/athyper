import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import type { PolicyDefinition } from "@athyper/server-contract-policy";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerServices } from "../register-services.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe("Policy host vertical", () => {
  it("authenticates and evaluates a local policy through host composition", async () => {
    const tenantId = "11111111-1111-4111-8111-111111111111";
    const principalId = "22222222-2222-4222-8222-222222222222";
    const token: VerifiedToken = { issuer: "https://iam.example/realms/athyper", subject: principalId, audience: ["athyper-api"], claims: { iss: "https://iam.example/realms/athyper", sub: principalId, aud: "athyper-api", tenant_id: tenantId, principal_id: principalId, auth_epoch: 1, azp: "mesh-web", permissions: ["policy.evaluate"], resource_access: { "mesh-web": { roles: ["AUTHORIZED"] } } } };
    const definitions: readonly PolicyDefinition[] = [{ id: "33333333-3333-4333-8333-333333333333", entityType: "network_relationship", name: "Restricted network", priority: 10, evaluationMode: "first_match", effectiveFrom: "2026-01-01", versionNo: 1, rules: [{ id: "44444444-4444-4444-8444-444444444444", priority: 10, condition: { "==": [{ var: "risk" }, "blocked"] }, action: "deny", actionConfig: {}, explanation: "Network is blocked", metadata: {} }] }];
    const container = createContainer();
    const audit = createInMemoryAuditSink();
    const config = loadConfig();
    registerPlatform(container, { ...config, env: "production", iam: { ...config.iam, defaultRealmKey: "athyper", claimContextMode: "on" } }, { tokenVerifier: { verify: async () => token }, resolveIdentityContext: async () => ({ tenantId, principalId, authEpoch: 1 }), auditSink: audit });
    registerServices(container, { metadata: { getEntityDescriptor: async () => null }, policyRepository: { findActive: async () => definitions } as never, transactions: { run: async (_plane, _actor, work) => work({}) } as never });
    const app = createHttpApplication({ configure(application) { for (const register of container.platform.httpRegistrars) register(application); } });
    const baseUrl = await listen(app);
    const response = await fetch(`${baseUrl}/api/policy/evaluate`, { method: "POST", headers: { authorization: "Bearer signed-token", "x-plane": "mesh", "content-type": "application/json" }, body: JSON.stringify({ entityType: "network_relationship", facts: { risk: "blocked" } }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ action: "deny", permitted: false, winning: { explanation: "Network is blocked" } });
    expect(audit.events.some((event) => event.eventCode === "policy.evaluation.completed")).toBe(true);
    const invalid = await fetch(`${baseUrl}/api/policy/evaluate`, { method: "POST", headers: { authorization: "Bearer signed-token", "x-plane": "mesh", "content-type": "application/json" }, body: JSON.stringify({ entityType: "network_relationship", facts: {}, policyDefinitionIds: ["not-a-uuid"] }) });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: "INVALID_POLICY_IDS" });
  });
});

async function listen(app: ReturnType<typeof createHttpApplication>): Promise<string> { const server = createServer(app); servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("server address unavailable"); return `http://127.0.0.1:${address.port}`; }
