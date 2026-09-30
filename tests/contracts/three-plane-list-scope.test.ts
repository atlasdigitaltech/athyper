import assert from "node:assert/strict";
import test from "node:test";
import { createMeshRecordCollectionScopeResolver } from "../../server/packages/planes/mesh/src/record-collection-scope";
import { createStudioRecordCollectionScopeResolver } from "../../server/packages/planes/studio/src/record-collection-scope";
import { createStudioCatalogMetadataReader } from "../../server/packages/planes/studio/src/catalog-metadata-reader";

const context = { planeKey: "mesh", tenantId: "11111111-1111-4111-8111-111111111111", principalId: "22222222-2222-4222-8222-222222222222" } as never;
const meshDescriptor = { planeKey: "mesh", entityCode: "network_relationship", storage: { schema: "mesh", object: "network_relationship" } } as never;

test("Mesh list scope requires and validates the selected actor network account", async () => {
  const account = { networkAccountId: "33333333-3333-4333-8333-333333333333", code: "buyer.apac", displayName: "APAC Buyer", role: "buyer" as const };
  const resolver = createMeshRecordCollectionScopeResolver({ meshNetworkAccounts: async () => ({ revision: "accounts-1", accounts: [account] }) });
  assert.equal((await resolver.resolve({ context, descriptor: meshDescriptor, operationCode: "read" })).status, "context_required");
  assert.deepEqual(await resolver.resolve({ context, descriptor: meshDescriptor, operationCode: "read", coordinate: { networkAccountId: account.networkAccountId } }), { status: "ready", authorizationResource: { networkAccountId: account.networkAccountId, actorNetworkAccountId: account.networkAccountId }, constraints: [{ kind: "mesh.network_relationship.actor_account.v1", networkAccountId: account.networkAccountId }], labels: [{ key: "network_account", label: "Acting account", value: "buyer.apac · APAC Buyer" }, { key: "network_role", label: "Role", value: "Buyer" }], fingerprintMaterial: { resolver: "mesh.network_relationship.actor_account.v1", networkAccountId: account.networkAccountId, catalogRevision: "accounts-1" } });
  assert.equal((await resolver.resolve({ context, descriptor: meshDescriptor, operationCode: "read", coordinate: { networkAccountId: "44444444-4444-4444-8444-444444444444" } })).status, "forbidden");
});

test("Studio metadata catalog always applies global-plus-current-tenant normalization", async () => {
  const resolver = createStudioRecordCollectionScopeResolver();
  const result = await resolver.resolve({ context: { ...context, planeKey: "studio" } as never, descriptor: { planeKey: "studio", entityCode: "metadata_entity", storage: { schema: "metadata", object: "entity" } } as never, operationCode: "read" });
  assert.deepEqual(result, { status: "ready", authorizationResource: {}, constraints: [{ kind: "studio.metadata_entity.catalog.v1", tenantId: "11111111-1111-4111-8111-111111111111" }], labels: [{ key: "catalog_scope", label: "Catalog scope", value: "System and current tenant" }], fingerprintMaterial: { resolver: "studio.metadata_entity.catalog.v1", tenantId: "11111111-1111-4111-8111-111111111111" } });
});

test("Studio catalog descriptor is a separate read-model adapter rather than a fake published CRUD entity", async () => {
  let delegated = false;
  const reader = createStudioCatalogMetadataReader({ getEntityDescriptor: async () => { delegated = true; return null; } });
  const descriptor = await reader.getEntityDescriptor({ ...context, planeKey: "studio" } as never, "metadata_entity");
  assert.equal(delegated, false);
  assert.equal(descriptor?.storage.schema, "metadata");
  assert.equal(descriptor?.operations.read?.permissionCode, "studio.metadata.contract.view");
  assert.equal(descriptor?.listPresentation?.identityField, "entity_code");
});
