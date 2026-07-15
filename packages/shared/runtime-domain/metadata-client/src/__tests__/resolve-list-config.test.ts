import { describe, expect, it } from "vitest";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";

import { resolveListConfig } from "../compiled-reader.js";

// ─────────────────────────────────────────────────────────────────────────────
// resolveListConfig — column selection semantics
//
// The contract under test (P0 of the line-item column retirement):
//
//   - When `display_config.list_columns` is a non-empty array, it is
//     authoritative for BOTH membership AND order. Unknown field names are
//     silently dropped. Fields not listed are NOT re-added by sort_order.
//   - When `list_columns` is absent or empty, the fallback heuristic runs:
//     pick filterable-or-sortable fields, take the first 8, sort by
//     sort_order. (Identical to the previous behaviour.)
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_BASE: Omit<EntityField, "id" | "name" | "column_name" | "sort_order"> = {
  label: null,
  description: null,
  data_type: "text",
  ui_type: null,
  format: null,
  unit: null,
  cardinality: "one",
  origin: "business",
  is_required: false,
  is_readonly: false,
  is_unique: false,
  is_searchable: false,
  is_filterable: true,   // default to filterable so fields are eligible for the fallback heuristic
  is_sortable: true,
  is_groupable: false,
  is_aggregatable: false,
  is_pii: false,
  is_computed: false,
  is_write_once: false,
  is_primary_amount: false,
  is_primary_currency: false,
  default_value: null,
  validation_rules: null,
  enum_domain_code: null,
  reference_config: null,
  group_key: null,
  i18n_key: null,
};

function field(name: string, sortOrder: number, over: Partial<EntityField> = {}): EntityField {
  return {
    ...FIELD_BASE,
    id: `00000000-0000-0000-0000-${name.padEnd(12, "0").slice(0, 12)}`,
    name,
    column_name: name,
    sort_order: sortOrder,
    ...over,
  };
}

function entity(over: { fields: EntityField[]; list_columns?: string[] }): CompiledEntity {
  return {
    entity_id: "00000000-0000-0000-0000-000000000001",
    entity_code: "test_entity",
    slug: "test-entity",
    entity_name: "Test Entity",
    entity_class: "MASTER",
    table_schema: "master",
    table_name: "test_entity",
    version_no: 1,
    version_hash: "deadbeef",
    fields: over.fields,
    field_groups: [],
    display_config: over.list_columns === undefined
      ? {}
      : { list_columns: over.list_columns },
    feature_flags: {},
    governance_level: "standard",
    security_tier: "standard",
    compiled_at: "2026-04-20T00:00:00.000Z",
    compiled_hash: "deadbeef",
  } as unknown as CompiledEntity;
}

describe("resolveListConfig — list_columns authoritative semantics", () => {
  it("preserves list_columns order even when it disagrees with field.sort_order", () => {
    const fields = [
      field("a", 10),
      field("b", 20),
      field("c", 30),
    ];
    const result = resolveListConfig(entity({ fields, list_columns: ["c", "a", "b"] }));

    expect(result.columns.map((f) => f.name)).toEqual(["c", "a", "b"]);
  });

  it("silently drops unknown field names from list_columns", () => {
    const fields = [
      field("a", 10),
      field("b", 20),
    ];
    const result = resolveListConfig(entity({ fields, list_columns: ["b", "ghost", "a"] }));

    expect(result.columns.map((f) => f.name)).toEqual(["b", "a"]);
  });

  it("does NOT re-add omitted fields by sort_order when list_columns is authoritative", () => {
    // `b` and `c` are filterable+sortable — under the OLD fallback heuristic
    // they would be in the result. Under the new authoritative semantics
    // they must not appear because list_columns deliberately omitted them.
    const fields = [
      field("a", 10),
      field("b", 20),
      field("c", 30),
    ];
    const result = resolveListConfig(entity({ fields, list_columns: ["a"] }));

    expect(result.columns.map((f) => f.name)).toEqual(["a"]);
  });

  it("returns no columns when list_columns is non-empty but every name is unknown", () => {
    const fields = [field("a", 10), field("b", 20)];
    const result = resolveListConfig(entity({ fields, list_columns: ["x", "y"] }));

    expect(result.columns).toEqual([]);
  });
});

describe("resolveListConfig — fallback when list_columns is absent or empty", () => {
  it("falls back to filterable-or-sortable fields sorted by sort_order when list_columns is absent", () => {
    // Input fields are deliberately NOT in sort_order — the fallback must sort.
    const fields = [
      field("c", 30),
      field("a", 10),
      field("b", 20),
    ];
    const result = resolveListConfig(entity({ fields }));

    expect(result.columns.map((f) => f.name)).toEqual(["a", "b", "c"]);
  });

  it("treats an empty list_columns array the same as absent (fallback)", () => {
    const fields = [
      field("a", 10),
      field("b", 20),
    ];
    const result = resolveListConfig(entity({ fields, list_columns: [] }));

    expect(result.columns.map((f) => f.name)).toEqual(["a", "b"]);
  });

  it("caps the fallback heuristic at 8 columns", () => {
    const fields = Array.from({ length: 10 }, (_, i) => field(`f${i}`, (i + 1) * 10));
    const result = resolveListConfig(entity({ fields }));

    expect(result.columns).toHaveLength(8);
    expect(result.columns.map((f) => f.name)).toEqual([
      "f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7",
    ]);
  });

  it("excludes fields that are neither filterable nor sortable from the fallback", () => {
    const fields = [
      field("a", 10, { is_filterable: true,  is_sortable: false }),
      field("b", 20, { is_filterable: false, is_sortable: true  }),
      field("c", 30, { is_filterable: false, is_sortable: false }),
    ];
    const result = resolveListConfig(entity({ fields }));

    expect(result.columns.map((f) => f.name)).toEqual(["a", "b"]);
  });
});

describe("resolveListConfig — authoritative path bypasses filterable/sortable gate", () => {
  it("includes list_columns fields even if they are neither filterable nor sortable", () => {
    // This is the load-bearing property for the line-item migration: the DDL
    // author should be able to project any field into the columns array
    // without first re-flagging it as filterable or sortable.
    const fields = [
      field("a", 10, { is_filterable: false, is_sortable: false }),
      field("b", 20, { is_filterable: false, is_sortable: false }),
    ];
    const result = resolveListConfig(entity({ fields, list_columns: ["b", "a"] }));

    expect(result.columns.map((f) => f.name)).toEqual(["b", "a"]);
  });
});
