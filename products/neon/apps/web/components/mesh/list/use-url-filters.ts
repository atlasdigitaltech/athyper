"use client";

// components/mesh/list/use-url-filters.ts
//
// Bidirectional sync between ListPageState and URL search params.
// Reads initial state from URL on mount; writes changes back via replaceState.

import { useEffect, useRef } from "react";

import type { ListPageAction, ListPageState, ViewMode } from "./types";

const VALID_VIEW_MODES: ViewMode[] = ["table", "table-columns", "card-grid", "kanban"];

const PARAM_SEARCH = "q";
const PARAM_SORT = "sort";
const PARAM_DIR = "dir";
const PARAM_VIEW = "view";
const PARAM_PAGE = "page";
const PARAM_PAGE_SIZE = "pageSize";
const FILTER_PREFIX = "f.";

/**
 * Read URL search params into a partial ListPageState override.
 * Call once on mount to seed initial state.
 */
export function readUrlState(): Partial<ListPageState> {
    if (typeof window === "undefined") return {};

    const params = new URLSearchParams(window.location.search);
    const result: Partial<ListPageState> = {};

    const search = params.get(PARAM_SEARCH);
    if (search) result.search = search;

    const sort = params.get(PARAM_SORT);
    if (sort) result.sortKey = sort;

    const dir = params.get(PARAM_DIR);
    if (dir === "asc" || dir === "desc") result.sortDir = dir;

    const view = params.get(PARAM_VIEW);
    if (view && VALID_VIEW_MODES.includes(view as ViewMode)) {
        result.viewMode = view as ViewMode;
    }

    const page = params.get(PARAM_PAGE);
    if (page) {
        const n = parseInt(page, 10);
        if (!isNaN(n) && n > 0) result.page = n;
    }

    const pageSize = params.get(PARAM_PAGE_SIZE);
    if (pageSize) {
        const n = parseInt(pageSize, 10);
        if ([10, 25, 50, 100].includes(n)) result.pageSize = n;
    }

    // Read filter params
    const filters: Record<string, string> = {};
    params.forEach((value, key) => {
        if (key.startsWith(FILTER_PREFIX)) {
            filters[key.slice(FILTER_PREFIX.length)] = value;
        }
    });
    if (Object.keys(filters).length > 0) result.filters = filters;

    return result;
}

/**
 * Write current state to URL search params (replaceState, no navigation).
 */
function writeUrlState(
    state: ListPageState,
    defaultFilters: Record<string, string>,
    defaultViewMode: ViewMode,
) {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams();

    if (state.search) params.set(PARAM_SEARCH, state.search);
    if (state.sortKey) {
        params.set(PARAM_SORT, state.sortKey);
        params.set(PARAM_DIR, state.sortDir);
    }
    if (state.viewMode !== defaultViewMode) params.set(PARAM_VIEW, state.viewMode);
    if (state.page > 1) params.set(PARAM_PAGE, String(state.page));
    if (state.pageSize !== 25) params.set(PARAM_PAGE_SIZE, String(state.pageSize));

    // Write non-default filter values
    for (const [key, value] of Object.entries(state.filters)) {
        if (value && value !== (defaultFilters[key] ?? "all")) {
            params.set(`${FILTER_PREFIX}${key}`, value);
        }
    }

    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
}

/**
 * Hook: sync ListPageState ↔ URL search params.
 * - On mount: dispatches URL params into state
 * - On state change: writes state to URL
 */
export function useUrlFilters(
    state: ListPageState,
    dispatch: React.Dispatch<ListPageAction>,
    defaultFilters: Record<string, string>,
    defaultViewMode: ViewMode = "card-grid",
) {
    const initialized = useRef(false);

    // On mount: read URL → dispatch into state
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        const urlState = readUrlState();

        if (urlState.search) {
            dispatch({ type: "SET_SEARCH", payload: urlState.search });
        }
        if (urlState.filters) {
            dispatch({ type: "SET_FILTERS", payload: urlState.filters });
        }
        if (urlState.sortKey) {
            dispatch({ type: "SET_SORT", payload: { key: urlState.sortKey } });
            // If URL specifies desc but SET_SORT defaults to asc, toggle again
            if (urlState.sortDir === "desc") {
                dispatch({ type: "SET_SORT", payload: { key: urlState.sortKey } });
            }
        }
        if (urlState.viewMode) {
            dispatch({ type: "SET_VIEW_MODE", payload: urlState.viewMode });
        }
        if (urlState.page) {
            dispatch({ type: "SET_PAGE", payload: urlState.page });
        }
        if (urlState.pageSize) {
            dispatch({ type: "SET_PAGE_SIZE", payload: urlState.pageSize });
        }
    }, [dispatch]);

    // On state change: write state → URL
    useEffect(() => {
        if (!initialized.current) return;
        writeUrlState(state, defaultFilters, defaultViewMode);
    }, [state, defaultFilters]);
}
