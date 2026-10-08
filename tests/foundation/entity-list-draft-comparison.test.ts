import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListSortV1 } from "@athyper/contract-platform-entity-list";
import { columnsModified, sortModified } from "../../packages/platform/entity/runtime/list-view/src/draft-comparison";

// Foundation section 6: sort and column comparisons must stay order-sensitive.
// A future cleanup that normalizes either would hide a real change.
describe("editor draft comparison", () => {
  const sort: readonly ListSortV1[] = [
    { field: "code", direction: "asc" },
    { field: "name", direction: "desc" },
  ];

  it("marks a sort-level reorder as modified", () => {
    assert.equal(sortModified([sort[1]!, sort[0]!], sort), true);
    assert.equal(sortModified([...sort], sort), false);
  });

  it("marks a column reorder as modified", () => {
    assert.equal(columnsModified(["name", "code", "status"], ["code", "name", "status"]), true);
    assert.equal(columnsModified(["code", "name", "status"], ["code", "name", "status"]), false);
  });
});
