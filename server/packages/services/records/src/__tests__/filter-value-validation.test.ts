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
  ["relative", "today"], ["relative", "this_quarter"], ["relative", "next_year"], ["between", [1, 2]], ["in", ["a"]], ["eq", null],
  ["contains", "text"], ["is_null", undefined], ["eq", false], ["gte", 0],
])("accepts valid %s", (operator, value) => {
  expect(() => validateFilterValue({ field: "field", operator, value } as RecordFilter)).not.toThrow();
});
it.each([
  ["date", "gte", "2026-10-08T00:00:00Z"], ["date", "lt", "2026-02-30"], ["date", "between", ["2026-10-01", "10/31/2026"]],
  ["datetime", "gte", "2026-10-08T14:30:00"], ["datetime", "lt", "2026-10-08T14:30Z"], ["datetime", "eq", "2026-10-08T14:30:00+0800"],
  ["datetime", "in", ["2026-10-08T14:30:00Z", "2026-10-08"]],
])("rejects a %s %s value that is not written exactly as compared", (fieldType, operator, value) => {
  expect(() => validateFilterValue({ field: "field", operator, value } as RecordFilter, fieldType)).toThrowError(expect.objectContaining({ statusCode: 400, code: "INVALID_FILTER_VALUE" }));
});
it.each([
  ["date", "gte", "2026-10-08"], ["date", "between", ["2026-10-01", "2026-10-31"]], ["datetime", "lt", "2026-10-08T14:30:00Z"],
  ["datetime", "gte", "2026-10-08T14:30:00.5+08:00"], ["datetime", "eq", null], ["datetime", "relative", "this_month"], ["string", "eq", "2026-10-08T14:30:00"],
])("accepts a %s %s value written exactly", (fieldType, operator, value) => {
  expect(() => validateFilterValue({ field: "field", operator, value } as RecordFilter, fieldType)).not.toThrow();
});
