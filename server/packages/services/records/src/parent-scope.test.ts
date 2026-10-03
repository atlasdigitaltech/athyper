import { expect, it } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityFieldDescriptor, EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordQueryService } from "@athyper/server-contract-records";
import { createParentCollectionScopeResolver } from "./parent-collection-scope.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordQueryService } from "./query-service.js";
import { parseEntityListScopeCoordinate } from "./list-scope-coordinate.js";
const tenant = "10000000-0000-4000-8000-000000000001";
const self = "10000000-0000-4000-8000-000000000002";
const other = "10000000-0000-4000-8000-000000000003";
const childId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const context: VerifiedRequestContext = { tenantId: tenant, principalId: self, planeKey: "neon", realmKey: "neon", authEpoch: 1, requestId: "scope-test", profileHash: "profile", permissions: {
    tenantId: tenant, principalId: self, planeKey: "neon", profileHash: "profile", principalFingerprint: "self", schemaHash: "schema", resolvedAt: 1, allowed: ["parent.read", "child.read"], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [],
  } };
  const field = (key: string, type: EntityFieldDescriptor["type"]): EntityFieldDescriptor => ({ key, storagePath: key, type, required: true, writableOn: [], filterable: true, sortable: true, searchable: type === "string", list: { groupable: true } });
  const make = (code: string): EntityRuntimeDescriptor => ({ schema: "athyper.entity-runtime-descriptor/1.0", entityCode: code, planeKey: "neon", releaseId: childId(90), releaseNo: 1, compiledHash: "a".repeat(64), contractHash: "contract", storage: { schema: "master", object: code, idField: "id", tenantField: "tenant_id", versionField: "version" }, fields: [field("id", "uuid"), field("tenant_id", "uuid"), field("name", "string"), field("version", "integer")], operations: { read: { code: "read", permissionCode: "parent.read" }, list: { code: "list", permissionCode: "parent.read" } }, directoryScope: { schemaVersion: 1, mode: "tenant" } });
  const parent = { ...make("principal"), ownerAccess: { schemaVersion: 1 as const, ownerField: "id", createdByField: "created_by", updatedByField: "updated_by", administerPermission: "admin" }, recordPresentation: { entityRelationships: [{ key: "notifications", targetEntity: "principal_notification_preference", cardinality: "many", fields: [{ source: "id", target: "principal_id" }], tenant: { source: "tenant_id", target: "tenant_id" }, readOperation: "list" }] } } as unknown as EntityRuntimeDescriptor;
  const child: EntityRuntimeDescriptor = { ...make("principal_notification_preference"), compiledHash: "b".repeat(64), fields: [...make("child").fields, field("principal_id", "uuid")], operations: { read: { code: "read", permissionCode: "child.read" }, list: { code: "list", permissionCode: "child.read" } } };
  const metadata: MetadataReader = { getEntityDescriptor: async (_, code) => code === parent.entityCode ? parent : code === child.entityCode ? child : null };
  let admin = true, revoked = false;
  const authorizer: Authorizer = { authorize: async ({ context: c, permissionCode }) => !revoked && c.permissions.allowed.includes(permissionCode) ? { allowed: true } : { allowed: false, reason: "denied" } };
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(parent, tenant, [{ id: self, tenant_id: tenant, name: "Self", version: 1 }, { id: other, tenant_id: tenant, name: "Other", version: 1 }]);
  persistence.seed(child, tenant, [1, 2, 3, 4].map(n => ({ id: childId(n), tenant_id: tenant, principal_id: n < 3 ? self : other, name: n < 3 ? `Self ${n}` : "OTHER_SENTINEL", version: 1 })));
  let queries: RecordQueryService;
  const collectionScopes = createParentCollectionScopeResolver({ metadata, readParent: input => queries.get(input) });
  queries = createRecordQueryService({ ...persistence, metadata, authorizer, collectionScopes, ownerAccess: { prepare: async ({ context: c, descriptor }) => admin ? {} : { [descriptor.ownerAccess!.ownerField]: c.principalId } } });
  const scope = { parentEntityCode: parent.entityCode, parentRecordId: self, relationshipKey: "notifications", parentDescriptorHash: parent.compiledHash };
  const list = (extra = {}, c = context) => queries.list({ context: c, entityCode: child.entityCode, scopeCoordinate: scope, ...extra });
  return { context, parent, child, queries, collectionScopes, scope, list, setAdmin: (value: boolean) => { admin = value; }, revoke: () => { revoked = true; } };
}
it("intersects parent scope with rows, counts, aggregates, search and requested export IDs", async () => {
  const f = fixture();
  const result = await f.list({ countMode: "exact" });
  expect(result.data.map(row => row.id)).toEqual([childId(1), childId(2)]);
  expect(result.pagination.total).toBe(2);
  expect(JSON.stringify(result)).not.toContain("OTHER_SENTINEL");
  expect((await f.list({ filters: [{ field: "principal_id", operator: "eq", value: other }], countMode: "exact" })).pagination.total).toBe(0);
  expect((await f.list({ search: "OTHER_SENTINEL", countMode: "exact" })).pagination.total).toBe(0);
  expect((await f.list({ recordIds: [childId(1), childId(3)] })).data.map(row => row.id)).toEqual([childId(1)]);
  const grouped = await f.list({ group: "name", countMode: "exact" });
  expect(grouped.groups).toHaveLength(2);
  expect(JSON.stringify(grouped)).not.toContain("OTHER_SENTINEL");
});
it("binds cursors to the parent and publication and rechecks tenant and current parent access", async () => {
  const f = fixture();
  const first = await f.list({ limit: 1 });
  expect(first.pagination.nextCursor).toBeTruthy();
  expect((await f.list({ limit: 1, cursor: first.pagination.nextCursor })).data[0]?.id).toBe(childId(2));
  await expect(f.list({ limit: 1, cursor: first.pagination.nextCursor, scopeCoordinate: { ...f.scope, parentRecordId: other } })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  await expect(f.list({}, { ...f.context, tenantId: other, permissions: { ...f.context.permissions, tenantId: other } })).rejects.toThrow();
  f.setAdmin(false);
  await expect(f.list({ scopeCoordinate: { ...f.scope, parentRecordId: other } })).rejects.toThrow();
  expect((await f.list()).data).toHaveLength(2);
  Object.assign(f.parent, { compiledHash: "c".repeat(64) });
  await expect(f.list()).rejects.toMatchObject({ code: "ENTITY_PARENT_ACCESS_DENIED" });
  await expect(f.list({ limit: 1, cursor: first.pagination.nextCursor, scopeCoordinate: { ...f.scope, parentDescriptorHash: f.parent.compiledHash } })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
});
it("fails closed for incomplete/unregistered scope, owner failure, revocation and a missing resolver", async () => {
  const f = fixture();
  for (const coordinate of [{ parentDescriptorHash: f.parent.compiledHash }, { ...f.scope, relationshipKey: "profile" }, { ...f.scope, parentRecordId: "invalid" }])
    await expect(f.list({ scopeCoordinate: coordinate })).rejects.toMatchObject({ code: "ENTITY_PARENT_ACCESS_DENIED" });
  expect(parseEntityListScopeCoordinate(f.scope)).toEqual(f.scope);
  expect(() => parseEntityListScopeCoordinate({ parentDescriptorHash: f.parent.compiledHash })).toThrow();
  const unavailable = createRecordQueryService({ metadata: { getEntityDescriptor: async () => f.child }, authorizer: { authorize: async () => ({ allowed: true }) }, ...createInMemoryRecordPersistence() });
  await expect(unavailable.list({ context: f.context, entityCode: f.child.entityCode, scopeCoordinate: f.scope })).rejects.toMatchObject({ code: "ENTITY_PARENT_ACCESS_DENIED" });
  f.revoke();
  await expect(f.list()).rejects.toThrow();
  const failing = createParentCollectionScopeResolver({ metadata: { getEntityDescriptor: async () => f.parent }, readParent: async () => { throw Error("owner unavailable"); } });
  await expect(failing.resolve({ context: f.context, descriptor: f.child, operationCode: "read", coordinate: f.scope })).rejects.toThrow("owner unavailable");
});
it("names the parent scope by its published title, never by its id when the title is readable", async () => {
  const f = fixture();
  Object.assign(f.parent, { recordPresentation: { ...(f.parent as { recordPresentation: object }).recordPresentation, titleField: "name" } });
  const resolved = await f.collectionScopes.resolve({ context: f.context, descriptor: f.child, operationCode: "read", coordinate: f.scope } as never);
  expect(resolved.status).toBe("ready");
  expect(resolved.labels.find((label) => label.key === "parent")?.value).toBe("Self");
  // Without a published title field the id still identifies the scope.
  Object.assign(f.parent, { recordPresentation: { ...(f.parent as { recordPresentation: object }).recordPresentation, titleField: undefined } });
  const fallback = await f.collectionScopes.resolve({ context: f.context, descriptor: f.child, operationCode: "read", coordinate: f.scope } as never);
  expect(fallback.labels.find((label) => label.key === "parent")?.value).toBe(f.scope.parentRecordId);
});

it.each([['account_root', 'account_line'], ['shipment', 'shipment_item']])(
  'requires published parent admission for %s/%s without a child grant', async (parentCode, childCode) => {
    const f = fixture();
    Object.assign(f.parent, { entityCode: parentCode, recordPresentation: { ...f.parent.recordPresentation, titleField: 'name' } });
    Object.assign(f.child, {
      entityCode: childCode,
      operations: { read: { code: 'read', permissionCode: 'parent.read' }, list: { code: 'list', permissionCode: 'parent.read' } },
      directoryScope: { schemaVersion: 1, mode: 'tenant', parent: { entityCode: parentCode, relationshipKey: 'notifications' } },
    });
    const relation = f.parent.recordPresentation!.entityRelationships![0]!;
    Object.assign(relation, { targetEntity: childCode });
    Object.assign(f.scope, { parentEntityCode: parentCode });
    Object.assign(f.context.permissions, { allowed: ['parent.read'] });
    // Storage remains the original fixture tables: the contract does not dispatch by entity name.
    expect((await f.list()).data.map(row => row.id)).toEqual([childId(1), childId(2)]);
    await expect(f.list({ scopeCoordinate: undefined })).rejects.toMatchObject({ code: 'ENTITY_PARENT_ACCESS_DENIED' });
    await expect(f.list({ scopeCoordinate: { ...f.scope, parentDescriptorHash: undefined } })).rejects.toMatchObject({ code: 'ENTITY_PARENT_ACCESS_DENIED' });
    await expect(f.list({ scopeCoordinate: { ...f.scope, parentEntityCode: 'another_parent' } })).rejects.toThrow();
    await expect(f.queries.get({ context: f.context, entityCode: childCode, recordId: childId(1) })).rejects.toThrow();
    expect((await f.queries.get({ context: f.context, entityCode: childCode, recordId: childId(1), scopeCoordinate: f.scope })).data?.id).toBe(childId(1));
    expect((await f.queries.get({ context: f.context, entityCode: childCode, recordId: childId(3), scopeCoordinate: f.scope })).data).toBeNull();
    f.revoke();
    await expect(f.list()).rejects.toThrow();
  },
);
