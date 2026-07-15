import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CompiledEntity, EntityField, FieldGroup } from "@athyper/api-contracts/metadata";
import { MetaFieldPanel } from "../meta-field-panel";

vi.mock("../../components/meta-field-input", () => ({
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
  entity_code: "purchase_order_line",
  display_config: {},
  fields: [
    makeField({
      name: "description",
      label: "Description",
      data_type: "text",
      group_key: "item",
      sort_order: 10,
    }),
    makeField({
      name: "procurement_type",
      label: "Procurement Type",
      data_type: "enum",
      group_key: "item",
      sort_order: 20,
    }),
    makeField({
      name: "uom_code",
      label: "UOM",
      data_type: "text",
      group_key: "pricing",
      sort_order: 30,
      visibility: { when: { field: "procurement_type", notNull: true } },
    }),
    makeField({
      name: "quantity",
      label: "Quantity",
      data_type: "decimal",
      group_key: "pricing",
      sort_order: 40,
      visibility: { when: { field: "procurement_type", notNull: true } },
    }),
  ],
  field_groups: [
    makeGroup({ group_key: "item", label: "Item", columns: 2, ui_intent: "what", sort_order: 10 }),
    makeGroup({ group_key: "pricing", label: "Pricing", columns: 2, ui_intent: "how_much", sort_order: 20 }),
  ],
} as unknown as CompiledEntity;

describe("meta-field-panel", () => {
  it("re-evaluates field visibility using the live draft values", () => {
    const onDraftChange = vi.fn();
    const baseProps = {
      entity: ENTITY,
      uiIntents: ["what", "how_much"],
      onDraftChange,
      saving: false,
      line: null,
      recordId: "po-1",
      mode: "edit" as const,
      parentEntityCode: "purchase_order",
      lineEntityCode: "purchase_order_line",
    };

    const { rerender } = render(
      <MetaFieldPanel
        {...baseProps}
        draft={{}}
      />,
    );

    expect(screen.queryByLabelText("UOM")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();

    rerender(
      <MetaFieldPanel
        {...baseProps}
        draft={{ procurement_type: "material" }}
      />,
    );

    expect(screen.getByLabelText("UOM")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
  });
});
