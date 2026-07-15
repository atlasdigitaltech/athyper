import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CompiledEntity, EntityField, FieldGroup } from "@athyper/api-contracts/metadata";
import { ProcureItemPanel } from "../procure-item-panel";

vi.mock("../../../components/meta-field-input", () => ({
  MetaFieldInput: ({
    field,
    value,
    onChange,
    disabled,
  }: {
    field: EntityField;
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
  }) => (
    <input
      aria-label={field.label ?? field.name}
      value={String(value ?? "")}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

function makeField(overrides: Partial<EntityField> & Pick<EntityField, "name" | "data_type" | "group_key">): EntityField {
  return {
    id: `00000000-0000-0000-0000-${overrides.name.padEnd(12, "0").slice(0, 12)}`,
    column_name: overrides.name,
    label: null,
    description: null,
    ui_type: null,
    format: null,
    unit: null,
    cardinality: "one",
    origin: "standard",
    is_required: false,
    is_readonly: false,
    is_unique: false,
    is_searchable: false,
    is_filterable: true,
    is_sortable: true,
    is_groupable: false,
    is_aggregatable: false,
    is_pii: false,
    is_computed: false,
    default_value: null,
    compute_expr: null,
    validation_rules: null,
    enum_domain_code: null,
    reference_config: null,
    visibility: null,
    sort_order: 0,
    i18n_key: null,
    ...overrides,
  } as unknown as EntityField;
}

function makeGroup(overrides: Partial<FieldGroup> & Pick<FieldGroup, "group_key" | "label" | "columns">): FieldGroup {
  return {
    id: `group-${overrides.group_key}`,
    description: null,
    sort_order: 0,
    ui_intent: null,
    ...overrides,
  } as unknown as FieldGroup;
}

const ENTITY: CompiledEntity = {
  entity_code: "commitment_line",
  display_config: {
    procure_line: {
      editor_tabs: [
        {
          key: "item",
          label: "Item",
          type: "fields",
          groups: ["quantities", "item", "pricing"],
        },
      ],
    },
  },
  fields: [
    makeField({ name: "item_description", label: "Description", data_type: "text", group_key: "item", sort_order: 10 }),
    makeField({ name: "procurement_type", label: "Procurement Type", data_type: "enum", group_key: "item", sort_order: 20 }),
    makeField({ name: "uom_code", label: "UOM", data_type: "text", group_key: "quantities", sort_order: 30 }),
    makeField({ name: "quantity", label: "Quantity", data_type: "decimal", group_key: "quantities", sort_order: 40 }),
    makeField({ name: "unit_price", label: "Unit Price", data_type: "decimal", group_key: "pricing", sort_order: 50 }),
    makeField({ name: "price_unit", label: "Price Per", data_type: "decimal", group_key: "pricing", sort_order: 60 }),
  ],
  field_groups: [
    makeGroup({ group_key: "item", label: "Item", columns: 2, sort_order: 10, ui_intent: "what" }),
    makeGroup({ group_key: "quantities", label: "Quantities", columns: 2, sort_order: 20 }),
    makeGroup({ group_key: "pricing", label: "Pricing", columns: 2, sort_order: 30, ui_intent: "how_much" }),
  ],
} as unknown as CompiledEntity;

describe("procure-item-panel", () => {
  it("renders quantity-group fields on the Item tab even when the group has no ui_intent", () => {
    render(
      <ProcureItemPanel
        entity={ENTITY}
        mode="edit"
        parentEntityCode="purchase_order"
        lineEntityCode="commitment_line"
        line={null}
        draft={{}}
        onDraftChange={vi.fn()}
        recordId="po-1"
      />,
    );

    expect(screen.getByLabelText("UOM")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit Price")).toBeInTheDocument();
    expect(screen.getByLabelText("Price Per")).toBeInTheDocument();
  });
});
