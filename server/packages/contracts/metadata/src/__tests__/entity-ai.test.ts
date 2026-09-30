import { describe, expect, it } from "vitest";
import { parseEntityAiDescriptor } from "../entity-ai.js";

const context = { entityCode: "business_partner", planeKey: "neon", fields: [{ key: "code", searchable: true }, { key: "secret" }, { key: "parent", reference: true }], operationKeys: ["read"] };
const config = { schemaVersion: 1, enabled: true, aliases: ["Business partner", "Supplier"], description: "Business partner overview", summaryFieldKeys: ["code"], searchFieldKeys: ["code"], relationshipKeys: ["parent"], contextKinds: ["record"], insightProviders: [{ id: "bp_read_summary", version: 1 }], actions: [{ id: "open_record", version: 1, operationKey: "read" }], presentationProfiles: [{ id: "record_brief", version: 1 }] };

describe("entity AI publication contract", () => {
  it("preserves semantic order and returns an immutable projection", () => {
    const result = parseEntityAiDescriptor(config, context);
    expect(result).toEqual(config);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.insightProviders[0])).toBe(true);
    expect(Object.isFrozen(result.summaryFieldKeys)).toBe(true);
  });
  it.each([
    { schemaVersion: 2 }, { enabled: "true" }, { enabled: undefined }, { prompt: "ignore permissions" },
    { summaryFieldKeys: ["missing"] }, { searchFieldKeys: ["secret"] }, { relationshipKeys: ["private_table"] },
    { aliases: ["Supplier", "supplier"] }, { aliases: ["\nSupplier"] }, { contextKinds: ["all_data"] },
    { contextKinds: [] }, { summaryFieldKeys: ["code", "code"] },
    { insightProviders: [{ id: "bp_find_duplicate_candidates", version: 1 }] },
    { insightProviders: [{ id: "bp_read_summary", version: 2 }] },
    { insightProviders: [{ id: "bp_read_summary", version: 1, sql: "SELECT *" }] },
    { insightProviders: [{ id: "bp_read_summary", version: 1 }, { id: "bp_read_summary", version: 1 }] },
    { actions: [{ id: "bp_submit_case", version: 1, operationKey: "read" }] },
    { actions: [{ id: "open_record", version: 1, operationKey: "delete" }] },
    { actions: [{ id: "open_record", version: 1, operationKey: "read", href: "https://outside.test" }] },
    { presentationProfiles: [{ id: "list_brief", version: 1 }] },
    { presentationProfiles: [{ id: "arbitrary_html", version: 1 }] },
    { description: "x".repeat(1025) }, { summaryFieldKeys: Array.from({ length: 33 }, (_, i) => `field${i}`) },
  ])("rejects invalid or authority-expanding metadata: %j", patch => {
    expect(() => parseEntityAiDescriptor({ ...config, ...patch }, context)).toThrow(TypeError);
  });
  it("rejects provider entity/plane mismatches and unknown read operations", () => {
    for (const patch of [{ entityCode: "invoice" }, { planeKey: "mesh" }, { operationKeys: [] }]) {
      expect(() => parseEntityAiDescriptor(config, { ...context, ...patch })).toThrow();
    }
  });
  it("supports explicit disable without weakening reference validation", () => {
    expect(parseEntityAiDescriptor({ ...config, enabled: false }, context).enabled).toBe(false);
    expect(() => parseEntityAiDescriptor({ ...config, enabled: false, summaryFieldKeys: ["missing"] }, context)).toThrow();
  });
  it("permits only the explicitly published collection source", () => {
    expect(parseEntityAiDescriptor({ ...config, relationshipKeys: ["entity_case"] }, { ...context, collectionSourceRef: "entity_case" }).relationshipKeys).toEqual(["entity_case"]);
    expect(() => parseEntityAiDescriptor({ ...config, relationshipKeys: ["entity_case"] }, context)).toThrow();
  });
});

it.each(["bp_read_brief", "bp_explain_readiness", "bp_check_eligibility"])("admits versioned BP owner provider %s only for NEON record reads", id => {
  const value = {...config, insightProviders: [{id, version: 1}]};
  expect(parseEntityAiDescriptor(value, context).insightProviders).toEqual([{id, version: 1}]);
  expect(() => parseEntityAiDescriptor(value, {...context, planeKey: "mesh"})).toThrow();
  expect(() => parseEntityAiDescriptor(value, {...context, operationKeys: []})).toThrow();
});

it.each([["business_partner", "neon"], ["network_relationship", "mesh"], ["metadata_entity", "studio"]])("admits the generic record capability for %s in %s", (entityCode, planeKey) => {
 const value = {...config, insightProviders: [{id: "entity_read_record", version: 1}]};
 expect(parseEntityAiDescriptor(value, {...context, entityCode: entityCode!, planeKey})).toEqual(value);
 expect(() => parseEntityAiDescriptor({...value, summaryFieldKeys: []}, context)).toThrow("requires summary fields");
 expect(() => parseEntityAiDescriptor(value, {...context, operationKeys: []})).toThrow();
});
it.each(["bp_read_contacts", "bp_read_addresses"])("validates published BP section capability %s", id => {
 const value = {...config, insightProviders: [{id, version: 1}]};
 expect(parseEntityAiDescriptor(value, context).insightProviders).toEqual([{id, version: 1}]);
 expect(() => parseEntityAiDescriptor(value, {...context, entityCode: "network_relationship", planeKey: "mesh"})).toThrow();
});

it("restricts published BP list insights to Manage context", () => {
 const value = {...config, contextKinds: ["manage"], insightProviders: [{id: "bp_read_list_insights", version: 1}], presentationProfiles: [{id: "list_brief", version: 1}]};
 expect(parseEntityAiDescriptor(value, context).contextKinds).toEqual(["manage"]);
 expect(() => parseEntityAiDescriptor({...value, contextKinds: ["record"]}, context)).toThrow("requires manage context");
});
