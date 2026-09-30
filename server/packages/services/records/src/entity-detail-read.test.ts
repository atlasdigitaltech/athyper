import { describe, expect, it, vi } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createEntityListService } from "./entity-list-service.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordListExecutor, createRecordQueryService } from "./query-service.js";

const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "reference", planeKey: "neon",
  releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
  storage: { schema: "shared", object: "reference", idField: "id", tenantField: "tenant_id" },
  fields: ["id", "name", "secret"].map(key => ({ key, storagePath: key, type: "string", required: true, writableOn: [], readPermissionCode: `field.${key}` })),
  operations: { read: { code: "read", permissionCode: "record.read" } },
};
const context: VerifiedRequestContext = {
  planeKey: "neon", realmKey: "athyper", tenantId: "tenant-a", principalId: "actor", authEpoch: 1,
  profileHash: "profile", requestId: "request", permissions: { planeKey: "neon", tenantId: "tenant-a", principalId: "actor", principalFingerprint: "actor", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};
function setup(deny = false) {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(descriptor, context.tenantId, [{ id: "one", name: "Visible", secret: "HIDDEN" }]);
  const get = vi.spyOn(persistence.repository, "get");
  const metadata = { getEntityDescriptor: vi.fn(async () => descriptor) };
  const authorize = vi.fn<Authorizer["authorize"]>(async ({ permissionCode }) =>
    deny || permissionCode === "field.secret" ? { allowed: false, reason: "denied" } : { allowed: true });
  const options = { ...persistence, metadata, authorizer: { authorize } };
  const listExecutor = createRecordListExecutor(options);
  const queries = createRecordQueryService(options, listExecutor);
  const collaboration = vi.fn(async () => [] as const);
  return { get, metadata, authorize, queries, collaboration,
    lists: createEntityListService({ ...options, listExecutor, queries, collaboration }) };
}
describe("combined authorized entity detail read", () => {
  it("reads once and reuses the exact admitted metadata and field projection", async () => {
    const h = setup();
    const result = await h.lists.detailRead(context, descriptor.entityCode, "one");
    expect(result.record).toEqual({ id: "one", values: { id: "one", name: "Visible" } });
    expect(result.descriptor.fields.map(field => field.key)).toEqual(["id", "name"]);
    expect(h.get).toHaveBeenCalledOnce();
    expect(h.authorize.mock.calls.filter(([input]) => input.permissionCode === "record.read")).toHaveLength(1);
    expect(h.metadata.getEntityDescriptor).toHaveBeenCalledOnce();
    expect(h.authorize.mock.calls.filter(([input]) => input.permissionCode.startsWith("field."))).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain("HIDDEN");
    expect(JSON.stringify(result)).not.toContain("storage");
    await h.lists.detailRead({ ...context, authEpoch: 2 }, descriptor.entityCode, "one");
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(h.authorize.mock.calls.filter(([input]) => input.permissionCode.startsWith("field."))).toHaveLength(6);
  });
  it("does not serialize internal evidence through the existing get API", async () => {
    const h = setup();
    expect(Object.keys(await h.queries.get({ context, entityCode: descriptor.entityCode, recordId: "one" }))).toEqual(["data"]);
  });
  it("denies before repository access and never runs capability hooks", async () => {
    const h = setup(true);
    await expect(h.lists.detailRead(context, descriptor.entityCode, "one")).rejects.toMatchObject({ statusCode: 403 });
    expect(h.get).not.toHaveBeenCalled();
    expect(h.collaboration).not.toHaveBeenCalled();
  });
  it("does not return another tenant's record or invoke capability hooks for missing data", async () => {
    const h = setup();
    await expect(h.lists.detailRead({ ...context, tenantId: "tenant-b" }, descriptor.entityCode, "one")).rejects.toMatchObject({ statusCode: 404 });
    expect(h.collaboration).not.toHaveBeenCalled();
  });
});

it("retains descriptor-only authorization when no admitted record is present", async () => {
  const h=setup(true);
  await expect(h.lists.detailDescriptor(context,descriptor.entityCode)).rejects.toMatchObject({statusCode:403});
  expect(h.authorize.mock.calls.filter(([input])=>input.permissionCode==="record.read")).toHaveLength(1);
  expect(h.get).not.toHaveBeenCalled();
});
it("does not treat a failed relationship capability evaluation as permission denial", async () => {
  const {parseEntityRecordPresentation}=await import("@athyper/contract-platform-entity-runtime");
  const h=setup();
  const parent={...descriptor,recordPresentation:parseEntityRecordPresentation({schemaVersion:1,titleField:"name",sections:[{key:"overview",label:"Overview",fields:["name"]},{key:"profile",label:"Profile",fields:[],relationshipKey:"profile"}],entityRelationships:[{key:"profile",targetEntity:"child",cardinality:"zero_or_one",fields:[{source:"id",target:"parent_id"}],tenant:{source:"tenant_id",target:"tenant_id"},readOperation:"list"}]})};
  const child={...descriptor,entityCode:"child",operations:{...descriptor.operations,list:{code:"list",permissionCode:"child.list"},create:{code:"create",permissionCode:"child.create"}}};
  h.metadata.getEntityDescriptor.mockImplementation(async (...args: unknown[])=>args[1]==="child"?child:parent);
  h.authorize.mockImplementation(async input=>input.permissionCode==="child.create"?{allowed:false,reason:"denied"}:{allowed:true});
  const result=await h.lists.detailRead(context,descriptor.entityCode,"one");
  expect(result.descriptor.relationshipCapabilities).toEqual({profile:{create:false}});
  h.authorize.mockImplementation(async input=>{if(input.permissionCode==="child.create")throw Error("dependency failed");return {allowed:true};});
  await expect(h.lists.detailRead(context,descriptor.entityCode,"one")).rejects.toThrow("dependency failed");
});
