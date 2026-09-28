import { expect, it } from "vitest";
import type { RecordFilter } from "@athyper/server-contract-records";
import { validateFilterValue } from "../filter-value-validation.js";

it.each([
  ["relative", "someday"], ["between", [1]], ["in", []], ["in", [{}]],
  ["eq", undefined], ["contains", {}], ["gt", NaN], ["is_null", "x"],
])("rejects malformed %s before SQL", (operator, value) => {
  expect(() => validateFilterValue({ field: "field", operator, value } as RecordFilter)).toThrowError(expect.objectContaining({ statusCode: 400, code: "INVALID_FILTER_VALUE" }));
});
it.each([
  ["relative", "today"], ["between", [1, 2]], ["in", ["a"]], ["eq", null],
  ["contains", "text"], ["is_null", undefined], ["eq", false], ["gte", 0],
])("accepts valid %s", (operator, value) => {
  expect(() => validateFilterValue({ field: "field", operator, value } as RecordFilter)).not.toThrow();
});
