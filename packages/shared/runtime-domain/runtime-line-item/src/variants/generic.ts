import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type {
  LineItemAmountConfig,
  LineItemSection,
  LineItemTab,
  MetaLineColumn,
} from "../types";
import { fieldLabel } from "../meta";
import { fieldsForGroups } from "./procure";
import { resolveSummaryStripFromMeta } from "./summary-strip";

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
  const meta = resolveSummaryStripFromMeta(entity);

  const fallbackAmountField = entity.fields.find((f) => f.data_type === "money");
  const amountFieldName = meta.amountField ?? fallbackAmountField?.name ?? null;
  if (!amountFieldName) return null;

  const amountFieldDef = entity.fields.find((f) => f.name === amountFieldName) ?? fallbackAmountField!;
  const summaryFields = meta.summaryFields ?? [
    { name: amountFieldDef.name, label: fieldLabel(amountFieldDef), bold: true },
  ];

  return {
    amountField:   amountFieldName,
    currencyField: meta.currencyField ?? undefined,
    summaryFields,
    financialBar:  [{ name: amountFieldDef.name, label: fieldLabel(amountFieldDef) }],
  };
}

