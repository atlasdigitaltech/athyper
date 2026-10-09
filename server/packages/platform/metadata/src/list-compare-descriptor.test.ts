import { describe, expect, it } from "vitest";
import { technicalFieldKeys, type EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import { parseFieldCompare, parsePublishedListCompare, validatePublishedListCompare } from "./list-compare-descriptor.js";

// Publication checks of the comparison declaration (Entity list Compare blueprint section 6).
const field = (key: string, type: EntityFieldDescriptor["type"], extra: Partial<EntityFieldDescriptor> = {}): EntityFieldDescriptor => ({ key, storagePath: key, type, required: false, writableOn: [], ...extra });
const byKey = new Map([field("code", "string"), field("name", "string"), field("uom", "enum"), field("cost", "money", { list: { currencyField: "cur" } }), field("cur", "string"), field("id", "uuid"), field("version", "integer"), field("plant_id", "uuid")].map((item) => [item.key, item]));
const valid = { sections: [{ key: "basic", label: "Basic data", fields: ["uom", "cost"] }, { key: "audit", label: "Record details", fields: ["name"], collapsed: true }] };
const check = (raw: unknown, extra: Partial<Parameters<typeof validatePublishedListCompare>[1]> = {}) =>
  validatePublishedListCompare(parsePublishedListCompare(raw), { byKey, identityField: "code", titleField: "name", storage: { idField: "id", versionField: "version" }, ...extra });

describe("best value property (C3)", () => {
  it("parses an authored direction and summary label on number and date fields", () => {
    expect(parseFieldCompare({ better: "lower", summaryLabel: "Lowest total price" }, "money", "total")).toEqual({ better: "lower", summaryLabel: "Lowest total price" });
    expect(parseFieldCompare({ better: "higher" }, "date", "valid_until")).toEqual({ better: "higher" });
  });
  it("refuses ineligible types, a summary label without a direction, and unknown properties", () => {
    expect(() => parseFieldCompare({ better: "lower" }, "string", "name")).toThrow(/COMPARE_BETTER_INELIGIBLE/);
    expect(() => parseFieldCompare({ summaryLabel: "Best" }, "money", "total")).toThrow(/COMPARE_SUMMARY_WITHOUT_BETTER/);
    expect(() => parseFieldCompare({ better: "cheaper" }, "money", "total")).toThrow(/lower or higher/);
    expect(() => parseFieldCompare({ better: "lower", inferred: true }, "money", "total")).toThrow(/not a published comparison property/);
  });
});

describe("the one technical-identity rule", () => {
  it("names the storage identity and version fields by key or storage path, and UUID-typed fields", () => {
    const keys = technicalFieldKeys({ storage: { idField: "record_id", versionField: "row_version" }, fields: [field("id", "string", { storagePath: "record_id" }), field("version", "integer", { storagePath: "row_version" }), field("plant_id", "uuid"), field("country", "reference"), field("code", "string")] });
    expect([...keys].sort()).toEqual(["id", "plant_id", "version"]);
  });
});

describe("published comparison declaration", () => {
  it("parses sections in order with their collapsed default", () => {
    expect(parsePublishedListCompare(valid)).toEqual({ sections: [{ key: "basic", label: "Basic data", fields: ["uom", "cost"] }, { key: "audit", label: "Record details", fields: ["name"], collapsed: true }] });
    expect(() => check(valid)).not.toThrow();
  });

  it("refuses empty, duplicate, unknown, oversized and unknown-property declarations", () => {
    expect(() => parsePublishedListCompare({ sections: [] })).toThrow(/COMPARE_SECTION_EMPTY/);
    expect(() => parsePublishedListCompare({ sections: [{ key: "a", label: "A", fields: [] }] })).toThrow(/COMPARE_SECTION_EMPTY/);
    expect(() => parsePublishedListCompare({ sections: [{ key: "a", label: "A", fields: ["uom"] }, { key: "b", label: "B", fields: ["uom"] }] })).toThrow(/COMPARE_FIELD_DUPLICATE/);
    expect(() => parsePublishedListCompare({ sections: [{ key: "a", label: "A", fields: Array.from({ length: 61 }, (_, index) => `f${index}`) }] })).toThrow(/COMPARE_FIELDS_ABOVE_CAP/);
    expect(() => parsePublishedListCompare({ sections: [{ key: "a", label: "A", fields: ["uom"], inferred: true }] })).toThrow(/not a published comparison property/);
    expect(() => parsePublishedListCompare({ sections: [{ key: "a", label: "A", fields: ["uom"], collapsed: false }] })).toThrow(/must be true/);
    expect(() => check({ sections: [{ key: "a", label: "A", fields: ["missing"] }] })).toThrow(/COMPARE_FIELD_UNKNOWN/);
  });

  it("refuses technical identities, and requires a readable identity to head the columns", () => {
    for (const key of ["id", "version", "plant_id"]) expect(() => check({ sections: [{ key: "a", label: "A", fields: [key] }] })).toThrow(/COMPARE_FIELD_TECHNICAL/);
    expect(() => check(valid, { identityField: undefined })).toThrow(/COMPARE_IDENTITY_REQUIRED/);
    expect(() => check(valid, { identityField: "absent" })).toThrow(/COMPARE_IDENTITY_REQUIRED/);
  });

  it("counts the identity, title and currency fields against the request limit", () => {
    const many = new Map(byKey);
    const keys = Array.from({ length: 60 }, (_, index) => `m${index}`);
    for (const key of keys) many.set(key, field(key, "money", { list: { currencyField: `c${key}` } }));
    for (const key of keys) many.set(`c${key}`, field(`c${key}`, "string"));
    const raw = { sections: [{ key: "a", label: "A", fields: keys }] };
    expect(() => validatePublishedListCompare(parsePublishedListCompare(raw), { byKey: many, identityField: "code", titleField: "name", storage: { idField: "id" } })).toThrow(/COMPARE_FIELDS_ABOVE_CAP: a comparison request would name 122 fields/);
  });
});
