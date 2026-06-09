import { describe, expect, it } from "vitest";
import type { CompiledEntity, EntityField, FieldGroup } from "@athyper/api-contracts/metadata";

import { resolveDetailConfig } from "../compiled-reader.js";

const FIELD_BASE: Omit<EntityField, "id" | "name" | "column_name" | "sort_order" | "group_key"> = {
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
  is_filterable: false,
  is_sortable: false,
  is_groupable: false,
  is_aggregatable: false,
  is_pii: false,
  is_computed: false,
  is_write_once: false,
  default_value: null,
  validation_rules: null,
  enum_domain_code: null,
  reference_config: null,
  i18n_key: null,
};

function field(name: string, sortOrder: number, groupKey: string): EntityField {
  return {
    ...FIELD_BASE,
    id: `00000000-0000-0000-0000-0000000000${sortOrder.toString().padStart(2, "0")}`,
    name,
    column_name: name,
    sort_order: sortOrder,
    group_key: groupKey,
  };
}

function group(groupKey: string, sortOrder: number, fields: string[]): FieldGroup {
  return {
    group_key: groupKey,
    label: groupKey,
    description: null,
    sort_order: sortOrder,
    columns: 2,
    page_span: "half",
    fields,
  };
}

function entity(fieldGroups: FieldGroup[]): CompiledEntity {
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
    fields: [
      field("second", 20, "second_group"),
      field("first", 10, "first_group"),
    ],
    field_groups: fieldGroups,
    display_config: {},
    feature_flags: {},
    governance_level: "standard",
    security_tier: "standard",
    compiled_at: "2026-04-20T00:00:00.000Z",
    compiled_hash: "deadbeef",
  };
}

describe("resolveDetailConfig", () => {
  it("does not mutate compiled field_groups while sorting sections", () => {
    const fieldGroups = [
      group("second_group", 20, ["second"]),
      group("first_group", 10, ["first"]),
    ];
    const compiled = entity(fieldGroups);

    const result = resolveDetailConfig(compiled);

    expect(result.sections.map((section) => section.group.group_key)).toEqual(["first_group", "second_group"]);
    expect(compiled.field_groups.map((item) => item.group_key)).toEqual(["second_group", "first_group"]);
  });
});
