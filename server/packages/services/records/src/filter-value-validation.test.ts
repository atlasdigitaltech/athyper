import { describe, expect, it } from "vitest";
import { MAX_LIST_FILTER_VALUES } from "@athyper/contract-platform-entity-list";
import { validateFilterValue } from "./filter-value-validation.js";

// The published in-filter limit (Compare blueprint 5.8 point 8).
describe("in filter values", () => {
  it("accepts up to the published limit and refuses more", () => {
    const values = (n: number) => Array.from({ length: n }, (_, index) => `v${index}`);
    expect(MAX_LIST_FILTER_VALUES).toBe(100);
    expect(() => validateFilterValue({ field: "item", operator: "in", value: values(100) })).not.toThrow();
    expect(() => validateFilterValue({ field: "item", operator: "in", value: values(101) })).toThrow(/Invalid value/);
    expect(() => validateFilterValue({ field: "item", operator: "in", value: [] })).toThrow(/Invalid value/);
  });
});
