"use client";

/**
 * useEntityListUrl — URL ↔ EntityListQueryState sync hook
 *
 * The URL IS the store. No separate Zustand layer needed for list state.
 *
 * URL serialization rules:
 *   search     → ?q=<term>
 *   sort       → ?sort=<key>:<dir>          e.g. ?sort=amount:desc
 *   filters    → ?filter.<field>=<v1>,<v2>  e.g. ?filter.status=posted,draft
 *   group      → ?group=<field>
 *   page       → ?page=<n>   (omitted when page=1 for clean URLs)
 *   pageSize   → ?size=<n>
 *   viewMode   → ?view=<mode> (omitted when "list" — the default)
 *   columns    → ?cols=<f1>,<f2>,...
 *   density    → ?density=<value>
 *   facets     → ?facets=<cheap|all>
 *   savedViewId     → ?vid=<uuid>
 *   baseSavedViewId → ?bvid=<uuid>
 *
 * Mutation semantics:
 *   - setSearch, setSort, setFilters, setGroup, setPage, setViewMode, setColumns
 *     update the URL via router.replace (no history entry).
 *   - loadSavedView loads a full EntityListQueryState and sets both
 *     savedViewId and baseSavedViewId to the same UUID.
 *   - markModified applies a partial update and clears savedViewId
 *     while retaining baseSavedViewId — enables "Modified from <name>" UI.
 *   - reset clears all params, returning to the bare entity page.
 *
 * Requires a <Suspense> boundary around any component that calls this hook
 * (Next.js App Router useSearchParams requirement).
 */

import { useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type {
  EntityListQueryState,
  EntityListSort,
  EntityListFilters,
  EntityListViewMode,
  FacetScope,
} from "@athyper/api-contracts/entity-list";

// ─── URL param keys ────────────────────────────────────────────────────────────

const P = {
  SEARCH:       "q",
  SEARCH_MODE:  "search_mode", // omitted when "server" (the default)
  SORT:         "sort",        // "<key>:<dir>"
  FILTER_PFX:   "filter.",     // "filter.<field>" = "<v1>,<v2>"
  GROUP:        "group",
  PAGE:         "page",
  PAGE_SIZE:    "size",
  VIEW_MODE:    "view",
  COLUMNS:      "cols",        // "<f1>,<f2>,..."
  DENSITY:      "density",
  FACETS:       "facets",
  VIEW_ID:      "vid",         // savedViewId
  BASE_VIEW_ID: "bvid",        // baseSavedViewId
} as const;

// ─── State parser ──────────────────────────────────────────────────────────────

function parseState(
  entityCode: string,
  searchParams: ReturnType<typeof useSearchParams>,
): EntityListQueryState {
  const state: EntityListQueryState = { _v: 1, entity: entityCode };

  // search
  const q = searchParams.get(P.SEARCH);
  if (q) state.search = q;

  // searchMode (only stored in URL when "client"; default is "server")
  const searchMode = searchParams.get(P.SEARCH_MODE);
  if (searchMode === "client" || searchMode === "server") state.searchMode = searchMode;

  // sort: "key:dir"
  const sortRaw = searchParams.get(P.SORT);
  if (sortRaw) {
    const colonIdx = sortRaw.lastIndexOf(":");
    if (colonIdx > 0) {
      const key = sortRaw.slice(0, colonIdx);
      const dir = sortRaw.slice(colonIdx + 1);
      if (key && (dir === "asc" || dir === "desc")) {
        state.sort = { key, dir };
      }
    }
  }

  // filters: one param per field, values comma-separated
  const filters: EntityListFilters = {};
  for (const [paramKey, paramValue] of searchParams.entries()) {
    if (paramKey.startsWith(P.FILTER_PFX)) {
      const field = paramKey.slice(P.FILTER_PFX.length);
      if (field) {
        const vals = paramValue.split(",").filter(Boolean);
        if (vals.length > 0) filters[field] = vals;
      }
    }
  }
  if (Object.keys(filters).length > 0) state.filters = filters;

  // group
  const group = searchParams.get(P.GROUP);
  if (group === "null") state.group = null;
  else if (group) state.group = group;

  // page
  const page = parseInt(searchParams.get(P.PAGE) ?? "", 10);
  if (!Number.isNaN(page) && page > 0) state.page = page;

  // pageSize
  const size = parseInt(searchParams.get(P.PAGE_SIZE) ?? "", 10);
  if (!Number.isNaN(size) && size > 0 && size <= 200) state.pageSize = size;

  // viewMode
  const view = searchParams.get(P.VIEW_MODE) as EntityListViewMode | null;
  if (view === "list" || view === "board" || view === "compact" || view === "dashboard" || view === "excel") {
    state.viewMode = view;
  }

  // columns
  const cols = searchParams.get(P.COLUMNS);
  if (cols) {
    const colArr = cols.split(",").filter(Boolean);
    if (colArr.length > 0) state.columns = colArr;
  }

  // density
  const density = searchParams.get(P.DENSITY);
  if (density === "compact" || density === "comfortable" || density === "spacious") {
    state.density = density;
  }

  // facets
  const facets = searchParams.get(P.FACETS) as FacetScope | null;
  if (facets === "cheap" || facets === "all") state.facets = facets;

  // savedViewId
  const vid = searchParams.get(P.VIEW_ID);
  if (vid) state.savedViewId = vid;

  // baseSavedViewId
  const bvid = searchParams.get(P.BASE_VIEW_ID);
  if (bvid) state.baseSavedViewId = bvid;

  return state;
}

// ─── State serializer ──────────────────────────────────────────────────────────

function stateToParams(s: EntityListQueryState): URLSearchParams {
  const p = new URLSearchParams();

  if (s.search?.trim())   p.set(P.SEARCH, s.search.trim());

  // Omit searchMode when "server" (the default — avoids URL noise)
  if (s.searchMode && s.searchMode !== "server") p.set(P.SEARCH_MODE, s.searchMode);

  if (s.sort) p.set(P.SORT, `${s.sort.key}:${s.sort.dir}`);

  if (s.filters) {
    for (const [field, values] of Object.entries(s.filters)) {
      const clean = values.filter(Boolean);
      if (clean.length > 0) p.set(`${P.FILTER_PFX}${field}`, clean.join(","));
    }
  }

  if (s.group !== undefined && s.group !== null) p.set(P.GROUP, s.group);
  if (s.group === null) p.set(P.GROUP, "null");

  // Omit page=1 — redundant and pollutes clean URLs
  if (s.page && s.page > 1) p.set(P.PAGE, String(s.page));

  if (s.pageSize) p.set(P.PAGE_SIZE, String(s.pageSize));

  // Omit viewMode="list" — it's the default
  if (s.viewMode && s.viewMode !== "list") p.set(P.VIEW_MODE, s.viewMode);

  if (s.columns?.length) p.set(P.COLUMNS, s.columns.join(","));

  if (s.density) p.set(P.DENSITY, s.density);

  if (s.facets) p.set(P.FACETS, s.facets);

  if (s.savedViewId)     p.set(P.VIEW_ID,      s.savedViewId);
  if (s.baseSavedViewId) p.set(P.BASE_VIEW_ID, s.baseSavedViewId);

  return p;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEntityListUrl(entityCode: string) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  // Derive current state from URL (memoized — recomputes when searchParams changes)
  const state = useMemo(
    () => parseState(entityCode, searchParams),
    [entityCode, searchParams],
  );

  // Apply a new full state to the URL (replace — no history entry for list navigation)
  const applyState = useCallback(
    (next: EntityListQueryState) => {
      const params = stateToParams(next);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname],
  );

  // ── Setters ──────────────────────────────────────────────────────────────────

  const setSearch = useCallback(
    (q: string) => applyState({ ...state, search: q.trim() || undefined, page: undefined }),
    [state, applyState],
  );

  const setSort = useCallback(
    (sort: EntityListSort | undefined) => applyState({ ...state, sort, page: undefined }),
    [state, applyState],
  );

  const setFilters = useCallback(
    (filters: EntityListFilters | undefined) => applyState({ ...state, filters, page: undefined }),
    [state, applyState],
  );

  const setGroup = useCallback(
    (group: string | null | undefined) => applyState({ ...state, group, page: undefined }),
    [state, applyState],
  );

  const setPage = useCallback(
    (page: number) => applyState({ ...state, page }),
    [state, applyState],
  );

  const setViewMode = useCallback(
    (viewMode: EntityListViewMode) => applyState({ ...state, viewMode }),
    [state, applyState],
  );

  const setColumns = useCallback(
    (columns: string[]) => applyState({ ...state, columns }),
    [state, applyState],
  );

  const setDensity = useCallback(
    (density: "compact" | "comfortable" | "spacious" | undefined) =>
      applyState({ ...state, density }),
    [state, applyState],
  );

  // ── Saved view operations ─────────────────────────────────────────────────────

  /**
   * Load a saved view: apply its config state, set savedViewId = baseSavedViewId = viewId.
   * Any subsequent modification will clear savedViewId (via markModified) while
   * retaining baseSavedViewId so the UI can show "Modified from <name>".
   */
  const loadSavedView = useCallback(
    (viewId: string, viewConfig: EntityListQueryState) => {
      applyState({
        ...viewConfig,
        _v: 1,
        entity: entityCode,
        savedViewId:     viewId,
        baseSavedViewId: viewId,
      });
    },
    [entityCode, applyState],
  );

  /**
   * Apply a partial update and mark as "modified relative to base saved view".
   * Clears savedViewId (state no longer matches saved view exactly).
   * Retains baseSavedViewId for "Modified from <name>" UI affordance.
   */
  const markModified = useCallback(
    (patch: Partial<EntityListQueryState>) => {
      const next = { ...state, ...patch };
      if (state.savedViewId) {
        next.baseSavedViewId = state.baseSavedViewId ?? state.savedViewId;
        delete next.savedViewId;
      }
      applyState(next);
    },
    [state, applyState],
  );

  /**
   * Clear all URL params — returns to the bare entity page with no filters,
   * sort, search, saved view, etc.
   */
  const reset = useCallback(
    () => router.replace(pathname, { scroll: false }),
    [router, pathname],
  );

  // ── Derived state ─────────────────────────────────────────────────────────────

  /** True when state has been modified relative to a loaded saved view. */
  const isModified = !!state.baseSavedViewId && !state.savedViewId;

  /** True when any filter/search/sort/group is active. */
  const hasActiveQuery = !!(
    state.search ||
    (state.filters && Object.keys(state.filters).length > 0) ||
    state.sort ||
    state.group
  );

  return {
    state,
    setSearch,
    setSort,
    setFilters,
    setGroup,
    setPage,
    setViewMode,
    setColumns,
    setDensity,
    loadSavedView,
    markModified,
    reset,
    isModified,
    hasActiveQuery,
  };
}
