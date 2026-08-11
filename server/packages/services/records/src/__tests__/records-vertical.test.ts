import { describe, expect, it } from "vitest";
import type { AuditEvent, AuditRecordInput } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxEventInput } from "@athyper/server-contract-events";
import type { EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import {
  createInMemoryRecordPersistence,
  createInMemoryCommandExecutionStore,
  createRecordMutationService,
  createRecordQueryService,
} from "../index.js";

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
    { key: "code", storagePath: "code", type: "string", required: true, writableOn: ["create"], filterable: true, sortable: true, validation: { minLength: 2, maxLength: 63, pattern: "^[A-Z][A-Z0-9_.-]+$" } },
    { key: "name", storagePath: "name", type: "string", required: true, writableOn: ["create", "patch"], searchable: true, sortable: true },
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

const permissions = Object.values(descriptor.operations).map((operation) => operation.permissionCode).concat("master.business_partner.activate");
const context: VerifiedRequestContext = {
  planeKey: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 1,
  profileHash: "profile", requestId: "request-1",
  permissions: { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "fp", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: permissions, denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};
const metadata: MetadataReader = { getEntityDescriptor: async (_context, code) => code === descriptor.entityCode ? descriptor : null };
const authorizer: Authorizer = { authorize: async ({ context: value, permissionCode }) => value.permissions.allowed.includes(permissionCode) ? { allowed: true } : { allowed: false, reason: "missing_permission" } };

describe("descriptor-driven Records vertical", () => {
  it("executes create, patch, lifecycle, and read with transactional side effects", async () => {
    const persistence = createInMemoryRecordPersistence();
    const audit: AuditEvent[] = [];
    const outbox: OutboxEventInput[] = [];
    const mutations = createRecordMutationService({
      metadata, authorizer, repository: persistence.repository, transactions: persistence.transactions,
      commandExecutions: createInMemoryCommandExecutionStore(),
      audit: { record: async (input, transaction) => { const event = eventFrom(input, audit.length + 1); transaction?.onCommit(() => audit.push(event)); return event; } },
      outbox: { append: async (event, transaction) => { transaction?.onCommit(() => outbox.push(event)); } },
    });
    const queries = createRecordQueryService({ metadata, authorizer, repository: persistence.repository, transactions: persistence.transactions });

    const createdCommand = { context, entityCode: "business_partner", input: { code: "ACME", name: "Acme", status: "draft" }, origin: "classic", validationMode: "strict", idempotencyKey: "records-create-0001" } as const;
    const created = await mutations.create(createdCommand);
    expect(created).toMatchObject({ kind: "Committed", action: "create", version: 1 });
    if (created.kind !== "Committed") throw new Error("create failed");
    const replay = await mutations.create(createdCommand);
    expect(replay).toMatchObject({ kind: "Committed", recordId: created.recordId, replayed: true });
    await expect(mutations.patch({ context, entityCode: "business_partner", recordId: created.recordId, input: { name: "Acme Ltd" }, origin: "classic", validationMode: "strict", idempotencyKey: "records-patch-no-version" })).resolves.toEqual({ kind: "VersionRequired" });
    const patched = await mutations.patch({ context, entityCode: "business_partner", recordId: created.recordId, input: { name: "Acme Ltd" }, expectedVersion: 1, origin: "classic", validationMode: "strict", idempotencyKey: "records-patch-000001" });
    expect(patched).toMatchObject({ kind: "Committed", version: 2 });
    const transitioned = await mutations.transition({ context, entityCode: "business_partner", recordId: created.recordId, transitionCode: "activate", input: {}, expectedVersion: 2, origin: "classic", validationMode: "strict", idempotencyKey: "records-transition-01" });
    expect(transitioned).toMatchObject({ kind: "Committed", action: "transition", version: 3, record: { status: "active" } });
    await expect(queries.get({ context, entityCode: "business_partner", recordId: created.recordId })).resolves.toMatchObject({ data: { code: "ACME", name: "Acme Ltd", status: "active", row_version: 3 } });
    expect(outbox.map((event) => event.eventType)).toEqual(["records.record.created", "records.record.patched", "records.record.transitioned"]);
    expect(audit).toHaveLength(3);
  });

  it("rolls back record state, outbox, audit, and command receipt when audit fails", async () => {
    const persistence = createInMemoryRecordPersistence();
    const audit: AuditEvent[] = [];
    const outbox: OutboxEventInput[] = [];
    const commandExecutions = createInMemoryCommandExecutionStore();
    let failAudit = true;
    const mutations = createRecordMutationService({ metadata, authorizer, repository: persistence.repository, transactions: persistence.transactions, commandExecutions,
      audit: { record: async (input, transaction) => { const event = eventFrom(input, 1); transaction?.onCommit(() => audit.push(event)); if (failAudit) throw new Error("audit unavailable"); return event; } },
      outbox: { append: async (event, transaction) => { transaction?.onCommit(() => outbox.push(event)); } } });
    const command = { context, entityCode: "business_partner", input: { code: "FAIL", name: "Failure", status: "draft" }, origin: "classic", validationMode: "strict", idempotencyKey: "records-rollback-001" } as const;
    await expect(mutations.create(command)).rejects.toThrow("audit unavailable");
    const queries = createRecordQueryService({ metadata, authorizer, repository: persistence.repository, transactions: persistence.transactions });
    await expect(queries.list({ context, entityCode: "business_partner", countMode: "exact" })).resolves.toMatchObject({ data: [], pagination: { total: 0 } });
    expect(outbox).toEqual([]);
    expect(audit).toEqual([]);
    failAudit = false;
    await expect(mutations.create(command)).resolves.toMatchObject({ kind: "Committed", replayed: false });
    expect(outbox).toHaveLength(1);
    expect(audit).toHaveLength(1);
  });

  it("enforces descriptor field rules before entering a transaction", async () => {
    const persistence = createInMemoryRecordPersistence();
    const mutations = createRecordMutationService({ metadata, authorizer, repository: persistence.repository, transactions: persistence.transactions, commandExecutions: createInMemoryCommandExecutionStore(), audit: { record: async (input) => eventFrom(input, 1) }, outbox: { append: async () => undefined } });
    await expect(mutations.create({ context, entityCode: "business_partner", input: { code: "bad", unknown: true }, origin: "classic", validationMode: "strict", idempotencyKey: "records-invalid-0001" })).resolves.toMatchObject({ kind: "FieldsNotWritable", fields: { code: expect.any(Array), name: expect.any(Array), status: expect.any(Array), unknown: expect.any(Array) } });
    await expect(mutations.create({ context, entityCode: "business_partner", input: { code: "OK", name: "No key", status: "draft" }, origin: "classic", validationMode: "strict" })).resolves.toEqual({ kind: "IdempotencyConflict", reason: "required" });
  });

  it("applies field authorization inside query projection and mutation admission", async () => {
    const secured: EntityRuntimeDescriptor = { ...descriptor, fields: [...descriptor.fields, { key: "taxId", storagePath: "tax_id", type: "string", required: false, writableOn: ["create", "patch"], filterable: true, readPermissionCode: "master.business_partner.tax_id.read", writePermissionCode: "master.business_partner.tax_id.write", classification: "sensitive_pii" }] };
    const securedMetadata: MetadataReader = { getEntityDescriptor: async () => secured };
    const persistence = createInMemoryRecordPersistence();
    persistence.seed(secured, context.tenantId, [{ id: "bp-1", tenant_id: context.tenantId, code: "ACME", name: "Acme", status: "active", row_version: 1, tax_id: "SECRET" }]);
    const queries = createRecordQueryService({ metadata: securedMetadata, authorizer, repository: persistence.repository, transactions: persistence.transactions });
    const detail = await queries.get({ context, entityCode: secured.entityCode, recordId: "bp-1" });
    expect(detail.data).not.toHaveProperty("taxId");
    await expect(queries.list({ context, entityCode: secured.entityCode, filters: [{ field: "taxId", operator: "eq", value: "SECRET" }] })).rejects.toThrow("not filterable");
    const mutations = createRecordMutationService({ metadata: securedMetadata, authorizer, repository: persistence.repository, transactions: persistence.transactions, commandExecutions: createInMemoryCommandExecutionStore(), audit: { record: async (input) => eventFrom(input, 1) }, outbox: { append: async () => undefined } });
    await expect(mutations.patch({ context, entityCode: secured.entityCode, recordId: "bp-1", input: { taxId: "NEW" }, expectedVersion: 1, origin: "classic", validationMode: "strict", idempotencyKey: "records-field-security-01" })).resolves.toMatchObject({ kind: "FieldsNotWritable", fields: { taxId: [{ code: "FIELD_WRITE_FORBIDDEN" }] } });
  });
});

function eventFrom(input: AuditRecordInput, sequence: number): AuditEvent { return { ...input, id: `audit-${sequence}`, occurredAt: "2026-08-09T00:00:00.000Z", severity: input.severity ?? "info" }; }
