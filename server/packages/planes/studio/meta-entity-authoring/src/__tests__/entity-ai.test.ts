import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileGraph, validateGraph } from "../deterministic.js";

const ai = { schemaVersion: 1, enabled: true, aliases: ["Partner"], summaryFieldKeys: ["code"], searchFieldKeys: ["code"], relationshipKeys: [], contextKinds: ["record"], insightProviders: [{ id: "bp_read_summary", version: 1 }], actions: [{ id: "open_record", version: 1, operationKey: "read" }], presentationProfiles: [{ id: "record_brief", version: 1 }] };
function graph(config: unknown = ai): MetaEntityGraph {
  return { contractSchema: "athyper.meta-entity-contract/2.1", entity: { entityCode: "business_partner" },
    runtimeProfiles: [{ profileKey: "default", backingKind: "virtual", apiExposure: "catalog_only", readMode: "none", writeMode: "none" }],
    fields: [{ id: "field-code", fieldKey: "code", dataType: "string", typeConfig: { kind: "string" } }],
    operations: [{ id: "read-op", operationKey: "read", operationKind: "read", label: "Read", auditEventCode: "partner.read" }],
    searchProfiles: [{ id: "search", searchKey: "default", searchKind: "contains", minimumQueryLength: 2 }],
    searchFields: [{ entitySearchProfileId: "search", entityFieldId: "field-code", position: 1, matchMode: "contains" }],
    surfaces: [{ surfaceKey: "detail", surfaceKind: "detail", title: "Partner", layoutConfig: { ai: config } }],
  };
}
it("validates before publication and includes AI in deterministic descriptor hashes", () => {
  expect(validateGraph(graph()).issues).toEqual([]);
  const first = compileGraph(graph());
  expect(first.descriptor.ai).toEqual(ai);
  const reordered = Object.fromEntries(Object.entries(ai).reverse());
  expect(compileGraph(graph(reordered)).descriptorHash).toBe(first.descriptorHash);
  expect(compileGraph(graph(reordered)).contractHash).toBe(first.contractHash);
  expect(compileGraph(graph({ ...ai, enabled: false })).descriptorHash).not.toBe(first.descriptorHash);
});
it("reports invalid references in graph validation and refuses compilation", () => {
  for (const value of [{ ...ai, summaryFieldKeys: ["unknown"] }, { ...ai, actions: [{ id: "destroy", version: 1, operationKey: "read" }] }, { ...ai, schemaVersion: 2 }]) {
    expect(validateGraph(graph(value)).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "ENTITY_AI_INVALID" })]));
    expect(() => compileGraph(graph(value))).toThrow("META_ENTITY_GRAPH_INVALID");
  }
});
it("requires active search bindings and rejects deprecated field references", () => {
  const source = graph();
  expect(validateGraph({ ...source, searchFields: [] }).issues.some(issue => issue.code === "ENTITY_AI_INVALID")).toBe(true);
  expect(validateGraph({ ...source, fields: source.fields.map(field => ({ ...field, status: "deprecated" })) }).issues.some(issue => issue.code === "ENTITY_AI_INVALID")).toBe(true);
});
it("requires one active declaration and ignores deprecated surfaces", () => {
  const source = graph();
  expect(() => compileGraph({ ...source, surfaces: [...source.surfaces!, { ...source.surfaces![0]!, surfaceKey: "other" }] })).toThrow();
  const legacy = compileGraph({ ...source, surfaces: [] });
  expect(legacy.descriptor).not.toHaveProperty("ai");
  const deprecated = compileGraph({ ...source, surfaces: [{ ...source.surfaces![0]!, status: "deprecated" }] });
  expect(deprecated.descriptor).not.toHaveProperty("ai");
});

it.each(["business_partner", "network_relationship"])("compiles the generic record provider for %s through the same authoring path", entityCode => {
  const config = {...ai, insightProviders: [{id: "entity_read_record", version: 1}]};
  const source = {...graph(config), entity: {entityCode}};
  expect(validateGraph(source).issues).toEqual([]);
  expect(compileGraph(source).descriptor.ai).toEqual(config);
  expect(() => compileGraph({...source, surfaces: [{...source.surfaces![0]!, layoutConfig: {ai: {...config, summaryFieldKeys: []}}}]})).toThrow("META_ENTITY_GRAPH_INVALID");
});
