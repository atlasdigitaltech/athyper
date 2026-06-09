import type { MetaEntityField, MetaEntityFieldGroup, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";

export interface RuntimeFieldGroupModel {
  key: string;
  label: string;
  description?: string;
  order: number;
  columns: 1 | 2 | 3;
  pageSpan: "narrow" | "half" | "wide" | "full";
  role?: string;
  initiallyCollapsed?: boolean;
  fields: MetaEntityField[];
}

type FieldSurface = "list" | "detail" | "create" | "edit" | "print";

function groupSurfaceMatches(
  group: MetaEntityFieldGroup,
  surface: FieldSurface,
): boolean {
  const gs = group.surface;
  if (gs === "all") return true;
  if (surface === "list") return false;
  return gs === surface;
}

function fieldStaticallyHidden(field: MetaEntityField, surface: FieldSurface): boolean {
  const vis = field.visibility;
  if (!vis || typeof vis !== "object" || Array.isArray(vis)) return false;
  const v = vis as Record<string, unknown>;

  if (v["hidden"] === true) return true;

  const hideIn = v["hideIn"] ?? v["hide_in"];
  if (typeof hideIn === "string") {
    const tokens = hideIn.split(",").map((s) => s.trim().toLowerCase());
    return tokens.includes(surface);
  }
  if (Array.isArray(hideIn)) {
    return hideIn.some((s) => typeof s === "string" && s.trim().toLowerCase() === surface);
  }

  return false;
}

function isLongTextGroup(fields: MetaEntityField[]): boolean {
  if (fields.length === 0) return false;
  return fields.every((f) => {
    const dt = f.dataType.toLowerCase();
    return dt === "text" || dt === "json" || dt === "jsonb";
  });
}

export function buildMetaEntityFieldGroups(
  descriptor: MetaEntityRuntimeDescriptor,
  surface: FieldSurface,
): RuntimeFieldGroupModel[] {
  const surfaceGroups = descriptor.fieldGroups.filter((g) => groupSurfaceMatches(g, surface));
  const groupByKey = new Map(surfaceGroups.map((g) => [g.key, g]));

  const fieldsByGroup = new Map<string, MetaEntityField[]>();
  const ungrouped: MetaEntityField[] = [];

  for (const field of descriptor.fields) {
    if (fieldStaticallyHidden(field, surface)) continue;

    const key = field.groupKey;
    if (key && groupByKey.has(key)) {
      const existing = fieldsByGroup.get(key) ?? [];
      existing.push(field);
      fieldsByGroup.set(key, existing);
    } else if (key && !groupByKey.has(key)) {
      const existing = fieldsByGroup.get(key) ?? [];
      existing.push(field);
      fieldsByGroup.set(key, existing);
    } else {
      ungrouped.push(field);
    }
  }

  const result: RuntimeFieldGroupModel[] = [];

  for (const group of surfaceGroups) {
    const fields = fieldsByGroup.get(group.key) ?? [];
    if (fields.length === 0) continue;

    const effectiveColumns = isLongTextGroup(fields) ? 1 : group.columns;

    result.push({
      key: group.key,
      label: group.label,
      description: group.description,
      order: group.order,
      columns: effectiveColumns,
      pageSpan: group.pageSpan,
      role: group.role,
      initiallyCollapsed: group.initiallyCollapsed,
      fields: [...fields].sort((a, b) => a.order - b.order),
    });
  }

  const fallbackOrder = surfaceGroups.length > 0
    ? Math.max(...surfaceGroups.map((g) => g.order)) + 10
    : 0;
  let fallbackOffset = 0;

  for (const [key, fields] of fieldsByGroup.entries()) {
    if (groupByKey.has(key)) continue;
    if (fields.length === 0) continue;

    result.push({
      key,
      label: toTitleLabel(key),
      order: fallbackOrder + fallbackOffset,
      columns: isLongTextGroup(fields) ? 1 : 3,
      pageSpan: "full",
      initiallyCollapsed: false,
      fields: [...fields].sort((a, b) => a.order - b.order),
    });
    fallbackOffset += 10;
  }

  if (ungrouped.length > 0) {
    result.push({
      key: "general",
      label: "General",
      order: fallbackOrder + fallbackOffset,
      columns: isLongTextGroup(ungrouped) ? 1 : 3,
      pageSpan: "full",
      initiallyCollapsed: false,
      fields: [...ungrouped].sort((a, b) => a.order - b.order),
    });
  }

  return result.sort((a, b) => a.order - b.order);
}

function toTitleLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
