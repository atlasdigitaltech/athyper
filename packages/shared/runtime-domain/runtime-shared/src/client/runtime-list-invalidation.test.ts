import { describe, expect, it } from "vitest";

import { runtimeListMutationReasonForOperation } from "./runtime-list-invalidation";

describe("runtime list mutation invalidation", () => {
  it.each([
    ["document.post", "posting"],
    ["reverse_posting", "reversal"],
    ["import_records", "import"],
    ["bulk_update", "bulk_operation"],
    ["delete", "delete"],
    ["approve", "status_transition"],
  ] as const)("classifies %s as %s", (operation, expected) => {
    expect(runtimeListMutationReasonForOperation(operation)).toBe(expected);
  });
});
