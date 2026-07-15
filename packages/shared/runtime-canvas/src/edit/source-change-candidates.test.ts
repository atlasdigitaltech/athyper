import { describe, expect, it } from "vitest";
import type { EntityFieldDefaults } from "@athyper/cascade";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import { hasClientSourceChangeCandidates } from "./source-change-candidates";

describe("hasClientSourceChangeCandidates", () => {
  it("detects dependent picker defaults even when explicit defaults are absent", () => {
    const fields = [
      field("supplier_id"),
      field("billfrom_address_id", {
        lookupConfig: {
          dependent_filter: {
            source_field: "supplier_id",
            target_field: "owner_id",
          },
        },
      }),
    ];

    expect(hasClientSourceChangeCandidates(fields, ["supplier_id"], {})).toBe(true);
  });

  it("detects explicit client source-change rules", () => {
    const defaultsByField: Record<string, EntityFieldDefaults> = {
      payment_term_id: {
        on_source_change: [{
          sources: ["supplier_id"],
          action: "rederive",
          resolver: "supplier.default_payment_term",
          mode: "if_empty_or_derived",
          layers: ["client_on_change"],
        }],
      },
    };

    expect(hasClientSourceChangeCandidates([field("supplier_id")], ["supplier_id"], defaultsByField)).toBe(true);
  });

  it("ignores unrelated field changes", () => {
    const fields = [
      field("supplier_id"),
      field("billfrom_address_id", {
        lookupConfig: {
          dependent_filter: {
            source_field: "supplier_id",
            target_field: "owner_id",
          },
        },
      }),
    ];

    expect(hasClientSourceChangeCandidates(fields, ["invoice_name"], {})).toBe(false);
  });
});

function field(name: string, patch: Partial<MetaEntityField> = {}): MetaEntityField {
  return {
    key: name,
    name,
    columnName: name,
    label: name,
    dataType: "uuid",
    order: 0,
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
    ...patch,
  } as MetaEntityField;
}
