import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { OutboxEventInput } from "@athyper/server-contract-events";
import type { AuditEvent } from "@athyper/server-contract-audit";
import type { EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { createInMemoryCommandExecutionStore, createInMemoryRecordPersistence, type MemoryRecordTransaction } from "@athyper/server-service-records";
import { createHttpApplication } from "@athyper/server-runtime-http";

import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerServices } from "../register-services.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "business_partner",
  planeKey: "neon",
  releaseId: "release-1",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id", versionField: "row_version", statusField: "status" },
  fields: [
    { key: "name", storagePath: "name", type: "string", required: true, writableOn: ["create", "patch"], searchable: true },
    { key: "status", storagePath: "status", type: "enum", required: true, writableOn: ["create"] },
    { key: "status_changed_at", storagePath: "status_changed_at", type: "datetime", required: false, writableOn: [] },
    { key: "status_changed_by", storagePath: "status_changed_by", type: "uuid", required: false, writableOn: [] },
  ],
  operations: {
    read: { code: "read", permissionCode: "master.business_partner.read" },
    create: { code: "create", permissionCode: "master.business_partner.create" },
    patch: { code: "patch", permissionCode: "master.business_partner.update" },
    delete: { code: "delete", permissionCode: "master.business_partner.delete" },
  },
  lifecycle: { transitions: [{ code: "activate", from: ["draft"], to: "active", permissionCode: "master.business_partner.activate" }] },
};

describe("Metadata plus Records host vertical", () => {
  it("authenticates and executes create, update, lifecycle, read, and delete routes", async () => {
    const permissions = ["read", "create", "update", "delete", "activate"].map((action) => `master.business_partner.${action}`);
    const token: VerifiedToken = {
      issuer: "https://iam.example/realms/athyper", subject: "subject-1", audience: ["athyper-api"],
      claims: { iss: "https://iam.example/realms/athyper", sub: "subject-1", aud: "athyper-api", tenant_id: "tenant-1", principal_id: "principal-1", auth_epoch: 1, azp: "neon-web", permissions, resource_access: { "neon-web": { roles: ["AUTHORIZED"] } } },
    };
    const container = createContainer();
    const audit = createInMemoryAuditSink();
    const config = loadConfig();
    registerPlatform(container, { ...config, env: "production", iam: { ...config.iam, defaultRealmKey: "athyper", claimContextMode: "on" } }, {
      tokenVerifier: { verify: async () => token }, auditSink: audit,
    });
    const persistence = createInMemoryRecordPersistence();
    const metadata: MetadataReader = { getEntityDescriptor: async (_coordinate, entityCode) => entityCode === descriptor.entityCode ? descriptor : null };
    const events: OutboxEventInput[] = [];
    registerServices(container, {
      metadata,
      repository: persistence.repository as never,
      transactions: persistence.transactions as never,
      commandExecutions: createInMemoryCommandExecutionStore() as never,
      outbox: { append: async (event) => { events.push(event); } },
    });
    const app = createHttpApplication({ configure(application) { for (const register of container.platform.httpRegistrars) register(application); } });
    const baseUrl = await listen(app);
    const headers = { authorization: "Bearer signed-token", "x-plane": "neon", "content-type": "application/json" };

    const createdResponse = await fetch(`${baseUrl}/api/records/business_partner`, { method: "POST", headers: { ...headers, "idempotency-key": "host-record-create-01" }, body: JSON.stringify({ name: "Acme", status: "draft" }) });
    expect(createdResponse.status, await createdResponse.clone().text()).toBe(201);
    const created = await createdResponse.json() as { recordId: string };
    const patchedResponse = await fetch(`${baseUrl}/api/records/business_partner/${created.recordId}`, { method: "PATCH", headers: { ...headers, "if-match": "1", "idempotency-key": "host-record-patch-001" }, body: JSON.stringify({ name: "Acme Ltd" }) });
    expect(patchedResponse.status).toBe(200);
    const transitionedResponse = await fetch(`${baseUrl}/api/records/business_partner/${created.recordId}/transitions/activate`, { method: "POST", headers: { ...headers, "if-match": "2", "idempotency-key": "host-record-transition" }, body: "{}" });
    expect(transitionedResponse.status).toBe(200);
    const readResponse = await fetch(`${baseUrl}/api/records/business_partner/${created.recordId}`, { headers });
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toMatchObject({ data: { name: "Acme Ltd", status: "active", row_version: 3 } });
    const deletedResponse = await fetch(`${baseUrl}/api/records/business_partner/${created.recordId}`, { method: "DELETE", headers: { ...headers, "if-match": "3", "idempotency-key": "host-record-delete-01" } });
    expect(deletedResponse.status).toBe(200);
    expect(events.map((event) => event.eventType)).toEqual(["records.record.created", "records.record.patched", "records.record.transitioned", "records.record.deleted"]);
    expect(audit.events.filter((event) => event.eventCode.startsWith("records.record."))).toHaveLength(4);
  });

  it("rolls back authenticated state, outbox, audit, and idempotency when audit persistence fails", async () => {
    const permissions = ["read", "create"].map((action) => `master.business_partner.${action}`);
    const token: VerifiedToken = {
      issuer: "https://iam.example/realms/athyper", subject: "subject-1", audience: ["athyper-api"],
      claims: { iss: "https://iam.example/realms/athyper", sub: "subject-1", aud: "athyper-api", tenant_id: "tenant-1", principal_id: "principal-1", auth_epoch: 1, azp: "neon-web", permissions, resource_access: { "neon-web": { roles: ["AUTHORIZED"] } } },
    };
    const container = createContainer();
    const persistedAudit: AuditEvent[] = [];
    let rejectRecordAudit = true;
    registerPlatform(container, { ...loadConfig(), env: "production", iam: { ...loadConfig().iam, defaultRealmKey: "athyper", claimContextMode: "on" } }, {
      tokenVerifier: { verify: async () => token },
      auditSink: { async append(event, transaction) {
        if (transaction) {
          (transaction as MemoryRecordTransaction).onCommit(() => persistedAudit.push(event));
          if (rejectRecordAudit && event.eventCode === "records.record.created") throw new Error("audit unavailable");
        }
      } },
    });
    const persistence = createInMemoryRecordPersistence();
    const outbox: OutboxEventInput[] = [];
    registerServices(container, {
      metadata: { getEntityDescriptor: async (_coordinate, entityCode) => entityCode === descriptor.entityCode ? descriptor : null },
      repository: persistence.repository as never,
      transactions: persistence.transactions as never,
      commandExecutions: createInMemoryCommandExecutionStore() as never,
      outbox: { append: async (event, transaction) => { (transaction as unknown as MemoryRecordTransaction).onCommit(() => outbox.push(event)); } },
    });
    const app = createHttpApplication({ configure(application) { for (const register of container.platform.httpRegistrars) register(application); } });
    const baseUrl = await listen(app);
    const headers = { authorization: "Bearer signed-token", "x-plane": "neon", "content-type": "application/json", "idempotency-key": "host-atomic-rollback" };
    const body = JSON.stringify({ name: "Rollback", status: "draft" });

    const failed = await fetch(`${baseUrl}/api/records/business_partner`, { method: "POST", headers, body });
    expect(failed.status, await failed.clone().text()).toBe(500);
    expect(failed.headers.get("content-type")).toContain("application/problem+json");
    const listed = await fetch(`${baseUrl}/api/records/business_partner`, { headers: { authorization: headers.authorization, "x-plane": headers["x-plane"] } });
    await expect(listed.json()).resolves.toMatchObject({ data: [] });
    expect(outbox).toEqual([]);
    expect(persistedAudit).toEqual([]);

    rejectRecordAudit = false;
    const retried = await fetch(`${baseUrl}/api/records/business_partner`, { method: "POST", headers, body });
    expect(retried.status).toBe(201);
    await expect(retried.json()).resolves.toMatchObject({ kind: "Committed", replayed: false });
    expect(outbox).toHaveLength(1);
    expect(persistedAudit).toHaveLength(1);
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
