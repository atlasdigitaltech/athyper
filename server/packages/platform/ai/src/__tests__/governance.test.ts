import { describe, expect, it, vi } from "vitest";
import type { AtlasModelBinding, AtlasRegisteredTool } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { AtlasBindingRegistry, AtlasRegisteredToolCoordinator, AtlasServiceError, AtlasToolRegistry, AtlasToolService, createAtlasRecordDataGateway } from "../index.js";
import { MemoryToolStore } from "./tool-store-fixture.js";

const context: VerifiedRequestContext = {
  planeKey: "neon", realmKey: "neon", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 3, requestId: "request-1", profileHash: "profile-1",
  permissions: { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "p", profileHash: "profile-1", schemaHash: "schema-1", resolvedAt: 1, allowed: ["ai.agent.tools.read", "records.invoice.read"], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};
const binding: AtlasModelBinding = { bindingId: "b1", bindingRevision: "br1", publicModelId: "atlas-fast", providerId: "openai", upstreamModelId: "model-exact", adapterId: "openai-responses", adapterVersion: "1", displayTier: "fast", exposure: "product", status: "available", capabilities: { streaming: true, tools: true, vision: false, structuredOutput: true, maxContextTokens: 1000, maxOutputTokens: 100 }, credentialPolicy: "platform", credentialOwnerId: "platform-openai", providerRegion: "global", dataHandlingProfileId: "store-false", routingPolicyId: "no-fallback-v1", allowedDataClasses: ["internal"], priceVersion: "p1", inputPricePerMtokUsd: 1, outputPricePerMtokUsd: 2 };

describe("Atlas governance", () => {
  it("rejects ambiguous public modes instead of choosing a fallback", () => {
    expect(() => new AtlasBindingRegistry([binding, { ...binding, bindingId: "b2" }])).toThrow(/Ambiguous/);
  });
  it("queries Records through a descriptor and field-security projection", async () => {
    const records = { list: vi.fn(async () => ({ data: [{ id: "i1", row_version: 7, supplier: "Visible", secret: "hidden" }], pagination: { pageSize: 1, hasMore: false, countMode: "none" as const } })), get: vi.fn() };
    const gateway = createAtlasRecordDataGateway({ maxRows: 5, maxResponseBytes: 1024, metadata: { getEntityDescriptor: vi.fn(async () => ({ schema: "athyper.entity-runtime-descriptor/1.0" as const, entityCode: "invoice", planeKey: "neon" as const, releaseId: "r", releaseNo: 1, contractHash: "c", compiledHash: "descriptor-1", storage: { schema: "finance", object: "invoice", idField: "id", versionField: "row_version" }, fields: [{ key: "id", storagePath: "id", type: "uuid" as const, required: true, writableOn: [] }, { key: "supplier", storagePath: "supplier", type: "string" as const, required: false, writableOn: [] }], operations: { read: { code: "read", permissionCode: "records.invoice.read" } } })) }, records, fieldSecurity: { project: vi.fn(async ({ rows }: { rows: readonly Readonly<Record<string, unknown>>[] }) => rows.map((row) => ({ id: row.id, supplier: row.supplier }))) } });
    const result = await gateway.query({ context, request: { entityCode: "invoice", fields: ["supplier"], limit: 1 } });
    expect(result.rows).toEqual([{ supplier: "Visible" }]); expect(result.sources[0]).toMatchObject({ recordId: "i1", revision: "7", descriptorHash: "descriptor-1" }); expect(records.list).toHaveBeenCalledWith(expect.objectContaining({ context, countMode: "none", hydrateReferences: false }));
  });
  it("requires explicit confirmation and fresh authorization for mutations", async () => {
    const mutation: AtlasRegisteredTool = { manifest: { schema: "atlas-tool-manifest/1", toolCode: "invoice_intake", version: "1", displayName: "Prepare invoice intake", description: "Runs the registered intake command.", access: "mutation", risk: "high", allowedPlanes: ["neon"], requiredPermissions: ["ai.agent.tools.read"], featureKey: "atlas_tools_mutation_enabled", inputSchema: {}, resultSchema: {}, timeoutMs: 1000, maxResultBytes: 1000, commandBinding: "finance.invoice.intake", confirmation: "explicit_user" } };
    const authority = { authorize: vi.fn(async ({ phase }) => ({ allowed: phase === "preview", policyRevision: "policy-1" })) }; const commands = { execute: vi.fn() };
    const service = new AtlasToolService({ registry: new AtlasToolRegistry([mutation]), authority, proposals: new MemoryToolStore(), records: { query: vi.fn() }, confirmations: { verify: vi.fn(async () => true) }, commands, createId: () => "proposal-1", createConfirmationToken: () => "confirmed", now: () => new Date("2026-08-10T00:00:00Z") });
    const preview = await service.preview({ context, threadId: "thread-1", runId: "run-1", callId: "call-1", toolCode: "invoice_intake", toolVersion: "1", arguments: { recordId: "i1" }, summary: "Prepare invoice intake", affectedEntityType: "finance.invoice", affectedEntityId: "10000000-0000-4000-8000-000000000011", expectedRowVersion: 7 });
    expect(preview.confirmationRequired).toBe(true);
    await expect(service.run({ context, proposalId: preview.proposalId, arguments: { recordId: "i1" }, confirmationToken: "confirmed" })).rejects.toMatchObject({ code: "TOOL_DENIED" } satisfies Partial<AtlasServiceError>);
    expect(authority.authorize).toHaveBeenCalledTimes(2); expect(commands.execute).not.toHaveBeenCalled();
  });
  it("does not expose or execute mutation tools when mutation admission is disabled", async () => {
    const mutation: AtlasRegisteredTool = { manifest: { schema: "atlas-tool-manifest/1", toolCode: "invoice_intake", version: "1", displayName: "Prepare invoice intake", description: "Runs the registered intake command.", access: "mutation", risk: "high", allowedPlanes: ["neon"], requiredPermissions: ["ai.agent.tools.read"], featureKey: "atlas_tools_mutation_enabled", inputSchema: {}, resultSchema: {}, timeoutMs: 1000, maxResultBytes: 1000, commandBinding: "finance.invoice.intake", confirmation: "explicit_user" } };
    const registry = new AtlasToolRegistry([mutation]);
    const service = new AtlasToolService({ registry, authority: { authorize: vi.fn(async () => ({ allowed: true, policyRevision: "policy-1" })) }, proposals: new MemoryToolStore(), records: { query: vi.fn() }, confirmations: { verify: vi.fn(async () => true) }, commands: { execute: vi.fn() } });
    const coordinator = new AtlasRegisteredToolCoordinator(registry, service);
    await expect(coordinator.definitions(context, { readToolsAllowed: true, mutationToolsAllowed: false })).resolves.toEqual([]);
    await expect(coordinator.handle({ context, threadId: "thread-1", runId: "run-1", callId: "call-1", toolCode: "invoice_intake", arguments: {}, mutationToolsAllowed: false })).rejects.toThrow(/not admitted/i);
  });
  it("applies a configured agent tool allowlist in addition to admission", async () => {
    const read:AtlasRegisteredTool={manifest:{schema:"atlas-tool-manifest/1",toolCode:"invoice_read",version:"1",displayName:"Read invoice",description:"Reads one invoice.",access:"read",risk:"low",allowedPlanes:["neon"],requiredPermissions:["ai.agent.tools.read"],featureKey:"atlas_tools_read_enabled",inputSchema:{},resultSchema:{},timeoutMs:1000,maxResultBytes:1000,confirmation:"none"},readHandler:{execute:vi.fn()}};
    const registry=new AtlasToolRegistry([read]),service=new AtlasToolService({registry,authority:{authorize:vi.fn()},proposals:new MemoryToolStore(),records:{query:vi.fn()},confirmations:{verify:vi.fn()},commands:{execute:vi.fn()}}),coordinator=new AtlasRegisteredToolCoordinator(registry,service);
    await expect(coordinator.definitions(context,{readToolsAllowed:true,mutationToolsAllowed:false},[])).resolves.toEqual([]);
    await expect(coordinator.handle({context,threadId:"thread-1",runId:"run-1",callId:"call-1",toolCode:"invoice_read",arguments:{},mutationToolsAllowed:false,allowedToolCodes:[]})).rejects.toThrow(/agent profile/i);
  });
});
