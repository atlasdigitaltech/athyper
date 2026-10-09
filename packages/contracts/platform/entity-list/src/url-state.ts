import {
  ENTITY_LIST_MAX_FILTERS,
  ENTITY_LIST_MAX_SEARCH_LENGTH,
  ENTITY_LIST_MAX_URL_LENGTH,
  ENTITY_LIST_MAX_VISIBLE_COLUMNS,
} from "./types";
import { readCompareLocation, writeCompareLocation } from "./compare";
import {
  parseEntityListDescriptor,
  parseListLocationState,
  parseSaveableListState,
} from "./parsers";
import type {
  EntityListDescriptorV1,
  JsonValue,
  ListFilterOperator,
  ListFilterV1,
  ListLocationStateV1,
  ListSortV1,
  SaveableListStateV1,
  SpreadsheetStateV1,
} from "./types";

export interface ListLocationCodecOptions {
  /** State inherited from a saved view. Only overrides are written to the URL. */
  readonly baseState?: SaveableListStateV1;
  /** Local saved-view identifiers are excluded from portable/share links. */
  readonly includeViewIds?: boolean;
}

export function decodeListLocationState(
  input: URLSearchParams | string,
  descriptor: EntityListDescriptorV1,
  options: ListLocationCodecOptions = {},
): ListLocationStateV1 {
  // Descriptor and saved-base failures are programming/configuration errors,
  // not optional URL input. Never swallow them in the normalization boundary.
  parseEntityListDescriptor(descriptor);
  const serialized =
    typeof input === "string"
      ? input.startsWith("?")
        ? input.slice(1)
        : input
      : input.toString();
  const base = normalizedBase(descriptor, options.baseState);
  if (serialized.length > ENTITY_LIST_MAX_URL_LENGTH)
    return locationFromBase(base, descriptor);
  const parameters = new URLSearchParams(serialized);
  const filters: ListFilterV1[] = [];
  let hasFilterParameter = parameters.get("filters") === "none";
  for (const [key, raw] of parameters) {
    if (!key.startsWith("filter.") || filters.length >= ENTITY_LIST_MAX_FILTERS)
      continue;
    hasFilterParameter = true;
    const field = key.slice("filter.".length);
    try {
      const parsed = JSON.parse(raw) as {
        operator?: unknown;
        value?: JsonValue;
      };
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.operator === "string"
      )
        filters.push({
          field,
          operator: parsed.operator as ListFilterOperator,
          ...(Object.hasOwn(parsed, "value") ? { value: parsed.value } : {}),
        });
    } catch {
      /* Malformed optional URL state is normalized away. */
    }
  }
  let state = locationFromBase(base, descriptor);
  const apply = (patch: Partial<ListLocationStateV1>) => {
    try {
      state = parseListLocationState({ ...state, ...patch }, descriptor);
    } catch (error) {
      // URL input is optional and untrusted. Preserve every independently valid
      // setting rather than discarding the entire shared link.
      if (!(error instanceof TypeError)) throw error;
    }
  };
  if (hasFilterParameter) {
    state = parseListLocationState({ ...state, filters: [] }, descriptor);
    for (const filter of filters)
      apply({ filters: [...state.filters, filter] });
  }
  if (parameters.has("sort")) {
    try {
      apply({
        sort:
          parameters.get("sort") === "none"
            ? []
            : parseSort(
                parameters.get("sort"),
                descriptor.limits.maxSortLevels,
              ),
      });
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
  }
  if (parameters.has("standardView"))
    apply({ standardViewKey: parameters.get("standardView") || undefined });
  if (parameters.has("q")) apply({ query: parameters.get("q") || undefined });
  // `groups=a,b,c`; a legacy `group=x` reads as one level.
  if (parameters.has("groups") || parameters.has("group") || parameters.get("group.clear") === "1")
    apply({
      ...(parameters.get("group.clear") === "1"
        ? { groups: undefined }
        : parameters.get("groups")
          ? { groups: parameters.get("groups")!.split(",").filter(Boolean) }
          : parameters.get("group")
            ? { groups: [parameters.get("group")!] }
            : {}),
    });
  if (
    parameters.has("cols") ||
    parameters.has("col.rm") ||
    parameters.has("col.at")
  )
    apply({ columns: decodeColumns(parameters, state.columns) });
  if (parameters.has("density"))
    apply({
      density: parameters.get("density") as ListLocationStateV1["density"],
    });
  const view = parameters.get("view");
  // Only a layout this viewer can use is applied; anything else keeps the base layout.
  if (view !== null) {
    const mode = descriptor.surface.supportedModes.find(
      (supported) => supported === view,
    );
    if (mode) apply({ mode });
  }
  if (
    state.board &&
    (parameters.has("lane") || parameters.has("lanes.collapsed"))
  ) {
    const collapsed = parameters.get("lanes.collapsed");
    apply({
      board: {
        laneField: parameters.get("lane") ?? state.board.laneField,
        collapsed:
          collapsed === null
            ? state.board.collapsed
            : collapsed.split(",").filter(Boolean),
      },
    });
  }
  if (
    state.calendar &&
    (parameters.has("cal.field") || parameters.has("cal.view"))
  )
    apply({
      calendar: {
        dateField: parameters.get("cal.field") ?? state.calendar.dateField,
        view: (parameters.get("cal.view") ??
          state.calendar.view) as NonNullable<
          ListLocationStateV1["calendar"]
        >["view"],
      },
    });
  if (parameters.has("cal"))
    apply({ calendarAnchor: parameters.get("cal") || undefined });
  if (
    state.gantt &&
    (parameters.has("gantt.field") || parameters.has("gantt.zoom"))
  )
    apply({
      gantt: {
        dateField: parameters.get("gantt.field") ?? state.gantt.dateField,
        zoom: (parameters.get("gantt.zoom") ?? state.gantt.zoom) as NonNullable<
          ListLocationStateV1["gantt"]
        >["zoom"],
      },
    });
  if (parameters.has("gantt"))
    apply({ ganttAnchor: parameters.get("gantt") || undefined });
  if (parameters.has("tree.node"))
    apply({ treeNode: parameters.get("tree.node") || undefined });
  // An invalid comparison is dropped here; the runtime reports it.
  const compare = readCompareLocation(parameters);
  if (compare && compare !== "invalid") apply({ compare });
  if (parameters.get("sheet") === "none") apply({ spreadsheet: undefined });
  else if (
    parameters.get("sheet") === "custom" ||
    parameters.has("pinned") ||
    [...parameters.keys()].some((key) => key.startsWith("width."))
  )
    apply({ spreadsheet: decodeSpreadsheet(parameters, state.spreadsheet) });
  if (parameters.get("vid")) apply({ savedViewId: parameters.get("vid")! });
  if (parameters.get("bvid"))
    apply({ baseSavedViewId: parameters.get("bvid")! });
  if (parameters.get("cursor")) apply({ cursor: parameters.get("cursor")! });
  if (parameters.has("page"))
    apply({ pageIndex: Number(parameters.get("page")) });
  if (parameters.has("pageSize"))
    apply({ pageSize: Number(parameters.get("pageSize")) });
  return state;
}

export function encodeListLocationState(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  options: ListLocationCodecOptions = {},
): URLSearchParams {
  // An over-long query can never reach the records API. Drop it instead of
  // throwing so every other part of the state (filters, sort, pagination)
  // still round-trips through the URL.
  const normalized = parseListLocationState(
    (state.query?.trim().length ?? 0) > ENTITY_LIST_MAX_SEARCH_LENGTH
      ? { ...state, query: undefined }
      : state,
    descriptor,
  );
  const base = normalizedBase(descriptor, options.baseState);
  const parameters = new URLSearchParams();
  if (normalized.standardViewKey !== base.standardViewKey)
    parameters.set("standardView", normalized.standardViewKey ?? "");
  if ((normalized.query ?? "") !== (base.query ?? ""))
    parameters.set("q", normalized.query ?? "");
  if (!equal(normalized.filters, base.filters)) {
    if (!normalized.filters.length) parameters.set("filters", "none");
    else
      for (const filter of normalized.filters)
        parameters.append(
          `filter.${filter.field}`,
          stableStringify({
            operator: filter.operator,
            ...(filter.value !== undefined ? { value: filter.value } : {}),
          }),
        );
  }
  if (!equal(normalized.sort, base.sort))
    parameters.set(
      "sort",
      normalized.sort.length
        ? normalized.sort.map(formatSort).join(",")
        : "none",
    );
  if ((normalized.groups ?? []).join(",") !== (base.groups ?? []).join(",")) {
    if (normalized.groups?.length) parameters.set("groups", normalized.groups.join(","));
    else parameters.set("group.clear", "1");
  }
  encodeColumns(parameters, normalized.columns, base.columns);
  if (normalized.density !== base.density)
    parameters.set("density", normalized.density);
  if (normalized.mode !== base.mode) parameters.set("view", normalized.mode);
  encodeSpreadsheet(parameters, normalized.spreadsheet, base.spreadsheet);
  if (normalized.calendar && base.calendar) {
    if (normalized.calendar.dateField !== base.calendar.dateField)
      parameters.set("cal.field", normalized.calendar.dateField);
    if (normalized.calendar.view !== base.calendar.view)
      parameters.set("cal.view", normalized.calendar.view);
  }
  if (normalized.calendarAnchor)
    parameters.set("cal", normalized.calendarAnchor);
  if (normalized.gantt && base.gantt) {
    if (normalized.gantt.dateField !== base.gantt.dateField)
      parameters.set("gantt.field", normalized.gantt.dateField);
    if (normalized.gantt.zoom !== base.gantt.zoom)
      parameters.set("gantt.zoom", normalized.gantt.zoom);
  }
  if (normalized.ganttAnchor) parameters.set("gantt", normalized.ganttAnchor);
  if (normalized.treeNode && normalized.mode === "tree")
    parameters.set("tree.node", normalized.treeNode);
  if (normalized.compare) writeCompareLocation(parameters, normalized.compare);
  if (normalized.board && base.board) {
    if (normalized.board.laneField !== base.board.laneField)
      parameters.set("lane", normalized.board.laneField);
    if (!equal(normalized.board.collapsed, base.board.collapsed))
      parameters.set("lanes.collapsed", normalized.board.collapsed.join(","));
  }
  if (options.includeViewIds !== false) {
    if (normalized.savedViewId) parameters.set("vid", normalized.savedViewId);
    if (normalized.baseSavedViewId)
      parameters.set("bvid", normalized.baseSavedViewId);
  }
  if (normalized.cursor) parameters.set("cursor", normalized.cursor);
  if (normalized.pageIndex !== undefined && normalized.pageIndex > 0)
    parameters.set("page", String(normalized.pageIndex));
  if (
    normalized.pageSize !== undefined &&
    normalized.pageSize !== descriptor.limits.defaultPageSize
  )
    parameters.set("pageSize", String(normalized.pageSize));
  return parameters;
}

export function toSaveableListState(
  state: ListLocationStateV1,
): SaveableListStateV1 {
  return Object.freeze({
    ...(state.standardViewKey
      ? { standardViewKey: state.standardViewKey }
      : {}),
    ...(state.query ? { query: state.query } : {}),
    filters: state.filters,
    sort: state.sort,
    ...(state.groups?.length ? { groups: state.groups } : {}),
    columns: state.columns,
    density: state.density,
    mode: state.mode,
    ...(state.spreadsheet ? { spreadsheet: state.spreadsheet } : {}),
    ...(state.board ? { board: state.board } : {}),
    ...(state.calendar ? { calendar: state.calendar } : {}),
    ...(state.gantt ? { gantt: state.gantt } : {}),
  });
}

function normalizedBase(
  descriptor: EntityListDescriptorV1,
  state?: SaveableListStateV1,
): SaveableListStateV1 {
  return parseSaveableListState(
    state ?? descriptor.surface.defaultState,
    descriptor,
  );
}
function locationFromBase(
  base: SaveableListStateV1,
  descriptor: EntityListDescriptorV1,
): ListLocationStateV1 {
  return parseListLocationState(base, descriptor);
}

function decodeColumns(
  parameters: URLSearchParams,
  base: readonly string[],
): readonly string[] {
  if (parameters.has("cols")) return split(parameters.get("cols"));
  if (!parameters.has("col.rm") && !parameters.has("col.at")) return [...base];
  const removed = new Set(split(parameters.get("col.rm")));
  const columns = base.filter((field) => !removed.has(field));
  for (const instruction of split(parameters.get("col.at"))) {
    const separator = instruction.lastIndexOf(":");
    if (separator <= 0) continue;
    const field = instruction.slice(0, separator),
      index = Number.parseInt(instruction.slice(separator + 1), 36);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= ENTITY_LIST_MAX_VISIBLE_COLUMNS
    )
      continue;
    const current = columns.indexOf(field);
    if (current >= 0) columns.splice(current, 1);
    columns.splice(Math.min(index, columns.length), 0, field);
  }
  return columns.slice(0, ENTITY_LIST_MAX_VISIBLE_COLUMNS);
}

function encodeColumns(
  parameters: URLSearchParams,
  columns: readonly string[],
  base: readonly string[],
): void {
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
  const selected =
    delta.toString().length < full.toString().length ? delta : full;
  selected.forEach((value, key) => parameters.set(key, value));
}

function decodeSpreadsheet(
  parameters: URLSearchParams,
  base?: SpreadsheetStateV1,
): SpreadsheetStateV1 | undefined {
  if (parameters.get("sheet") === "none") return undefined;
  const hasOverride =
    parameters.get("sheet") === "custom" ||
    parameters.has("pinned") ||
    [...parameters.keys()].some((key) => key.startsWith("width."));
  if (!hasOverride) return base;
  const pinned = split(parameters.get("pinned"));
  const widths: Record<string, number> = {};
  for (const [key, value] of parameters) {
    if (
      !key.startsWith("width.") ||
      Object.keys(widths).length >= ENTITY_LIST_MAX_VISIBLE_COLUMNS
    )
      continue;
    widths[key.slice("width.".length)] = Number(value);
  }
  return { pinned, widths };
}

function encodeSpreadsheet(
  parameters: URLSearchParams,
  spreadsheet: SpreadsheetStateV1 | undefined,
  base: SpreadsheetStateV1 | undefined,
): void {
  if (equal(spreadsheet, base)) return;
  if (!spreadsheet) {
    parameters.set("sheet", "none");
    return;
  }
  parameters.set("sheet", "custom");
  if (spreadsheet.pinned.length)
    parameters.set("pinned", spreadsheet.pinned.join(","));
  for (const [field, width] of Object.entries(spreadsheet.widths)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, ENTITY_LIST_MAX_VISIBLE_COLUMNS))
    parameters.set(`width.${field}`, String(width));
}

function split(
  value: string | null,
  maximum = ENTITY_LIST_MAX_VISIBLE_COLUMNS,
): string[] {
  return value
    ? value
        .split(",", maximum)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}
function parseSort(value: string | null, maximum: number): ListSortV1[] {
  return split(value, maximum).map((item) => {
    const [field = "", direction = "", nulls] = item.split(":");
    return { field, direction, ...(nulls ? { nulls } : {}) } as ListSortV1;
  });
}
function formatSort(value: ListSortV1): string {
  return [value.field, value.direction, value.nulls].filter(Boolean).join(":");
}
function equal(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}
function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}
function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  return value;
}

export type { ListFilterOperator };
