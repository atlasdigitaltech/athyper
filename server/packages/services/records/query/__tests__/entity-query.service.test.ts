import { describe, expect, it, vi } from "vitest";
import { hydrateExecutionDescriptor } from "@athyper/svc-metadata";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { EntityQueryService } from "../entity-query.service.js";
import type { CompiledEntityQueryPlan, EntityQueryExecutor } from "../entity-query.types.js";

const HASH = "a".repeat(64);
const descriptor = hydrateExecutionDescriptor({
  schemaVersion: 1,
  identity: { entityCode: "supplier", entityVersionId: "v1", versionHash: "vh", compiledHash: HASH, entityClass: "MASTER" },
  storage: { schema: "master", table: "supplier", primaryKey: "id", tenantColumn: "tenant_id", backingType: "table" },
  fields: [
    field("id", "id", { filterable: true, sortable: true }),
    field("tenant_id", "tenant_id"),
    field("company_code_id", "company_code_id"),
    field("name", "name", { searchable: true, filterable: true, sortable: true }),
    field("secret", "secret"),
  ],
  read: {
    projection: ["id", "tenant_id", "company_code_id", "name", "secret"],
    searchableFields: ["name"], filterableFields: ["id", "name"],
    defaultSort: [{ field: "name", direction: "asc", nulls: "last" }],
    stableTieBreaker: "id", naturalKeyFields: [],
  },
  write: {
    create: { mode: "DIRECT_CREATE", idempotencyRequired: false, numberingStrategy: "none" },
    mutations: {
      create: { enabled: true, kind: "generic" }, update: { enabled: true, kind: "generic" }, delete: { enabled: true, kind: "generic" },
    }, arrayFields: [], jsonFields: [],
    concurrency: { strategy: "none", rollout: "observe", lockRequired: false }, deletionMode: "hard_delete",
  },
  relations: [], lifecycle: undefined,
  policy: { governanceLevel: "tenant", securityTier: "internal", mutability: "mutable", dataPolicy: { hiddenFields: ["secret"] }, degradedFeatures: [] },
  handlers: { collectionHandlers: [], domainHooks: [] },
});

const context = {
  planeKey: "neon", realmKey: "r", tenantId: "tenant-1", principalId: "principal-1",
  profileHash: "profile", authEpoch: 4, requestId: "req", companyCodeId: "company-1",
  permissions: {},
} as VerifiedRequestContext;

describe("EntityQueryService", () => {
  it("uses one data execution, limit + 1, stable PK sort, scope, and descriptor projection", async () => {
    const executor = fakeExecutor([
      { id: "1", tenant_id: "tenant-1", company_code_id: "company-1", name: "A", secret: "x" },
      { id: "2", tenant_id: "tenant-1", company_code_id: "company-1", name: "B", secret: "y" },
      { id: "3", tenant_id: "tenant-1", company_code_id: "company-1", name: "C", secret: "z" },
    ]);
    const service = new EntityQueryService({ executor, cursorSecret: "test-secret" });
    const result = await service.list({ context, descriptor, generation: "9", limit: 2, countMode: "none" });

    expect(executor.executeData).toHaveBeenCalledOnce();
    const plan = vi.mocked(executor.executeData).mock.calls[0]![0];
    expect(plan.limit).toBe(3);
    expect(plan.columns.map((entry) => entry.field)).toEqual(descriptor.read.projection);
    expect(plan.sort.map((entry) => entry.field)).toEqual(["name", "id"]);
    expect(plan.predicates).toEqual(expect.arrayContaining([
      { column: "tenant_id", operator: "eq", value: "tenant-1" },
      { column: "company_code_id", operator: "eq", value: "company-1" },
    ]));
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).not.toHaveProperty("secret");
    expect(result.pagination).toMatchObject({ has_more: true, page_size: 2, count_mode: "none" });
    expect(result.pagination.next_cursor).toBeTypeOf("string");
    expect(executor.executeExactCount).not.toHaveBeenCalled();
  });

  it("reuses the opaque cursor tuple without offset and has stable deep-page cost", async () => {
    const firstExecutor = fakeExecutor([{ id: "10", name: "Acme" }, { id: "11", name: "Beta" }]);
    const service = new EntityQueryService({ executor: firstExecutor, cursorSecret: "test-secret" });
    const first = await service.list({ context, descriptor, generation: "9", limit: 1, countMode: "none" });
    const secondExecutor = fakeExecutor([{ id: "11", name: "Beta" }]);
    const secondService = new EntityQueryService({ executor: secondExecutor, cursorSecret: "test-secret" });
    await secondService.list({ context, descriptor, generation: "9", limit: 1, cursor: first.pagination.next_cursor, countMode: "none" });
    const plan = vi.mocked(secondExecutor.executeData).mock.calls[0]![0];
    expect(plan.boundary?.values).toEqual(["Acme", "10"]);
    expect(plan.offset).toBeUndefined();
    expect(plan.limit).toBe(2);
  });

  it("hydrates all page references with one batch call", async () => {
    const relatedDescriptor = hydrateExecutionDescriptor({
      ...serialized(descriptor),
      relations: [{
        name: "category", targetEntity: "category", kind: "many_to_one", ownership: "foreign_key",
        foreignKey: "category_id", targetKey: "id", mutationOwner: "generic", versionStrategy: "none",
        allowedActions: { create: false, update: false, delete: false, replace: false },
      }],
      fields: [...serialized(descriptor).fields, field("category_id", "category_id")],
      read: { ...serialized(descriptor).read, projection: [...serialized(descriptor).read.projection, "category_id"] },
    });
    const resolve = vi.fn(async () => new Map([["category", new Map([["c1", "Hardware"], ["c2", "Services"]])]]));
    const service = new EntityQueryService({
      executor: fakeExecutor([{ id: "1", name: "A", category_id: "c1" }, { id: "2", name: "B", category_id: "c2" }]),
      cursorSecret: "test-secret", references: { resolve },
    });
    const result = await service.list({ context, descriptor: relatedDescriptor, generation: "1", countMode: "none" });
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve.mock.calls[0]![0][0].ids).toEqual(["c1", "c2"]);
    expect(result.data[0]).toHaveProperty("category_id_label", "Hardware");
  });

  it("hydrates a 100-row page without per-row reference calls", async () => {
    const relatedDescriptor = hydrateExecutionDescriptor({
      ...serialized(descriptor),
      relations: [{
        name: "category", targetEntity: "category", kind: "many_to_one", ownership: "foreign_key",
        foreignKey: "category_id", targetKey: "id", mutationOwner: "generic", versionStrategy: "none",
        allowedActions: { create: false, update: false, delete: false, replace: false },
      }],
      fields: [...serialized(descriptor).fields, field("category_id", "category_id")],
      read: { ...serialized(descriptor).read, projection: [...serialized(descriptor).read.projection, "category_id"] },
    });
    const rows = Array.from({ length: 100 }, (_, index) => ({ id: String(index), name: `Row ${index}`, category_id: `c${index}` }));
    const resolve = vi.fn(async () => new Map([["category", new Map(rows.map((_, index) => [`c${index}`, `Category ${index}`]))]]));
    const service = new EntityQueryService({ executor: fakeExecutor(rows), cursorSecret: "test-secret", references: { resolve } });
    const result = await service.list({ context, descriptor: relatedDescriptor, generation: "1", limit: 100, countMode: "none" });
    expect(result.data).toHaveLength(100);
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve.mock.calls[0]![0][0].ids).toHaveLength(100);
  });

  it("runs exact count separately only when requested", async () => {
    const executor = fakeExecutor([]);
    vi.mocked(executor.executeExactCount).mockResolvedValue(42);
    const service = new EntityQueryService({ executor, cursorSecret: "test-secret" });
    const result = await service.list({ context, descriptor, generation: "1", countMode: "exact" });
    expect(executor.executeData).toHaveBeenCalledOnce();
    expect(executor.executeExactCount).toHaveBeenCalledOnce();
    expect(result.pagination.total).toBe(42);
  });

  it("rejects unsafe pagination inputs before executing SQL", async () => {
    const executor = fakeExecutor([]);
    const service = new EntityQueryService({ executor, cursorSecret: "test-secret" });
    await expect(service.list({ context, descriptor, generation: "1", limit: Number.NaN, countMode: "none" }))
      .rejects.toMatchObject({ code: "INVALID_LIMIT" });
    await expect(service.list({ context, descriptor, generation: "1", limit: 1, offset: -1, countMode: "none" }))
      .rejects.toMatchObject({ code: "INVALID_OFFSET" });
    expect(executor.executeData).not.toHaveBeenCalled();
  });

  it("counts the full result set when a keyset cursor is present", async () => {
    const executor = fakeExecutor([{ id: "1", name: "Acme" }, { id: "2", name: "Beta" }]);
    vi.mocked(executor.executeExactCount).mockResolvedValue(2);
    const service = new EntityQueryService({ executor, cursorSecret: "test-secret" });
    const first = await service.list({ context, descriptor, generation: "1", limit: 1, countMode: "none" });
    await service.list({ context, descriptor, generation: "1", limit: 1, cursor: first.pagination.next_cursor, countMode: "exact" });
    const countPlan = vi.mocked(executor.executeExactCount).mock.calls[0]![0];
    expect(countPlan.boundary).toBeUndefined();
  });

  it("returns byte-equivalent normalized results from the keyset cache", async () => {
    const values = new Map<string, Awaited<ReturnType<EntityQueryService["list"]>>>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: Awaited<ReturnType<EntityQueryService["list"]>>) => { values.set(key, JSON.parse(JSON.stringify(value))); }),
    };
    const executor = fakeExecutor([{ id: "1", name: "Acme" }]);
    const service = new EntityQueryService({ executor, cursorSecret: "test-secret", resultCache: cache });
    const command = { context, descriptor, generation: "3", limit: 20, countMode: "none" as const };
    const uncached = await service.list(command);
    const cached = await service.list(command);
    expect(JSON.stringify(cached)).toBe(JSON.stringify(uncached));
    expect(executor.executeData).toHaveBeenCalledOnce();
    expect([...values.keys()][0]).toContain("listpage:v2");
    expect([...values.keys()][0]).not.toContain(":p:");
  });
});

function fakeExecutor(rows: readonly Record<string, unknown>[]): EntityQueryExecutor {
  return {
    executeData: vi.fn(async (_plan: CompiledEntityQueryPlan) => rows),
    executeExactCount: vi.fn(async () => rows.length),
  };
}

function field(name: string, column: string, overrides: Record<string, unknown> = {}) {
  return {
    name, column, dataType: "string", coercion: "scalar", required: false,
    searchable: false, filterable: false, sortable: false, computed: false, readOnly: false,
    writeOnce: false, systemManaged: false, createWritable: true, updateWritable: true,
    createRequired: false, editableInStatuses: [], ...overrides,
  };
}

function serialized(value: typeof descriptor) {
  return {
    schemaVersion: value.schemaVersion, identity: value.identity, storage: value.storage,
    fields: [...value.fields.values()], read: value.read, write: value.write,
    relations: [...value.relations.values()], policy: value.policy, handlers: value.handlers,
  };
}
