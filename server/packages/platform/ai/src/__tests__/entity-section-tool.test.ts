import {expect, it, vi} from "vitest";
import type {AtlasEntitySectionBinding, AtlasEntitySectionProjection} from "@athyper/server-contract-ai";
import {createAtlasEntitySectionTool} from "../entity-section-tool.js";
import {selectEntitySectionTools, providerTools} from "../entity-section-tool-selection.js";
import {AtlasRegisteredToolCoordinator} from "../runtime-tool-coordinator.js";
import {AtlasToolRegistry, AtlasToolService} from "../tool-service.js";
import {MemoryToolStore} from "./tool-store-fixture.js";
import {context as actor} from "./review-fixture.js";
const id = actor.tenantId;
function fixture(planeKey: "neon" | "mesh" | "studio" = "studio") {
 const context = {...actor, planeKey, realmKey: planeKey, permissions: {...actor.permissions, planeKey, allowed: ["catalog.product.read"]}};
 const binding: AtlasEntitySectionBinding = {planeKey, entityCode: "product", sectionKey: "specifications", toolCode: "product_specs", label: "Product specifications", aliases: ["specifications", "technical details"], readPermission: "catalog.product.read", admissionField: "sku", recordIdField: "product_id", resultKey: "items", maxRows: 5, fields: {label: {type: "string", maxLength: 80}, approved: {type: "boolean"}, weight: {type: "number"}}};
 const projection: AtlasEntitySectionProjection = {entityCode: "product", sectionKey: "specifications", recordId: id, status: "ready", rows: [{label: "Widget", approved: true, weight: 5, hiddenCost: "SECRET"}], hasMore: false};
 const read = vi.fn(async () => projection);
 const query = vi.fn(async () => ({rows: [{sku: "W-1"}], sources: [{entityCode: "product", recordId: id, revision: "1", descriptorHash: "published"}], authorizationProfileHash: context.profileHash, responseBytes: 10}));
 const tool = createAtlasEntitySectionTool(binding, read);
 const registry = new AtlasToolRegistry([tool]);
 const service = new AtlasToolService({registry, proposals: new MemoryToolStore(), records: {query}, authority: {authorize: async () => ({allowed: true, policyRevision: "1"})}, confirmations: {verify: async () => true}, commands: {execute: async () => {throw Error("unexpected mutation");}}});
 const coordinator = new AtlasRegisteredToolCoordinator(registry, service);
 const page = {schemaVersion: 1, kind: "record", entityCode: "product", recordId: id, section: "overview", dirty: false, generationId: id, locale: "en", workContext: {companyCodeId: id}} as const;
 const request = {context, runId: id, threadId: id, callId: "c", toolCode: "product_specs", arguments: {recordId: id}, mutationToolsAllowed: false, businessContext: {page, descriptorHash: "published", scopeFingerprint: "scope"}};
 return {context, binding, projection, read, query, tool, service, coordinator, request};
}
it.each(["neon", "mesh", "studio"] as const)("uses the same section engine for a non-BP entity in %s", async plane => {
 const h = fixture(plane), result = await h.coordinator.handle(h.request);
 expect(result.result?.data).toEqual({section: "specifications", status: "ready", items: [{label: "Widget", approved: true, weight: 5}], hasMore: false});
 expect(h.query).toHaveBeenCalledWith({context: h.context, request: {entityCode: "product", fields: ["sku"], filters: [{field: "product_id", operator: "eq", value: id}], limit: 1}});
 expect(JSON.stringify(result)).not.toContain("SECRET");
 expect(result.result?.sources[0]?.coordinate).toMatchObject({entityCode: "product", revision: expect.stringMatching(/^content-sha256:/)});
 expect(await h.service.revalidate(h.context, result.replayEvidence!)).toBe(true);
 h.read.mockResolvedValue({...h.projection, rows: [{label: "Changed"}]});
 expect(await h.service.revalidate(h.context, result.replayEvidence!)).toBe(false);
 h.read.mockResolvedValue({...h.projection, status: "unavailable", rows: [], hasMore: false});
 expect(await h.service.revalidate(h.context, result.replayEvidence!)).toBe(false);
});
it.each(["entityCode", "sectionKey", "recordId"] as const)("rejects owner substitution of %s", async key => {
 const h = fixture(); h.read.mockResolvedValue({...h.projection, [key]: "other"});
 await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({code: "TOOL_DENIED"});
});
it("binds entity, record and historical context before calling the owner", async () => {
 const h = fixture();
 for (const patch of [{entityCode: "business_partner"}, {recordId: actor.principalId}, {asOf: "2020-01-01"}]) {
  await expect(h.coordinator.handle({...h.request, businessContext: {page: {...h.request.businessContext.page, ...patch}} as never})).rejects.toMatchObject({code: "TOOL_DENIED"});
 }
 expect(h.read).not.toHaveBeenCalled();
});
it("does not read the owner when parent admission fails", async () => {
 const h = fixture(); h.query.mockResolvedValue({rows: [], sources: [], authorizationProfileHash: h.context.profileHash, responseBytes: 0});
 await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({code: "TOOL_DENIED"}); expect(h.read).not.toHaveBeenCalled();
});
it("uses registered aliases, enforces page entity and strips routing metadata from provider tools", async () => {
 const h = fixture(); const tools = await h.coordinator.definitions(h.context, {readToolsAllowed: true, mutationToolsAllowed: false});
 expect(selectEntitySectionTools(tools, "Explain the technical details", h.request.businessContext.page)?.map(t => t.name)).toEqual(["product_specs"]);
 expect(selectEntitySectionTools(tools, "specifications", {...h.request.businessContext.page, entityCode: "other"})).toBeUndefined();
 expect(providerTools(tools)[0]).not.toHaveProperty("entitySection");
 expect(await h.coordinator.definitions({...h.context, planeKey: "neon"}, {readToolsAllowed: true, mutationToolsAllowed: false})).toEqual([]);
});
it("rejects invalid fields and caps owner rows; unavailable is not empty", async () => {
 const h = fixture();
 for (const rows of [[{weight: Infinity}], [{label: "x".repeat(81)}], Array.from({length: 6}, () => ({label: "x"}))]) {
  h.read.mockResolvedValue({...h.projection, rows});
  await expect(h.coordinator.handle({...h.request, callId: String(rows.length) + JSON.stringify(rows)})).rejects.toBeDefined();
 }
 h.read.mockResolvedValue({...h.projection, status: "unavailable", rows: [], hasMore: false});
 const result = await h.coordinator.handle({...h.request, callId: "unavailable"});
 expect(result.result?.data).toMatchObject({status: "unavailable", items: []}); expect(result.result?.sources).toEqual([]);
});
it("reports an unconnected reader explicitly after record admission, without empty evidence", async () => {
 const h = fixture();
 const tool = createAtlasEntitySectionTool(h.binding);
 const output = await tool.readHandler!.execute({context: {context: h.context, records: {query: h.query}}, arguments: {recordId: id}} as never);
 expect(output.data).toMatchObject({status: "unavailable", unavailableReason: "reader_unavailable", items: []});
 expect(output.sources).toEqual([]);
 expect(h.query).toHaveBeenCalled();
});
it.each(["missing_scope", "denied", "reader_unavailable"] as const)("preserves typed owner state %s and withholds citations", async unavailableReason => {
 const h = fixture();
 h.read.mockResolvedValue({...h.projection, status: "unavailable", unavailableReason, rows: []});
 const outcome = await h.coordinator.handle(h.request);
 expect(outcome.result?.data).toMatchObject({status: "unavailable", unavailableReason, items: []});
 expect(outcome.result?.sources).toEqual([]);
});
