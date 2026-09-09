import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasInsightOwnerProjection } from "@athyper/server-contract-ai";
import { createBusinessPartnerInsightTools } from "../business-partner-insight-tools.js";
import { AtlasRegisteredToolCoordinator } from "../runtime-tool-coordinator.js";
import { AtlasToolRegistry, AtlasToolService } from "../tool-service.js";
import { MemoryToolStore } from "./tool-store-fixture.js";
import { atlasReadEvidenceHash } from "../message-lineage.js";
const id = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const permissions = ["neon.relationship.business_partner.read", "neon.relationship.entity_case.submit"];
const context: VerifiedRequestContext = {
  planeKey: "neon", realmKey: "neon", tenantId: id, principalId: id, authEpoch: 1, requestId: "r9", profileHash: "profile-1",
  permissions: { planeKey: "neon", tenantId: id, principalId: id, principalFingerprint: "fingerprint", profileHash: "profile-1", schemaHash: "schema-1", resolvedAt: 1, allowed: permissions, denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};

const candidate = <T>(value: T) => ({state: "evaluated_pass" as const, claims: [permissions[0]!], value});
function harness(withAddresses = false) {
  const projection: AtlasInsightOwnerProjection = {evaluationMode: "user_scoped", scope: candidate({entityCode: "business_partner", fingerprint: "scope", role: "supplier", operatingOrganizationId: id, companyCodeId: id}), coverage: candidate({target: "record", state: "complete"}), evaluatedAt: "2026-09-09T00:00:00Z", freshness: "current", evidence: [], findings: [candidate({id: "scope", code: "scope_required", state: "not_evaluated", severity: "info", facts: {}, ruleVersion: "1", evidenceIds: [], actionIds: []})], actions: []};
  const read = vi.fn(async () => projection);
  const query = vi.fn(async () => ({rows: [{code: "BP-1", bank: "secret"}], sources: [{entityCode: "business_partner", recordId: id, revision: "1", descriptorHash: "d"}], responseBytes: 10, authorizationProfileHash: context.profileHash}));
  const readAddresses = vi.fn(async () => ({recordId: id, status: "ready" as "ready" | "empty" | "unavailable", addresses: [{address: "1 Merchant Square", countryCode: "GB", primary: true, secret: "never-return"}] as Record<string, string | boolean>[], hasMore: false}));
  const readContacts = vi.fn(async () => ({recordId: id, status: "ready" as "ready" | "empty" | "unavailable", contacts: [{displayName: "Supplier contact", channels: "email: contact@example.test", primary: true, secret: "never-return"}] as Record<string, string | boolean>[], hasMore: false}));
  const registry = new AtlasToolRegistry(createBusinessPartnerInsightTools({read, ...(withAddresses ? {readAddresses, readContacts} : {})}));
  const service = new AtlasToolService({registry, proposals: new MemoryToolStore(), records: {query}, authority: {authorize: async () => ({allowed: true, policyRevision: "1"})}, confirmations: {verify: async () => true}, commands: {execute: async () => {throw Error("unexpected mutation");}}});
  const coordinator = new AtlasRegisteredToolCoordinator(registry, service);
  const request = {context, runId: id, threadId: id, callId: "insight", toolCode: "bp_explain_readiness", arguments: {recordId: id, role: "supplier", operatingOrganizationId: id, companyCodeId: id}, mutationToolsAllowed: false};
  return {projection, read, readAddresses, readContacts, query, registry, service, coordinator, request};
}
it.each(["bp_read_brief", "bp_explain_readiness", "bp_check_eligibility"])("executes %s using Records plus disclosed owner evidence", async toolCode => {
  const h = harness();
  const result = await h.coordinator.handle({...h.request, toolCode});
  expect(result.result?.outcome).toBe("completed");
  expect(result.result?.data).toMatchObject({records: [{code: "BP-1"}], insight: {findings: [{state: "not_evaluated"}]}});
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(h.read).toHaveBeenCalledWith(expect.objectContaining({context, recordId: id, companyCodeId: id}));
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(true);
});
it("does not call the owner for a record outside Records admission", async () => {
  const h = harness(); h.query.mockResolvedValue({rows: [], sources: [], responseBytes: 0, authorizationProfileHash: context.profileHash});
  await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({code: "TOOL_DENIED"});
  expect(h.read).not.toHaveBeenCalled();
});
it("rejects owner scope substitution", async () => {
  const h = harness(); h.read.mockResolvedValue({...h.projection, scope: {...h.projection.scope, value: {...h.projection.scope.value, companyCodeId: other}}});
  await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({code: "TOOL_DENIED"});
});
it.each([{recordId: id, asOf: "2020-01-01"}, {recordId: id, role: "admin"}, {recordId: id, operation: "approve"}, {recordId: id, businessDate: "2026-02-30"}])("rejects unregistered arguments %j", args => {
  const tool = createBusinessPartnerInsightTools({read: vi.fn()}).find(t => t.manifest.toolCode === "bp_check_eligibility")!;
  expect(() => tool.validateArguments!(args, {})).toThrow();
});
it("rejects current-page company, role, record, and historical substitutions before preview", async () => {
  const h = harness();
  const page = {schemaVersion: 1, kind: "record", entityCode: "business_partner", recordId: id, roleLens: "supplier", workContext: {operatingOrganizationId: id, companyCodeId: id}};
  for (const patch of [{companyCodeId: other}, {role: "customer"}, {recordId: other}]) await expect(h.coordinator.handle({...h.request, arguments: {...h.request.arguments, ...patch}, businessContext: {page, descriptorHash: "d", scopeFingerprint: "s"} as never})).rejects.toMatchObject({code: "TOOL_DENIED"});
  await expect(h.coordinator.handle({...h.request, businessContext: {page: {...page, asOf: "2020-01-01"}, descriptorHash: "d", scopeFingerprint: "s"} as never})).rejects.toMatchObject({code: "TOOL_DENIED"});
  expect(h.read).not.toHaveBeenCalled();
});
it("replays only after a fresh equal owner read; observation times alone may advance", async () => {
  const h = harness(), result = await h.coordinator.handle(h.request);
  h.read.mockResolvedValue({...h.projection, evaluatedAt: "2026-09-09T00:01:00Z"});
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(true);
  h.read.mockRejectedValue(Error("revoked"));
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(false);
  const a = {data: {insight: {evaluatedAt: "a", findings: ["pass"]}}, sources: []};
  const b = {data: {insight: {evaluatedAt: "b", findings: ["fail"]}}, sources: []};
  expect(atlasReadEvidenceHash("bp_explain_readiness", a)).not.toBe(atlasReadEvidenceHash("bp_explain_readiness", b));
});
it("keeps the expanded local tool catalogue within the pinned prompt budget", async () => {
  const {createBusinessPartnerAtlasTools} = await import("../business-partner-tools.js");
  const {fitLocalPrompt, localPromptTokenBound} = await import("@athyper/server-contract-ai");
  const tools = [...createBusinessPartnerAtlasTools(), ...createBusinessPartnerInsightTools({read: vi.fn()})].map(t => ({name: t.manifest.toolCode, description: t.manifest.description, inputSchema: t.manifest.inputSchema, entitySection: t.entitySection}));
  const {selectLocalBusinessPartnerTools} = await import("../business-partner-tool-selection.js");
  for (const [question, code] of [["Can we purchase?", "bp_check_eligibility"], ["What is missing?", "bp_explain_readiness"], ["Give me a brief", "bp_read_brief"], ["Summarize", "bp_read_summary"], ["Submit case", "bp_submit_case"]]) {
  const selected = selectLocalBusinessPartnerTools(tools, question!);
  expect(selected.map(t => t.name)).toEqual([code]);
  const prompt = fitLocalPrompt({messages: [{role: "system", content: [{type: "text", text: "Answer from supplied owner evidence."}]}, {role: "user", content: [{type: "text", text: "Can we purchase from this supplier?"}]}], tools: selected, maxOutputTokens: 512});
  expect(prompt.tools).toHaveLength(1);
  expect(localPromptTokenBound(prompt) + prompt.maxOutputTokens).toBeLessThanOrEqual(4096);
  }
});

it("rejects typed scope names before preview and distinguishes absent scope from a conflicting selected scope", async () => {
  const {AtlasScopeSelectionRequiredError} = await import("../errors.js");
  const h = harness();
  const page = {kind: "record", entityCode: "business_partner", recordId: id, roleLens: "all"};
  await expect(h.coordinator.handle({...h.request, arguments: {recordId: id, operatingOrganizationId: "CirrusAtlantic"}, businessContext: {page, descriptorHash: "d", scopeFingerprint: "s"} as never})).rejects.toBeInstanceOf(AtlasScopeSelectionRequiredError);
  expect(h.read).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled();
});

it("preserves shared identity when scoped admission is denied and skips owner reads", async () => {
  const {AtlasServiceError} = await import("../errors.js");
  const h = harness();
  const identity = await h.query(); h.query.mockClear();
  h.query.mockResolvedValueOnce(identity).mockRejectedValueOnce(new AtlasServiceError("PERMISSION_DENIED", "protected scope"));
  const result = await h.coordinator.handle(h.request);
  expect(result.result?.data).toMatchObject({records: [{code: "BP-1"}], insight: {coverage: {state: "partial"}, evidence: [], findings: [{code: "scoped_assessment_unavailable", state: "not_evaluated", facts: {}}]}});
  expect(h.read).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toMatch(/secret|protected scope/);
  expect(h.query.mock.calls[0]).toEqual([expect.objectContaining({request: expect.not.objectContaining({scopeCoordinate: expect.anything()})})]);
  expect(h.query.mock.calls[1]).toEqual([expect.objectContaining({request: expect.objectContaining({scopeCoordinate: {operatingOrganizationId: id, companyCodeId: id, partnerRole: "supplier"}})})]);
});
it("does not soften a shared-record permission denial", async () => {
  const {AtlasServiceError} = await import("../errors.js");
  const h = harness(); h.query.mockRejectedValue(new AtlasServiceError("PERMISSION_DENIED", "denied"));
  await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({code: "PERMISSION_DENIED"});
  expect(h.read).not.toHaveBeenCalled();
});

it("reads addresses from another tab with citations and no work-scope injection", async () => {
  const h = harness(true);
  const result = await h.coordinator.handle({...h.request, toolCode: "bp_read_addresses", arguments: {recordId: id}, businessContext: {page: {kind: "record", entityCode: "business_partner", recordId: id, section: "banking", workContext: {operatingOrganizationId: other}}, descriptorHash: "d", scopeFingerprint: "s"} as never});
  expect(result.result?.data).toMatchObject({section: "addresses", status: "ready", addresses: [{address: "1 Merchant Square"}]});
  expect(result.result?.sources[0]?.coordinate).toMatchObject({entityCode: "business_partner", recordId: id, revision: expect.stringMatching(/^content-sha256:/)});
  expect(h.readAddresses).toHaveBeenCalledWith({context, recordId: id});
  expect(JSON.stringify(result)).not.toMatch(/never-return|secret/);
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(true);
  h.readAddresses.mockResolvedValue({recordId: id, status: "unavailable", addresses: [], hasMore: false});
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(false);
});
it("rejects address target and historical substitutions before owner reads", async () => {
  const h = harness(true);
  for (const page of [{kind: "record", entityCode: "business_partner", recordId: other}, {kind: "record", entityCode: "business_partner", recordId: id, asOf: "2020-01-01"}]) {
    await expect(h.coordinator.handle({...h.request, toolCode: "bp_read_addresses", arguments: {recordId: id}, businessContext: {page} as never})).rejects.toMatchObject({code: "TOOL_DENIED"});
  }
  expect(h.readAddresses).not.toHaveBeenCalled();
});
it("keeps explicit address routing within the local prompt budget", async () => {
  const h = harness(true);
  const {selectLocalBusinessPartnerTools} = await import("../business-partner-tool-selection.js");
  const {fitLocalPrompt, localPromptTokenBound} = await import("@athyper/server-contract-ai");
  const tools = h.registry.list().map(t => ({name: t.manifest.toolCode, description: t.manifest.description, inputSchema: t.manifest.inputSchema, entitySection: t.entitySection}));
  const selected = selectLocalBusinessPartnerTools(tools, "Summarize this partner’s addresses.");
  expect(selected.map(t => t.name)).toEqual(["bp_read_addresses"]);
  const prompt = fitLocalPrompt({messages: [{role: "user", content: [{type: "text", text: "Summarize this partner’s addresses."}]}], tools: selected, maxOutputTokens: 512});
  expect(localPromptTokenBound(prompt) + prompt.maxOutputTokens).toBeLessThanOrEqual(4096);
});
it("does not call address owner outside shared Records admission", async () => {
  const h = harness(true); h.query.mockResolvedValue({rows: [], sources: [], responseBytes: 0, authorizationProfileHash: context.profileHash});
  await expect(h.coordinator.handle({...h.request, toolCode: "bp_read_addresses", arguments: {recordId: id}})).rejects.toMatchObject({code: "TOOL_DENIED"});
  expect(h.readAddresses).not.toHaveBeenCalled();
});

it("reads contacts from another tab with citations and no work-scope injection", async () => {
  const h = harness(true);
  const result = await h.coordinator.handle({...h.request, toolCode: "bp_read_contacts", arguments: {recordId: id}, businessContext: {page: {kind: "record", entityCode: "business_partner", recordId: id, section: "banking", workContext: {operatingOrganizationId: other}}, descriptorHash: "d", scopeFingerprint: "s"} as never});
  expect(result.result?.data).toMatchObject({section: "contacts", status: "ready", contacts: [{displayName: "Supplier contact"}]});
  expect(result.result?.sources[0]?.coordinate).toMatchObject({entityCode: "business_partner", recordId: id, revision: expect.stringMatching(/^content-sha256:/)});
  expect(h.readContacts).toHaveBeenCalledWith({context, recordId: id});
  expect(JSON.stringify(result)).not.toMatch(/never-return|secret/);
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(true);
  h.readContacts.mockResolvedValue({recordId: id, status: "unavailable", contacts: [], hasMore: false});
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(false);
});
it("rejects address target and historical substitutions before owner reads", async () => {
  const h = harness(true);
  for (const page of [{kind: "record", entityCode: "business_partner", recordId: other}, {kind: "record", entityCode: "business_partner", recordId: id, asOf: "2020-01-01"}]) {
    await expect(h.coordinator.handle({...h.request, toolCode: "bp_read_contacts", arguments: {recordId: id}, businessContext: {page} as never})).rejects.toMatchObject({code: "TOOL_DENIED"});
  }
  expect(h.readContacts).not.toHaveBeenCalled();
});

it.each(["Summarize this partner’s contact.", "Summarize this partner’s contacts"])("routes %s to the contacts tool", async question => {
 const {selectLocalBusinessPartnerTools} = await import("../business-partner-tool-selection.js");
 const tools = harness(true).registry.list().map(t => ({name: t.manifest.toolCode, description: t.manifest.description, inputSchema: t.manifest.inputSchema, entitySection: t.entitySection}));
 expect(selectLocalBusinessPartnerTools(tools, question).map(t => t.name)).toEqual(["bp_read_contacts"]);
});
