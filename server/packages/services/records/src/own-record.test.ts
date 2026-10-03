import { describe, expect, it, vi } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createEntityListService } from "./entity-list-service.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordListExecutor, createRecordQueryService } from "./query-service.js";

const owned: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "principal_profile", planeKey: "neon",
  releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "principal_profile", idField: "id", tenantField: "tenant_id" },
  fields: ["id", "principal_id", "display_name"].map(key => ({ key, storagePath: key, type: "string", required: true, writableOn: [], readPermissionCode: `field.${key}`, ...(key === "principal_id" ? { filterable: true } : {}) })),
  operations: { read: { code: "read", permissionCode: "record.read" }, list: { code: "list", permissionCode: "record.list" } },
  ownerAccess: { schemaVersion: 1, ownerField: "principal_id", administerPermission: "profile.administer", createdByField: "created_by", updatedByField: "updated_by" },
} as EntityRuntimeDescriptor;
const unowned = { ...owned, entityCode: "country", ownerAccess: undefined } as EntityRuntimeDescriptor;
const context: VerifiedRequestContext = {
  planeKey: "neon", realmKey: "athyper", tenantId: "tenant-a", principalId: "actor", authEpoch: 1,
  profileHash: "profile", requestId: "request", permissions: { planeKey: "neon", tenantId: "tenant-a", principalId: "actor", principalFingerprint: "actor", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};
function setup(deny = false) {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(owned, context.tenantId, [
    { id: "mine", principal_id: "actor", display_name: "Me" },
    { id: "theirs", principal_id: "someone-else", display_name: "Them" },
  ]);
  const metadata = { getEntityDescriptor: vi.fn(async (_context: unknown, code: string) => code === "country" ? unowned : owned) };
  const authorize = vi.fn<Authorizer["authorize"]>(async () => deny ? { allowed: false, reason: "denied" } : { allowed: true });
  const options = { ...persistence, metadata, authorizer: { authorize }, ownerAccess: { prepare: async ({ context: c, descriptor }: { context: VerifiedRequestContext; descriptor: EntityRuntimeDescriptor }) => ({ [descriptor.ownerAccess!.ownerField]: c.principalId }) } };
  const listExecutor = createRecordListExecutor(options);
  const queries = createRecordQueryService(options, listExecutor);
  return createEntityListService({ ...options, listExecutor, queries });
}

const principal = {
  ...owned, entityCode: "principal",
  storage: { ...owned.storage, object: "principal" },
  fields: ["id", "name"].map(key => ({ key, storagePath: key, type: "string", required: true, writableOn: [], readPermissionCode: `field.${key}` })),
  ownerAccess: { ...owned.ownerAccess!, ownerField: "id" },
} as EntityRuntimeDescriptor;
function principalSetup(deny = false) {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(principal, context.tenantId, [{ id: "actor", name: "Me" }, { id: "someone-else", name: "Them" }]);
  const get = vi.spyOn(persistence.repository, "get");
  const metadata = { getEntityDescriptor: vi.fn(async () => principal) };
  const authorize = vi.fn<Authorizer["authorize"]>(async () => deny ? { allowed: false, reason: "denied" } : { allowed: true });
  const options = { ...persistence, metadata, authorizer: { authorize }, ownerAccess: { prepare: async ({ context: c, descriptor }: { context: VerifiedRequestContext; descriptor: EntityRuntimeDescriptor }) => ({ [descriptor.ownerAccess!.ownerField]: c.principalId }) } };
  const listExecutor = createRecordListExecutor(options);
  const queries = createRecordQueryService(options, listExecutor);
  return { get, lists: createEntityListService({ ...options, listExecutor, queries }) };
}

describe("an entity whose record is the principal itself (owner field = id)", () => {
  it("returns the caller's principal id after the governed read, without needing a filterable field", async () => {
    const h = principalSetup();
    expect(await h.lists.ownRecord(context, "principal")).toEqual({ recordId: "actor" });
    expect(h.get).toHaveBeenCalledOnce();
    expect(h.get.mock.calls[0]![2]).toBe("actor");
  });
  it("only ever reads the caller's own id", async () => {
    const h = principalSetup();
    await h.lists.ownRecord({ ...context, principalId: "someone-else" }, "principal");
    expect(h.get.mock.calls.every((call) => call[2] === "someone-else")).toBe(true);
  });
  it("404s when the caller has no record, and refuses a caller who may not read", async () => {
    await expect(principalSetup().lists.ownRecord({ ...context, principalId: "missing" }, "principal")).rejects.toMatchObject({ statusCode: 404 });
    await expect(principalSetup(true).lists.ownRecord(context, "principal")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("the caller's own record of an owner-scoped entity", () => {
  it("resolves the one record whose owner field names the caller", async () => {
    expect(await setup().ownRecord(context, "principal_profile")).toEqual({ recordId: "mine" });
  });
  it("never resolves another principal's record", async () => {
    await expect(setup().ownRecord({ ...context, principalId: "nobody" }, "principal_profile")).rejects.toMatchObject({ statusCode: 404, code: "ENTITY_OWN_RECORD_NOT_FOUND" });
  });
  it("refuses entities without owner-scoped records", async () => {
    await expect(setup().ownRecord(context, "country")).rejects.toMatchObject({ statusCode: 404, code: "ENTITY_OWN_RECORD_UNSUPPORTED" });
  });
  it("refuses an owner field that is not published filterable, like the ownership view", async () => {
    const strict = { ...owned, fields: owned.fields.map((field) => ({ ...field, filterable: false })) } as EntityRuntimeDescriptor;
    const persistence = createInMemoryRecordPersistence();
    const metadata = { getEntityDescriptor: vi.fn(async () => strict) };
    const options = { ...persistence, metadata, authorizer: { authorize: vi.fn<Authorizer["authorize"]>(async () => ({ allowed: true })) }, ownerAccess: { prepare: async ({ context: c, descriptor }: { context: VerifiedRequestContext; descriptor: EntityRuntimeDescriptor }) => ({ [descriptor.ownerAccess!.ownerField]: c.principalId }) } };
    const listExecutor = createRecordListExecutor(options);
    const service = createEntityListService({ ...options, listExecutor, queries: createRecordQueryService(options, listExecutor) });
    await expect(service.ownRecord(context, "principal_profile")).rejects.toMatchObject({ statusCode: 404, code: "ENTITY_OWN_RECORD_UNSUPPORTED" });
  });
  it("goes through list authorization: a caller who may not list gets no record id", async () => {
    await expect(setup(true).ownRecord(context, "principal_profile")).rejects.toMatchObject({ statusCode: 403 });
  });
});
