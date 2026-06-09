import type { RuntimeDescriptor, RuntimeField, ResolvedColumn } from "./types";

// Fields never surfaced in a list regardless of visibility flags.
const SYSTEM_FIELDS = new Set([
  "tenant_id",
  "metadata",
  "row_version",
  "deleted_at",
  "deleted_by",
]);

// Default column candidates when descriptor has no explicit list_columns config.
const IDENTITY_FIELDS = new Set([
  "id", "code", "name", "display_name",
  "document_no", "number", "status", "updated_at",
]);

// ─── Allowed column set (PII + visibility guard) ──────────────────────────────
// Mirrors resolveEntityListContract's allowedColumnNames.
// Prevents crafted ?cols= params from surfacing hidden or PII fields.

export function resolveAllowedColumnNames(descriptor: RuntimeDescriptor): Set<string> {
  return new Set(
    descriptor.fields
      .filter(isRuntimeListFieldAllowed)
      .map((f) => f.name),
  );
}

export function isRuntimeListFieldAllowed(field: RuntimeField): boolean {
  return !SYSTEM_FIELDS.has(field.name) &&
    field.isVisible !== false &&
    field.isPii !== true;
}

// ─── Column resolution ────────────────────────────────────────────────────────

export function resolveColumns(
  descriptor: RuntimeDescriptor,
  requestedNames: string[] | undefined,
): ResolvedColumn[] {
  const allowed      = resolveAllowedColumnNames(descriptor);
  const fieldByName  = new Map(descriptor.fields.map((f) => [f.name, f]));
  const configuredNames = displayListColumns(descriptor);

  // URL-requested columns: sanitize against allowed set (PII / visibility guard)
  const effective = requestedNames?.length
    ? requestedNames.filter((n) => allowed.has(n))
    : configuredNames.filter((n) => allowed.has(n));

  const deduped = uniqueNames(effective);

  if (deduped.length > 0) {
    const cols = deduped
      .map((n) => fieldByName.get(n))
      .filter((f): f is RuntimeField => Boolean(f))
      .map(toResolvedColumn)
      .slice(0, 12);
    if (cols.length > 0) return cols;
  }

  // Fallback: identity-candidate + sortable/filterable/searchable fields
  return descriptor.fields
    .filter((f) => allowed.has(f.name))
    .filter((f) => f.isSearchable || f.isFilterable || f.isSortable || IDENTITY_FIELDS.has(f.name))
    .sort((a, b) => a.order - b.order)
    .slice(0, 8)
    .map(toResolvedColumn);
}

// ─── All resolvable columns (for column-picker drawer) ────────────────────────

export function resolveAllColumns(descriptor: RuntimeDescriptor): ResolvedColumn[] {
  const allowed = resolveAllowedColumnNames(descriptor);
  return descriptor.fields
    .filter((f) => allowed.has(f.name))
    .sort((a, b) => a.order - b.order)
    .map(toResolvedColumn);
}

// ─── Field subsets for drawer props ──────────────────────────────────────────

export function resolveFilterableFields(descriptor: RuntimeDescriptor): RuntimeField[] {
  return descriptor.fields
    .filter((f) => isRuntimeListFieldAllowed(f) && f.isFilterable)
    .sort((a, b) => a.order - b.order);
}

export function resolveSortableFields(descriptor: RuntimeDescriptor): RuntimeField[] {
  return descriptor.fields
    .filter((f) => isRuntimeListFieldAllowed(f) && f.isSortable)
    .sort((a, b) => a.order - b.order);
}

export function resolveGroupableFields(descriptor: RuntimeDescriptor): RuntimeField[] {
  return descriptor.fields
    .filter((f) => isRuntimeListFieldAllowed(f) && f.isGroupable)
    .sort((a, b) => a.order - b.order);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayListColumns(descriptor: RuntimeDescriptor): string[] {
  const cfg = descriptor.extensions?.["displayConfig"];
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const cols = (cfg as Record<string, unknown>)["list_columns"];
    if (Array.isArray(cols)) {
      return cols.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
    }
  }
  // Sensible default order — first match wins per entity
  return ["code", "document_no", "number", "name", "display_name", "title", "status", "updated_at"];
}

function toResolvedColumn(f: RuntimeField): ResolvedColumn {
  return {
    name:           f.name,
    columnName:     f.columnName,
    label:          f.label,
    dataType:       f.dataType,
    uiType:         f.uiType,
    display:        f.display,
    isSortable:     f.isSortable ?? false,
    isFilterable:   f.isFilterable ?? false,
    compactVisible: f.compactVisible,
    excelVisible:   f.excelVisible,
    aggregation:    f.aggregation,
  };
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out:  string[] = [];
  for (const n of names) {
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
