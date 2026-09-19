import assert from "node:assert/strict";
import test from "node:test";
import {
  directorySelectionKey,
  reconcileDirectorySelection,
  scopeFilterReady,
  type DirectoryFilterAdapter,
} from "../../packages/platform/entity/runtime/list-view/src/directory-filters";
const options = [{ value: "selected", label: "Selected" }];
const filters = [
  { key: "category", options },
  { key: "classification", requires: ["category"], options },
  {
    key: "operation",
    requires: ["classification", "organization", "company"],
    options,
  },
];
const adapter: DirectoryFilterAdapter = {
  value: {},
  companies: [],
  apply: () => {},
  organizations: [
    {
      id: "org",
      displayName: "Org",
      companyAssignments: [{ companyCodeId: "company" }],
    },
  ],
};
const selected = {
  category: "selected",
  classification: "selected",
  operation: "selected",
  operatingOrganizationIds: ["org"],
  companyCodeIds: ["company"],
};
test("arbitrary filter dependencies clear transitively, independent of declaration order", () => {
  for (const order of [filters, [...filters].reverse()]) {
    const next = reconcileDirectorySelection(
      order,
      selected,
      { ...selected, category: undefined },
      adapter,
    );
    assert.equal(next.classification, undefined);
    assert.equal(next.operation, undefined);
    assert.deepEqual(next.operatingOrganizationIds, ["org"]);
  }
});
test("scope changes invalidate dependent filters and reject incompatible companies", () => {
  assert.equal(scopeFilterReady(filters[2]!, selected, adapter), true);
  const next = { ...selected, companyCodeIds: ["unassigned"] };
  assert.equal(scopeFilterReady(filters[2]!, next, adapter), false);
  assert.equal(
    reconcileDirectorySelection(filters, selected, next, adapter).operation,
    undefined,
  );
  assert.equal(
    reconcileDirectorySelection(filters, selected, next, adapter)
      .classification,
    "selected",
  );
});
test("a valid dependent choice survives an unrelated change and invalid options are cleared", () => {
  assert.equal(
    reconcileDirectorySelection(
      filters,
      selected,
      { ...selected, unrelated: "new" },
      adapter,
    ).operation,
    "selected",
  );
  assert.equal(
    reconcileDirectorySelection(
      filters,
      selected,
      { ...selected, operation: "unknown" },
      adapter,
    ).operation,
    undefined,
  );
});
test("selection comparison includes arbitrary keys and ignores empty and reordered sets", () => {
  assert.equal(
    directorySelectionKey({
      category: undefined,
      companyCodeIds: [],
      other: "",
    }),
    directorySelectionKey({}),
  );
  assert.equal(
    directorySelectionKey({ tags: ["b", "a"], category: "selected" }),
    directorySelectionKey({ category: "selected", tags: ["a", "b"] }),
  );
  assert.notEqual(
    directorySelectionKey({ category: "selected" }),
    directorySelectionKey({ category: "different" }),
  );
});
