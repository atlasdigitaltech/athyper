import { expect, it, vi } from "vitest";
import { parseEntityAiDescriptor, type EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createAtlasEntityRecordTool, ENTITY_RECORD_TOOL } from "../entity-record-tool.js";
import { createAtlasRecordDataGateway } from "../record-data-gateway.js";
import { AtlasRegisteredToolCoordinator } from "../runtime-tool-coordinator.js";
import { AtlasToolRegistry, AtlasToolService } from "../tool-service.js";
import { AtlasAgentRuntime } from "../agent-runtime.js";
import { providerTools } from "../entity-section-tool-selection.js";
import { MemoryToolStore } from "./tool-store-fixture.js";
import { context as actor } from "./review-fixture.js";

function fixture(entityCode = "business_partner", planeKey: "neon" | "mesh" = "neon") {
  const permission = `${planeKey}.catalog.${entityCode}.read`;
  const context = {...actor, planeKey, realmKey: planeKey, permissions: {...actor.permissions, planeKey, allowed: [permission]}};
  const summary = entityCode === "business_partner" ? "legal_name" : "relationship_kind";
  let descriptor: EntityRuntimeDescriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0", entityCode, planeKey, releaseId: actor.tenantId, releaseNo: 1, contractHash: "contract", compiledHash: "published",
    storage: {schema: planeKey, object: entityCode, idField: "id"},
    fields: ["id", summary, "status", "secret"].map(key => ({key, storagePath: key, type: key === "id" ? "uuid" : "string", required: true, writableOn: [], filterable: true})),
    operations: {read: {code: "read", permissionCode: permission}},
  };
  descriptor = {...descriptor, ai: parseEntityAiDescriptor({schemaVersion: 1, enabled: true, aliases: [entityCode.replaceAll("_", " ")], summaryFieldKeys: [summary, "status", "secret"], searchFieldKeys: [], relationshipKeys: [], contextKinds: ["record"], insightProviders: [{id: ENTITY_RECORD_TOOL, version: 1}], actions: [], presentationProfiles: [{id: "record_brief", version: 1}]}, {...descriptor, operationKeys: ["read"]})};
  const metadata = {getEntityDescriptor: vi.fn(async (_context: unknown, code: string) => code === entityCode ? descriptor : null)};
  const list = vi.fn(async () => ({data: [{id: actor.tenantId, [summary]: "Saved value", status: "active", secret: "NEVER_DISCLOSE"}], nextCursor: null}));
  const gateway = createAtlasRecordDataGateway({metadata, records: {list} as never, maxRows: 1, maxResponseBytes: 2048, allowProjectedContentRevision: true,
    fieldSecurity: {project: async ({rows}) => rows.map(({secret: _, ...row}) => row)}});
  const registry = new AtlasToolRegistry([createAtlasEntityRecordTool(metadata)]);
  const service = new AtlasToolService({registry, records: gateway, proposals: new MemoryToolStore(), authority: {authorize: async () => ({allowed: true, policyRevision: "1"})}, confirmations: {verify: async () => true}, commands: {execute: async () => {throw Error("Unexpected mutation");}}});
  const coordinator = new AtlasRegisteredToolCoordinator(registry, service, metadata);
  const page = {schemaVersion: 1, kind: "record", entityCode, recordId: actor.tenantId, section: "overview", dirty: false, generationId: actor.tenantId, locale: "en"} as const;
  const scope = {page, descriptorHash: "published", scopeFingerprint: "scope"};
  const request = {context, businessContext: scope, threadId: actor.tenantId, runId: actor.tenantId, callId: "c", toolCode: ENTITY_RECORD_TOOL, arguments: {recordId: actor.tenantId}, mutationToolsAllowed: false};
  const definitions = () => coordinator.definitions(context, {readToolsAllowed: true, mutationToolsAllowed: false}, undefined, scope);
  return {context, summary, metadata, list, service, coordinator, scope, request, definitions, descriptor: () => descriptor, replace: (next: EntityRuntimeDescriptor) => {descriptor = next;}};
}

it.each([["business_partner", "neon"], ["network_relationship", "mesh"]] as const)("discovers and executes %s through the same registry, gateway and replay service", async (entity, plane) => {
  const h = fixture(entity, plane);
  const definitions = await h.definitions();
  expect(definitions.map(d => d.name)).toEqual([ENTITY_RECORD_TOOL]);
  expect(providerTools(definitions)[0]).not.toHaveProperty("entitySection");
  expect(JSON.stringify(providerTools(definitions))).not.toMatch(/descriptorHash|entityCode|secret/);
  const result = await h.coordinator.handle(h.request);
  expect(result.result?.data).toMatchObject({status: "ready", items: [{[h.summary]: "Saved value", status: "active"}]});
  expect(JSON.stringify(result)).not.toMatch(/NEVER_DISCLOSE/);
  expect(result.replayEvidence?.arguments).toEqual({recordId: actor.tenantId, entityCode: entity, descriptorHash: "published"});
  expect(result.result?.sources[0]?.coordinate).toMatchObject({entityCode: entity, descriptorHash: "published", revision: expect.stringMatching(/^content-sha256:/)});
  expect(await h.service.revalidate(h.context, result.replayEvidence!)).toBe(true);
  h.replace({...h.descriptor(), compiledHash: "new-publication"});
  expect(await h.definitions()).toEqual([]);
  expect(await h.service.revalidate(h.context, result.replayEvidence!)).toBe(false);
});

it("intersects publication, context, plane, permission, model admission and agent profile", async () => {
  const h = fixture();
  for (const patch of [{ai: undefined}, {ai: {...h.descriptor().ai!, enabled: false}}, {ai: {...h.descriptor().ai!, insightProviders: []}}, {operations: {}}, {planeKey: "mesh" as const}]) {
    const original = h.descriptor(); h.replace({...original, ...patch});
    expect(await h.definitions()).toEqual([]);
    await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({code: "TOOL_DENIED"});
    h.replace(original);
  }
  expect(await h.coordinator.definitions(h.context, {readToolsAllowed: false, mutationToolsAllowed: false}, undefined, h.scope)).toEqual([]);
  expect(await h.coordinator.definitions(h.context, {readToolsAllowed: true, mutationToolsAllowed: false}, [], h.scope)).toEqual([]);
  expect(await h.coordinator.definitions(h.context, {readToolsAllowed: true, mutationToolsAllowed: false})).toEqual([]);
  const denied = {...h.context, permissions: {...h.context.permissions, denied: h.context.permissions.allowed}};
  expect(await h.coordinator.definitions(denied, {readToolsAllowed: true, mutationToolsAllowed: false}, undefined, h.scope)).toEqual([]);
  await expect(h.coordinator.handle({...h.request, context: denied})).rejects.toMatchObject({code: "TOOL_DENIED"});
  expect(h.list).not.toHaveBeenCalled();
});

it("rejects model-supplied coordinates, cross-record targets and historical contexts before reading", async () => {
  const h = fixture();
  for (const args of [{recordId: actor.principalId}, {recordId: actor.tenantId, entityCode: "network_relationship"}, {recordId: actor.tenantId, descriptorHash: "published"}]) {
    await expect(h.coordinator.handle({...h.request, arguments: args})).rejects.toMatchObject({code: "TOOL_DENIED"});
  }
  await expect(h.coordinator.handle({...h.request, businessContext: {...h.scope, page: {...h.scope.page, asOf: "2020-01-01T00:00:00Z"}}})).rejects.toMatchObject({code: "TOOL_DENIED"});
  expect(h.list).not.toHaveBeenCalled();
});

it("rejects unavailable Records and invalid source identities, and withholds revoked replay", async () => {
  const h = fixture();
  const result = await h.coordinator.handle(h.request);
  h.list.mockResolvedValue({data: [], nextCursor: null});
  expect(await h.service.revalidate(h.context, result.replayEvidence!)).toBe(false);
  h.list.mockResolvedValue({data: [{id: actor.principalId, legal_name: "Other", status: "active", secret: "NEVER_DISCLOSE"}], nextCursor: null});
  await expect(h.coordinator.handle({...h.request, callId: "wrong-source"})).rejects.toMatchObject({code: "TOOL_DENIED"});
  h.list.mockRejectedValue(Error("Records denied"));
  expect(await h.service.revalidate(h.context, result.replayEvidence!)).toBe(false);
});

it.each([["business_partner", "neon"], ["network_relationship", "mesh"]] as const)("runs %s summary with durable evidence and zero model calls", async (entity, plane) => {
  const h = fixture(entity, plane);
  const binding = {providerId: "ollama", upstreamModelId: "qwen", bindingId: "b", bindingRevision: "1", publicModelId: "atlas-fast", allowedDataClasses: ["internal"], capabilities: {tools: true, maxContextTokens: 4096, maxOutputTokens: 1024}};
  const invoke = vi.fn(async function* () {throw Error("Unexpected provider call");});
  const complete = vi.fn(async () => ({status: "completed"}));
  const runtime = new AtlasAgentRuntime({
    businessContexts: {resolve: async () => h.scope},
    admission: {resolve: async () => ({chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], policyRevision: "1"})},
    modelPolicy: {evaluate: async () => ({allowed: true, policyRevision: "1", promptRevision: "1"})},
    bindings: {resolve: () => binding, resolveChain: () => [binding]}, providers: {resolve: () => ({invoke})}, credentials: {resolve: async () => ({secret: "test"})},
    threads: {get: async () => ({threadId: actor.tenantId, status: "active", lastMessageSequence: 0}), boundedHistory: async () => []},
    runs: {get: async () => ({status: "completed"}), begin: async () => ({replayed: false, run: {runId: actor.tenantId, outputMessageId: actor.principalId}}), complete, fail: async () => null},
    ledger: {append: async () => {}}, prompts: {resolve: async () => ({revision: "1", systemText: "Cite authorized records."})},
    tools: h.coordinator, maxInputCharacters: 1000, maxToolRounds: 1,
  } as never);
  const events = [];
  for await (const event of runtime.run({context: h.context, threadId: actor.tenantId, clientRequestId: "c", publicModelId: "atlas-fast", dataClass: "internal", userText: "Show this record summary", catalogPolicyRevision: "1", businessContext: h.scope.page})) events.push(event);
  expect(events.at(-1)?.event.type, JSON.stringify(events)).toBe("run.completed");
  expect(events.some(e => e.event.type === "source.cited")).toBe(true);
  expect(JSON.stringify(events)).toContain("Saved value");
  expect(JSON.stringify(events)).not.toContain("NEVER_DISCLOSE");
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({replayCompletion: {complete: true, reads: [expect.objectContaining({toolCode: ENTITY_RECORD_TOOL, arguments: expect.objectContaining({entityCode: entity})})]}}));
  expect(invoke).not.toHaveBeenCalled();
});

it("discovers declared BP sections only when their owner is installed, preserving section routing", async () => {
  const {createBusinessPartnerInsightTools} = await import("../business-partner-insight-tools.js");
  const {directEntitySectionRead} = await import("../entity-section-tool-selection.js");
  const h = fixture();
  const context = {...h.context, permissions: {...h.context.permissions, allowed: [...h.context.permissions.allowed, "neon.relationship.business_partner.read"]}};
  h.replace({...h.descriptor(), ai: {...h.descriptor().ai!, aliases: ["supplier"], insightProviders: [{id: ENTITY_RECORD_TOOL, version: 1}, {id: "bp_read_contacts", version: 1}, {id: "bp_read_addresses", version: 1}]}});
  const registry = new AtlasToolRegistry([createAtlasEntityRecordTool(h.metadata), ...createBusinessPartnerInsightTools({read: vi.fn(), readContacts: vi.fn()})]);
  const coordinator = new AtlasRegisteredToolCoordinator(registry, h.service, h.metadata);
  const definitions = await coordinator.definitions(context, {readToolsAllowed: true, mutationToolsAllowed: false}, undefined, h.scope);
  expect(definitions.map(t => t.name)).toEqual([ENTITY_RECORD_TOOL, "bp_read_contacts"]);
  expect(directEntitySectionRead(definitions, "Show this supplier's contacts", h.scope.page)?.name).toBe("bp_read_contacts");
  h.replace({...h.descriptor(), ai: {...h.descriptor().ai!, insightProviders: [{id: ENTITY_RECORD_TOOL, version: 1}]}});
  expect((await coordinator.definitions(context, {readToolsAllowed: true, mutationToolsAllowed: false}, undefined, h.scope)).map(t => t.name)).toEqual([ENTITY_RECORD_TOOL]);
});

it.each([["business_partner", "neon"], ["network_relationship", "mesh"]] as const)("F4 published vocabulary improves unseen %s wording; draft, rollback and denied profiles do not read", async (entity, plane) => {
  const h=fixture(entity,plane);
  const questions=["Show this company snapshot", "Could you display the company snapshot for this record?", "Give me the current company snapshot"];
  for(const text of questions) expect(h.coordinator.resolveIntent(h.context,text,h.scope,await h.definitions()).kind).toBe("delegate");
  const before=h.descriptor();
  const published={...before,compiledHash:"release-with-reviewed-vocabulary",ai:{...before.ai!,vocabulary:{schemaVersion:1 as const,locale:"en" as const,terms:[{phrase:"company snapshot",capabilityId:ENTITY_RECORD_TOOL,origin:{plane,candidateId:h.context.principalId,proposalHash:"a".repeat(64)}}]}}};
  // Building/reviewing the draft does not mutate the MetadataReader's active release.
  expect(h.coordinator.resolveIntent(h.context,questions[1]!,h.scope,await h.definitions()).kind).toBe("delegate");
  h.replace(published);
  expect(await h.definitions()).toEqual([]); // old page hash invalidates discovery
  const scope={...h.scope,descriptorHash:published.compiledHash};
  const definitions=await h.coordinator.definitions(h.context,{readToolsAllowed:true,mutationToolsAllowed:false},undefined,scope);
  for(const text of questions) expect(h.coordinator.resolveIntent(h.context,text,scope,definitions)).toMatchObject({kind:"read",capabilityIds:[ENTITY_RECORD_TOOL]});
  expect(JSON.stringify(providerTools(definitions))).not.toContain("company snapshot");
  const outcome=await h.coordinator.handle({...h.request,businessContext:scope});
  expect(outcome.result?.outcome).toBe("completed");
  const none=await h.coordinator.definitions(h.context,{readToolsAllowed:true,mutationToolsAllowed:false},[],scope);
  expect(h.coordinator.resolveIntent(h.context,questions[1]!,scope,none).kind).not.toBe("read");
  for(const text of ["Delete this company snapshot", "Show this company snapshot without private fields", "Show the old company snapshot"])expect(h.coordinator.resolveIntent(h.context,text,scope,definitions).kind).not.toBe("read");
  const nonEnglish={...scope,page:{...scope.page,locale:"fr"}};
  expect(h.coordinator.resolveIntent(h.context,questions[0]!,nonEnglish,await h.coordinator.definitions(h.context,{readToolsAllowed:true,mutationToolsAllowed:false},undefined,nonEnglish)).kind).toBe("delegate");
  h.replace(before);
  expect(h.coordinator.resolveIntent(h.context,questions[1]!,h.scope,await h.definitions()).kind).toBe("delegate");
});
