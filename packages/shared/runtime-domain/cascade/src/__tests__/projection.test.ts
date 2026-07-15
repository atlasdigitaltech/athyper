import { describe, expect, it } from "vitest";
import { projectInheritance } from "../projection.js";
import type { DefaultsMap } from "../types.js";

const PIL_DEFAULTS: DefaultsMap = {
  cost_center_id: {
    default_value_source: { kind: "parent_field", parent_entity: "purchase_invoice", parent_field: "cost_center_id" },
    override_detection: { compare_to: "parent.cost_center_id" },
    on_parent_change: "preserve",
  },
  project_id: {
    default_value_source: { kind: "parent_field", parent_entity: "purchase_invoice", parent_field: "project_id" },
    override_detection: { compare_to: "parent.project_id" },
    on_parent_change: "preserve",
  },
  business_intent_id: {
    // No override_detection — chip should not render
    default_value_source: { kind: "static", static_value: null },
    on_parent_change: "preserve",
  },
};

describe("projectInheritance", () => {
  it("labels matching child/parent as inherited_match", () => {
    const result = projectInheritance(
      { cost_center_id: "CC-A", project_id: "P-1" },
      { cost_center_id: "CC-A", project_id: "P-1" },
      PIL_DEFAULTS,
    );
    expect(result.cost_center_id).toBe("inherited_match");
    expect(result.project_id).toBe("inherited_match");
  });

  it("labels divergent values as overridden", () => {
    const result = projectInheritance(
      { cost_center_id: "CC-B" },
      { cost_center_id: "CC-A" },
      PIL_DEFAULTS,
    );
    expect(result.cost_center_id).toBe("overridden");
  });

  it("labels null child against valued parent as inherited_null", () => {
    const result = projectInheritance(
      { cost_center_id: null },
      { cost_center_id: "CC-A" },
      PIL_DEFAULTS,
    );
    expect(result.cost_center_id).toBe("inherited_null");
  });

  it("labels both null as unset", () => {
    const result = projectInheritance(
      { project_id: null },
      { project_id: null },
      PIL_DEFAULTS,
    );
    expect(result.project_id).toBe("unset");
  });

  it("omits fields with no override_detection", () => {
    const result = projectInheritance(
      { business_intent_id: "INTENT-X" },
      { business_intent_id: null },
      PIL_DEFAULTS,
    );
    expect(result.business_intent_id).toBeUndefined();
  });

  it("returns empty object when defaults map is empty", () => {
    expect(projectInheritance({}, {}, {})).toEqual({});
  });
});
