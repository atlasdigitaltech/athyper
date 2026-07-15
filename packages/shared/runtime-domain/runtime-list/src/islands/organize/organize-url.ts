import type {
  RawSearchParams,
  RuntimeField,
  RuntimeFilterKind,
  RuntimeFilterOperator,
  SaveableListState,
  SortEntry,
  ViewDensity,
  ViewMode,
} from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { firstParam, normalizeFilterParamValue, serializeListState, splitFilterParamValue } from "../../core/url-state";

type OrganizeUrlValue = string | null | undefined;

export function serializeOrganizeState(
  base:      string,
  current:   RawSearchParams,
  overrides: Record<string, OrganizeUrlValue>,
): string {
  const normalized: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(overrides)) {
    normalized[key] = value === undefined ? null : value;
  }
  normalized[P.PAGE] = null;
  return serializeListState(base, current, normalized);
}

export function sortEntriesToParam(entries: SortEntry[]): string | null {
  const value = entries
    .filter((entry) => entry.key)
    .map((entry) => `${entry.key}:${entry.dir === "desc" ? "desc" : "asc"}`)
    .join(",");
  return value || null;
}

export function parseFilterDraft(
  rawSearchParams: RawSearchParams,
  fields:          RuntimeField[],
): Record<string, string[]> {
  const draft: Record<string, string[]> = {};
  for (const field of fields) {
    const value = firstParam(rawSearchParams[filterParam(field.name)]);
    if (!value) continue;
    draft[field.name] = splitFilterParamValue(value);
  }
  return draft;
}

export function buildFilterOverrides(
  fields: RuntimeField[],
  draft:  Record<string, string[]>,
): Record<string, string | null> {
  const overrides: Record<string, string | null> = {};
  for (const field of fields) {
    const values = (draft[field.name] ?? [])
      .map(sanitizeFilterValue)
      .filter((value) => value && isFilterValueAllowed(field, value));
    // Filter values containing commas are not supported in v1. Values are joined as-is.
    overrides[filterParam(field.name)] = values.length > 0 ? values.join(",") : null;
  }
  return overrides;
}

export function filterParam(fieldName: string): string {
  return `${P.FILTER_PFX}${fieldName}`;
}

export function sanitizeFilterValue(value: string): string {
  return normalizeFilterParamValue(value);
}

function isFilterValueAllowed(field: RuntimeField, value: string): boolean {
  const operator = operatorForFilterValue(field, value);
  return operator ? allowsFilterOperator(field, operator) : false;
}

function allowsFilterOperator(field: RuntimeField, operator: RuntimeFilterOperator): boolean {
  const operators = field.filter?.operators;
  return !operators?.length || operators.includes(operator);
}

function operatorForFilterValue(
  field: RuntimeField,
  value: string,
): RuntimeFilterOperator | null {
  if (value === "null") return "empty";
  if (value === "notnull") return "not_empty";
  if (value.startsWith("between:")) return "between";
  if (value.startsWith("not_in:")) return "not_in";
  if (value.startsWith("in:")) return "in";
  if (value.startsWith(">=")) return "gte";
  if (value.startsWith("<=")) return "lte";
  if (value.startsWith(">")) return "gt";
  if (value.startsWith("<")) return "lt";
  if (value.startsWith("@")) return "relative";
  if (value.startsWith("~")) return "contains";
  return defaultBareValueOperator(runtimeFilterKind(field));
}

function defaultBareValueOperator(kind: RuntimeFilterKind): RuntimeFilterOperator {
  return kind === "enum" || kind === "lookup" || kind === "reference" ? "in" : "eq";
}

function runtimeFilterKind(field: RuntimeField): RuntimeFilterKind {
  return field.filter?.kind ?? fallbackFilterKind(field);
}

function fallbackFilterKind(field: RuntimeField): RuntimeFilterKind {
  const dataType = field.dataType.toLowerCase();
  if (dataType === "boolean" || dataType === "bool") return "boolean";
  if (dataType === "date") return "date";
  if (dataType === "datetime" || dataType === "timestamp" || dataType === "timestamptz") return "datetime";
  if (["integer", "bigint", "decimal", "numeric", "number"].includes(dataType)) return "number";
  if (dataType === "money") return "money";
  if (dataType === "enum" || dataType === "lifecycle_state") return "enum";
  if (dataType === "json" || dataType === "jsonb") return "json";
  return "text";
}

export function buildSaveableListState(input: {
  activeSort: SortEntry[];
  filters:    Record<string, string[]>;
  columns:    string[];
  group?:     string;
  viewMode:   ViewMode;
  density:    ViewDensity;
}): SaveableListState {
  return {
    sort:     input.activeSort.length > 0 ? input.activeSort : undefined,
    filters:  Object.keys(input.filters).length > 0 ? input.filters : undefined,
    columns:  input.columns.length > 0 ? input.columns : undefined,
    group:    input.group,
    viewMode: input.viewMode,
    density:  input.density,
  };
}

// Release 2: scoped child-view URL helpers will live here once parseListSearchParams
// can read the same scoped keys that these helpers write.
function buildScopedParamName(stateKey: string, param: string): string {
  return `${stateKey}.${param}`;
}

void buildScopedParamName;
