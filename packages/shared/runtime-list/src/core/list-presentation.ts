import type {
  ResolvedColumn,
  RuntimeColumnAggregation,
  RuntimeDescriptor,
  RuntimeListPresentation,
  ViewDensity,
  ViewMode,
} from "./types";

export const RUNTIME_IMPLEMENTED_VIEW_MODES: readonly ViewMode[] = ["list", "compact", "excel"] as const;

const VIEW_MODES: readonly ViewMode[] = ["list", "compact", "board", "dashboard", "excel"] as const;
const VIEW_DENSITIES: readonly ViewDensity[] = ["compact", "comfortable", "spacious"] as const;

const VIEW_MODE_SET = new Set<string>(VIEW_MODES);
const VIEW_DENSITY_SET = new Set<string>(VIEW_DENSITIES);

export function isRuntimeViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && VIEW_MODE_SET.has(value);
}

export function isRuntimeViewDensity(value: unknown): value is ViewDensity {
  return typeof value === "string" && VIEW_DENSITY_SET.has(value);
}

export function resolveRuntimeDensity(value: unknown): ViewDensity {
  return isRuntimeViewDensity(value) ? value : "compact";
}

export function resolveRuntimeViewModes(
  featureModes:       readonly ViewMode[],
  presentationModes?: readonly ViewMode[],
): ViewMode[] {
  const presentationSet = new Set(presentationModes?.length ? presentationModes : featureModes);
  const result = RUNTIME_IMPLEMENTED_VIEW_MODES.filter(
    (mode) => featureModes.includes(mode) && presentationSet.has(mode),
  );
  return result.length > 0 ? [...result] : ["list"];
}

export function resolveRuntimeViewMode(
  rawMode: ViewMode | undefined,
  allowed: readonly ViewMode[],
): ViewMode {
  if (rawMode && allowed.includes(rawMode)) return rawMode;
  return allowed.includes("list") ? "list" : allowed[0] ?? "list";
}

export function buildDefaultListPresentation(): RuntimeListPresentation {
  return {
    defaultViewMode: "list",
    viewModes:       ["list"],
    compact: {
      titleField:   "id",
      bottomFields: [],
      fields:       ["id"],
    },
    excel: {
      columns:      [],
      aggregations: {},
    },
  };
}

export function resolveListPresentation(
  descriptor:     RuntimeDescriptor,
  columns:        ResolvedColumn[],
  allColumns:     ResolvedColumn[],
  defaultColumns: ResolvedColumn[],
): RuntimeListPresentation {
  const config = descriptor.listPresentation;
  const allowedNames = new Set(allColumns.map((column) => column.name));
  const currentNames = columns.map((column) => column.name);
  const defaultNames = defaultColumns.map((column) => column.name);
  const allNames = allColumns.map((column) => column.name);

  const titleField = firstAllowed(allowedNames, [
    config?.compact?.titleField,
    "name",
    "display_name",
    "title",
    "code",
    "document_no",
    "number",
    currentNames[0],
    defaultNames[0],
    allNames[0],
  ]) ?? "id";

  const subtitleField = firstAllowed(allowedNames, [
    config?.compact?.subtitleField,
    "description",
    "subtitle",
    "status",
    firstDifferent(currentNames, titleField),
    firstDifferent(defaultNames, titleField),
  ]);

  const configuredBottom = sanitizeNames(config?.compact?.bottomFields, allowedNames)
    .filter((name) => name !== titleField && name !== subtitleField);
  const markedCompact = allColumns
    .filter((column) => column.compactVisible === true)
    .map((column) => column.name)
    .filter((name) => name !== titleField && name !== subtitleField);
  const fallbackBottom = currentNames
    .filter((name) => name !== titleField && name !== subtitleField);
  const bottomFields = uniqueNames(
    configuredBottom.length > 0
      ? configuredBottom
      : markedCompact.length > 0
        ? markedCompact
        : fallbackBottom,
  );

  const compactFields = uniqueNames([
    titleField,
    subtitleField,
    ...bottomFields,
  ].filter((name): name is string => Boolean(name && allowedNames.has(name))));

  const configuredExcelColumns = sanitizeNames(config?.excel?.columns, allowedNames);
  const defaultExcelColumns = defaultColumns
    .filter((column) => column.excelVisible !== false)
    .map((column) => column.name);
  const excelColumns = uniqueNames(
    configuredExcelColumns.length > 0
      ? configuredExcelColumns
      : defaultExcelColumns.length > 0
        ? defaultExcelColumns
        : currentNames,
  );

  return {
    defaultViewMode: config?.defaultViewMode ?? "list",
    viewModes:       config?.viewModes?.length ? uniqueNames(config.viewModes) as ViewMode[] : [...RUNTIME_IMPLEMENTED_VIEW_MODES],
    compact: {
      titleField,
      subtitleField,
      bottomFields,
      fields: compactFields,
    },
    excel: {
      columns: excelColumns,
      aggregations: resolveExcelAggregations(config?.excel?.aggregations, allColumns),
    },
  };
}

function firstAllowed(
  allowedNames: Set<string>,
  names:        Array<string | undefined>,
): string | undefined {
  return names.find((name) => Boolean(name && allowedNames.has(name)));
}

function firstDifferent(names: string[], excluded: string): string | undefined {
  return names.find((name) => name !== excluded);
}

function sanitizeNames(names: readonly string[] | undefined, allowedNames: Set<string>): string[] {
  if (!names) return [];
  return uniqueNames(names.filter((name) => allowedNames.has(name)));
}

function uniqueNames<T extends string>(names: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const name of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function resolveExcelAggregations(
  configured: Partial<Record<string, RuntimeColumnAggregation>> | undefined,
  columns:    ResolvedColumn[],
): Partial<Record<string, RuntimeColumnAggregation>> {
  const result: Partial<Record<string, RuntimeColumnAggregation>> = {};
  for (const column of columns) {
    if (column.aggregation) result[column.name] = column.aggregation;
  }
  if (!configured) return result;
  for (const [name, aggregation] of Object.entries(configured)) {
    if (aggregation) result[name] = aggregation;
  }
  return result;
}
