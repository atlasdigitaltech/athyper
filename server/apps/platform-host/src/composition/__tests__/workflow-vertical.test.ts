import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import type { OutboxEventInput } from "@athyper/server-contract-events";
import type { EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { createInMemoryWorkflowPersistence } from "@athyper/server-platform-workflow";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerServices } from "../register-services.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe("Workflow host vertical", () => {
  it("authenticates an Athyper request and completes a descriptor-governed work item", async () => {
    const ids = { tenant: "11111111-1111-4111-8111-111111111111", principal: "22222222-2222-4222-8222-222222222222", source: "33333333-3333-4333-8333-333333333333", item: "44444444-4444-4444-8444-444444444444" };
    const permissions = ["create", "read", "claim", "complete", "cancel"].map((action) => `workflow.work_item.${action}`);
    const token: VerifiedToken = { issuer: "https://iam.example/realms/athyper", subject: ids.principal, audience: ["athyper-api"], claims: { iss: "https://iam.example/realms/athyper", sub: ids.principal, aud: "athyper-api", tenant_id: ids.tenant, principal_id: ids.principal, auth_epoch: 1, azp: "studio-web", permissions, resource_access: { "studio-web": { roles: ["AUTHORIZED"] } } } };
    const descriptor: EntityRuntimeDescriptor = { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "tenant_change", planeKey: "studio", releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64), storage: { schema: "control", object: "tenant_change", idField: "id", statusField: "status" }, fields: [], operations: {}, lifecycle: { transitions: [{ code: "approve", from: ["pending"], to: "approved", permissionCode: "control.tenant_change.approve" }] } };
    const metadata: MetadataReader = { getEntityDescriptor: async () => descriptor };
    const persistence = createInMemoryWorkflowPersistence({ createId: () => ids.item, now: () => new Date("2026-08-09T00:00:00.000Z") });
    const audit = createInMemoryAuditSink();
    const events: OutboxEventInput[] = [];
    const container = createContainer();
    const config = loadConfig();
    registerPlatform(container, { ...config, env: "production", iam: { ...config.iam, defaultRealmKey: "athyper", claimContextMode: "on" } }, { tokenVerifier: { verify: async () => token }, resolveIdentityContext: async () => ({ tenantId: ids.tenant, principalId: ids.principal, authEpoch: 1 }), auditSink: audit });
    registerServices(container, { metadata, workflowRepository: persistence.repository as never, workflowCommandExecutions: persistence.commandExecutions as never, transactions: persistence.transactions as never, outbox: { append: async (event) => { events.push(event); } } });
    const app = createHttpApplication({ configure(application) { for (const register of container.platform.httpRegistrars) register(application); } });
    const baseUrl = await listen(app);
    const headers = { authorization: "Bearer signed-token", "x-plane": "studio", "content-type": "application/json" };
    const createdResponse = await fetch(`${baseUrl}/api/workflow/work-items`, { method: "POST", headers, body: JSON.stringify({ workTypeCode: "approval", title: "Approve tenant change", sourceEntityCode: "tenant_change", sourceEntityId: ids.source, sourceActionCode: "approve", assigneePrincipalId: ids.principal }) });
    expect(createdResponse.status).toBe(201);
    const inboxResponse = await fetch(`${baseUrl}/api/workflow/inbox`, { headers });
    await expect(inboxResponse.json()).resolves.toMatchObject({ data: [{ id: ids.item, status: "open" }] });
    expect((await fetch(`${baseUrl}/api/workflow/work-items/${ids.item}/claim`, { method: "POST", headers, body: "{}" })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/workflow/work-items/${ids.item}/complete`, { method: "POST", headers, body: JSON.stringify({ outcome: { decision: "approved" } }) })).status).toBe(200);
    const actionHeaders = { ...headers, "idempotency-key": "claim-again" };
    // A stale keyed command remains a conflict when retried and emits no events.
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await fetch(`${baseUrl}/api/workflow/items/${ids.item}/actions/claim`, { method: "POST", headers: actionHeaders, body: JSON.stringify({ currentRowVersion: 1 }) })).status).toBe(409);
    }
    expect(events.map((event) => event.eventType)).toEqual(["workflow.work_item.created", "workflow.work_item.claimed", "workflow.work_item.completed"]);
    expect(audit.events.filter((event) => event.eventCode.startsWith("workflow.work_item."))).toHaveLength(3);
  });
});

async function listen(app: ReturnType<typeof createHttpApplication>): Promise<string> { const server = createServer(app); servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("server address unavailable"); return `http://127.0.0.1:${address.port}`; }
