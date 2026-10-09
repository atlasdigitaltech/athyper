import { describe, expect, it } from "vitest";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { EntityFieldDescriptor, EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { resolveCompareCollections, type CompareTargetList } from "./list-compare-collections.js";

// C4 collections resolved per viewer (Compare blueprint 5.8 point 10a).
const hash = "a".repeat(64);
const lf = (key: string, valueKind: ListFieldDescriptorV1["valueKind"], extra: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({ key, label: `L ${key}`, valueKind, defaultVisible: true, defaultOrder: 0, filterOperators: ["eq", "in"], sortable: true, groupable: false, aggregations: [], ...extra });
const ef = (key: string, type: EntityFieldDescriptor["type"], extra: Partial<EntityFieldDescriptor> = {}): EntityFieldDescriptor => ({ key, storagePath: key, type, required: false, writableOn: [], ...extra });
const award = {
  entityCode: "award", compiledHash: hash,
  storage: { schema: "d", object: "award", idField: "id" },
  fields: [ef("code", "string"), ef("event", "reference")],
  recordPresentation: { entityRelationships: [{ key: "allocations", targetEntity: "allocation", cardinality: "many" }] },
  authorization: { relationships: [{ key: "allocations", targetEntity: "allocation", ownership: "inherited", readOperation: "read" }] },
  listPresentation: { compare: { sections: [], collections: [{ key: "lines", label: "Allocations", relationship: "allocations", matchKey: ["demand", "company"], fields: ["qty", "amount", "secret"], master: { entity: "demand", parentField: "event", recordParentField: "event" }, absentLabel: "Not allocated" }] } },
} as unknown as EntityRuntimeDescriptor;
const allocation = { entityCode: "allocation", storage: { idField: "id" }, fields: [ef("id", "uuid"), ef("demand", "reference", { referenceTargetEntity: "demand" }), ef("company", "reference"), ef("qty", "decimal", { compare: { better: "higher", unitField: "uom" } }), ef("uom", "string"), ef("amount", "money", { list: { currencyField: "cur" }, compare: { better: "lower", evaluation: true } }), ef("cur", "string"), ef("secret", "string")] } as unknown as EntityRuntimeDescriptor;
const demand = { entityCode: "demand", storage: { idField: "id" }, fields: [] } as unknown as EntityRuntimeDescriptor;
const lists: Record<string, CompareTargetList> = {
  allocation: { fields: [lf("demand", "reference"), lf("company", "reference"), lf("qty", "decimal"), lf("uom", "string"), lf("amount", "money"), lf("cur", "string")], identityField: "demand", exactCounts: true, searchable: false },
  demand: { fields: [lf("code", "string"), lf("name", "string", { semanticRole: "title" }), lf("event", "reference"), lf("category", "enum", { filterOptions: [{ value: "valves", label: "Valves" }] })], identityField: "code", exactCounts: true, searchable: true },
};
const run = (overrides: Partial<Parameters<typeof resolveCompareCollections>[0]> = {}) =>
  resolveCompareCollections({
    descriptor: award,
    listedParentKeys: new Set(["code", "event"]),
    load: async (code) => ({ allocation, demand })[code],
    listFor: async (target) => lists[target.entityCode],
    masked: () => false,
    ...overrides,
  });

describe("per-viewer C4 collections", () => {
  it("resolves line fields, the master list and the parent pin; unreadable fields are restricted without names", async () => {
    const { collections, restricted } = await run();
    const [lines] = collections;
    expect(lines).toMatchObject({ key: "lines", targetEntity: "allocation", relationshipKey: "allocations", parentDescriptorHash: hash, absentLabel: "Not allocated", exactCounts: true });
    expect(lines!.matchKey.map((field) => field.key)).toEqual(["demand", "company"]);
    expect(lines!.fields.map((field) => field.key)).toEqual(["qty", "amount"]);
    expect(lines!.fields[0]).toMatchObject({ better: "higher", unitField: "uom" });
    expect(lines!.fields[1]).toMatchObject({ better: "lower", evaluation: true, currencyField: "cur" });
    expect(lines!.master).toMatchObject({ entity: "demand", identityField: "code", titleField: "name", searchable: true, exactCounts: true });
    expect(lines!.master!.filters.map((filter) => filter.key)).toEqual(["category"]);
    expect(lines!.accessIndependent).toBeUndefined();
    expect(restricted).toBe(true);
    expect(JSON.stringify(collections)).not.toContain("secret");
  });

  it("marks independent line access, and fails closed with a reason", async () => {
    const independent = { ...award, authorization: { relationships: [{ key: "allocations", targetEntity: "allocation", ownership: "independent", readOperation: "read" }] } } as unknown as EntityRuntimeDescriptor;
    expect((await run({ descriptor: independent })).collections[0]!.accessIndependent).toBe(true);
    expect((await run({ masked: (_, key) => key === "demand" })).collections[0]!.unavailable).toBe("MATCH_KEY_UNAVAILABLE");
    expect((await run({ listedParentKeys: new Set(["code"]) })).collections[0]!.unavailable).toBe("MASTER_UNAVAILABLE");
    const unshared = { ...allocation, fields: allocation.fields.map((field) => (field.key === "demand" ? { ...field, referenceTargetEntity: "item" } : field)) } as unknown as EntityRuntimeDescriptor;
    expect((await run({ load: async (code) => ({ allocation: unshared, demand })[code] })).collections[0]!.unavailable).toBe("MATCH_KEY_NOT_SHARED");
    expect((await run({ load: async () => undefined })).collections[0]!.unavailable).toBe("RELATIONSHIP_UNAVAILABLE");
  });
});
