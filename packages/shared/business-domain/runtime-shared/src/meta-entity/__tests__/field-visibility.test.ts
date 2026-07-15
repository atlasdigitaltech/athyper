import { describe, expect, it } from "vitest";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import { evaluateMetaEntityFieldVisibility } from "../field-visibility";

describe("evaluateMetaEntityFieldVisibility", () => {
  it("honors surface-specific visibility", () => {
    const hiddenInEdit = field("internal_note", { visibility: { hideIn: ["edit"] } });

    expect(evaluateMetaEntityFieldVisibility(hiddenInEdit, {
      surface: "detail",
      values: {},
    }).visible).toBe(true);

    expect(evaluateMetaEntityFieldVisibility(hiddenInEdit, {
      surface: "edit",
      values: {},
    })).toEqual({
      visible: false,
      reason: "Field is hidden in edit.",
    });
  });

  it("evaluates conditional predicates from current values", () => {
    const taxField = field("tax_id", {
      visibility: {
        when: { field: "business_type", eq: "vendor" },
      },
    });

    expect(evaluateMetaEntityFieldVisibility(taxField, {
      surface: "edit",
      values: { business_type: "customer" },
    }).visible).toBe(false);

    expect(evaluateMetaEntityFieldVisibility(taxField, {
      surface: "edit",
      values: { business_type: "vendor" },
    }).visible).toBe(true);
  });
});

function field(name: string, overrides: Partial<MetaEntityField> = {}): MetaEntityField {
  return {
    key: name,
    name,
    columnName: name,
    label: name,
    dataType: "text",
    uiType: "text",
    order: 10,
    isRequired: false,
    isUnique: false,
    isSearchable: false,
    isFilterable: false,
    isSortable: false,
    isGroupable: false,
    isAggregatable: false,
    isReadOnly: false,
    isComputed: false,
    isWriteOnce: false,
    ...overrides,
  } as MetaEntityField;
}
