import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";

export function matchesColumnSearch(field: ListFieldDescriptorV1, query: string): boolean {
  const normalized = normalize(query);
  if (!normalized) return true;
  return normalize([field.label, field.key, field.columnGroup, field.semanticRole, field.valueKind].filter(Boolean).join(" ")).includes(normalized);
}

/** The picker's built-in groups, in display order around the authored ones
 * (shared list layout foundation, gap 7). Each is a stable key with a
 * catalogue label; the label is never an identity. */
const BUILT_IN_GROUPS = ["recommended", "general", "status", "related", "dates", "audit"] as const;
export type BuiltInFieldGroup = (typeof BUILT_IN_GROUPS)[number];
export interface FieldGroup {
  /** `builtIn:<key>` or `authored:<columnGroup>`: an authored name never matches a built-in group. */
  readonly key: string;
  readonly label: string;
  /** Declared audit stamps: collapsed in pickers until searched. */
  readonly audit: boolean;
  readonly fields: readonly ListFieldDescriptorV1[];
}

type Intl = { readonly message: (id: string) => string };

/** Recommended fields first, then each authored `columnGroup` (ordered by its
 * fields' published `defaultOrder`, so the author places it), then the
 * built-in groups by value kind, with declared audit stamps last. A field is
 * an audit stamp only when it declares `auditRole`; its name is never read. */
export function groupAvailableColumns(fields: readonly ListFieldDescriptorV1[], intl: Intl): readonly FieldGroup[] {
  const groups = new Map<string, { builtIn?: BuiltInFieldGroup; label: string; order: number; fields: ListFieldDescriptorV1[] }>();
  for (const field of fields) {
    const builtIn = field.columnGroup ? undefined : builtInGroup(field);
    const key = builtIn ? `builtIn:${builtIn}` : `authored:${field.columnGroup}`;
    const group = groups.get(key) ?? { ...(builtIn ? { builtIn } : {}), label: builtIn ? intl.message(`list.chrome.fieldGroup.${builtIn}`) : field.columnGroup!, order: field.defaultOrder, fields: [] };
    group.order = Math.min(group.order, field.defaultOrder);
    group.fields.push(field);
    groups.set(key, group);
  }
  // Recommended is rank 0, authored groups rank 1, the other built-ins follow.
  const rank = (group: { builtIn?: BuiltInFieldGroup }) => (group.builtIn === undefined ? 1 : group.builtIn === "recommended" ? 0 : BUILT_IN_GROUPS.indexOf(group.builtIn) + 1);
  return [...groups]
    .sort(([, left], [, right]) => rank(left) - rank(right) || (left.builtIn === undefined ? left.order - right.order || left.label.localeCompare(right.label) : 0))
    .map(([key, group]) => ({ key, label: group.label, audit: group.builtIn === "audit", fields: group.fields }));
}

function builtInGroup(field: ListFieldDescriptorV1): BuiltInFieldGroup {
  if (field.defaultVisible) return "recommended";
  if (field.auditRole) return "audit";
  if (field.valueKind === "reference") return "related";
  if (field.valueKind === "date" || field.valueKind === "datetime") return "dates";
  if (field.valueKind === "enum" || field.valueKind === "boolean" || field.semanticRole === "status") return "status";
  return "general";
}

export function reorderColumn(columns: readonly string[], source: string, target: string, edge: "before" | "after"): readonly string[] {
  if (source === target || !columns.includes(source)) return columns;
  const next = columns.filter((key) => key !== source), targetIndex = next.indexOf(target);
  if (targetIndex < 0) return columns;
  next.splice(targetIndex + (edge === "after" ? 1 : 0), 0, source);
  return next;
}

function normalize(value: string): string { return value.trim().toLocaleLowerCase().replace(/[_-]+/g, " "); }
