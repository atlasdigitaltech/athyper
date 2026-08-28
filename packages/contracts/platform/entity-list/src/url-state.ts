import { parseListLocationState } from "./parsers";
import type { EntityListDescriptorV1, JsonValue, ListFilterOperator, ListLocationStateV1, ListSortV1 } from "./types";

export function decodeListLocationState(input: URLSearchParams | string, descriptor: EntityListDescriptorV1): ListLocationStateV1 {
  const parameters = typeof input === "string" ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input) : input;
  const filters: { field: string; operator: string; value?: JsonValue }[] = [];
  let hasFilterParameter = false;
  for (const [key, raw] of parameters) {
    if (!key.startsWith("filter.")) continue;
    hasFilterParameter = true;
    const field = key.slice("filter.".length);
    try {
      const parsed = JSON.parse(raw) as { operator?: unknown; value?: JsonValue };
      if (parsed && typeof parsed === "object" && typeof parsed.operator === "string") filters.push({ field, operator: parsed.operator, ...(Object.hasOwn(parsed, "value") ? { value: parsed.value } : {}) });
    } catch { /* Malformed optional URL state is normalized away. */ }
  }
  const sort = parameters.has("sort") ? parseSort(parameters.get("sort")) : [...descriptor.surface.defaultState.sort];
  const columns = parameters.has("cols") ? split(parameters.get("cols")) : [...descriptor.surface.defaultState.columns];
  const pinned = split(parameters.get("pinned"));
  const widths = Object.fromEntries([...parameters].filter(([key]) => key.startsWith("width.")).map(([key, value]) => [key.slice("width.".length), Number(value)]));
  return parseListLocationState({
    ...(parameters.get("q") ? { query: parameters.get("q") } : descriptor.surface.defaultState.query ? { query: descriptor.surface.defaultState.query } : {}),
    filters: hasFilterParameter ? filters : [...descriptor.surface.defaultState.filters],
    sort,
    ...(parameters.get("group") ? { group: parameters.get("group") } : descriptor.surface.defaultState.group ? { group: descriptor.surface.defaultState.group } : {}),
    columns,
    density: parameters.get("density") ?? descriptor.surface.defaultState.density,
    mode: parameters.get("view") ?? descriptor.surface.defaultState.mode,
    ...(pinned.length || Object.keys(widths).length ? { spreadsheet: { pinned, widths } } : {}),
    ...(parameters.get("vid") ? { savedViewId: parameters.get("vid") } : {}),
    ...(parameters.get("bvid") ? { baseSavedViewId: parameters.get("bvid") } : {}),
    ...(parameters.get("cursor") ? { cursor: parameters.get("cursor") } : {}),
    ...(parameters.get("page") ? { pageIndex: Number(parameters.get("page")) } : {}),
    ...(parameters.get("pageSize") ? { pageSize: Number(parameters.get("pageSize")) } : {}),
  }, descriptor);
}

export function encodeListLocationState(state: ListLocationStateV1, descriptor: EntityListDescriptorV1): URLSearchParams {
  const normalized = parseListLocationState(state, descriptor);
  const parameters = new URLSearchParams();
  if (normalized.query) parameters.set("q", normalized.query);
  for (const filter of normalized.filters) parameters.append(`filter.${filter.field}`, JSON.stringify({ operator: filter.operator, ...(filter.value !== undefined ? { value: filter.value } : {}) }));
  if (normalized.sort.length) parameters.set("sort", normalized.sort.map(formatSort).join(","));
  else if (descriptor.surface.defaultState.sort.length) parameters.set("sort", "none");
  if (normalized.group) parameters.set("group", normalized.group);
  if (normalized.columns.length) parameters.set("cols", normalized.columns.join(","));
  if (normalized.density !== descriptor.surface.defaultState.density) parameters.set("density", normalized.density);
  if (normalized.mode !== descriptor.surface.defaultState.mode) parameters.set("view", normalized.mode);
  if (normalized.spreadsheet) {
    if (normalized.spreadsheet.pinned.length) parameters.set("pinned", normalized.spreadsheet.pinned.join(","));
    for (const [field, width] of Object.entries(normalized.spreadsheet.widths).sort(([left], [right]) => left.localeCompare(right))) parameters.set(`width.${field}`, String(width));
  }
  if (normalized.savedViewId) parameters.set("vid", normalized.savedViewId);
  if (normalized.baseSavedViewId) parameters.set("bvid", normalized.baseSavedViewId);
  if (normalized.cursor) parameters.set("cursor", normalized.cursor);
  if (normalized.pageIndex !== undefined) parameters.set("page", String(normalized.pageIndex));
  if (normalized.pageSize !== undefined && normalized.pageSize !== descriptor.limits.defaultPageSize) parameters.set("pageSize", String(normalized.pageSize));
  return parameters;
}

export function toSaveableListState(state: ListLocationStateV1) {
  return Object.freeze({
    ...(state.query ? { query: state.query } : {}),
    filters: state.filters,
    sort: state.sort,
    ...(state.group ? { group: state.group } : {}),
    columns: state.columns,
    density: state.density,
    mode: state.mode,
    ...(state.spreadsheet ? { spreadsheet: state.spreadsheet } : {}),
  });
}

function split(value: string | null): string[] { return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []; }
function parseSort(value: string | null): ListSortV1[] { return split(value).map((item) => { const [field = "", direction = "", nulls] = item.split(":"); return { field, direction, ...(nulls ? { nulls } : {}) } as ListSortV1; }); }
function formatSort(value: ListSortV1): string { return [value.field, value.direction, value.nulls].filter(Boolean).join(":"); }
export type { ListFilterOperator };
