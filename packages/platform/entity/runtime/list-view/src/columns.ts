import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";

export function matchesColumnSearch(field: ListFieldDescriptorV1, query: string): boolean {
  const normalized = normalize(query);
  if (!normalized) return true;
  return normalize([field.label, field.key, field.columnGroup, field.semanticRole, field.valueKind].filter(Boolean).join(" ")).includes(normalized);
}

export function fieldTypeLabel(valueKind: ListFieldDescriptorV1["valueKind"]): string {
  return valueKind === "datetime" ? "Date and time" : valueKind.charAt(0).toLocaleUpperCase() + valueKind.slice(1);
}

export function groupAvailableColumns(fields: readonly ListFieldDescriptorV1[]): readonly { readonly label: string; readonly fields: readonly ListFieldDescriptorV1[] }[] {
  const priority = ["Recommended fields", "General fields", "Status and classification", "Related records", "Dates and time", "Audit and system fields"];
  const groups = new Map<string, ListFieldDescriptorV1[]>();
  for (const field of fields) {
    const label = columnGroup(field), group = groups.get(label) ?? [];
    group.push(field);
    groups.set(label, group);
  }
  return [...groups]
    .map(([label, groupedFields]) => ({ label, fields: groupedFields }))
    .sort((left, right) => {
      const leftIndex = priority.indexOf(left.label), rightIndex = priority.indexOf(right.label);
      return (leftIndex < 0 ? priority.length : leftIndex) - (rightIndex < 0 ? priority.length : rightIndex) || left.label.localeCompare(right.label);
    });
}

export function reorderColumn(columns: readonly string[], source: string, target: string, edge: "before" | "after"): readonly string[] {
  if (source === target || !columns.includes(source)) return columns;
  const next = columns.filter((key) => key !== source), targetIndex = next.indexOf(target);
  if (targetIndex < 0) return columns;
  next.splice(targetIndex + (edge === "after" ? 1 : 0), 0, source);
  return next;
}

function normalize(value: string): string { return value.trim().toLocaleLowerCase().replace(/[_-]+/g, " "); }

function columnGroup(field: ListFieldDescriptorV1): string {
  if (field.columnGroup) return field.columnGroup;
  if (field.defaultVisible) return "Recommended fields";
  if (field.semanticRole === "updated_at" || /(^|_)(created|updated|modified|deleted)(_at)?$|(^|_)(id|version|tenant_id)$/i.test(field.key)) return "Audit and system fields";
  if (field.valueKind === "reference") return "Related records";
  if (field.valueKind === "date" || field.valueKind === "datetime") return "Dates and time";
  if (field.valueKind === "enum" || field.valueKind === "boolean" || field.semanticRole === "status") return "Status and classification";
  return "General fields";
}
