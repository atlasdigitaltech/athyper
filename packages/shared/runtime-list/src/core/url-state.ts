import {
  LIST_URL_PARAMS as P,
  type RawSearchParams,
  type RuntimeListState,
  type SortEntry,
  type ViewMode,
  type ViewDensity,
} from "./types";

// ─── Primitive helpers ────────────────────────────────────────────────────────

export function firstParam(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export function splitFilterParamValue(value: string): string[] {
  const normalized = normalizeFilterParamValue(value);
  if (!normalized) return [];
  if (normalized.startsWith("between:") || normalized.startsWith("in:") || normalized.startsWith("not_in:")) return [normalized];
  return normalized.split(",").map((s) => s.trim()).filter(Boolean);
}

export function normalizeFilterParamValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("between:")) {
    const rest = trimmed.slice("between:".length);
    const comma = rest.indexOf(",");
    if (comma > 0) {
      const from = rest.slice(0, comma).trim();
      const to = rest.slice(comma + 1).trim();
      if (from && to && !from.includes(",") && !to.includes(",")) {
        return `between:${from},${to}`;
      }
    }
  }

  if (trimmed.startsWith("in:") || trimmed.startsWith("not_in:")) {
    const prefix = trimmed.startsWith("not_in:") ? "not_in:" : "in:";
    const rest = trimmed.slice(prefix.length);
    const values = rest.split(",").map((item) => item.trim()).filter((item) => item && !item.includes(","));
    if (values.length === 0) return "";
    return `${prefix}${values.join(",")}`;
  }

  return trimmed.replace(/,/g, " ");
}

export function describeFilterParamValue(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const relative = RELATIVE_FILTER_LABELS.get(raw);
  if (relative) return relative;

  if (raw === "null") return "Empty";
  if (raw === "notnull") return "Not empty";

  const between = parseBetweenFilterValue(raw);
  if (between) return `${formatIsoDateLabel(between.from)} - ${formatIsoDateLabel(between.to)}`;

  if (raw.startsWith(">=")) return `From ${formatFilterBoundaryLabel(raw.slice(2))}`;
  if (raw.startsWith("<=")) return `Until ${formatFilterBoundaryLabel(raw.slice(2))}`;
  if (raw.startsWith(">")) return `After ${formatFilterBoundaryLabel(raw.slice(1))}`;
  if (raw.startsWith("<")) return `Before ${formatFilterBoundaryLabel(raw.slice(1))}`;
  if (raw.startsWith("~")) return `Contains ${raw.slice(1)}`;
  if (raw.startsWith("in:")) return raw.slice("in:".length).split(",").map((item) => item.trim()).filter(Boolean).join(", ");
  if (raw.startsWith("not_in:")) return `Not ${raw.slice("not_in:".length).split(",").map((item) => item.trim()).filter(Boolean).join(", ")}`;

  return raw;
}

export function positiveInt(v: string | string[] | undefined, fallback: number): number {
  const n = Number(firstParam(v));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const VALID_VIEW_MODES = new Set<string>(["list", "compact", "board", "dashboard", "excel"]);
const VALID_DENSITIES  = new Set<string>(["compact", "comfortable", "spacious"]);

// ─── Parser — raw URL params → RuntimeListState ───────────────────────────────
// Key names MUST match the P constant (same as useEntityListUrl.ts).

export function parseListSearchParams(raw: RawSearchParams): RuntimeListState {
  const state: RuntimeListState = {};

  const q = firstParam(raw[P.SEARCH]);
  if (q) state.search = q;

  const scope = firstParam(raw[P.SEARCH_SCOPE]);
  if (scope === "loaded" || scope === "all") state.searchScope = scope;

  const sm = firstParam(raw[P.SEARCH_MODE]);
  if (sm === "client") state.searchMode = "client";

  // sort: "key:dir" comma-separated
  const sortRaw = firstParam(raw[P.SORT]);
  if (sortRaw) {
    const entries: SortEntry[] = sortRaw.split(",").flatMap((seg) => {
      const [key, dir] = seg.trim().split(":");
      if (!key?.trim()) return [];
      return [{ key: key.trim(), dir: dir === "desc" ? "desc" : "asc" } as SortEntry];
    });
    if (entries.length > 0) state.sort = entries;
  }

  // filters: filter.<field>=<value>
  const filters: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith(P.FILTER_PFX)) continue;
    const field = k.slice(P.FILTER_PFX.length);
    if (!field) continue;
    const val = firstParam(v);
    if (val) filters[field] = splitFilterParamValue(val);
  }
  if (Object.keys(filters).length > 0) state.filters = filters;

  const group = firstParam(raw[P.GROUP]);
  if (group) state.group = group;

  const page = Number(firstParam(raw[P.PAGE]));
  if (Number.isFinite(page) && page > 0) state.page = Math.floor(page);

  const size = Number(firstParam(raw[P.PAGE_SIZE]) ?? firstParam(raw["size"]));
  if (Number.isFinite(size) && size > 0) state.pageSize = Math.floor(size);

  const view = firstParam(raw[P.VIEW_MODE]);
  if (view && VALID_VIEW_MODES.has(view)) state.viewMode = view as ViewMode;

  const cols = firstParam(raw[P.COLUMNS]);
  if (cols) state.columns = cols.split(",").map((s) => s.trim()).filter(Boolean);

  const density = firstParam(raw[P.DENSITY]);
  if (density && VALID_DENSITIES.has(density)) state.density = density as ViewDensity;

  const facets = firstParam(raw[P.FACETS]);
  if (facets === "all") state.facets = "all";

  const pinned = firstParam(raw[P.PINNED]);
  if (pinned) state.pinnedCols = pinned.split(",").map((s) => s.trim()).filter(Boolean);

  const vid = firstParam(raw[P.VIEW_ID]);
  if (vid) state.savedViewId = vid;

  const bvid = firstParam(raw[P.BASE_VIEW_ID]);
  if (bvid) state.baseSavedViewId = bvid;

  return state;
}

// ─── Serializer — RuntimeListState → URL search string ────────────────────────

export function serializeListState(
  base: string,
  current: RawSearchParams,
  overrides: Record<string, string | null>,
): string {
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(current)) {
    const val = firstParam(v);
    if (val !== undefined) params.set(k, val);
  }

  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// ─── Saved-view merge ─────────────────────────────────────────────────────────

export function mergeSavedViewState(
  urlState:  RuntimeListState,
  savedState:Partial<RuntimeListState> | null,
): RuntimeListState {
  if (!savedState) return urlState;
  // URL state wins over saved state (user navigated with explicit params)
  return { ...savedState, ...urlState };
}

// ─── Active filter entries for display ───────────────────────────────────────

export function resolveActiveFilters(
  state: RuntimeListState,
  fieldLabels: Record<string, string>,
): import("./types").ActiveFilterEntry[] {
  if (!state.filters) return [];
  return Object.entries(state.filters)
    .filter(([, vals]) => vals.length > 0)
    .map(([field, vals]) => ({
      fieldName: field,
      label:     fieldLabels[field] ?? field.replace(/_/g, " "),
      value:     vals.map(describeFilterParamValue).filter(Boolean).join(", "),
    }));
}

// ─── Effective state → raw params ────────────────────────────────────────────
// Used by presenterProps to pass the merged saved-view state to fetchRecords,
// so saved-view filters/sort/page are actually honoured by the data layer.

export function effectiveStateToRawParams(state: RuntimeListState): RawSearchParams {
  const params: RawSearchParams = {};

  if (state.search)              params[P.SEARCH]       = state.search;
  if (state.searchScope)         params[P.SEARCH_SCOPE] = state.searchScope;
  if (state.searchMode)          params[P.SEARCH_MODE]  = state.searchMode;
  if (state.sort?.length)        params[P.SORT]         = state.sort.map((e) => `${e.key}:${e.dir}`).join(",");
  if (state.group)               params[P.GROUP]        = state.group;
  if (state.page)                params[P.PAGE]         = String(state.page);
  if (state.pageSize)            params[P.PAGE_SIZE]    = String(state.pageSize);
  if (state.viewMode)            params[P.VIEW_MODE]    = state.viewMode;
  if (state.columns?.length)     params[P.COLUMNS]      = state.columns.join(",");
  if (state.density)             params[P.DENSITY]      = state.density;
  if (state.facets)              params[P.FACETS]       = state.facets;
  if (state.pinnedCols?.length)  params[P.PINNED]       = state.pinnedCols.join(",");

  if (state.filters) {
    for (const [field, vals] of Object.entries(state.filters)) {
      if (vals.length > 0) {
        params[`${P.FILTER_PFX}${field}`] = vals.join(",");
      }
    }
  }

  return params;
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

export const LIST_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export function resolvePageSize(
  requested: number | undefined,
  options:   readonly number[] = LIST_PAGE_SIZE_OPTIONS,
): number {
  const allowed = options.length > 0 ? options : LIST_PAGE_SIZE_OPTIONS;
  if (!requested) return allowed[0] ?? DEFAULT_PAGE_SIZE;
  const closest = allowed.reduce((best, opt) =>
    Math.abs(opt - requested) < Math.abs(best - requested) ? opt : best,
  );
  return closest;
}

const RELATIVE_FILTER_LABELS = new Map<string, string>([
  ["@today", "Today"],
  ["@yesterday", "Yesterday"],
  ["@this_week", "This week"],
  ["@last_week", "Last week"],
  ["@this_month", "This month"],
  ["@last_month", "Last month"],
  ["@this_quarter", "This quarter"],
  ["@last_quarter", "Last quarter"],
  ["@this_year", "This year"],
  ["@last_year", "Last year"],
  ["@ytd", "Year to date"],
  ["@qtd", "Quarter to date"],
  ["@mtd", "Month to date"],
]);

function parseBetweenFilterValue(value: string): { from: string; to: string } | null {
  if (!value.startsWith("between:")) return null;
  const rest = value.slice("between:".length);
  const comma = rest.indexOf(",");
  if (comma <= 0) return null;
  const from = rest.slice(0, comma).trim();
  const to = rest.slice(comma + 1).trim();
  return from && to ? { from, to } : null;
}

function formatFilterBoundaryLabel(value: string): string {
  return ISO_DATE_RE.test(value) ? formatIsoDateLabel(value) : value;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatIsoDateLabel(value: string): string {
  if (!ISO_DATE_RE.test(value)) return value;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const monthIndex = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  const year = Number(yearRaw);
  const month = MONTH_LABELS[monthIndex];
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return value;
  return `${month} ${day}, ${year}`;
}
