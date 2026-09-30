import { expect, it } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { parseEntityAiDescriptor, type EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { AtlasRegisteredToolCoordinator, AtlasToolRegistry, createAtlasBusinessContextResolver, createAtlasEntityRecordTool, createAtlasRecordDataGateway } from "@athyper/server-platform-ai";
import { createMeshRecordCollectionScopeResolver } from "@athyper/server-plane-mesh";
import { createEntityListService, createRecordListExecutor, createRecordQueryService, createInMemoryRecordPersistence } from "@athyper/server-service-records";

const tenantId = "10000000-0000-4000-8000-000000000001";
const principalId = "10000000-0000-4000-8000-000000000002";
const recordId = "10000000-0000-4000-8000-000000000003";
const accountId = "10000000-0000-4000-8000-000000000004";
const otherId = "10000000-0000-4000-8000-000000000005";

it.each([["business_partner", "neon"], ["network_relationship", "mesh"]] as const)("reads %s through real Records authorization and scope services", async (entityCode, planeKey) => {
  const permission = `${planeKey}.catalog.${entityCode}.read`;
  const context: VerifiedRequestContext = {planeKey, realmKey: planeKey, tenantId, principalId, authEpoch: 1, requestId: "test", profileHash: "profile", permissions: {planeKey, tenantId, principalId, principalFingerprint: "actor", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [permission], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: []}};
  const summary = planeKey === "mesh" ? "relationship_kind" : "legal_name";
  let descriptor: EntityRuntimeDescriptor = {schema: "athyper.entity-runtime-descriptor/1.0", entityCode, planeKey, releaseId: recordId, releaseNo: 1, compiledHash: "published", contractHash: "contract",
    storage: {schema: planeKey === "mesh" ? "mesh" : "master", object: entityCode, idField: "id", tenantField: "tenant_id"},
    fields: ["id", summary, "status", "secret", "buyer_account_id", "supplier_account_id"].map(key => ({key, storagePath: key, type: key.endsWith("id") ? "uuid" : "string", required: true, writableOn: [], filterable: true, ...(key === "secret" ? {readPermissionCode: "private.read"} : {})})),
    operations: {read: {code: "read", permissionCode: permission}},
  };
  descriptor = {...descriptor, ai: parseEntityAiDescriptor({schemaVersion: 1, enabled: true, aliases: [entityCode], summaryFieldKeys: [summary, "status", "secret"], searchFieldKeys: [], relationshipKeys: [], contextKinds: ["record"], insightProviders: [{id: "entity_read_record", version: 1}], actions: [], presentationProfiles: []}, {...descriptor, operationKeys: ["read"]})};
  const metadata = {getEntityDescriptor: async (_context: VerifiedRequestContext, code: string) => code === entityCode ? descriptor : null};
  const authorizer: Authorizer = {authorize: async input => input.context.permissions.allowed.includes(input.permissionCode) ? {allowed: true} : {allowed: false, reason: "missing_permission"}};
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(descriptor, tenantId, [
    {id: recordId, [summary]: "Saved record", status: "active", secret: "NEVER_DISCLOSE", buyer_account_id: accountId, supplier_account_id: otherId},
    {id: otherId, [summary]: "UNRELATED_ACCOUNT", status: "active", buyer_account_id: otherId, supplier_account_id: otherId},
  ]);
  let accountAllowed = true;
  const collectionScopes = createMeshRecordCollectionScopeResolver({meshNetworkAccounts: async () => ({revision: "1", accounts: accountAllowed ? [{networkAccountId: accountId, code: "A", displayName: "Account A", role: "buyer"}] : []})});
  const options = {metadata, authorizer, ...persistence, collectionScopes};
  const executor = createRecordListExecutor(options);
  const records = createRecordQueryService(options, executor);
  const lists = createEntityListService({metadata, authorizer, listExecutor: executor, queries: records, collectionScopes});
  const resolver = createAtlasBusinessContextResolver({metadata, records, list: query => lists.list(query)});
  const page = {schemaVersion: 1, kind: "record", entityCode, recordId, section: "overview", dirty: false, generationId: recordId, locale: "en", ...(planeKey === "mesh" ? {workContext: {networkAccountId: accountId}} : {})} as const;
  const resolved = await resolver.resolve(context, page);
  expect(resolved.entityDescriptorHash).toBe("published");
  // The actual Records service removes denied fields before this projection.
  const gateway = createAtlasRecordDataGateway({metadata, records, maxRows: 1, maxResponseBytes: 2048, allowProjectedContentRevision: true, fieldSecurity: {project: async ({rows}) => rows}});
  const tool = createAtlasEntityRecordTool(metadata);
  const coordinator = new AtlasRegisteredToolCoordinator(new AtlasToolRegistry([tool]), {} as never, metadata);
  expect((await coordinator.definitions(context, {readToolsAllowed: true, mutationToolsAllowed: false}, undefined, resolved)).map(tool => tool.name)).toEqual(["entity_read_record"]);
  const args = {recordId, entityCode, descriptorHash: resolved.entityDescriptorHash, ...(page.workContext ? {scopeCoordinate: page.workContext} : {})};
  const read = () => tool.readHandler!.execute({context: {context, records: gateway}, arguments: args});
  const result = await read();
  expect(result.data).toMatchObject({items: [{[summary]: "Saved record", status: "active"}]});
  expect(JSON.stringify(result)).not.toMatch(/NEVER_DISCLOSE|UNRELATED_ACCOUNT/);
  await expect(resolver.resolve({...context, tenantId: otherId, permissions: {...context.permissions, tenantId: otherId}}, page)).rejects.toMatchObject({code: "PERMISSION_DENIED"});
  if (planeKey === "mesh") {
    await expect(resolver.resolve(context, {...page, workContext: undefined})).rejects.toMatchObject({code: "TOOL_DENIED"});
    await expect(resolver.resolve(context, {...page, recordId: otherId})).rejects.toMatchObject({code: "PERMISSION_DENIED"});
    await expect(resolver.resolve(context, {...page, workContext: {networkAccountId: otherId}})).rejects.toMatchObject({code: "PERMISSION_DENIED"});
    accountAllowed = false;
    await expect(read()).rejects.toMatchObject({code: "PERMISSION_DENIED"});
  }
});
