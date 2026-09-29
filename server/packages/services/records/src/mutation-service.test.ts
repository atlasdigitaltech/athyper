import { describe, expect, it, vi } from "vitest";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import { createInMemoryCommandExecutionStore } from "./in-memory-command-execution-store.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordMutationService } from "./mutation-service.js";
import {
  validateFieldWriteAuthorization,
  validateRecordInput,
} from "./field-validation.js";

const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "sample",
  planeKey: "neon",
  releaseId: "release",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: {
    schema: "shared",
    object: "sample",
    idField: "id",
    tenantField: "tenant_id",
    versionField: "version",
  },
  fields: [
    {
      key: "amount",
      storagePath: "amount",
      type: "money",
      required: false,
      writableOn: ["create", "patch"],
      writePermissionCode: "sample.amount.write",
    },
  ],
  operations: {
    create: { code: "create", permissionCode: "sample.create" },
    patch: { code: "patch", permissionCode: "sample.patch" },
    delete: { code: "delete", permissionCode: "sample.delete" },
    aggregate: { code: "aggregate", permissionCode: "sample.aggregate" },
  },
  aggregate: { collections: [] },
  // The installed backend test double declares support; only its truthiness is read here.
  authorization: {
    schemaVersion: 1,
  } as unknown as EntityRuntimeDescriptor["authorization"],
} satisfies EntityRuntimeDescriptor;
const context = {
  planeKey: "neon",
  realmKey: "athyper",
  tenantId: "tenant",
  principalId: "principal",
  authEpoch: 1,
  profileHash: "profile",
  requestId: "request",
  permissions: {
    planeKey: "neon",
    tenantId: "tenant",
    principalId: "principal",
    principalFingerprint: "fp",
    profileHash: "profile",
    schemaHash: "schema",
    resolvedAt: 1,
    allowed: [],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
  },
} satisfies VerifiedRequestContext;
const command = {
  context,
  entityCode: "sample",
  origin: "classic",
  validationMode: "strict",
  idempotencyKey: "sample-command-001",
} as const;

function fixture(
  metadata: MetadataReader = { getEntityDescriptor: async () => descriptor },
  authorizer?: Authorizer,
) {
  const persistence = createInMemoryRecordPersistence();
  const audit = vi.fn(async () => undefined);
  const outbox = vi.fn(async () => undefined);
  const mutations = createRecordMutationService({
    metadata,
    authorizer: authorizer ?? {
      entityDescriptorSupported: () => true,
      authorize: async () => ({ allowed: true }),
    },
    repository: persistence.repository,
    transactions: persistence.transactions,
    aggregateExecutor: { execute: async () => null },
    commandExecutions: createInMemoryCommandExecutionStore(),
    audit: {
      record: async (input, transaction) => {
        await audit();
        return {
          ...input,
          id: "event",
          createdAt: new Date(),
          tenantId: context.tenantId,
          eventCode: "test",
          action: "test",
          outcome: "success",
          actor: { kind: "user", principalId: context.principalId },
        } as never;
      },
    },
    outbox: {
      append: async () => {
        await outbox();
      },
    },
  });
  return { mutations, audit, outbox };
}

describe("record mutation boundaries", () => {
  it("accepts finite money and rejects invalid money", () => {
    expect(validateRecordInput(descriptor, "create", { amount: 12.5 })).toEqual(
      {},
    );
    expect(
      validateRecordInput(descriptor, "create", {
        amount: Number.POSITIVE_INFINITY,
      }).amount?.[0]?.code,
    ).toBe("FIELD_TYPE_INVALID");
  });

  it("uses tenant and operation for field-write decisions", async () => {
    const authorize = vi.fn(async () => ({ allowed: true }) as const);
    await validateFieldWriteAuthorization(
      { authorize },
      context,
      descriptor,
      { amount: 2 },
      "patch",
    );
    expect(authorize).toHaveBeenCalledWith({
      context,
      permissionCode: "sample.amount.write",
      resource: {
        tenantId: "tenant",
        entityCode: "sample",
        operationKey: "patch",
        field: "amount",
      },
    });
  });

  it("propagates metadata failures but treats a missing descriptor as unavailable", async () => {
    const outage = fixture({
      getEntityDescriptor: async () => {
        throw Error("database down");
      },
    });
    await expect(
      outage.mutations.create({ ...command, input: {} }),
    ).rejects.toThrow("database down");
    const missing = fixture({ getEntityDescriptor: async () => null });
    await expect(
      missing.mutations.create({ ...command, input: {} }),
    ).resolves.toEqual({ kind: "CapabilityUnavailable", entityCode: "sample" });
  });

  it("rejects an empty patch without audit or outbox effects", async () => {
    const { mutations, audit, outbox } = fixture();
    await expect(
      mutations.patch({
        ...command,
        recordId: "record",
        expectedVersion: 1,
        input: {},
      }),
    ).resolves.toMatchObject({
      kind: "FieldsNotWritable",
      fields: { _record: [{ code: "EMPTY_PATCH" }] },
    });
    expect(audit).not.toHaveBeenCalled();
    expect(outbox).not.toHaveBeenCalled();
  });

  it("rechecks delete and aggregate authorization before execution", async () => {
    const calls = new Map<string, number>();
    const authorizer: Authorizer = {
      entityDescriptorSupported: () => true,
      authorize: async ({ permissionCode }) => {
        const count = (calls.get(permissionCode) ?? 0) + 1;
        calls.set(permissionCode, count);
        return count === 1
          ? { allowed: true }
          : { allowed: false, reason: "revoked" };
      },
    };
    const { mutations, audit, outbox } = fixture(undefined, authorizer);
    await expect(
      mutations.delete({ ...command, recordId: "record", expectedVersion: 1 }),
    ).resolves.toMatchObject({ kind: "Forbidden" });
    await expect(
      mutations.mutateAggregate({
        ...command,
        recordId: "record",
        expectedVersion: 1,
        changes: { header: { patch: {} }, collections: {} },
        planHash: "plan",
      }),
    ).resolves.toMatchObject({ kind: "Forbidden" });
    expect(calls.get("sample.delete")).toBe(2);
    expect(calls.get("sample.aggregate")).toBe(2);
    expect(audit).not.toHaveBeenCalled();
    expect(outbox).not.toHaveBeenCalled();
  });

  it("does not create a record after field-write permission is revoked", async () => {
    let fieldChecks = 0;
    const authorizer: Authorizer = {
      entityDescriptorSupported: () => true,
      authorize: async ({ permissionCode }) => permissionCode === "sample.amount.write" && ++fieldChecks > 1
        ? { allowed: false, reason: "revoked" }
        : { allowed: true },
    };
    const { mutations, audit, outbox } = fixture(undefined, authorizer);
    await expect(mutations.create({ ...command, input: { amount: 12.5 } })).resolves.toMatchObject({ kind: "Forbidden" });
    expect(fieldChecks).toBe(2);
    expect(audit).not.toHaveBeenCalled();
    expect(outbox).not.toHaveBeenCalled();
  });
});
