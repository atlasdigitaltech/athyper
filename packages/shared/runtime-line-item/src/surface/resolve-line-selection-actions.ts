import { BadgePercent, Calculator, Copy, Pencil, Plus, ReceiptText, ShieldMinus, Tag, Trash2 } from "lucide-react";
import type { MetaEntityOperation } from "@athyper/runtime-contracts";
import type { SelectionAction, SelectionActionItem } from "@athyper/platform-ui/composites";
import type { LinePricingComponentKind } from "../types";

export interface LineSelectionActionHandlers {
  editItem?: () => void;
  editAccounting?: () => void;
  addComponent?: (kind: LinePricingComponentKind) => void;
  copy?: () => void;
  delete?: () => void;
}

export function resolveLineSelectionActions(
  operations: ReadonlyArray<MetaEntityOperation>,
  selectionCount: number,
  handlers: LineSelectionActionHandlers,
): SelectionAction[] {
  const cardinality = selectionCount === 1 ? "single" : "multiple";
  const eligible = operations.filter((operation) => {
    const config = operation.selectionConfig;
    return operation.enabled && operation.permissionDecision !== "deny" && config?.enabled === true
      && (config.cardinality === "both" || config.cardinality === cardinality);
  });
  if (eligible.length === 0) return [];

  const direct: SelectionAction[] = [];
  const menuItems = new Map<string, SelectionActionItem[]>();
  for (const operation of eligible.sort((left, right) => left.order - right.order)) {
    const resolved = resolveOperationHandler(operation, handlers);
    if (!resolved) continue;
    const action: SelectionAction = {
      id: operation.permissionCode,
      label: operation.label ?? resolved.label,
      icon: resolved.icon,
      variant: operation.selectionConfig?.group === "danger" ? "destructive" : "default",
      group: operation.selectionConfig?.group === "clipboard" || operation.selectionConfig?.group === "danger" ? "secondary" : "primary",
      disabled: Boolean(operation.disabledReason),
      onSelect: resolved.onSelect,
    };
    if (operation.selectionConfig?.presentation === "menu_item") {
      const group = operation.selectionConfig.group;
      menuItems.set(group, [...(menuItems.get(group) ?? []), action]);
    } else {
      direct.push(action);
    }
  }

  for (const [group, items] of menuItems) {
    direct.push({
      id: `${group}-menu`,
      label: group === "components" ? "Components" : group === "accounting" ? "Accounting" : "More",
      icon: group === "components" ? Plus : Calculator,
      group: "primary",
      onSelect: () => undefined,
      items,
    });
  }
  return direct;
}

function resolveOperationHandler(
  operation: MetaEntityOperation,
  handlers: LineSelectionActionHandlers,
): { label: string; icon: typeof Pencil; onSelect: () => void } | null {
  const code = operation.permissionCode.split(".").pop()?.toLowerCase() ?? "";
  const target = operation.handlerTarget?.toLowerCase() ?? "";
  const key = target || code;
  if ((key === "edit_line" || key === "edit_item" || code === "update" || code === "edit") && handlers.editItem) {
    return { label: "Edit item", icon: Pencil, onSelect: handlers.editItem };
  }
  if ((key === "edit_accounting" || key === "accounting_distribution") && handlers.editAccounting) {
    return { label: "Edit accounting", icon: Calculator, onSelect: handlers.editAccounting };
  }
  if (key.includes("discount") && handlers.addComponent) {
    return { label: "Add discount", icon: BadgePercent, onSelect: () => handlers.addComponent?.("discount") };
  }
  if (key.includes("charge") && handlers.addComponent) {
    return { label: "Add charge", icon: Tag, onSelect: () => handlers.addComponent?.("charge") };
  }
  if (key.includes("withholding") && handlers.addComponent) {
    return { label: "Add withholding tax", icon: ShieldMinus, onSelect: () => handlers.addComponent?.("withholding") };
  }
  if (key.includes("tax") && handlers.addComponent) {
    return { label: "Add tax", icon: ReceiptText, onSelect: () => handlers.addComponent?.("tax") };
  }
  if (key.includes("copy") && handlers.copy) return { label: "Copy", icon: Copy, onSelect: handlers.copy };
  if (key.includes("delete") && handlers.delete) return { label: "Delete", icon: Trash2, onSelect: handlers.delete };
  return null;
}
