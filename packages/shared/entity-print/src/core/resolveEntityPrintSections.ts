import type { CompiledEntity, EntityField, FieldGroup } from "@athyper/api-contracts/metadata";
import type { EntityPrintConfig } from "@athyper/runtime-contracts";
import { isPrintExcluded, getFieldDisplayLabel, getGroupDisplayLabel } from "./field-value";

export interface ResolvedPrintField {
  name:      string;
  label:     string;
  data_type: string;
  ui_type:   string;
  reference_config?: EntityField["reference_config"];
  money_config?:     EntityField["money_config"];
}

export interface ResolvedPrintSection {
  key:       string;
  label:     string;
  fields:    ResolvedPrintField[];
  /** Resolved field grid column count (1|2|3). Print default is 2. */
  columns:   1 | 2 | 3;
  /** Whether this section spans the full page or participates in left/right split in two_column mode. */
  page_span: "full" | "half";
  collapsed?: boolean;
}

function toResolvedField(field: EntityField, printConfig: EntityPrintConfig | undefined): ResolvedPrintField {
  return {
    name:             field.name,
    label:            getFieldDisplayLabel(field, printConfig),
    data_type:        field.data_type,
    ui_type:          field.ui_type ?? field.data_type,
    reference_config: field.reference_config ?? undefined,
    money_config:     field.money_config ?? undefined,
  };
}

function resolveColumns(
  explicit: 1 | 2 | 3 | undefined,
  groupColumns: 1 | 2 | 3 | undefined,
  layoutDefault: 1 | 2 | 3 | undefined,
): 1 | 2 | 3 {
  return explicit ?? groupColumns ?? layoutDefault ?? 2;
}

export function resolveEntityPrintSections(entity: CompiledEntity): ResolvedPrintSection[] {
  const displayConfig = entity.display_config as Record<string, unknown> | undefined;
  const printConfig   = displayConfig?.["print_config"] as EntityPrintConfig | undefined;
  const layoutFieldColumns = printConfig?.layout?.["field_columns"] as 1 | 2 | 3 | undefined;

  // Step 1: Hard exclusions
  let eligible = entity.fields.filter((f) => !isPrintExcluded(f, entity));

  // Step 2: Apply excluded_fields from print_config
  if (printConfig?.excluded_fields?.length) {
    const excludeSet = new Set(printConfig.excluded_fields);
    eligible = eligible.filter((f) => !excludeSet.has(f.name));
  }

  // Step 3: Apply included_fields allowlist (if set, keep only those in order)
  if (printConfig?.included_fields != null && printConfig.included_fields.length > 0) {
    const includeOrder: string[] = printConfig.included_fields;
    const byName = new Map<string, EntityField>(eligible.map((f) => [f.name, f]));
    const ordered = includeOrder
      .map((name: string) => byName.get(name))
      .filter((f): f is EntityField => f !== undefined);
    return [
      {
        key:       "__all",
        label:     "",
        fields:    ordered.map((f) => toResolvedField(f, printConfig)),
        columns:   resolveColumns(undefined, undefined, layoutFieldColumns),
        page_span: "half",
      },
    ];
  }

  // Step 4: If print_config.sections defined — use as canonical
  if (printConfig?.sections?.length) {
    const fieldByName = new Map<string, EntityField>(eligible.map((f) => [f.name, f]));
    return (printConfig.sections as Array<{ key: string; label: string; fields: string[]; columns?: 1 | 2 | 3; collapsed?: boolean }>)
      .map((section) => {
        const fields = section.fields
          .map((name: string) => fieldByName.get(name))
          .filter((f): f is EntityField => f !== undefined)
          .map((f) => toResolvedField(f, printConfig));
        return {
          key:       section.key,
          label:     section.label,
          fields,
          columns:   resolveColumns(section.columns, undefined, layoutFieldColumns),
          page_span: "half" as const,
          collapsed: section.collapsed,
        };
      })
      .filter((s: ResolvedPrintSection) => s.fields.length > 0);
  }

  // Step 5: Group-based auto-section
  const groupsByKey = new Map(entity.field_groups.map((g) => [g.group_key, g]));
  const fieldToGroup = new Map<string, string>();
  for (const g of entity.field_groups) {
    for (const fname of g.fields) {
      fieldToGroup.set(fname, g.group_key);
    }
  }

  // Determine group order
  const groupOrder: string[] = printConfig?.group_order ?? [];
  const groupOrderMap = new Map<string, number>(groupOrder.map((k: string, i: number) => [k, i]));
  const sortedGroups = [...entity.field_groups].sort((a, b) => {
    const ai = groupOrderMap.get(a.group_key) ?? 999;
    const bi = groupOrderMap.get(b.group_key) ?? 999;
    if (ai !== bi) return ai - bi;
    return (a.sort_order as number) - (b.sort_order as number);
  });

  const sections: ResolvedPrintSection[] = [];
  const groupedFieldNames = new Set<string>();

  for (const group of sortedGroups) {
    const fields = group.fields
      .map((name) => eligible.find((f) => f.name === name))
      .filter((f): f is EntityField => f !== undefined)
      .map((f) => toResolvedField(f, printConfig));
    if (fields.length === 0) continue;
    groupedFieldNames.add(group.group_key);

    const fg = groupsByKey.get(group.group_key) as FieldGroup | undefined;
    sections.push({
      key:       group.group_key,
      label:     getGroupDisplayLabel(group.group_key, group.label, printConfig),
      fields,
      columns:   resolveColumns(undefined, fg?.columns as 1 | 2 | 3 | undefined, layoutFieldColumns),
      page_span: (fg?.page_span ?? "half") as "full" | "half",
    });
  }

  // Step 6: Ungrouped fields go last
  const ungrouped = eligible
    .filter((f) => !fieldToGroup.has(f.name) || !groupsByKey.has(fieldToGroup.get(f.name)!))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => toResolvedField(f, printConfig));

  if (ungrouped.length > 0) {
    sections.push({
      key:       "__ungrouped",
      label:     "Other",
      fields:    ungrouped,
      columns:   resolveColumns(undefined, undefined, layoutFieldColumns),
      page_span: "half",
    });
  }

  return sections.filter((s) => s.fields.length > 0);
}
