import { expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import { createAtlasBusinessContextResolver } from "./business-context.js";
import { createAtlasEntityLookupTools } from "./entity-lookup-tools.js";
import { createAtlasEntityRecordTool } from "./entity-record-tool.js";
import { AtlasRegisteredToolCoordinator } from "./runtime-tool-coordinator.js";
import { AtlasToolRegistry, AtlasToolService } from "./tool-service.js";
import { MemoryToolStore } from "./__tests__/tool-store-fixture.js";
import { context as actor } from "./__tests__/review-fixture.js";
const id = "10000000-0000-4000-8000-000000000003";
const parentId = "10000000-0000-4000-8000-000000000004";
function fixture() {
  const context = { ...actor, permissions: { ...actor.permissions, allowed: [...actor.permissions.allowed, "child.read"] } };
  const child = { entityCode: "child_record", planeKey: "neon", compiledHash: "b".repeat(64), contractHash: "contract", operations: { read: { code: "read", permissionCode: "child.read" } }, storage: { schema: "master", object: "child_record", idField: "id", tenantField: "tenant_id" },
    fields: [{ key: "id", type: "uuid", classification: "internal", writableOn: [] }, { key: "name", type: "string", classification: "internal", writableOn: [], searchable: true, filterable: true }],
    directoryScope: { mode: "tenant" }, ai: { schemaVersion: 1, enabled: true, aliases: ["child"], summaryFieldKeys: ["name"], searchFieldKeys: ["name"], relationshipKeys: [], contextKinds: ["record", "manage"], insightProviders: [{ id: "entity_lookup", version: 1 }, { id: "entity_read_record", version: 1 }], actions: [], presentationProfiles: [] },
  } as unknown as EntityRuntimeDescriptor;
  const parent = { entityCode: "parent_record", planeKey: "neon", compiledHash: "a".repeat(64), recordPresentation: { entityRelationships: [{ key: "children", targetEntity: child.entityCode }] } } as unknown as EntityRuntimeDescriptor;
  const metadata: MetadataReader = { getEntityDescriptor: async (_, code) => code === parent.entityCode ? parent : code === child.entityCode ? child : null, listEntityCodes: async () => [child.entityCode, "unrelated"] };
  const parentScope = { parentEntityCode: parent.entityCode, parentRecordId: parentId, relationshipKey: "children" };
  const scopeCoordinate = { ...parentScope, parentDescriptorHash: parent.compiledHash };
  let allowed = true;
  const query = vi.fn(async ({ request }: { request: { scopeCoordinate?: unknown; entityCode: string } }) => {
    if (!allowed || request.entityCode !== child.entityCode || !Object.entries({ ...parentScope, parentDescriptorHash: parent.compiledHash }).every(([key, value]) => (request.scopeCoordinate as Record<string, string> | undefined)?.[key] === value)) throw Error("scope denied");
    return { rows: [{ id, name: "Authorized saved value" }], sources: [{ entityCode: child.entityCode, recordId: id, descriptorHash: child.compiledHash, revision: "1" }], responseBytes: 100, authorizationProfileHash: context.profileHash };
  });
  const records = { query };
  const store = new MemoryToolStore();
  const registry = new AtlasToolRegistry([...createAtlasEntityLookupTools(metadata, { authorize: async () => ({ allowed: true }) }), createAtlasEntityRecordTool(metadata)]);
  const service = new AtlasToolService({ registry, proposals: store, authority: { authorize: async () => ({ allowed: true, policyRevision: "policy" }) }, confirmations: { verify: async () => true }, commands: { execute: async () => { throw Error("mutation forbidden"); } }, records });
  const coordinator = new AtlasRegisteredToolCoordinator(registry, service, metadata);
  const page = { schemaVersion: 1 as const, kind: "manage" as const, entityCode: child.entityCode, generationId: id, locale: "en", filters: [], sort: [], selectedIds: [], visibleIds: [id], analysisTarget: "visible_page" as const, pageSize: 25, pageIndex: 0, parentScope };
  const resolved = { page, entityDescriptorHash: child.compiledHash, descriptorHash: "list", scopeFingerprint: "locked", scopeCoordinate };
  const handle = (toolCode: string, args: Record<string, unknown>, callId = "scope-test") => coordinator.handle({ context, businessContext: resolved, threadId: parentId, runId: id, callId, toolCode, arguments: args, mutationToolsAllowed: false });
  return { context, child, parent, parentScope, scopeCoordinate, metadata, records, query, coordinator, service, page, resolved, handle, revoke: () => { allowed = false; } };
}
it("preserves a parent scope in tenant-directory admission and selected/visible queries", async () => {
  const f = fixture();
  const list = vi.fn(async (input: { scopeCoordinate?: unknown }) => {
    expect(input.scopeCoordinate).toEqual(f.scopeCoordinate);
    return { rows: [{ id }], descriptorHash: "list", scopeFingerprint: "locked" };
  });
  const resolver = createAtlasBusinessContextResolver({ metadata: f.metadata, records: { get: async () => ({ data: { id } }) } as never, list });
  const resolved = await resolver.resolve(f.context, { ...f.page, selectedIds: [id], analysisTarget: "selection" });
  expect(resolved.scopeCoordinate).toEqual(f.scopeCoordinate);
  expect(list).toHaveBeenCalledTimes(3);
  const record = await resolver.resolve(f.context, { schemaVersion: 1, kind: "record", entityCode: f.child.entityCode, recordId: id, dirty: false, generationId: id, locale: "en", parentScope: f.parentScope });
  expect(record.scopeCoordinate).toEqual(f.scopeCoordinate);
  await expect(resolver.resolve(f.context, { ...f.page, parentScope: { ...f.parentScope, relationshipKey: "unregistered" } })).rejects.toMatchObject({ code: "BUSINESS_CONTEXT_UNAVAILABLE" });
  await expect(resolver.resolve(f.context, { ...f.page, directory: { partnerRole: "supplier" } })).rejects.toMatchObject({ code: "BUSINESS_CONTEXT_UNAVAILABLE" });
});
it("binds lookup/discovery on the server and rejects model scope substitution and cross-entity reads", async () => {
  const f = fixture();
  const definitions = await f.coordinator.definitions(f.context, { readToolsAllowed: true, mutationToolsAllowed: false }, undefined, f.resolved);
  expect(definitions.map(item => item.name)).toEqual(["entity_discover", "entity_lookup"]);
  expect(JSON.stringify(definitions)).not.toContain("scopeCoordinate");
  const discovery = await f.handle("entity_discover", { query: "child" }, "discovery");
  expect(discovery.result?.data).toMatchObject({ items: [expect.objectContaining({ entityCode: f.child.entityCode })] });
  const args = { entityCode: f.child.entityCode, descriptorHash: f.child.compiledHash, searchField: "name", value: "Authorized saved value", fields: ["name"] };
  const read = await f.handle("entity_lookup", args);
  expect(read.result?.data).toMatchObject({ items: [expect.objectContaining({ fields: [expect.objectContaining({ value: "Authorized saved value" })] })] });
  expect(f.query).toHaveBeenLastCalledWith(expect.objectContaining({ request: expect.objectContaining({ scopeCoordinate: f.scopeCoordinate }) }));
  for (const altered of [{ ...args, scopeCoordinate: {} }, { ...args, entityCode: "unrelated" }, { ...args, parentRecordId: id }])
    await expect(f.handle("entity_lookup", altered)).rejects.toThrow();
  expect(read.replayEvidence?.arguments.scopeCoordinate).toEqual(f.scopeCoordinate);
  expect(await f.service.revalidate(f.context, read.replayEvidence!)).toBe(true);
  f.revoke();
  expect(await f.service.revalidate(f.context, read.replayEvidence!)).toBe(false);
  expect(await f.service.revalidate(f.context, discovery.replayEvidence!)).toBe(false);
});
it("denies stale parent publications and binds record execution to the same scope", async () => {
  const f = fixture();
  const resolved = { ...f.resolved, page: { schemaVersion: 1 as const, kind: "record" as const, entityCode: f.child.entityCode, recordId: id, dirty: false, generationId: id, locale: "en", parentScope: f.parentScope } };
  const result = await f.coordinator.handle({ context: f.context, businessContext: resolved, threadId: parentId, runId: id, callId: "record", toolCode: "entity_read_record", arguments: { recordId: id }, mutationToolsAllowed: false });
  expect(result.replayEvidence?.arguments.scopeCoordinate).toEqual(f.scopeCoordinate);
  Object.assign(f.parent, { compiledHash: "c".repeat(64) });
  expect(await f.service.revalidate(f.context, result.replayEvidence!)).toBe(false);
});
