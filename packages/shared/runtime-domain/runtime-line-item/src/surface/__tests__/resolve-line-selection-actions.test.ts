import { describe, expect, it, vi } from "vitest";
import type { MetaEntityOperation } from "@athyper/runtime-contracts";
import { resolveLineSelectionActions } from "../resolve-line-selection-actions";

function operation(overrides: Partial<MetaEntityOperation>): MetaEntityOperation {
  return {
    key: "op",
    permissionCode: "line.update",
    surface: "DETAIL",
    placement: "CONTEXT",
    handlerType: "MODAL",
    handlerTarget: "edit_line",
    isRecordRequired: true,
    order: 10,
    enabled: true,
    permissionDecision: "allow",
    selectionConfig: {
      enabled: true,
      cardinality: "single",
      group: "item",
      presentation: "action",
      bulkStrategy: "none",
      preserveSelectionOnSuccess: false,
    },
    ...overrides,
  };
}

describe("resolve-line-selection-actions", () => {
  it("filters operations by selection cardinality", () => {
    const editItem = vi.fn();
    const actions = resolveLineSelectionActions([
      operation({}),
      operation({
        key: "mass",
        permissionCode: "line.bulk_update",
        selectionConfig: {
          enabled: true,
          cardinality: "multiple",
          group: "item",
          presentation: "action",
          bulkStrategy: "bulk_patch",
          preserveSelectionOnSuccess: false,
        },
      }),
    ], 1, { editItem });
    expect(actions.map((action) => action.label)).toEqual(["Edit item"]);
  });

  it("groups component menu items from metadata", () => {
    const addComponent = vi.fn();
    const actions = resolveLineSelectionActions([
      operation({
        permissionCode: "line.add_discount",
        handlerTarget: "add_discount",
        label: "Add discount",
        selectionConfig: {
          enabled: true,
          cardinality: "both",
          group: "components",
          presentation: "menu_item",
          bulkStrategy: "per_record_atomic",
          preserveSelectionOnSuccess: false,
        },
      }),
    ], 3, { addComponent });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.label).toBe("Components");
    actions[0]?.items?.[0]?.onSelect();
    expect(addComponent).toHaveBeenCalledWith("discount");
  });
});
