import { describe, expect, it } from "vitest";
import { parseListCompare, type ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import { resolveListCompare } from "./list-compare.js";

// The per-viewer comparison projection (Entity list Compare blueprint 5.3).
const listField = (key: string, valueKind: ListFieldDescriptorV1["valueKind"], options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({
  key, label: `Label ${key}`, valueKind, defaultVisible: true, defaultOrder: 0, filterOperators: ["eq"], sortable: true, groupable: false, aggregations: [], ...options,
});
const entityField = (key: string, type: EntityFieldDescriptor["type"], extra: Partial<EntityFieldDescriptor> = {}): EntityFieldDescriptor => ({ key, storagePath: key, type, required: false, writableOn: [], ...extra });
const compare = {
  sections: [
    { key: "basic", label: "Basic data", fields: ["uom", "status", "cost"] },
    { key: "secret", label: "Restricted", fields: ["margin"] },
    { key: "audit", label: "Record details", fields: ["updated"], collapsed: true as const },
  ],
};
const entityFields = [entityField("uom", "enum"), entityField("status", "enum"), entityField("cost", "money", { list: { currencyField: "cur" } }), entityField("cur", "string"), entityField("margin", "decimal"), entityField("updated", "datetime")];
const listed = [
  listField("uom", "enum", { filterOptions: [{ value: "KG", label: "Kilogram" }] }),
  listField("status", "enum"),
  listField("cost", "money"),
  listField("cur", "string"),
  listField("updated", "datetime"),
];

describe("per-viewer Compare projection", () => {
  it("lists only readable fields, drops emptied sections without naming them, and says some are restricted", () => {
    const result = resolveListCompare({ compare, fields: listed, entityFields, masked: () => false, statusField: "status" })!;
    expect(result.sections.map((section) => [section.key, section.fields.map((field) => field.key)])).toEqual([["basic", ["uom", "status", "cost"]], ["audit", ["updated"]]]);
    expect(result.fieldsRestricted).toBe(true);
    expect(JSON.stringify(result)).not.toContain("margin");
    expect(JSON.stringify(result)).not.toContain("\"Restricted\"");
    expect(result.sections[0]!.fields[0]).toEqual({ key: "uom", label: "Label uom", valueKind: "enum", options: [{ value: "KG", label: "Kilogram" }] });
    expect(result.sections[0]!.fields[2]).toEqual({ key: "cost", label: "Label cost", valueKind: "money", currencyField: "cur" });
    expect(result.sections[1]!.collapsed).toBe(true);
    expect(result.statusField).toBe("status");
    expect(result.maxRecords).toBe(4);
    // The browser contract accepts what the server publishes.
    expect(parseListCompare(JSON.parse(JSON.stringify(result)), new Map(listed.map((field) => [field.key, field])))).toEqual(result);
  });

  it("marks masked fields and a masked currency, which are shown but never compared", () => {
    const result = resolveListCompare({ compare, fields: listed, entityFields, masked: (key) => key === "uom" || key === "cur" })!;
    const [uom, , cost] = result.sections[0]!.fields;
    expect(uom).toEqual({ key: "uom", label: "Label uom", valueKind: "enum", masked: true });
    expect(cost).toMatchObject({ currencyField: "cur", currencyMasked: true });
  });

  it("names the status field only when declared, readable, unmasked and compared", () => {
    expect(resolveListCompare({ compare, fields: listed, entityFields, masked: () => false })!.statusField).toBeUndefined();
    expect(resolveListCompare({ compare, fields: listed, entityFields, masked: (key) => key === "status", statusField: "status" })!.statusField).toBeUndefined();
    expect(resolveListCompare({ compare, fields: listed.filter((field) => field.key !== "status"), entityFields, masked: () => false, statusField: "status" })!.statusField).toBeUndefined();
    expect(resolveListCompare({ compare: { sections: [{ key: "basic", label: "Basic", fields: ["uom"] }] }, fields: listed, entityFields, masked: () => false, statusField: "status" })!.statusField).toBeUndefined();
  });

  it("treats an unreadable currency field as restricted, so the money row's refusal is explained", () => {
    const result = resolveListCompare({ compare: { sections: [{ key: "basic", label: "Basic", fields: ["cost"] }] }, fields: listed.filter((field) => field.key !== "cur"), entityFields, masked: () => false })!;
    expect(result.sections[0]!.fields[0]).toEqual({ key: "cost", label: "Label cost", valueKind: "money" });
    expect(result.fieldsRestricted).toBe(true);
  });

  it("is absent when no declared field is readable", () => {
    expect(resolveListCompare({ compare: { sections: [{ key: "secret", label: "Restricted", fields: ["margin"] }] }, fields: listed, entityFields, masked: () => false })).toBeUndefined();
  });
});
