import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPARE_MAX_FIELDS,
  COMPARE_MAX_RECORDS,
  COMPARE_MIN_RECORDS,
  COMPARE_NARROW_COLUMNS,
  decodeListLocationState,
  encodeListLocationState,
  parseEntityListDescriptor,
  parseListCompare,
  readCompareLocation,
  writeCompareLocation,
} from "../../packages/contracts/platform/entity-list/src/index";

// Entity list Compare browser contract (blueprint sections 5.1, 5.3 and 5.4).
const listed = new Map([["uom", { valueKind: "enum" }], ["cost", { valueKind: "money" }], ["cur", { valueKind: "string" }], ["status", { valueKind: "enum" }]]);
const projection = { sections: [{ key: "basic", label: "Basic data", fields: [{ key: "uom", label: "Unit", valueKind: "enum" }, { key: "cost", label: "Cost", valueKind: "money", currencyField: "cur" }, { key: "status", label: "Status", valueKind: "enum" }] }], statusField: "status", maxRecords: 4 };

test("named presentation bounds", () => {
  assert.deepEqual([COMPARE_MIN_RECORDS, COMPARE_MAX_RECORDS, COMPARE_NARROW_COLUMNS, COMPARE_MAX_FIELDS], [2, 4, 2, 60]);
});

test("parses the projection and refuses what the server never publishes", () => {
  assert.equal(parseListCompare(projection, listed).sections[0]!.fields.length, 3);
  const bad = (change: (value: any) => void) => { const value = structuredClone(projection) as any; change(value); return () => parseListCompare(value, listed); };
  assert.throws(bad((value) => { value.maxRecords = 5; }), /maxRecords/);
  assert.throws(bad((value) => { value.sections[0].fields[0].valueKind = "uuid"; }), /valueKind/);
  assert.throws(bad((value) => { value.sections[0].fields[0].key = "unlisted"; }), /valueKind/);
  assert.throws(bad((value) => { value.sections[0].fields.push({ key: "uom", label: "Again", valueKind: "enum" }); }), /compared once/);
  assert.throws(bad((value) => { value.statusField = "cur"; }), /compared field/);
  assert.throws(bad((value) => { value.sections[0].fields[0].currencyField = "cur"; }), /money field/);
  assert.throws(bad((value) => { value.sections[0].guess = true; }), /not a Compare section property/);
  // C3: a best value only on number or date fields, and a summary label only with it.
  assert.equal(parseListCompare(JSON.parse(JSON.stringify({ ...projection, statusField: undefined, sections: [{ ...projection.sections[0], fields: [{ key: "cost", label: "Cost", valueKind: "money", currencyField: "cur", better: "lower", summaryLabel: "Lowest cost" }] }] })), listed).sections[0]!.fields[0]!.better, "lower");
  assert.throws(bad((value) => { value.sections[0].fields[0].better = "lower"; }), /number or date/);
  assert.throws(bad((value) => { value.sections[0].fields[1].summaryLabel = "Lowest"; }), /needs better/);
});

const field = (key: string, valueKind: string, defaultOrder: number) => ({ key, label: key, valueKind, defaultVisible: true, defaultOrder, filterOperators: ["eq"], sortable: true, groupable: false, aggregations: [] });
const descriptor = (compare?: unknown) => parseEntityListDescriptor({
  schemaVersion: 1, plane: "neon",
  entity: { code: "material", label: "Material", pluralLabel: "Materials", identityField: "code" },
  revision: { release: 1, descriptorHash: "a".repeat(64), surfaceHash: "b".repeat(64) },
  surface: {
    key: "default_list", title: "Materials",
    defaultState: { filters: [], sort: [{ field: "code", direction: "asc" }], columns: ["code", "uom"], density: "comfortable", mode: "table" },
    supportedModes: ["table"],
    filterPresentation: { quickFields: [], source: "metadata", allowUserPinning: true },
    ...(compare ? { compare } : {}),
  },
  fields: [field("code", "string", 0), field("uom", "enum", 1), field("cost", "money", 2), field("cur", "string", 3), field("status", "enum", 4)],
  actions: [],
  scope: { status: "ready", labels: [], fingerprint: "c".repeat(64) },
  limits: { defaultPageSize: 50, allowedPageSizes: [25, 50], maxSortLevels: 3, countMode: "none" },
});

test("an open comparison is location state of a surface that offers Compare, never saved state", () => {
  const offered = descriptor(projection);
  assert.ok(offered.surface.compare);
  const state = decodeListLocationState("compare=m1,m2,m3&compareBaseline=m2", offered);
  assert.deepEqual(state.compare, { records: ["m1", "m2", "m3"], baseline: "m2" });
  assert.equal(encodeListLocationState(state, offered).get("compare"), "m1,m2,m3");
  // Other list state changes keep the comparison in the URL.
  assert.equal(encodeListLocationState({ ...state, density: "compact" }, offered).get("compareBaseline"), "m2");
  // A surface without Compare drops it, and an invalid comparison is not decoded.
  assert.equal(decodeListLocationState("compare=m1,m2", descriptor()).compare, undefined);
  assert.equal(decodeListLocationState("compare=m1", offered).compare, undefined);
});

test("URL state: records in column order, baseline in the set, and invalid states refused", () => {
  const read = (search: string) => readCompareLocation(new URLSearchParams(search));
  assert.equal(read(""), undefined);
  assert.deepEqual(read("compare=b,a&compareBaseline=a&compareAll=true"), { records: ["b", "a"], baseline: "a", all: true });
  assert.deepEqual(read("compare=a,a,b"), { records: ["a", "b"] });
  for (const search of ["compare=a", "compare=a,b,c,d,e", "compare=a,b&compareBaseline=c", "compare=a,b&compareAll=yes", "compareBaseline=a", "compare=a,b%20c"])
    assert.equal(read(search), "invalid", search);
  const params = new URLSearchParams("view=x&compareAll=true");
  writeCompareLocation(params, { records: ["a", "b"], baseline: "b" });
  assert.equal(params.toString(), "view=x&compare=a%2Cb&compareBaseline=b");
  writeCompareLocation(params, undefined);
  assert.equal(params.toString(), "view=x");
});
