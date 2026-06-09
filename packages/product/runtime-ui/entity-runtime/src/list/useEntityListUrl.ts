"use client";

/**
 * useEntityListUrl — URL ↔ EntityListQueryState sync hook
 *
 * The URL IS the store. No separate Zustand layer needed for list state.
 *
 * URL serialization rules:
 *   search     → ?q=<term>
 *   sort       → ?sort=<key>:<dir>[:<nulls>]  e.g. ?sort=amount:desc,date:asc:nfirst
 *   filters    → ?filter.<field>=<sigil>    e.g. ?filter.status=posted,draft
 *                                                ?filter.amount=>50000
 *                                                ?filter.invoice_date=@this_month
 *   group      → ?group=<field>
 *   page       → ?page=<n>   (omitted when page=1 for clean URLs)
 *   pageSize   → ?size=<n>
 *   viewMode   → ?view=<mode>
 *   columns    → ?cols=<f1>,<f2>,...
 *   density    → ?density=<value>
 *   facets     → ?facets=<cheap|all>
 *   savedViewId     → ?vid=<uuid>
 *   baseSavedViewId → ?bvid=<uuid>
 *
 * Mutation semantics:
 *   - setSearch, setSort, setFilters, setGroup, setPage, setViewMode, setColumns
 *     update the URL via router.replace (no history entry). View-shaping edits
 *     clear savedViewId while retaining baseSavedViewId so "Modified from ..."
 *     affordances work across filters, sort, group, and columns.
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
  EntityListSortEntry,
  EntityListFilters,
  EntityListViewMode,
  FacetScope,
} from "@athyper/api-contracts/entity-list";
import { parseFilterSigil, serializeFilterEntry } from "@athyper/api-contracts/entity-list";

// ─── URL param keys ────────────────────────────────────────────────────────────

const P = {
  SEARCH:       "q",
  SEARCH_MODE:  "search_mode", // omitted when "server" (the default); written when "client" (in-view search)
  SORT:         "sort",        // "<key>:<dir>"
  FILTER_PFX:   "filter.",     // "filter.<field>" = "<sigil>"
  GROUP:        "group",
  PAGE:         "page",
  PAGE_SIZE:    "size",
  VIEW_MODE:    "view",
  COLUMNS:      "cols",        // "<f1>,<f2>,..."
  DENSITY:      "density",
  FACETS:       "facets",
  PINNED:       "pinned",      // "<f1>,<f2>,..." — pinned cols for excel view
  VIEW_ID:      "vid",         // savedViewId
  BASE_VIEW_ID: "bvid",        // baseSavedViewId
} as const;

const RETURN_TO_PARAM = "returnTo";

// ─── State parser ──────────────────────────────────────────────────────────────

function parseState(
  entityCode: string,
  searchParams: ReturnType<typeof useSearchParams>,
): EntityListQueryState {
  const state: EntityListQueryState = { _v: 1, entity: entityCode };

  // search
  const q = searchParams.get(P.SEARCH);
  if (q) state.search = q;

  // searchMode (only stored in URL when "client"; default is "server" / full-text)
  const searchMode = searchParams.get(P.SEARCH_MODE);
  if (searchMode === "client") state.searchMode = "client";

  // sort: "key:dir[,key:dir:nfirst,...]"  nfirst suffix = NULLS FIRST
  const sortRaw = searchParams.get(P.SORT);
  if (sortRaw) {
    const entries: EntityListSortEntry[] = [];
    for (const token of sortRaw.split(",")) {
      const parts = token.trim().split(":");
      if (parts.length < 2) continue;
      const key  = parts[0]!;
      const dir  = parts[1] === "desc" ? "desc" : "asc";
      const nulls = parts[2] === "nfirst" ? "first" as const : undefined;
      if (key) entries.push(nulls ? { key, dir, nulls } : { key, dir });
    }
    if (entries.length > 0) state.sort = entries;
  }

  // filters: one param per field, sigil-encoded value
  const filters: EntityListFilters = {};
  for (const [paramKey, paramValue] of searchParams.entries()) {
    if (paramKey.startsWith(P.FILTER_PFX)) {
      const field = paramKey.slice(P.FILTER_PFX.length);
      if (field && paramValue) {
        filters[field] = parseFilterSigil(paramValue);
      }
    }
  }
  if (Object.keys(filters).length > 0) state.filters = filters;

  // group
  const group = searchParams.get(P.GROUP);
  if (group === "" || group === "null") state.group = null;
  else if (group) state.group = group;

  // page
  const page = parseInt(searchParams.get(P.PAGE) ?? "", 10);
  if (!Number.isNaN(page) && page > 0) state.page = page;

  // pageSize
  const size = parseInt(searchParams.get(P.PAGE_SIZE) ?? "", 10);
  if (!Number.isNaN(size) && size > 0 && size <= 500) state.pageSize = size;

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

  // pinnedCols
  const pinned = searchParams.get(P.PINNED);
  if (pinned) {
    const arr = pinned.split(",").filter(Boolean);
    if (arr.length > 0) state.pinnedCols = arr;
  }

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

  // Omit searchMode when "server" (the default — avoids URL noise); write "client" as an explicit override
  if (s.searchMode === "client") p.set(P.SEARCH_MODE, "client");

  if (s.sort?.length) {
    p.set(P.SORT, s.sort.map((e) => e.nulls === "first" ? `${e.key}:${e.dir}:nfirst` : `${e.key}:${e.dir}`).join(","));
  }

  if (s.filters) {
    for (const [field, entry] of Object.entries(s.filters)) {
      const sigil = serializeFilterEntry(entry);
      if (sigil) p.set(`${P.FILTER_PFX}${field}`, sigil);
    }
  }

  // "" = explicit no-group (clears view default); "null" is the legacy encoding
  if (s.group !== undefined && s.group !== null) p.set(P.GROUP, s.group);
  if (s.group === null) p.set(P.GROUP, "");

  // Omit page=1 — redundant and pollutes clean URLs
  if (s.page && s.page > 1) p.set(P.PAGE, String(s.page));

  if (s.pageSize) p.set(P.PAGE_SIZE, String(s.pageSize));

  if (s.viewMode) p.set(P.VIEW_MODE, s.viewMode);

  if (s.columns?.length) p.set(P.COLUMNS, s.columns.join(","));

  if (s.density) p.set(P.DENSITY, s.density);

  if (s.facets) p.set(P.FACETS, s.facets);

  if (s.pinnedCols?.length) p.set(P.PINNED, s.pinnedCols.join(","));

  if (s.savedViewId)     p.set(P.VIEW_ID,      s.savedViewId);
  if (s.baseSavedViewId) p.set(P.BASE_VIEW_ID, s.baseSavedViewId);

  return p;
}

function equalStateValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
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
      const returnTo = searchParams.get(RETURN_TO_PARAM);
      if (returnTo) params.set(RETURN_TO_PARAM, returnTo);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // ── Setters ──────────────────────────────────────────────────────────────────

  const applyViewEdit = useCallback(
    (patch: Partial<EntityListQueryState>) => {
      const next: EntityListQueryState = { ...state, ...patch };
      const changesSavedViewState = Object.entries(patch).some(([rawKey, value]) => {
        if (rawKey === "page") return false;
        const key = rawKey as keyof EntityListQueryState;
        return !equalStateValue(state[key], value);
      });

      if (changesSavedViewState && state.savedViewId) {
        next.baseSavedViewId = state.baseSavedViewId ?? state.savedViewId;
        delete next.savedViewId;
      }

      applyState(next);
    },
    [state, applyState],
  );

  const setSearch = useCallback(
    (q: string) => applyViewEdit({ search: q.trim() || undefined, page: undefined }),
    [applyViewEdit],
  );

  const setSort = useCallback(
    (sort: EntityListSortEntry[] | undefined) => applyViewEdit({ sort, page: undefined }),
    [applyViewEdit],
  );

  const setFilters = useCallback(
    (filters: EntityListFilters | undefined) => applyViewEdit({ filters, page: undefined }),
    [applyViewEdit],
  );

  const setGroup = useCallback(
    (group: string | null | undefined) => applyViewEdit({ group, page: undefined }),
    [applyViewEdit],
  );

  const setPage = useCallback(
    (page: number) => applyState({ ...state, page }),
    [state, applyState],
  );

  const setPageSize = useCallback(
    (pageSize: number | undefined) => applyViewEdit({ pageSize, page: undefined }),
    [applyViewEdit],
  );

  const setViewMode = useCallback(
    (viewMode: EntityListViewMode) => applyViewEdit({ viewMode }),
    [applyViewEdit],
  );

  const setColumns = useCallback(
    (columns: string[]) => applyViewEdit({ columns }),
    [applyViewEdit],
  );

  const setDensity = useCallback(
    (density: "compact" | "comfortable" | "spacious" | undefined) =>
      applyViewEdit({ density }),
    [applyViewEdit],
  );

  const setSearchMode = useCallback(
    (mode: "server" | "client" | undefined) =>
      applyViewEdit({ searchMode: mode, page: undefined }),
    [applyViewEdit],
  );

  const setFacets = useCallback(
    (scope: "cheap" | "all" | undefined) => applyState({ ...state, facets: scope }),
    [state, applyState],
  );

  const setPinnedCols = useCallback(
    (cols: string[]) => applyViewEdit({ pinnedCols: cols.length > 0 ? cols : undefined }),
    [applyViewEdit],
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
    (patch: Partial<EntityListQueryState>) => applyViewEdit(patch),
    [applyViewEdit],
  );

  /**
   * Clear all URL params — returns to the bare entity page with no filters,
   * sort, search, saved view, etc.
   */
  const reset = useCallback(
    () => {
      const returnTo = searchParams.get(RETURN_TO_PARAM);
      router.replace(returnTo ? `${pathname}?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // ── Derived state ─────────────────────────────────────────────────────────────

  /** True when state has been modified relative to a loaded saved view. */
  const isModified = !!state.baseSavedViewId && !state.savedViewId;

  /** True when any server-query state is active. */
  const hasActiveQuery = !!(
    state.search ||
    (state.filters && Object.keys(state.filters).length > 0) ||
    (state.sort && state.sort.length > 0) ||
    state.group !== undefined
  );

  /** True when the current URL state can be saved as a named list view. */
  const hasSaveableViewState = !!(
    hasActiveQuery ||
    state.searchMode ||
    state.viewMode ||
    state.pageSize ||
    state.density ||
    (state.columns && state.columns.length > 0) ||
    (state.pinnedCols && state.pinnedCols.length > 0)
  );

  return {
    state,
    setSearch,
    setSort,
    setFilters,
    setGroup,
    setPage,
    setPageSize,
    setViewMode,
    setColumns,
    setDensity,
    setSearchMode,
    setFacets,
    setPinnedCols,
    loadSavedView,
    markModified,
    reset,
    isModified,
    hasActiveQuery,
    hasSaveableViewState,
  };
}
