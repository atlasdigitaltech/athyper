import { describe, expect, it, vi } from "vitest";

import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { hydrateExecutionDescriptor } from "@athyper/svc-metadata";

import { createEntityMutationService, mutationHash } from "../mutation/entity-mutation.service.js";
import { mapMutationResultToHttp } from "../mutation/entity-mutation-http.js";

function context(allowed: string[] = ["company_code.create", "company_code.update"]): VerifiedRequestContext {
  return {
    planeKey: "neon",
    realmKey: "athyper",
    tenantId: "00000000-0000-4000-8000-000000000001",
    principalId: "00000000-0000-4000-8000-000000000002",
    requestId: "request-1",
    idempotencyKey: "mutation-1",
    permissions: {
      planeKey: "neon",
      tenantId: "00000000-0000-4000-8000-000000000001",
      principalId: "00000000-0000-4000-8000-000000000002",
      principalFingerprint: "principal",
      allowed: new Set(allowed),
      denied: new Set(),
      planLocked: new Set(),
      planeExcluded: new Set(),
      entries: new Map(),
      profileHash: "profile",
      schemaHash: "schema",
      resolvedAt: Date.now(),
    },
  };
}

function capability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entityCode: "company_code",
    renderer: "master",
    mutation: {
      create: { enabled: true, kind: "generic", permissionCode: "company_code.create" },
      update: { enabled: true, kind: "generic", permissionCode: "company_code.update" },
      delete: { enabled: false, kind: "disabled", disabledReason: "operation_missing" },
    },
    deletionMode: "prohibited",
    collections: [],
    handlers: {},
    write: {
      entityVersionId: "version-1",
      fields: [{
        name: "name",
        columnName: "name",
        dataType: "text",
        origin: "user",
        writable: { create: true, update: true },
        required: { create: true, update: false },
        computed: false,
        readOnly: false,
        systemManaged: false,
        systemOrigin: false,
        writeOnce: false,
        statusLimited: false,
        editableInStatuses: [],
      }],
    },
    ...overrides,
  };
}

function resolverDb(manifest: Record<string, unknown>): any {
  const row = {
    compiled_json: { capability_manifest: manifest },
    table_schema: "master",
    table_name: "company_code",
    concurrency_policy: {},
    create_mode: "FORM_ONLY",
  };
  const chain: Record<string, any> = {};
  for (const method of ["innerJoin", "select", "where"]) chain[method] = () => chain;
  chain.executeTakeFirst = async () => row;
  return {
    selectFrom: () => chain,
    transaction: () => ({ execute: async () => { throw new Error("transaction should not be reached"); } }),
  };
}

function testService(manifest: Record<string, any>, extra: Record<string, unknown> = {}) {
  const fields = manifest.write.fields.map((field: Record<string, any>) => ({
    name: field.name, column: field.columnName, dataType: field.dataType, coercion: "scalar",
    required: field.required.create, searchable: false, filterable: false, sortable: field.name === "id",
    computed: field.computed, readOnly: field.readOnly, writeOnce: field.writeOnce,
    systemManaged: field.systemManaged, createWritable: field.writable.create,
    updateWritable: field.writable.update, createRequired: field.required.create,
    editableInStatuses: field.editableInStatuses,
  }));
  for (const system of ["id", "tenant_id", "row_version", "updated_at", "updated_by"]) {
    if (!fields.some((field: Record<string, unknown>) => field.name === system)) {
      fields.push({
        name: system, column: system, dataType: system === "row_version" ? "integer" : "text", coercion: "scalar",
        required: false, searchable: false, filterable: false, sortable: system === "id", computed: false,
        readOnly: true, writeOnce: false, systemManaged: true, createWritable: false, updateWritable: false,
        createRequired: false, editableInStatuses: [],
      });
    }
  }
  const descriptor = hydrateExecutionDescriptor({
    schemaVersion: 1,
    identity: { entityCode: manifest.entityCode, entityVersionId: manifest.write.entityVersionId, versionHash: "v1", compiledHash: "a".repeat(64), entityClass: String(manifest.renderer).toUpperCase() },
    storage: { schema: "master", table: manifest.entityCode, primaryKey: "id", tenantColumn: "tenant_id", rowVersionColumn: "row_version", backingType: "table" },
    fields,
    read: { projection: fields.map((field: Record<string, unknown>) => field.name), searchableFields: [], filterableFields: [], defaultSort: [{ field: "id", direction: "asc", nulls: "last" }], stableTieBreaker: "id", naturalKeyFields: [] },
    write: {
      create: { mode: "FORM_ONLY", idempotencyRequired: false, numberingStrategy: "none" },
      mutations: manifest.mutation, arrayFields: [], jsonFields: [],
      concurrency: { strategy: "version", rollout: "observe", rowVersionField: "row_version", lockRequired: false },
      deletionMode: manifest.deletionMode,
    },
    relations: (manifest.collections ?? []).map((relation: Record<string, any>) => ({ ...relation, kind: "collection" })),
    ...(manifest.lifecycle ? { lifecycle: { statusField: manifest.lifecycle.statusField, editableStatuses: manifest.lifecycle.editableStatuses, states: manifest.lifecycle.states } } : {}),
    policy: { governanceLevel: "tenant", securityTier: "internal", mutability: "mutable", dataPolicy: manifest.deletionPolicy ?? {}, degradedFeatures: [] },
    handlers: { ...manifest.handlers, collectionHandlers: [], domainHooks: [] },
  });
  return createEntityMutationService({
    db: resolverDb(manifest),
    executionDescriptorProvider: { get: async () => ({ descriptor, serialized: {} as never, generation: "1", cacheState: "L1" as const }) },
    ...extra,
  });
}

describe("EntityMutationService transport-independent command boundary", () => {
  it("prepares deterministic idempotency hashes independent of object key order", () => {
    expect(mutationHash("patch", "company_code", "record-1", 2, {
      name: "MY01", metadata: { region: "APAC", active: true },
    })).toBe(mutationHash("patch", "company_code", "record-1", 2, {
      metadata: { active: true, region: "APAC" }, name: "MY01",
    }));
  });

  it("shadow-validates PATCH fields through the descriptor without opening a transaction", async () => {
    const service = testService(capability());
    await expect(service.validatePatch({
      context: context(), entityCode: "company_code", recordId: "record-1",
      input: { unknown_field: "x" }, expectedVersion: 1, idempotencyKey: "patch-shadow-1",
      origin: "classic", validationMode: "strict",
    })).resolves.toEqual({ kind: "FieldsNotWritable", fields: { unknown_field: "FIELD_NOT_REGISTERED" } });
  });

  it("authorizes from VerifiedRequestContext without an Express request", async () => {
    const service = testService(capability());
    const result = await service.create({
      context: context([]),
      entityCode: "company_code",
      input: { name: "MY01" },
      idempotencyKey: "import-1",
      origin: "import",
      validationMode: "strict",
    });
    expect(result).toEqual({ kind: "Forbidden", permissionCode: "company_code.create" });
  });

  it("validates every supplied field in strict import/job mode", async () => {
    const service = testService(capability());
    const result = await service.create({
      context: context(),
      entityCode: "company_code",
      input: { unknown_field: "x" },
      idempotencyKey: "job-1",
      origin: "job",
      validationMode: "strict",
    });
    expect(result).toEqual({
      kind: "FieldsNotWritable",
      fields: { unknown_field: "FIELD_NOT_REGISTERED" },
    });
  });

  it("rejects a classic command against a workspace binding", async () => {
    const manifest = capability({
      renderer: "document",
      mutation: {
        create: { enabled: true, kind: "workspace", permissionCode: "company_code.create" },
        update: { enabled: true, kind: "workspace", permissionCode: "company_code.update" },
        delete: { enabled: false, kind: "disabled" },
        aggregate: { enabled: true, kind: "workspace" },
      },
    });
    const service = testService(manifest);
    const result = await service.create({
      context: context(), entityCode: "company_code", input: { name: "MY01" },
      idempotencyKey: "classic-1", origin: "classic", validationMode: "strict",
    });
    expect(result).toMatchObject({ kind: "IncompatibleAction", action: "create" });
  });

  it("fails closed when metadata names an unregistered mutation handler", async () => {
    const service = testService(capability({
      handlers: { mutationHandler: "MissingMutationHandler" },
    }));
    const result = await service.create({
      context: context(), entityCode: "company_code", input: { name: "MY01" },
      origin: "job", validationMode: "strict", idempotencyKey: "handler-1",
    });
    expect(result).toEqual({ kind: "CapabilityUnavailable", entityCode: "company_code" });
  });

  it("dispatches the canonical aggregate change set through the compiled workspace handler", async () => {
    const aggregateHandler = vi.fn(async () => ({
      kind: "Committed" as const,
      action: "aggregate" as const,
      entityCode: "purchase_invoice",
      recordId: "record-1",
      record: { etag: "2" },
      replayed: false,
    }));
    const documentCapability = capability({
      entityCode: "purchase_invoice",
      renderer: "document",
      mutation: {
        create: { enabled: false, kind: "disabled" },
        update: { enabled: false, kind: "disabled" },
        delete: { enabled: false, kind: "disabled" },
        aggregate: { enabled: true, kind: "workspace", handler: "DocumentWorkspaceAggregateHandler" },
      },
      deletionMode: "lifecycle_only",
      collections: [{
        name: "lines", targetEntity: "purchase_invoice_line", ownership: "foreign_key",
        foreignKey: "purchase_invoice_id", mutationOwner: "workspace", versionStrategy: "parent_version",
        allowedActions: { create: true, update: true, delete: true, replace: false },
      }],
    });
    const service = testService(documentCapability, {
      handlers: { aggregateBoundary: new Map([["DocumentWorkspaceAggregateHandler", aggregateHandler]]) },
    });
    const command = {
      context: context(), entityCode: "purchase_invoice", recordId: "record-1",
      expectedVersion: 1, idempotencyKey: "aggregate-1", origin: "workspace" as const,
      validationMode: "strict" as const, planHash: "plan-1",
      changes: {
        header: { patch: { supplier_id: "s1" } },
        collections: { lines: { update: [{ id: "line-1", patch: { quantity: 2 } }] } },
      },
    };
    await expect(service.mutateAggregate(command)).resolves.toMatchObject({ kind: "Committed", action: "aggregate" });
    expect(aggregateHandler).toHaveBeenCalledWith(expect.objectContaining({
      ...command,
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it("rejects generic document create at the service boundary", async () => {
    const service = testService(capability({
      entityCode: "purchase_invoice",
      renderer: "document",
      mutation: {
        create: { enabled: true, kind: "generic", permissionCode: "company_code.create" },
        update: { enabled: true, kind: "generic", permissionCode: "company_code.update" },
        delete: { enabled: false, kind: "disabled" },
        aggregate: { enabled: true, kind: "workspace", handler: "DocumentWorkspaceAggregateHandler" },
      },
    }));
    await expect(service.create({
      context: context(), entityCode: "purchase_invoice", input: { name: "PI" },
      origin: "classic", validationMode: "strict", idempotencyKey: "pi-create-1",
    })).resolves.toMatchObject({ kind: "IncompatibleAction", action: "create" });
  });

  it("rejects every public ledger CRUD command even if invalid metadata enables bindings", async () => {
    const service = testService(capability({
      entityCode: "journal_entry",
      renderer: "ledger",
      mutation: {
        create: { enabled: true, kind: "generic", permissionCode: "company_code.create" },
        update: { enabled: true, kind: "generic", permissionCode: "company_code.update" },
        delete: { enabled: true, kind: "generic", permissionCode: "company_code.update" },
      },
      deletionMode: "hard_delete",
    }));
    const [create, patch, remove] = await Promise.all([
      service.create({
        context: context(), entityCode: "journal_entry", input: { name: "JE" },
        origin: "classic", validationMode: "strict", idempotencyKey: "ledger-create-1",
      }),
      service.patch({
        context: context(), entityCode: "journal_entry", recordId: "entry-1", input: { name: "JE" },
        expectedVersion: 1, origin: "classic", validationMode: "strict", idempotencyKey: "ledger-patch-1",
      }),
      service.delete({
        context: context(), entityCode: "journal_entry", recordId: "entry-1",
        expectedVersion: 1, origin: "classic", validationMode: "strict", idempotencyKey: "ledger-delete-1",
      }),
    ]);
    for (const result of [create, patch, remove]) {
      expect(result).toMatchObject({
        kind: "IncompatibleAction",
        reason: "Ledger entities are public read-only. Use an authorized ledger posting or reversal service.",
      });
    }
  });
});

describe("classic HTTP contract mapping parity", () => {
  it("preserves classic create and patch success shapes", () => {
    expect(mapMutationResultToHttp({
      kind: "Committed", action: "create", entityCode: "company_code", recordId: "id-1",
      record: { id: "id-1", name: "MY01" }, replayed: false,
    })).toEqual({ status: 201, body: { id: "id-1", name: "MY01" } });

    expect(mapMutationResultToHttp({
      kind: "Committed", action: "patch", entityCode: "company_code", recordId: "id-1",
      record: { id: "id-1", row_version: 8 }, version: 8, replayed: false,
    })).toEqual({ status: 200, body: { id: "id-1", row_version: 8 }, headers: { ETag: '"8"' } });
  });

  it("preserves classic PATCH version-conflict contract", () => {
    expect(mapMutationResultToHttp({ kind: "VersionConflict", expectedVersion: 6, currentVersion: 7 })).toEqual({
      status: 412,
      body: {
        error: "VERSION_CONFLICT",
        message: "Record was modified by another user. Reload and try again.",
        current_version: 7,
        currentEtag: "7",
      },
    });
  });

  it("preserves status-lock and idempotency error codes", () => {
    expect(mapMutationResultToHttp({
      kind: "FieldsNotWritable",
      fields: { name: "LOCKED_IN_CURRENT_STATUS" },
      currentStatus: "posted",
    })).toEqual({
      status: 422,
      body: {
        error: "FIELDS_NOT_WRITABLE",
        fields: { name: "LOCKED_IN_CURRENT_STATUS" },
      },
    });
    expect(mapMutationResultToHttp({ kind: "IdempotencyConflict", reason: "required" }).status).toBe(428);
    expect(mapMutationResultToHttp({ kind: "IdempotencyConflict", reason: "reused" }).status).toBe(409);
  });
});
