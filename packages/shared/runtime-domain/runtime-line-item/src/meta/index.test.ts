import { describe, expect, it } from "vitest";
import type { EntityField } from "@athyper/api-contracts/metadata";
import { formatFieldValue } from "./index";

function field(overrides: Partial<EntityField>): EntityField {
  return {
    name: "value",
    data_type: "numeric",
    ui_type: "number",
    money_config: null,
    ...overrides,
  } as EntityField;
}

describe("formatFieldValue metadata semantics", () => {
  it("formats a percent from ui_type without document currency", () => {
    expect(formatFieldValue(100, field({ name: "split_pct", ui_type: "percent" }), "MYR"))
      .toBe("100%");
  });

  it("does not add document currency to a generic numeric field", () => {
    expect(formatFieldValue(12.5, field({ name: "split_quantity" }), "MYR"))
      .toBe("12.5");
  });

  it("uses currency only when the field declares money semantics", () => {
    expect(formatFieldValue(12.5, field({ name: "split_amount", ui_type: "money" }), "MYR"))
      .toContain("MYR");
  });
});
