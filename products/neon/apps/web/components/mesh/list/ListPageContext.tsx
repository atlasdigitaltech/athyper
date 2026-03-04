"use client";

// components/mesh/list/ListPageContext.tsx
//
// Shared state management for the CollectionExplorerPage.
// Provides a context + reducer that all zone components consume.

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";

import type { PaginationMeta, UseEntityDataOptions } from "@/lib/use-entity-data";
import type { QuickFilterDef } from "./types";


import { computeCapabilities } from "./explorer-capabilities";

import type {
    Density,
    ExplorerCapabilities,
    GroupRule,
    InfiniteScrollState,
    ItemGroup,
    ListPageAction,
    ListPageConfig,
    ListPageState,
    SortRule,
    ViewMode,
    ViewPreset,
} from "./types";

import {
    getLocalStorageValue,
    setLocalStorageValue,
} from "@/lib/local-storage.client";

const VALID_VIEW_MODES: ViewMode[] = ["table", "table-columns", "card-grid", "kanban", "timeline", "tree"];

/** Bump when defaults change to invalidate stale localStorage :userSet flags. */
const DEFAULTS_VERSION = "3";

/** Cap the number of displayed groups to prevent UI explosion from high-cardinality fields. */
const MAX_GROUPS = 50;

// ─── Default State ───────────────────────────────────────────

function createInitialState(
    config: ListPageConfig<unknown>,
): ListPageState {
    const filters: Record<string, string> = {};
    for (const qf of config.quickFilters) {
        filters[qf.id] = qf.defaultValue;
    }

    const columnVisibility: Record<string, boolean> = {};
    for (const col of config.columns) {
        columnVisibility[col.id] = !col.hidden;
    }

    const columnOrder = config.columns.map((c) => c.id);

    // Use a stable default for SSR (mobile-first) — client will sync in useEffect
    const viewMode: ViewMode =
        config.defaultViewMode ?? "card-grid";

    // Derive initial filter bar fields from quick filters
    const filterBarFields = config.quickFilters.map((f) => f.id);

    return {
        search: "",
        filters,
        advancedFilters: {},
        advancedOpen: false,
        sortKey: null,
        sortDir: "asc",
        sortRules: [],
        groupBy: [],
        density: (config.defaultDensity ?? "compact") as Density,
        viewMode,
        selectedIds: new Set(),
        expandedIds: new Set(),
        page: 1,
        pageSize: 25,
        columnVisibility,
        columnOrder,
        columnSizing: {},
        filterBarFields,
        previewItemId: null,
        activePresetId: null,
        settingsOpen: false,
        settingsDraft: null,
        adaptFiltersOpen: false,
        presetDirty: false,
        collapsedGroups: new Set(),
        settingsDefaultTab: null,
    };
}

/** Resolve the responsive view mode (always based on viewport, never localStorage).
 *  Mobile/Tablet (<1024px) uses defaultViewMode (card-grid).
 *  Desktop (>=1024px) uses defaultViewModeDesktop (table). */
function resolveClientViewMode(config: ListPageConfig<unknown>): ViewMode | null {
    if (typeof window === "undefined") return null;

    const isDesktop = window.innerWidth >= 1024;
    const mobileDefault: ViewMode = config.defaultViewMode ?? "card-grid";
    const desktopDefault: ViewMode = config.defaultViewModeDesktop ?? "table";
    const resolved = isDesktop ? desktopDefault : mobileDefault;

    // Only return if different from the SSR default (mobile-first)
    const ssrDefault: ViewMode = config.defaultViewMode ?? "card-grid";
    return resolved !== ssrDefault ? resolved : null;
}

const VALID_DENSITIES: Density[] = ["compact", "comfortable", "spacious"];

/** Resolve the responsive density (always based on viewport, never localStorage).
 *  All viewports default to compact. */
function resolveClientDensity(config: ListPageConfig<unknown>): Density | null {
    if (typeof window === "undefined") return null;

    const isDesktop = window.innerWidth >= 1024;
    const mobileDefault: Density = config.defaultDensity ?? "compact";
    const desktopDefault: Density = config.defaultDensityDesktop ?? mobileDefault;
    const resolved = isDesktop ? desktopDefault : mobileDefault;

    // Only return if different from the SSR default (mobile-first)
    const ssrDefault: Density = config.defaultDensity ?? "compact";
    return resolved !== ssrDefault ? resolved : null;
}

// ─── Group Label Formatting ──────────────────────────────────

function formatGroupLabel(raw: unknown): string {
    if (raw === null || raw === undefined) return "(No value)";
    const str = String(raw);
    if (str === "—" || str === "\u2014" || str.trim() === "") return "(No value)";

    // Boolean normalization
    if (str === "true") return "Yes";
    if (str === "false") return "No";

    // Capitalize ALL_CAPS or all_lower enum values
    if (/^[A-Z_]+$/.test(str) || /^[a-z_]+$/.test(str)) {
        return str
            .toLowerCase()
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    return str;
}

// ─── Reducer ─────────────────────────────────────────────────

function reducer(state: ListPageState, action: ListPageAction): ListPageState {
    switch (action.type) {
        case "SET_SEARCH":
            return { ...state, search: action.payload, page: 1 };

        case "SET_FILTER":
            return {
                ...state,
                filters: { ...state.filters, [action.payload.key]: action.payload.value },
                page: 1,
            };

        case "SET_FILTERS":
            return { ...state, filters: { ...state.filters, ...action.payload }, page: 1 };

        case "REMOVE_FILTER": {
            const next = { ...state.filters };
            delete next[action.payload];
            return { ...state, filters: next, page: 1 };
        }

        case "CLEAR_FILTERS": {
            return { ...state, filters: {}, search: "", advancedFilters: {}, page: 1 };
        }

        case "SET_ADVANCED_FILTER":
            return {
                ...state,
                advancedFilters: {
                    ...state.advancedFilters,
                    [action.payload.key]: action.payload.value,
                },
            };

        case "APPLY_ADVANCED_FILTERS":
            return {
                ...state,
                filters: { ...state.filters, ...state.advancedFilters },
                advancedOpen: false,
                page: 1,
            };

        case "CLEAR_ADVANCED_FILTERS":
            return { ...state, advancedFilters: {}, page: 1 };

        case "TOGGLE_ADVANCED":
            return { ...state, advancedOpen: !state.advancedOpen };

        case "SET_SORT": {
            const sameKey = state.sortKey === action.payload.key;
            const newDir = sameKey && state.sortDir === "asc" ? "desc" : "asc";
            return {
                ...state,
                sortKey: action.payload.key,
                sortDir: newDir,
                // Sync legacy sort into sortRules[0]
                sortRules: [{ fieldId: action.payload.key, dir: newDir }],
            };
        }

        case "SET_SORT_RULES":
            return {
                ...state,
                sortRules: action.payload,
                // Sync first rule back to legacy fields
                sortKey: action.payload[0]?.fieldId ?? null,
                sortDir: action.payload[0]?.dir ?? "asc",
            };

        case "SET_GROUP_BY":
            return { ...state, groupBy: action.payload, page: 1 };

        case "TOGGLE_GROUP_COLLAPSE": {
            const next = new Set(state.collapsedGroups);
            if (next.has(action.payload)) {
                next.delete(action.payload);
            } else {
                next.add(action.payload);
            }
            return { ...state, collapsedGroups: next };
        }

        case "SET_DENSITY":
            return { ...state, density: action.payload };

        case "SET_FILTER_BAR":
            return { ...state, filterBarFields: action.payload };

        case "SET_VIEW_MODE":
            return { ...state, viewMode: action.payload, expandedIds: new Set(), page: 1 };

        case "TOGGLE_SELECT": {
            const next = new Set(state.selectedIds);
            if (next.has(action.payload)) {
                next.delete(action.payload);
            } else {
                next.add(action.payload);
            }
            return { ...state, selectedIds: next };
        }

        case "SELECT_ALL":
            return { ...state, selectedIds: new Set(action.payload) };

        case "DESELECT_ALL":
            return { ...state, selectedIds: new Set() };

        case "TOGGLE_EXPAND": {
            const next = new Set(state.expandedIds);
            if (next.has(action.payload)) {
                next.delete(action.payload);
            } else {
                next.add(action.payload);
            }
            return { ...state, expandedIds: next };
        }

        case "EXPAND_ALL":
            return { ...state, expandedIds: new Set(action.payload) };

        case "COLLAPSE_ALL":
            return { ...state, expandedIds: new Set() };

        case "SET_PAGE":
            return { ...state, page: action.payload };

        case "SET_PAGE_SIZE":
            return { ...state, pageSize: action.payload, page: 1 };

        case "SET_COLUMN_VISIBILITY":
            return { ...state, columnVisibility: action.payload };

        case "SET_COLUMN_ORDER":
            return { ...state, columnOrder: action.payload };

        case "SET_COLUMN_SIZING":
            return { ...state, columnSizing: action.payload };

        case "SET_PREVIEW_ITEM":
            return { ...state, previewItemId: action.payload };

        case "APPLY_PRESET": {
            const preset = action.payload;
            return {
                ...state,
                search: preset.search ?? state.search,
                sortKey: preset.sortKey !== undefined ? preset.sortKey : state.sortKey,
                sortDir: preset.sortDir ?? state.sortDir,
                sortRules: preset.sortRules ?? (preset.sortKey
                    ? [{ fieldId: preset.sortKey, dir: preset.sortDir ?? "asc" }]
                    : state.sortRules),
                groupBy: preset.groupBy ?? state.groupBy,
                density: preset.density ?? state.density,
                viewMode: preset.viewMode ?? state.viewMode,
                filters: preset.filters ? { ...state.filters, ...preset.filters } : state.filters,
                columnVisibility: preset.columnVisibility ?? state.columnVisibility,
                columnOrder: preset.columnOrder ?? state.columnOrder,
                columnSizing: preset.columnSizing ?? state.columnSizing,
                filterBarFields: preset.filterBarFields ?? state.filterBarFields,
                pageSize: preset.pageSize ?? state.pageSize,
                activePresetId: preset.id,
                presetDirty: false,
                page: 1,
            };
        }

        case "OPEN_SETTINGS":
            return { ...state, settingsOpen: true, settingsDraft: { ...state } };

        case "CLOSE_SETTINGS":
            return { ...state, settingsOpen: false, settingsDraft: null };

        case "APPLY_SETTINGS": {
            const draft = action.payload;
            return {
                ...state,
                ...draft,
                settingsOpen: false,
                settingsDraft: null,
                page: 1,
            };
        }

        case "OPEN_ADAPT_FILTERS":
            return { ...state, adaptFiltersOpen: true };

        case "CLOSE_ADAPT_FILTERS":
            return { ...state, adaptFiltersOpen: false };

        case "SET_PRESET_DIRTY":
            return { ...state, presetDirty: action.payload };

        case "SET_SETTINGS_DEFAULT_TAB":
            return { ...state, settingsDefaultTab: action.payload };

        default:
            return state;
    }
}

// ─── Context ─────────────────────────────────────────────────

interface ListPageContextValue<T> {
    state: ListPageState;
    dispatch: React.Dispatch<ListPageAction>;
    config: ListPageConfig<T>;
    capabilities: ExplorerCapabilities;
    // Data
    allItems: T[];
    filteredItems: T[];
    sortedItems: T[];
    groupedItems: ItemGroup<T>[];
    /** Total group count before MAX_GROUPS truncation (for cardinality warning). */
    totalGroupCount: number;
    paginatedItems: T[];
    totalFilteredCount: number;
    totalPages: number;
    loading: boolean;
    error: string | null;
    refresh: () => void;
    /** True when a server query is pending (debounce or in-flight). */
    isPendingQuery: boolean;
    /** Ref to the scroll container. */
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    // Computed
    previewItem: T | null;
    /** Infinite scroll state (null when in paginated mode). */
    infiniteScroll: InfiniteScrollState | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ListPageCtx = createContext<ListPageContextValue<any> | null>(null);

// ─── Provider ────────────────────────────────────────────────

interface ListPageProviderProps<T> {
    config: ListPageConfig<T>;
    items: T[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
    children: React.ReactNode;
    /** Server pagination meta (when server-side filtering is active) */
    serverPagination?: PaginationMeta;
    /** True when the server applied search/filter WHERE clauses */
    isServerFiltered?: boolean;
    /** True when the server applied ORDER BY from the sort param */
    isServerSorted?: boolean;
    /** Callback: notify parent when search/filter/sort/page state changes for server-side query */
    onServerQueryChange?: (query: UseEntityDataOptions) => void;
    /** Infinite scroll orchestration state from page.tsx */
    infiniteScroll?: InfiniteScrollState;
    /** External scroll container ref (hoisted from parent for useInfiniteScroll hook access) */
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ListPageProvider<T>({
    config,
    items,
    loading,
    error,
    refresh,
    children,
    serverPagination,
    isServerFiltered,
    isServerSorted,
    onServerQueryChange,
    infiniteScroll,
    scrollContainerRef: externalScrollRef,
}: ListPageProviderProps<T>) {
    const [state, dispatch] = useReducer(
        reducer,
        config as ListPageConfig<unknown>,
        createInitialState,
    );

    // Scroll container ref (shared via context).
    // Use external ref if provided (hoisted by page.tsx for infinite scroll).
    const internalScrollRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = externalScrollRef ?? internalScrollRef;

    // Guard: only persist to localStorage after mount-time resolution completes.
    // This prevents responsive defaults from being written to localStorage
    // (only explicit user changes should be persisted).
    const isInitializing = useRef(true);

    // On mount, resolve view mode + density:
    //   1. If user has an explicit saved preference (:userSet flag), use it
    //   2. Otherwise apply the responsive default based on viewport width
    useEffect(() => {
        const cfg = config as ListPageConfig<unknown>;

        // Invalidate stale :userSet flags when defaults version changes
        const storedVersion = getLocalStorageValue(`neon:defaultsVersion:${cfg.basePath}`);
        if (storedVersion !== DEFAULTS_VERSION) {
            setLocalStorageValue(`neon:defaultsVersion:${cfg.basePath}`, DEFAULTS_VERSION);
            setLocalStorageValue(`neon:viewMode:${cfg.basePath}:userSet`, "");
            setLocalStorageValue(`neon:density:${cfg.basePath}:userSet`, "");
        }

        // View mode
        const hasExplicitMode =
            getLocalStorageValue(`neon:viewMode:${cfg.basePath}:userSet`) === "true";
        if (hasExplicitMode) {
            const saved = getLocalStorageValue(`neon:viewMode:${cfg.basePath}`);
            if (saved && VALID_VIEW_MODES.includes(saved as ViewMode)) {
                dispatch({ type: "SET_VIEW_MODE", payload: saved as ViewMode });
            }
        } else {
            const clientMode = resolveClientViewMode(cfg);
            if (clientMode) {
                dispatch({ type: "SET_VIEW_MODE", payload: clientMode });
            }
        }

        // Density
        const hasExplicitDensity =
            getLocalStorageValue(`neon:density:${cfg.basePath}:userSet`) === "true";
        if (hasExplicitDensity) {
            const saved = getLocalStorageValue(`neon:density:${cfg.basePath}`);
            if (saved && VALID_DENSITIES.includes(saved as Density)) {
                dispatch({ type: "SET_DENSITY", payload: saved as Density });
            }
        } else {
            const clientDensity = resolveClientDensity(cfg);
            if (clientDensity) {
                dispatch({ type: "SET_DENSITY", payload: clientDensity });
            }
        }

        // Enable persistence after React processes the mount dispatches
        const timer = setTimeout(() => {
            isInitializing.current = false;
        }, 0);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist explicit user preferences to localStorage (skipped during mount
    // and during viewport-triggered resets)
    const isViewportReset = useRef(false);

    useEffect(() => {
        if (isInitializing.current || isViewportReset.current) return;
        setLocalStorageValue(`neon:viewMode:${config.basePath}`, state.viewMode);
        setLocalStorageValue(`neon:viewMode:${config.basePath}:userSet`, "true");
    }, [state.viewMode, config.basePath]);

    useEffect(() => {
        if (isInitializing.current || isViewportReset.current) return;
        setLocalStorageValue(`neon:density:${config.basePath}`, state.density);
        setLocalStorageValue(`neon:density:${config.basePath}:userSet`, "true");
    }, [state.density, config.basePath]);

    // Re-resolve defaults when viewport size changes (e.g. dev ViewportSwitcher)
    const prevIsDesktopRef = useRef<boolean | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const cfg = config as ListPageConfig<unknown>;
        const container = document.querySelector<HTMLElement>('[data-slot="shell-container"]');
        const target = container ?? document.documentElement;

        function resolveAndApply() {
            // Use container width if available (ViewportSwitcher constrains it),
            // otherwise fall back to window width
            const width = container ? container.clientWidth : window.innerWidth;
            const isDesktop = width >= 1024;

            // Only act when the category actually changes
            if (prevIsDesktopRef.current === isDesktop) return;
            // Skip the very first call (handled by mount effect)
            if (prevIsDesktopRef.current === null) {
                prevIsDesktopRef.current = isDesktop;
                return;
            }
            prevIsDesktopRef.current = isDesktop;

            // Clear userSet flags so responsive defaults apply
            setLocalStorageValue(`neon:viewMode:${cfg.basePath}:userSet`, "");
            setLocalStorageValue(`neon:density:${cfg.basePath}:userSet`, "");

            // Resolve new defaults
            const mobileMode: ViewMode = cfg.defaultViewMode ?? "card-grid";
            const desktopMode: ViewMode = cfg.defaultViewModeDesktop ?? "table";
            const mobileDensity: Density = cfg.defaultDensity ?? "compact";
            const desktopDensity: Density = cfg.defaultDensityDesktop ?? mobileDensity;

            // Suppress persistence during viewport-triggered changes
            isViewportReset.current = true;
            dispatch({ type: "SET_VIEW_MODE", payload: isDesktop ? desktopMode : mobileMode });
            dispatch({ type: "SET_DENSITY", payload: isDesktop ? desktopDensity : mobileDensity });
            // Re-enable persistence after React processes the dispatches
            setTimeout(() => { isViewportReset.current = false; }, 0);
        }

        const observer = new ResizeObserver(resolveAndApply);
        observer.observe(target);
        // Also listen to window resize for non-container scenarios
        window.addEventListener("resize", resolveAndApply);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", resolveAndApply);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, dispatch]);

    // ── Pending query detection ──
    // Tracks whether a state change has occurred that will trigger a new server
    // query, but the fresh results haven't arrived yet. Used to show a visual
    // indicator (e.g. overlay) on the data area.
    const pendingQueryRef = useRef(false);
    const lastReceivedItemsRef = useRef(items);
    const [isPendingQuery, setIsPendingQuery] = useState(false);
    const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // When server-query-relevant state changes, mark as pending
    // Skip during initialization (mount-time localStorage hydration)
    useEffect(() => {
        if (isInitializing.current) return;
        if (onServerQueryChange) {
            pendingQueryRef.current = true;
            setIsPendingQuery(true);
            // Safety timeout: clear pending state if items never change (e.g.,
            // server returns identical data or query was de-duped)
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
            pendingTimeoutRef.current = setTimeout(() => {
                pendingQueryRef.current = false;
                setIsPendingQuery(false);
            }, 5000);
        }
    }, [state.search, state.filters, state.sortKey, state.sortDir, state.page, state.pageSize, state.groupBy, state.columnVisibility, onServerQueryChange]);

    // When new items arrive OR loading finishes, clear pending state
    useEffect(() => {
        if (items !== lastReceivedItemsRef.current) {
            lastReceivedItemsRef.current = items;
            pendingQueryRef.current = false;
            setIsPendingQuery(false);
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        }
    }, [items]);

    // Also clear when loading transitions to false (fetch completed, even if
    // items reference is unchanged — e.g., empty result set both times)
    const prevLoadingRef = useRef(loading);
    useEffect(() => {
        const wasLoading = prevLoadingRef.current;
        prevLoadingRef.current = loading;
        if (wasLoading && !loading && pendingQueryRef.current) {
            pendingQueryRef.current = false;
            setIsPendingQuery(false);
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        }
    }, [loading]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => { if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current); };
    }, []);

    // Filter pipeline — skip when server already applied filters (e.g. infinite
    // scroll accumulation). For paginated mode without server flags, client-side
    // filtering still runs as a safety net during the debounce window.
    const filteredItems = useMemo(() => {
        if (isServerFiltered) return items;

        let result = items;

        // Text search
        if (state.search) {
            const q = state.search.toLowerCase();
            result = result.filter((item) => config.searchFn(item, q));
        }

        // Quick + advanced filters
        const activeFilters = { ...state.filters };
        const realFilters: Record<string, string> = {};
        for (const [k, v] of Object.entries(activeFilters)) {
            const qf = config.quickFilters.find((f) => f.id === k);
            if (v && v !== (qf?.defaultValue ?? "all")) {
                realFilters[k] = v;
            }
        }

        if (Object.keys(realFilters).length > 0) {
            result = result.filter((item) => config.filterFn(item, realFilters));
        }

        return result;
    }, [items, state.search, state.filters, config, isServerFiltered]);

    // Capabilities (stable across renders unless config changes)
    const capabilities = useMemo(
        () => computeCapabilities(config),
        [config],
    );

    // Sort pipeline — skip when server already applied sort (e.g. infinite scroll
    // where re-sorting accumulated items would reorder cards and cause visual jumping).
    const sortedItems = useMemo(() => {
        if (isServerSorted) return filteredItems;

        const rules = state.sortRules;

        // Fallback to legacy sortKey/sortDir if no sortRules
        const effectiveRules: SortRule[] = rules.length > 0
            ? rules
            : state.sortKey
                ? [{ fieldId: state.sortKey, dir: state.sortDir }]
                : [];

        if (effectiveRules.length === 0) return filteredItems;

        // Pre-build a lookup map so we avoid O(columns) find() per comparison
        const sortKeyMap = new Map(config.columns.map((c) => [c.sortKey, c]));

        const sorted = [...filteredItems];

        sorted.sort((a, b) => {
            for (const rule of effectiveRules) {
                const col = sortKeyMap.get(rule.fieldId);
                if (!col) continue;

                const dir = rule.dir === "asc" ? 1 : -1;
                let cmp: number;

                if (col.sortFn) {
                    cmp = col.sortFn(a, b);
                } else {
                    const va = String(col.accessor(a) ?? "");
                    const vb = String(col.accessor(b) ?? "");
                    cmp = va.localeCompare(vb);
                }

                if (cmp !== 0) return cmp * dir;
            }
            return 0;
        });

        return sorted;
    }, [filteredItems, state.sortRules, state.sortKey, state.sortDir, config.columns, isServerSorted]);

    // Group-by pipeline (returns truncated groups + total count in one pass)
    const { groupedItems, totalGroupCount } = useMemo((): {
        groupedItems: ItemGroup<T>[];
        totalGroupCount: number;
    } => {
        if (state.groupBy.length === 0) return { groupedItems: [], totalGroupCount: 0 };

        const rule = state.groupBy[0]; // Primary group (multi-level in future phases)
        const col = config.columns.find((c) => c.id === rule.fieldId);
        if (!col) return { groupedItems: [], totalGroupCount: 0 };

        const groups = new Map<string, { items: T[]; label: string }>();

        for (const item of sortedItems) {
            const raw = col.accessor(item);
            const rawKey = String(raw ?? "__null__");
            const label = formatGroupLabel(raw);
            const existing = groups.get(rawKey);
            if (existing) {
                existing.items.push(item);
            } else {
                groups.set(rawKey, { items: [item], label });
            }
        }

        const totalCount = groups.size;

        // Sort groups by label
        const entries = Array.from(groups.entries());
        entries.sort((a, b) => {
            const cmp = a[1].label.localeCompare(b[1].label);
            return (rule.dir ?? "asc") === "asc" ? cmp : -cmp;
        });

        const all = entries.map(([rawKey, { items, label }]) => ({
            key: `${rule.fieldId}=${rawKey}`,
            label,
            items,
            collapsed: state.collapsedGroups.has(`${rule.fieldId}=${rawKey}`),
        }));

        // Truncate to MAX_GROUPS — totalGroupCount tracks full count for warning
        return { groupedItems: all.slice(0, MAX_GROUPS), totalGroupCount: totalCount };
    }, [sortedItems, state.groupBy, state.collapsedGroups, config.columns]);

    // Paginate
    // When the server already paginated, `sortedItems` IS the current page — don't re-slice.
    // When purely client-side, slice from the full sorted set.
    const totalFilteredCount = serverPagination
        ? serverPagination.total
        : sortedItems.length;
    const totalPages = serverPagination
        ? Math.max(1, serverPagination.totalPages)
        : Math.max(1, Math.ceil(sortedItems.length / state.pageSize));
    const paginatedItems = useMemo(() => {
        if (serverPagination) {
            // Server already paginated — items are the current page's records.
            // Client filtering may have reduced this further (safety net during
            // debounce transitions), so return sortedItems as-is.
            return sortedItems;
        }
        const start = (state.page - 1) * state.pageSize;
        return sortedItems.slice(start, start + state.pageSize);
    }, [sortedItems, state.page, state.pageSize, serverPagination]);

    // ── Debounced server query propagation ──
    // When search/filter/sort/page changes, notify the parent to re-fetch from server.
    // Debounced to avoid hammering the API on rapid keystroke changes.
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const buildServerFilterString = useCallback(
        (filters: Record<string, string>, quickFilters: QuickFilterDef[]): string => {
            const qfIds = new Set(quickFilters.map((qf) => qf.id));
            const parts: string[] = [];
            for (const [key, value] of Object.entries(filters)) {
                if (!value || value === "all") continue;
                // Check if this is a quick filter default value — skip if so
                const qf = quickFilters.find((f) => f.id === key);
                if (qf && value === qf.defaultValue) continue;

                if (qfIds.has(key)) {
                    parts.push(`${key}:${value}`);   // exact match
                } else {
                    parts.push(`${key}:~${value}`);  // ILIKE for column text filters
                }
            }
            return parts.join(",");
        },
        [],
    );

    useEffect(() => {
        if (!onServerQueryChange) return;

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(() => {
            const filtersStr = buildServerFilterString(state.filters, config.quickFilters);

            // When grouping is active, fetch all matching rows for client-side grouping
            const effectivePageSize = state.groupBy.length > 0 ? 1000 : state.pageSize;

            // Derive visible column IDs to limit FK resolution server-side
            const visibleCols = config.columns
                .filter((c) => state.columnVisibility[c.id] !== false)
                .map((c) => c.id)
                .join(",");

            onServerQueryChange({
                page: state.page,
                pageSize: effectivePageSize,
                sort: state.sortKey ?? undefined,
                dir: state.sortDir,
                search: state.search || undefined,
                filters: filtersStr || undefined,
                columns: visibleCols || undefined,
            });
        }, 250);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        state.search, state.filters, state.sortKey, state.sortDir,
        state.page, state.pageSize, state.groupBy, state.columnVisibility,
        onServerQueryChange, buildServerFilterString, config.quickFilters, config.columns,
    ]);

    // Preview item lookup
    const previewItem = useMemo(() => {
        if (!state.previewItemId) return null;
        return filteredItems.find(
            (item) => config.getId(item) === state.previewItemId,
        ) ?? null;
    }, [state.previewItemId, filteredItems, config]);

    const value = useMemo<ListPageContextValue<T>>(
        () => ({
            state,
            dispatch,
            config,
            capabilities,
            allItems: items,
            filteredItems,
            sortedItems,
            groupedItems,
            totalGroupCount,
            paginatedItems,
            totalFilteredCount,
            totalPages,
            loading,
            error,
            refresh,
            isPendingQuery,
            scrollContainerRef,
            previewItem,
            infiniteScroll: infiniteScroll ?? null,
        }),
        // scrollContainerRef is stable (useRef) — not needed in deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state, dispatch, config, capabilities, items, filteredItems, sortedItems, groupedItems, totalGroupCount, paginatedItems, totalFilteredCount, totalPages, loading, error, refresh, isPendingQuery, previewItem, infiniteScroll],
    );

    return <ListPageCtx.Provider value={value}>{children}</ListPageCtx.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────

export function useListPage<T>(): ListPageContextValue<T> {
    const ctx = useContext(ListPageCtx);
    if (!ctx) {
        throw new Error("useListPage must be used within a ListPageProvider");
    }
    return ctx as ListPageContextValue<T>;
}

// ─── Convenience Dispatchers ─────────────────────────────────

export function useListPageActions() {
    const { dispatch } = useListPage();

    return useMemo(
        () => ({
            setSearch: (value: string) => dispatch({ type: "SET_SEARCH", payload: value }),
            setFilter: (key: string, value: string) =>
                dispatch({ type: "SET_FILTER", payload: { key, value } }),
            setFilters: (filters: Record<string, string>) =>
                dispatch({ type: "SET_FILTERS", payload: filters }),
            removeFilter: (key: string) => dispatch({ type: "REMOVE_FILTER", payload: key }),
            clearFilters: () => dispatch({ type: "CLEAR_FILTERS" }),
            toggleAdvanced: () => dispatch({ type: "TOGGLE_ADVANCED" }),
            setSort: (key: string) => dispatch({ type: "SET_SORT", payload: { key } }),
            setViewMode: (mode: ViewMode) =>
                dispatch({ type: "SET_VIEW_MODE", payload: mode }),
            toggleSelect: (id: string) => dispatch({ type: "TOGGLE_SELECT", payload: id }),
            selectAll: (ids: string[]) => dispatch({ type: "SELECT_ALL", payload: ids }),
            deselectAll: () => dispatch({ type: "DESELECT_ALL" }),
            toggleExpand: (id: string) => dispatch({ type: "TOGGLE_EXPAND", payload: id }),
            expandAll: (ids: string[]) => dispatch({ type: "EXPAND_ALL", payload: ids }),
            collapseAll: () => dispatch({ type: "COLLAPSE_ALL" }),
            setPage: (page: number) => dispatch({ type: "SET_PAGE", payload: page }),
            setPageSize: (size: number) => dispatch({ type: "SET_PAGE_SIZE", payload: size }),
            setColumnVisibility: (vis: Record<string, boolean>) =>
                dispatch({ type: "SET_COLUMN_VISIBILITY", payload: vis }),
            setColumnOrder: (order: string[]) =>
                dispatch({ type: "SET_COLUMN_ORDER", payload: order }),
            setColumnSizing: (sizing: Record<string, number>) =>
                dispatch({ type: "SET_COLUMN_SIZING", payload: sizing }),
            setPreviewItem: (id: string | null) =>
                dispatch({ type: "SET_PREVIEW_ITEM", payload: id }),
            applyPreset: (preset: ViewPreset) =>
                dispatch({ type: "APPLY_PRESET", payload: preset }),
            setSortRules: (rules: SortRule[]) =>
                dispatch({ type: "SET_SORT_RULES", payload: rules }),
            setGroupBy: (rules: GroupRule[]) =>
                dispatch({ type: "SET_GROUP_BY", payload: rules }),
            toggleGroupCollapse: (key: string) =>
                dispatch({ type: "TOGGLE_GROUP_COLLAPSE", payload: key }),
            setDensity: (density: Density) =>
                dispatch({ type: "SET_DENSITY", payload: density }),
            setFilterBar: (fields: string[]) =>
                dispatch({ type: "SET_FILTER_BAR", payload: fields }),
            openSettings: (defaultTab?: "view" | "filter" | "columns" | "sort" | "group") => {
                if (defaultTab) {
                    dispatch({ type: "SET_SETTINGS_DEFAULT_TAB", payload: defaultTab });
                }
                dispatch({ type: "OPEN_SETTINGS" });
            },
            closeSettings: () => dispatch({ type: "CLOSE_SETTINGS" }),
            applySettings: (draft: Partial<ListPageState>) =>
                dispatch({ type: "APPLY_SETTINGS", payload: draft }),
            openAdaptFilters: () => dispatch({ type: "OPEN_ADAPT_FILTERS" }),
            closeAdaptFilters: () => dispatch({ type: "CLOSE_ADAPT_FILTERS" }),
            setPresetDirty: (dirty: boolean) =>
                dispatch({ type: "SET_PRESET_DIRTY", payload: dirty }),
        }),
        [dispatch],
    );
}

// ─── Scroll Container ─────────────────────────────────────────

/**
 * Scroll container that connects to the ListPage context's scrollContainerRef.
 * Used by grid components and infinite scroll.
 */
export function ListScrollContainer({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const { scrollContainerRef } = useListPage();
    return (
        <div ref={scrollContainerRef} data-slot="list-scroll-container" className={className}>
            {children}
        </div>
    );
}
