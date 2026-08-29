import { ENTITY_LIST_MAX_FILTERS, ENTITY_LIST_MAX_URL_LENGTH, ENTITY_LIST_MAX_VISIBLE_COLUMNS } from "./types";
import { parseListLocationState, parseSaveableListState } from "./parsers";
import type { EntityListDescriptorV1, JsonValue, ListFilterOperator, ListLocationStateV1, ListSortV1, SaveableListStateV1, SpreadsheetStateV1 } from "./types";

export interface ListLocationCodecOptions {
  /** State inherited from a saved view. Only overrides are written to the URL. */
  readonly baseState?: SaveableListStateV1;
  /** Local saved-view identifiers are excluded from portable/share links. */
  readonly includeViewIds?: boolean;
}

export function decodeListLocationState(input: URLSearchParams | string, descriptor: EntityListDescriptorV1, options: ListLocationCodecOptions = {}): ListLocationStateV1 {
  const serialized = typeof input === "string" ? (input.startsWith("?") ? input.slice(1) : input) : input.toString();
  const base = normalizedBase(descriptor, options.baseState);
  if (serialized.length > ENTITY_LIST_MAX_URL_LENGTH) return locationFromBase(base, descriptor);
  const parameters = new URLSearchParams(serialized);
  const filters: { field: string; operator: string; value?: JsonValue }[] = [];
  let hasFilterParameter = parameters.get("filters") === "none";
  for (const [key, raw] of parameters) {
    if (!key.startsWith("filter.") || filters.length >= ENTITY_LIST_MAX_FILTERS) continue;
    hasFilterParameter = true;
    const field = key.slice("filter.".length);
    try {
      const parsed = JSON.parse(raw) as { operator?: unknown; value?: JsonValue };
      if (parsed && typeof parsed === "object" && typeof parsed.operator === "string") filters.push({ field, operator: parsed.operator, ...(Object.hasOwn(parsed, "value") ? { value: parsed.value } : {}) });
    } catch { /* Malformed optional URL state is normalized away. */ }
  }
  const sort = parameters.has("sort") ? (parameters.get("sort") === "none" ? [] : parseSort(parameters.get("sort"), descriptor.limits.maxSortLevels)) : [...base.sort];
  const columns = decodeColumns(parameters, base.columns);
  const spreadsheet = decodeSpreadsheet(parameters, base.spreadsheet);
  const group = parameters.get("group.clear") === "1" ? undefined : parameters.has("group") ? parameters.get("group") ?? undefined : base.group;
  return parseListLocationState({
    ...(parameters.has("q") ? parameters.get("q") ? { query: parameters.get("q") } : {} : base.query ? { query: base.query } : {}),
    filters: hasFilterParameter ? filters : [...base.filters],
    sort,
    ...(group ? { group } : {}),
    columns,
    density: parameters.get("density") ?? base.density,
    mode: parameters.get("view") ?? base.mode,
    ...(spreadsheet ? { spreadsheet } : {}),
    ...(parameters.get("vid") ? { savedViewId: parameters.get("vid") } : {}),
    ...(parameters.get("bvid") ? { baseSavedViewId: parameters.get("bvid") } : {}),
    ...(parameters.get("cursor") ? { cursor: parameters.get("cursor") } : {}),
    ...(parameters.has("page") ? { pageIndex: Number(parameters.get("page")) } : {}),
    ...(parameters.has("pageSize") ? { pageSize: Number(parameters.get("pageSize")) } : {}),
  }, descriptor);
}

export function encodeListLocationState(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, options: ListLocationCodecOptions = {}): URLSearchParams {
  const normalized = parseListLocationState(state, descriptor);
  const base = normalizedBase(descriptor, options.baseState);
  const parameters = new URLSearchParams();
  if ((normalized.query ?? "") !== (base.query ?? "")) parameters.set("q", normalized.query ?? "");
  if (!equal(normalized.filters, base.filters)) {
    if (!normalized.filters.length) parameters.set("filters", "none");
    else for (const filter of normalized.filters) parameters.append(`filter.${filter.field}`, stableStringify({ operator: filter.operator, ...(filter.value !== undefined ? { value: filter.value } : {}) }));
  }
  if (!equal(normalized.sort, base.sort)) parameters.set("sort", normalized.sort.length ? normalized.sort.map(formatSort).join(",") : "none");
  if (normalized.group !== base.group) {
    if (normalized.group) parameters.set("group", normalized.group);
    else parameters.set("group.clear", "1");
  }
  encodeColumns(parameters, normalized.columns, base.columns);
  if (normalized.density !== base.density) parameters.set("density", normalized.density);
  if (normalized.mode !== base.mode) parameters.set("view", normalized.mode);
  encodeSpreadsheet(parameters, normalized.spreadsheet, base.spreadsheet);
  if (options.includeViewIds !== false) {
    if (normalized.savedViewId) parameters.set("vid", normalized.savedViewId);
    if (normalized.baseSavedViewId) parameters.set("bvid", normalized.baseSavedViewId);
  }
  if (normalized.cursor) parameters.set("cursor", normalized.cursor);
  if (normalized.pageIndex !== undefined && normalized.pageIndex > 0) parameters.set("page", String(normalized.pageIndex));
  if (normalized.pageSize !== undefined && normalized.pageSize !== descriptor.limits.defaultPageSize) parameters.set("pageSize", String(normalized.pageSize));
  return parameters;
}

export function toSaveableListState(state: ListLocationStateV1): SaveableListStateV1 {
  return Object.freeze({
    ...(state.query ? { query: state.query } : {}), filters: state.filters, sort: state.sort,
    ...(state.group ? { group: state.group } : {}), columns: state.columns, density: state.density, mode: state.mode,
    ...(state.spreadsheet ? { spreadsheet: state.spreadsheet } : {}),
  });
}

function normalizedBase(descriptor: EntityListDescriptorV1, state?: SaveableListStateV1): SaveableListStateV1 { return parseSaveableListState(state ?? descriptor.surface.defaultState, descriptor); }
function locationFromBase(base: SaveableListStateV1, descriptor: EntityListDescriptorV1): ListLocationStateV1 { return parseListLocationState(base, descriptor); }

function decodeColumns(parameters: URLSearchParams, base: readonly string[]): readonly string[] {
  if (parameters.has("cols")) return split(parameters.get("cols"));
  if (!parameters.has("col.rm") && !parameters.has("col.at")) return [...base];
  const removed = new Set(split(parameters.get("col.rm")));
  const columns = base.filter((field) => !removed.has(field));
  for (const instruction of split(parameters.get("col.at"))) {
    const separator = instruction.lastIndexOf(":");
    if (separator <= 0) continue;
    const field = instruction.slice(0, separator), index = Number.parseInt(instruction.slice(separator + 1), 36);
    if (!Number.isSafeInteger(index) || index < 0 || index >= ENTITY_LIST_MAX_VISIBLE_COLUMNS) continue;
    const current = columns.indexOf(field);
    if (current >= 0) columns.splice(current, 1);
    columns.splice(Math.min(index, columns.length), 0, field);
  }
  return columns.slice(0, ENTITY_LIST_MAX_VISIBLE_COLUMNS);
}

function encodeColumns(parameters: URLSearchParams, columns: readonly string[], base: readonly string[]): void {
  if (equal(columns, base)) return;
  const full = new URLSearchParams({ cols: columns.join(",") });
  const removed = base.filter((field) => !columns.includes(field));
  const working = base.filter((field) => !removed.includes(field));
  const placements: string[] = [];
  columns.forEach((field, index) => {
    if (working[index] === field) return;
    const current = working.indexOf(field);
    if (current >= 0) working.splice(current, 1);
    working.splice(index, 0, field);
    placements.push(`${field}:${index.toString(36)}`);
  });
  const delta = new URLSearchParams();
  if (removed.length) delta.set("col.rm", removed.join(","));
  if (placements.length) delta.set("col.at", placements.join(","));
  const selected = delta.toString().length < full.toString().length ? delta : full;
  selected.forEach((value, key) => parameters.set(key, value));
}

function decodeSpreadsheet(parameters: URLSearchParams, base?: SpreadsheetStateV1): SpreadsheetStateV1 | undefined {
  if (parameters.get("sheet") === "none") return undefined;
  const hasOverride = parameters.get("sheet") === "custom" || parameters.has("pinned") || [...parameters.keys()].some((key) => key.startsWith("width."));
  if (!hasOverride) return base;
  const pinned = split(parameters.get("pinned"));
  const widths: Record<string, number> = {};
  for (const [key, value] of parameters) {
    if (!key.startsWith("width.") || Object.keys(widths).length >= ENTITY_LIST_MAX_VISIBLE_COLUMNS) continue;
    widths[key.slice("width.".length)] = Number(value);
  }
  return { pinned, widths };
}

function encodeSpreadsheet(parameters: URLSearchParams, spreadsheet: SpreadsheetStateV1 | undefined, base: SpreadsheetStateV1 | undefined): void {
  if (equal(spreadsheet, base)) return;
  if (!spreadsheet) { parameters.set("sheet", "none"); return; }
  parameters.set("sheet", "custom");
  if (spreadsheet.pinned.length) parameters.set("pinned", spreadsheet.pinned.join(","));
  for (const [field, width] of Object.entries(spreadsheet.widths).sort(([left], [right]) => left.localeCompare(right)).slice(0, ENTITY_LIST_MAX_VISIBLE_COLUMNS)) parameters.set(`width.${field}`, String(width));
}

function split(value: string | null, maximum = ENTITY_LIST_MAX_VISIBLE_COLUMNS): string[] { return value ? value.split(",", maximum).map((item) => item.trim()).filter(Boolean) : []; }
function parseSort(value: string | null, maximum: number): ListSortV1[] { return split(value, maximum).map((item) => { const [field = "", direction = "", nulls] = item.split(":"); return { field, direction, ...(nulls ? { nulls } : {}) } as ListSortV1; }); }
function formatSort(value: ListSortV1): string { return [value.field, value.direction, value.nulls].filter(Boolean).join(":"); }
function equal(left: unknown, right: unknown): boolean { return stableStringify(left) === stableStringify(right); }
function stableStringify(value: unknown): string { return JSON.stringify(sortJson(value)); }
function sortJson(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortJson); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)])); return value; }

export type { ListFilterOperator };
