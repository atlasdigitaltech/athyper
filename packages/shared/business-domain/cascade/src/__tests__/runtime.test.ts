import { describe, expect, it } from "vitest";
import {
  applyCascadeDefaults,
  renderInheritanceChipModel,
  handleParentChange,
} from "../runtime.js";
import type { DefaultsMap, EntityFieldDefaults } from "../types.js";

const DEFAULTS: DefaultsMap = {
  cost_center_id: {
    default_value_source: {
      kind: "parent_field",
      parent_entity: "purchase_invoice",
      parent_field: "cost_center_id",
      apply_on: ["create"],
    },
    override_detection: {
      compare_to: "parent.cost_center_id",
      label_when_inherited: "From header",
      label_when_overridden: "Overridden",
      label_when_inherited_null: "Not set",
    },
    on_parent_change: "preserve",
    ui_affordance: { show_inheritance_chip: true, chip_position: "field_label" },
  },
};

describe("applyCascadeDefaults", () => {
  it("fills parent_field on create when child is null", () => {
    const result = applyCascadeDefaults(
      { cost_center_id: null },
      { cost_center_id: "CC-A" },
      DEFAULTS,
      "create",
    );
    expect(result.cost_center_id).toBe("CC-A");
  });

  it("does not overwrite existing user input", () => {
    const result = applyCascadeDefaults(
      { cost_center_id: "CC-USER" },
      { cost_center_id: "CC-A" },
      DEFAULTS,
      "create",
    );
    expect(result.cost_center_id).toBe("CC-USER");
  });

  it("skips fields not in apply_on", () => {
    const result = applyCascadeDefaults(
      { cost_center_id: null },
      { cost_center_id: "CC-A" },
      DEFAULTS,
      "reset",
    );
    expect(result.cost_center_id).toBeNull();
  });

  it("applies static value when source kind=static", () => {
    const staticMap: DefaultsMap = {
      tag: {
        default_value_source: { kind: "static", static_value: "NEW", apply_on: ["create"] },
        on_parent_change: "preserve",
      },
    };
    const result = applyCascadeDefaults({}, null, staticMap, "create");
    expect(result.tag).toBe("NEW");
  });
});

describe("renderInheritanceChipModel", () => {
  const def: EntityFieldDefaults = DEFAULTS.cost_center_id!;

  it("hides chip when show_inheritance_chip is false", () => {
    const hidden: EntityFieldDefaults = { ...def, ui_affordance: { show_inheritance_chip: false } };
    expect(renderInheritanceChipModel("inherited_match", hidden).visible).toBe(false);
  });

  it("renders inherited variant with correct label", () => {
    const m = renderInheritanceChipModel("inherited_match", def);
    expect(m.visible).toBe(true);
    expect(m.variant).toBe("inherited");
    expect(m.label).toBe("From header");
  });

  it("renders overridden variant with correct label", () => {
    const m = renderInheritanceChipModel("overridden", def);
    expect(m.variant).toBe("overridden");
    expect(m.label).toBe("Overridden");
  });

  it("hides chip when label is unset", () => {
    expect(renderInheritanceChipModel("unset", def).visible).toBe(false);
  });
});

describe("handleParentChange", () => {
  const def: EntityFieldDefaults = DEFAULTS.cost_center_id!;
  const children = [{ id: "1" }, { id: "2" }, { id: "3" }];

  it("returns silent_preserve when policy is preserve", () => {
    const action = handleParentChange("cost_center_id", "A", "B", children, def);
    expect(action.behavior).toBe("silent_preserve");
    expect(action.affected_indices).toEqual([]);
  });

  it("returns silent_propagate when policy is inherit", () => {
    const inheritDef: EntityFieldDefaults = { ...def, on_parent_change: "inherit" };
    const action = handleParentChange("cost_center_id", "A", "B", children, inheritDef);
    expect(action.behavior).toBe("silent_propagate");
    expect(action.affected_indices).toEqual([0, 1, 2]);
  });

  it("returns prompt_user with message when policy is prompt", () => {
    const promptDef: EntityFieldDefaults = { ...def, on_parent_change: "prompt" };
    const action = handleParentChange("cost_center_id", "A", "B", children, promptDef);
    expect(action.behavior).toBe("prompt_user");
    expect(action.prompt_message).toContain("cost_center_id");
  });

  it("returns silent_preserve when value unchanged", () => {
    const action = handleParentChange("cost_center_id", "A", "A", children, def);
    expect(action.behavior).toBe("silent_preserve");
  });
});
