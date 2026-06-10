import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type {
  LineItemAmountConfig,
  LineItemSection,
  LineItemTab,
  MetaLineColumn,
} from "../types";
import { fieldLabel } from "../meta";
import { fieldsForGroups } from "./procure";

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC VARIANT RESOLVERS
//
// Fallback when no specific variant is configured.
// Renders a flat field form in composer, single "Fields" tab in editor.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveGenericComposerSections(
  entity: CompiledEntity | null,
): LineItemSection[] {
  if (!entity) return [];

  const groupKeys = new Set(
    entity.fields
      .filter((f) => f.group_key && f.origin !== "system")
      .map((f) => f.group_key as string),
  );

  if (groupKeys.size === 0) {
    return [{
      key: "fields", label: "Fields", type: "other", groups: [], fields: [], defaultOpen: true,
    }];
  }

  return Array.from(groupKeys).map((gk) => ({
    key:         gk,
    label:       gk.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type:        "other" as const,
    groups:      [gk],
    fields:      [],
    defaultOpen: true,
  }));
}

export function resolveGenericEditorTabs(entity: CompiledEntity | null): LineItemTab[] {
  if (!entity) return [{ key: "fields", label: "Fields", type: "fields", groups: [], fields: [] }];

  const groupKeys = new Set(
    entity.fields
      .filter((f) => f.group_key && f.origin !== "system")
      .map((f) => f.group_key as string),
  );

  if (groupKeys.size === 0) {
    return [{ key: "fields", label: "Fields", type: "fields", groups: [], fields: [] }];
  }

  return Array.from(groupKeys).map((gk) => ({
    key:    gk,
    label:  gk.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type:   "fields" as const,
    groups: [gk],
    fields: [],
  }));
}

export function resolveGenericAmountConfig(entity: CompiledEntity | null): LineItemAmountConfig | null {
  if (!entity) return null;
  const amountField = entity.fields.find((f) => f.data_type === "money");
  if (!amountField) return null;
  return {
    amountField:  amountField.name,
    summaryFields: [{ name: amountField.name, label: fieldLabel(amountField), bold: true }],
    financialBar:  [{ name: amountField.name, label: fieldLabel(amountField) }],
  };
}

export function buildGenericColumnCatalog(entity: CompiledEntity | null): MetaLineColumn[] {
  if (!entity) return [];
  return entity.fields
    .filter((f) => f.origin !== "system" && !f.is_computed)
    .slice(0, 8)
    .map((f): MetaLineColumn => ({
      key:     f.name,
      label:   fieldLabel(f),
      field:   f,
      numeric: ["money", "decimal", "integer", "numeric"].includes(f.data_type),
      align:   ["money", "decimal", "integer", "numeric"].includes(f.data_type) ? "right" : "left",
      sortable: true,
    }));
}
