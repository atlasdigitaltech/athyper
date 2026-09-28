import { expect, it } from "vitest";
import { projectFieldQueryAccess } from "../native-runtime-projection.js";

it.each([
  [[], true, false, false],
  [["filter"], true, true, false],
  [["search"], true, false, true],
  [["search", "filter"], false, true, false],
  [["search", "filter"], true, true, true],
] as const)("projects independent query policy %j, configured=%s", (uses, configured, filterable, searchable) => {
  expect(projectFieldQueryAccess(uses, configured)).toEqual({sortable:false, filterable, searchable});
});
