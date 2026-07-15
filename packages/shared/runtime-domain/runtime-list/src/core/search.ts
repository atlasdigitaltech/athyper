import type {
  RawSearchParams,
  RuntimeDescriptor,
  RuntimeListSearchControls,
  RuntimeListSearchField,
  RuntimeRecordRow,
} from "./types";
import { isRuntimeListFieldAllowed } from "./columns";
import { LIST_URL_PARAMS as P } from "./types";

export const DEFAULT_SEARCH_CONTROLS: RuntimeListSearchControls = {
  defaultScope:                "auto",
  minQueryLength:              2,
  loadedSearchThreshold:       500,
  autoSearchAllOnEmpty:        true,
  autoSearchAllDebounceMs:     500,
  manualSearchAllDebounceMs:   300,
  queryStabilityMs:            50,
  serverSearchTimeoutMs:       10_000,
  fuzzySearch:                 false,
  visitedPageCache:            false,
  serverResultCacheTtlSeconds: 0,
};

export function normalizeSearchControls(
  input: Partial<RuntimeListSearchControls> | null | undefined,
): RuntimeListSearchControls {
  const definedInput = Object.fromEntries(
    Object.entries(input ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<RuntimeListSearchControls>;
  const merged = { ...DEFAULT_SEARCH_CONTROLS, ...definedInput };
  return {
    defaultScope:                isDefaultScope(merged.defaultScope) ? merged.defaultScope : DEFAULT_SEARCH_CONTROLS.defaultScope,
    minQueryLength:              clampInt(merged.minQueryLength, 1, 10, DEFAULT_SEARCH_CONTROLS.minQueryLength),
    loadedSearchThreshold:       clampInt(merged.loadedSearchThreshold, 1, 5_000, DEFAULT_SEARCH_CONTROLS.loadedSearchThreshold),
    autoSearchAllOnEmpty:        Boolean(merged.autoSearchAllOnEmpty),
    autoSearchAllDebounceMs:     clampInt(merged.autoSearchAllDebounceMs, 100, 5_000, DEFAULT_SEARCH_CONTROLS.autoSearchAllDebounceMs),
    manualSearchAllDebounceMs:   clampInt(merged.manualSearchAllDebounceMs, 0, 5_000, DEFAULT_SEARCH_CONTROLS.manualSearchAllDebounceMs),
    queryStabilityMs:            clampInt(merged.queryStabilityMs, 0, 500, DEFAULT_SEARCH_CONTROLS.queryStabilityMs),
    serverSearchTimeoutMs:       clampInt(merged.serverSearchTimeoutMs, 1_000, 60_000, DEFAULT_SEARCH_CONTROLS.serverSearchTimeoutMs),
    fuzzySearch:                 Boolean(merged.fuzzySearch),
    visitedPageCache:            Boolean(merged.visitedPageCache),
    serverResultCacheTtlSeconds: clampInt(merged.serverResultCacheTtlSeconds, 0, 300, DEFAULT_SEARCH_CONTROLS.serverResultCacheTtlSeconds),
  };
}

export function resolveSearchFields(descriptor: RuntimeDescriptor): RuntimeListSearchField[] {
  const searchConfig = asRecord(descriptor.extensions?.["searchConfig"]);
  const configuredFields = stringArray(searchConfig?.["fields"]);
  const rank = numberRecord(searchConfig?.["rank"]);
  const byName = new Map(descriptor.fields.map((field) => [field.name, field]));
  const candidates = configuredFields.length > 0
    ? configuredFields
    : descriptor.fields.filter((field) => field.isSearchable).map((field) => field.name);

  const seen = new Set<string>();
  return candidates.flatMap((name, index) => {
    const field = byName.get(name);
    if (!field || seen.has(name) || !isRuntimeListFieldAllowed(field)) return [];
    seen.add(name);
    return [{
      name,
      columnName: field.columnName,
      label:      field.label,
      weight:     positiveNumber(rank[name], Math.max(1, candidates.length - index)),
    }];
  });
}

export function resolveSearchMinLength(
  descriptor: RuntimeDescriptor,
  fallback: number,
): number {
  const searchConfig = asRecord(descriptor.extensions?.["searchConfig"]);
  return clampInt(searchConfig?.["min_query_length"], 1, 10, fallback);
}

export function filterRuntimeRows(
  rows: RuntimeRecordRow[],
  fields: RuntimeListSearchField[],
  query: string,
): RuntimeRecordRow[] {
  const tokens = tokenize(query);
  if (tokens.length === 0 || fields.length === 0) return rows;

  return rows.filter((row) => {
    const haystack = fields
      .map((field) => stringifySearchFieldValue(row, field))
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function buildServerSearchParams(
  rawSearchParams: RawSearchParams,
  query: string,
  pageSize: number,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (!isServerSearchDataParam(key)) continue;
    const item = Array.isArray(value) ? value[0] : value;
    if (item) params.set(key, item);
  }
  params.set("q", query.trim());
  params.set("search_scope", "all");
  params.set("page_size", String(pageSize));
  return params;
}

function isServerSearchDataParam(key: string): boolean {
  return key === P.SORT ||
    key === P.GROUP ||
    key === P.FACETS ||
    key.startsWith(P.FILTER_PFX);
}

function tokenize(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function stringifySearchValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const display = record["label"] ?? record["name"] ?? record["code"] ?? record["display"] ?? record["value"];
    return stringifySearchValue(display);
  }
  return "";
}

function stringifySearchFieldValue(row: RuntimeRecordRow, field: RuntimeListSearchField): string {
  return [
    row[field.name] ?? valueFromData(row, field.name),
    field.columnName ? row[field.columnName] ?? valueFromData(row, field.columnName) : undefined,
    row[`${field.name}_label`] ?? valueFromData(row, `${field.name}_label`),
    row[`${field.name}_name`] ?? valueFromData(row, `${field.name}_name`),
    row[`${field.name}_code`] ?? valueFromData(row, `${field.name}_code`),
    ...companionBaseNames(field).flatMap((base) => [
      row[`${base}_label`] ?? valueFromData(row, `${base}_label`),
      row[`${base}_name`] ?? valueFromData(row, `${base}_name`),
      row[`${base}_code`] ?? valueFromData(row, `${base}_code`),
    ]),
  ].map(stringifySearchValue).join(" ");
}

function companionBaseNames(field: RuntimeListSearchField): string[] {
  const names = new Set<string>();
  addReferenceBaseName(names, field.name);
  if (field.columnName) addReferenceBaseName(names, field.columnName);
  return [...names].filter((name) => name !== field.name && name !== field.columnName);
}

function addReferenceBaseName(names: Set<string>, fieldName: string): void {
  if (fieldName.endsWith("_id")) {
    names.add(fieldName.slice(0, -"_id".length));
  } else if (fieldName.endsWith("_code")) {
    names.add(fieldName.slice(0, -"_code".length));
  }
}

function valueFromData(row: RuntimeRecordRow, fieldName: string): unknown {
  // Some adapters wrap original field values under `data`; flat fields remain the preferred contract.
  const data = row["data"];
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)[fieldName]
    : undefined;
}

function isDefaultScope(value: unknown): value is RuntimeListSearchControls["defaultScope"] {
  return value === "auto" || value === "loaded" || value === "all";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function numberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (key && Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}
