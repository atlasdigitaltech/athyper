import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPARE_MAX_FIELDS,
  COMPARE_MAX_RECORDS,
  COMPARE_MIN_RECORDS,
  COMPARE_NARROW_COLUMNS,
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
