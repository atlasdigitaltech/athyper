"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { RuntimeListClientAdapter } from "../adapter/types";
import type {
  RawSearchParams,
  RuntimeListLazyPresenterState,
  RuntimeListPagination,
  RuntimeListSearchPresenterState,
  RuntimeRecordRow,
} from "../core/types";
import { buildListPageParams } from "../core/lazy-list";
import { runtimeListText } from "../core/resources";
import { buildServerSearchParams } from "../core/search";

type ServerSearchReason = "manual" | "enter" | "zeroLoadedMatches";
type ServerSearchState = "idle" | "pending" | "complete" | "error";
type LazyLoadState = "idle" | "loading" | "error";

interface ServerSearchSnapshot {
  state:      ServerSearchState;
  query:      string;
  reason?:    ServerSearchReason;
  message?:   string;
}

interface RunSearchAllInput {
  rawSearchParams: RawSearchParams;
  pageSize:        number;
  reason:          ServerSearchReason;
  debounceMs?:     number;
}

interface LoadedPage {
  rows:        RuntimeRecordRow[];
  pagination?: RuntimeListPagination;
  savedAt:     number;
  lastAccessed:number;
}

interface LazyListContextState {
  enabled:              boolean;
  controls:             RuntimeListLazyPresenterState["controls"];
  loadedRows:           RuntimeRecordRow[];
  loadedRowCount:       number;
  loadedPageNumbers:    number[];
  pagination?:          RuntimeListPagination;
  isFullyLoaded:        boolean;
  activeRows:           RuntimeRecordRow[];
  activePagination?:    RuntimeListPagination;
  activeIsFullyLoaded:  boolean;
  hasNextPage:          boolean;
  nextPage?:            number;
  hasNextWindow:        boolean;
  hasPreviousWindow:    boolean;
  nextWindowStartPage?: number;
  previousWindowStartPage?: number;
  loadingPage?:         number;
  state:                LazyLoadState;
  errorMessage?:        string;
  ariaMessage:          string;
  maxLoadedRowsReached: boolean;
  loadPage:             (page: number) => void;
  loadNextPage:         () => void;
  loadWindow:           (startPage: number) => void;
  loadNextWindow:       () => void;
  loadPreviousWindow:   () => void;
  saveScrollPosition:   () => void;
}

interface RuntimeListClientContextValue {
  adapter:          RuntimeListClientAdapter;
  search:           RuntimeListSearchPresenterState;
  lazyList:         LazyListContextState;
  query:            string;
  setQuery:         (query: string) => void;
  clearQuery:       () => void;
  localMatchCount:  number;
  setLocalMatchCount: (count: number) => void;
  serverSearch:     ServerSearchSnapshot;
  serverRows:       RuntimeRecordRow[] | null;
  serverPagination: RuntimeListPagination | undefined;
  runSearchAll:     (input: RunSearchAllInput) => void;
  resetServerSearch:() => void;
}

const RuntimeListClientCtx = createContext<RuntimeListClientContextValue | null>(null);

export function RuntimeListClientProvider({
  adapter,
  search,
  lazyList,
  children,
}: {
  adapter:  RuntimeListClientAdapter;
  search:   RuntimeListSearchPresenterState;
  lazyList: RuntimeListLazyPresenterState;
  children: React.ReactNode;
}) {
  const [query, setQueryState] = useState(search.initialQuery);
  const [pageMap, setPageMap] = useState(() => buildInitialPageMap(lazyList));
  const [listPagination, setListPagination] = useState<RuntimeListPagination | undefined>(lazyList.initialPagination);
  const [localMatchCount, setLocalMatchCount] = useState(search.loadedCount);
  const [serverSearch, setServerSearch] = useState<ServerSearchSnapshot>(() => ({
    state: hasInitialServerSearch(search) ? "complete" : "idle",
    query: hasInitialServerSearch(search) ? search.initialQuery.trim() : "",
  }));
  const [serverPageMap, setServerPageMap] = useState<Map<number, LoadedPage>>(() => buildInitialServerPageMap(search, lazyList));
  const [serverPagination, setServerPagination] = useState<RuntimeListPagination | undefined>(
    hasInitialServerSearch(search) ? lazyList.initialPagination : undefined,
  );
  const [lazyLoad, setLazyLoad] = useState<{
    state: LazyLoadState;
    page?: number;
    message?: string;
    ariaMessage: string;
  }>({ state: "idle", ariaMessage: "" });

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageAbortRefs = useRef<Map<string, AbortController>>(new Map());
  const pageRequestKeysRef = useRef<Set<string>>(new Set());
  const pageStorageWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupRequest = useCallback(() => {
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cleanupRequest, [cleanupRequest]);
  useEffect(() => () => {
    abortPageRequests(pageAbortRefs.current, pageRequestKeysRef.current);
    if (pageStorageWriteRef.current) {
      clearTimeout(pageStorageWriteRef.current);
      pageStorageWriteRef.current = null;
    }
  }, []);

  useEffect(() => {
    abortPageRequests(pageAbortRefs.current, pageRequestKeysRef.current);
    setQueryState(search.initialQuery);
    setPageMap(buildInitialPageMap(lazyList));
    setListPagination(lazyList.initialPagination);
    setLocalMatchCount(lazyList.initialRows.length);
    setServerPageMap(buildInitialServerPageMap(search, lazyList));
    setServerPagination(hasInitialServerSearch(search) ? lazyList.initialPagination : undefined);
    setServerSearch({
      state: hasInitialServerSearch(search) ? "complete" : "idle",
      query: hasInitialServerSearch(search) ? search.initialQuery.trim() : "",
    });
    setLazyLoad({ state: "idle", ariaMessage: "" });
  }, [
    lazyList.cacheKey,
    lazyList.initialPagination,
    lazyList.initialRows,
    lazyList.page,
    lazyList.pageSize,
    search.initialQuery,
    search.initialScope,
  ]);

  useEffect(() => {
    if (!lazyList.enabled) return;
    const storedPages = readStoredPageMap(
      lazyList.cacheKey,
      lazyList.controls.loadedPageCacheTtlSeconds,
      lazyList.controls.maxLoadedRows,
    );
    if (storedPages.size === 0) return;

    storedPages.set(lazyList.page, createLoadedPage(lazyList.initialRows, lazyList.initialPagination));
    setPageMap(withPrunedPages(storedPages, lazyList.controls.maxLoadedRows, lazyList.page));
  }, [
    lazyList.cacheKey,
    lazyList.controls.loadedPageCacheTtlSeconds,
    lazyList.controls.maxLoadedRows,
    lazyList.enabled,
    lazyList.initialPagination,
    lazyList.initialRows,
    lazyList.page,
  ]);

  useEffect(() => {
    restoreScrollPosition(lazyList.cacheKey);
  }, [lazyList.cacheKey]);

  useEffect(() => {
    if (pageStorageWriteRef.current) {
      clearTimeout(pageStorageWriteRef.current);
      pageStorageWriteRef.current = null;
    }
    pageStorageWriteRef.current = setTimeout(() => {
      writeStoredPageMap(lazyList.cacheKey, pageMap, lazyList.controls.loadedPageCacheTtlSeconds);
      pageStorageWriteRef.current = null;
    }, 500);
    return () => {
      if (pageStorageWriteRef.current) {
        clearTimeout(pageStorageWriteRef.current);
        pageStorageWriteRef.current = null;
      }
    };
  }, [lazyList.cacheKey, lazyList.controls.loadedPageCacheTtlSeconds, pageMap]);

  const listRows = useMemo(() => flattenPages(pageMap), [pageMap]);
  const loadedPageNumbers = useMemo(() => [...pageMap.keys()].sort((a, b) => a - b), [pageMap]);
  const baseFullyLoaded = inferFullyLoaded(listRows.length, listPagination, pageMap);
  const serverRows = useMemo(() => {
    if (serverPageMap.size === 0) return null;
    return flattenPages(serverPageMap);
  }, [serverPageMap]);
  const serverLoadedPageNumbers = useMemo(() => [...serverPageMap.keys()].sort((a, b) => a - b), [serverPageMap]);

  const trimmedQuery = query.trim();
  const hasActiveServerSearch = serverSearch.state === "complete" &&
    Boolean(serverSearch.query) &&
    serverSearch.query === trimmedQuery &&
    serverRows !== null;
  const activeRows = hasActiveServerSearch ? serverRows : listRows;
  const activePagination = hasActiveServerSearch ? serverPagination : listPagination;
  const activePageMap = hasActiveServerSearch ? serverPageMap : pageMap;
  const activeLoadedPageNumbers = hasActiveServerSearch ? serverLoadedPageNumbers : loadedPageNumbers;
  const activeFullyLoaded = inferFullyLoaded(activeRows.length, activePagination, activePageMap);
  const activeMaxLoadedRowsReached = activeRows.length >= lazyList.controls.maxLoadedRows;
  const nextPage = resolveNextPage(activePageMap);
  const windowPageCount = resolveWindowPageCount(lazyList.controls.maxLoadedRows, lazyList.pageSize);
  const activeWindowStartPage = activeLoadedPageNumbers[0] ?? lazyList.page;
  const previousWindowStartPage = activeWindowStartPage > 1
    ? Math.max(1, activeWindowStartPage - windowPageCount)
    : undefined;
  const hasNextPage = lazyList.enabled &&
    Boolean(adapter.recordsApiHref) &&
    !activeFullyLoaded &&
    !activeMaxLoadedRowsReached &&
    nextPage !== undefined;
  const hasNextWindow = lazyList.enabled &&
    Boolean(adapter.recordsApiHref) &&
    !activeFullyLoaded &&
    activeMaxLoadedRowsReached &&
    nextPage !== undefined;
  const hasPreviousWindow = lazyList.enabled && previousWindowStartPage !== undefined;

  const dynamicSearch = useMemo<RuntimeListSearchPresenterState>(() => ({
    ...search,
    isFullyLoaded: hasActiveServerSearch ? activeFullyLoaded : baseFullyLoaded,
    loadedCount:   hasActiveServerSearch ? activeRows.length : listRows.length,
    total:         activePagination?.total ?? search.total,
  }), [
    activeFullyLoaded,
    activePagination?.total,
    activeRows.length,
    baseFullyLoaded,
    hasActiveServerSearch,
    listRows.length,
    search,
  ]);

  const resetServerSearch = useCallback(() => {
    cleanupRequest();
    setServerPageMap(new Map());
    setServerPagination(undefined);
    setServerSearch({ state: "idle", query: "" });
  }, [cleanupRequest]);

  const setQuery = useCallback((nextQuery: string) => {
    setQueryState(nextQuery);
    const normalizedNext = nextQuery.trim();
    if (serverSearch.query && serverSearch.query !== normalizedNext) {
      cleanupRequest();
    }
    setServerSearch((prev) => {
      if (!prev.query || prev.query === normalizedNext) return prev;
      return { state: "idle", query: "" };
    });
    if (serverRows && normalizedNext !== serverSearch.query) {
      setServerPageMap(new Map());
      setServerPagination(undefined);
    }
  }, [cleanupRequest, serverRows, serverSearch.query]);

  const clearQuery = useCallback(() => {
    setQueryState("");
    resetServerSearch();
  }, [resetServerSearch]);

  const runSearchAll = useCallback((input: RunSearchAllInput) => {
    const currentQuery = query.trim();
    if (!currentQuery) {
      resetServerSearch();
      return;
    }

    if (currentQuery.length < search.controls.minQueryLength) {
      setServerSearch({
        state:   "error",
        query:   currentQuery,
        reason:  input.reason,
        message: runtimeListText.search.minQueryLength(search.controls.minQueryLength),
      });
      return;
    }

    if (!adapter.recordsApiHref) {
      setServerSearch({
        state:   "error",
        query:   currentQuery,
        reason:  input.reason,
        message: runtimeListText.search.searchInAllRecordsUnavailable,
      });
      return;
    }

    cleanupRequest();
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    const start = () => {
      const controller = new AbortController();
      abortRef.current = controller;
      timeoutRef.current = setTimeout(() => controller.abort(), search.controls.serverSearchTimeoutMs);

      setServerSearch({ state: "pending", query: currentQuery, reason: input.reason });
      const params = buildServerSearchParams(input.rawSearchParams, currentQuery, input.pageSize);
      const href = `${adapter.recordsApiHref}?${params.toString()}`;

      void fetch(href, {
        cache:  "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await readJson(response);
          if (!response.ok) {
            const message = readMessage(body) ?? runtimeListText.search.searchReturnedStatus(response.status);
            throw new Error(message);
          }
          return body;
        })
        .then((body) => {
          if (requestIdRef.current !== currentRequestId) return;
          const records = readRecords(body);
          const pagination = readPagination(body);
          setServerPageMap(new Map([[1, createLoadedPage(records, pagination)]]));
          setServerPagination(pagination);
          setServerSearch({ state: "complete", query: currentQuery, reason: input.reason });
          setLazyLoad({
            state: "idle",
            ariaMessage: runtimeListText.search.searchedAllRecordsLoadedRows(records.length),
          });
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== currentRequestId) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setServerPageMap(new Map());
          setServerPagination(undefined);
          setServerSearch({
            state:   "error",
            query:   currentQuery,
            reason:  input.reason,
            message: error instanceof Error ? error.message : runtimeListText.search.searchUnavailableTryAgain,
          });
        })
        .finally(() => {
          if (requestIdRef.current !== currentRequestId) return;
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          abortRef.current = null;
        });
    };

    const delayMs = Math.max(0, input.debounceMs ?? 0);
    if (delayMs > 0) {
      delayRef.current = setTimeout(start, delayMs);
    } else {
      start();
    }
  }, [adapter.recordsApiHref, cleanupRequest, query, resetServerSearch, search.controls]);

  const loadPage = useCallback((targetPage: number) => {
    const page = Math.max(1, Math.floor(targetPage));
    const serverQuery = hasActiveServerSearch ? trimmedQuery : "";
    const requestKey = `${serverQuery || "loaded"}:${page}`;

    if (!lazyList.enabled || !adapter.recordsApiHref) return;
    if (pageRequestKeysRef.current.has(requestKey)) return;
    if ((serverQuery ? serverPageMap : pageMap).has(page)) return;
    if (activeMaxLoadedRowsReached) return;

    pageRequestKeysRef.current.add(requestKey);
    const controller = new AbortController();
    pageAbortRefs.current.set(requestKey, controller);
    setLazyLoad({ state: "loading", page, ariaMessage: runtimeListText.system.loadingPage(page) });

    const params = buildListPageParams(lazyList.rawSearchParams, page, lazyList.pageSize, serverQuery);
    const href = `${adapter.recordsApiHref}?${params.toString()}`;

    void fetch(href, {
      cache:  "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok) {
          const message = readMessage(body) ?? runtimeListText.system.pageReturnedStatus(page, response.status);
          throw new Error(message);
        }
        return body;
      })
      .then((body) => {
        const records = readRecords(body);
        const pagination = readPagination(body);
        const loadedPage = createLoadedPage(records, pagination);
        // Delete the key before the state setters so the page enters the map
        // before any re-triggered loadPage call checks the dedup guard.
        pageRequestKeysRef.current.delete(requestKey);
        if (serverQuery) {
          setServerPageMap((prev) => withPrunedPage(prev, page, loadedPage, lazyList.controls.maxLoadedRows));
          setServerPagination(pagination);
        } else {
          setPageMap((prev) => withPrunedPage(prev, page, loadedPage, lazyList.controls.maxLoadedRows));
          setListPagination(pagination);
        }
        setLazyLoad({
          state: "idle",
          ariaMessage: runtimeListText.system.loadedPage(page),
        });
      })
      .catch((error: unknown) => {
        pageRequestKeysRef.current.delete(requestKey);
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLazyLoad({
          state: "error",
          page,
          message: error instanceof Error ? error.message : runtimeListText.system.couldNotLoadMoreRecords,
          ariaMessage: runtimeListText.system.couldNotLoadMoreRecords,
        });
      })
      .finally(() => {
        if (pageAbortRefs.current.get(requestKey) === controller) {
          pageAbortRefs.current.delete(requestKey);
        }
      });
  }, [
    activeMaxLoadedRowsReached,
    adapter.recordsApiHref,
    hasActiveServerSearch,
    lazyList.controls.maxLoadedRows,
    lazyList.enabled,
    lazyList.pageSize,
    lazyList.rawSearchParams,
    pageMap,
    serverPageMap,
    trimmedQuery,
  ]);

  const loadNextPage = useCallback(() => {
    if (hasNextPage && nextPage !== undefined) loadPage(nextPage);
  }, [hasNextPage, loadPage, nextPage]);

  const loadWindow = useCallback((startPage: number) => {
    const firstPage = Math.max(1, Math.floor(startPage));
    const serverQuery = hasActiveServerSearch ? trimmedQuery : "";
    const pagination = serverQuery ? serverPagination : listPagination;
    const maxPage = pagination?.totalPages;
    const pageCount = resolveWindowPageCount(lazyList.controls.maxLoadedRows, lazyList.pageSize);
    const lastPage = maxPage
      ? Math.min(maxPage, firstPage + pageCount - 1)
      : firstPage + pageCount - 1;
    const pageNumbers = rangePages(firstPage, lastPage);
    const requestKey = `${serverQuery || "loaded"}:window:${firstPage}-${lastPage}`;

    if (!lazyList.enabled || !adapter.recordsApiHref || pageNumbers.length === 0) return;
    if (pageRequestKeysRef.current.has(requestKey)) return;

    abortPageRequests(pageAbortRefs.current, pageRequestKeysRef.current);
    pageRequestKeysRef.current.add(requestKey);
    const controller = new AbortController();
    pageAbortRefs.current.set(requestKey, controller);
    setLazyLoad({
      state:       "loading",
      page:        firstPage,
      ariaMessage: runtimeListText.system.loadingRowsOnward((firstPage - 1) * lazyList.pageSize + 1),
    });

    const fetchPage = async (pageNumber: number): Promise<[number, LoadedPage]> => {
      const params = buildListPageParams(lazyList.rawSearchParams, pageNumber, lazyList.pageSize, serverQuery);
      const href = `${adapter.recordsApiHref}?${params.toString()}`;
      const response = await fetch(href, {
        cache:  "no-store",
        signal: controller.signal,
      });
      const body = await readJson(response);
      if (!response.ok) {
        const message = readMessage(body) ?? runtimeListText.system.pageReturnedStatus(pageNumber, response.status);
        throw new Error(message);
      }
      return [pageNumber, createLoadedPage(readRecords(body), readPagination(body))];
    };

    void Promise.all(pageNumbers.map(fetchPage))
      .then((entries) => {
        const next = new Map<number, LoadedPage>();
        for (const [pageNumber, loadedPage] of entries) {
          next.set(pageNumber, loadedPage);
        }
        const nextPagination = entries.at(-1)?.[1].pagination ?? pagination;
        const loadedRows = flattenPages(next).length;
        if (serverQuery) {
          setServerPageMap(withPrunedPages(next, lazyList.controls.maxLoadedRows));
          setServerPagination(nextPagination);
        } else {
          setPageMap(withPrunedPages(next, lazyList.controls.maxLoadedRows));
          setListPagination(nextPagination);
        }
        setLazyLoad({
          state:       "idle",
          ariaMessage: runtimeListText.system.loadedRowsOnward((firstPage - 1) * lazyList.pageSize + 1, loadedRows),
        });
        scrollRuntimeListToTop();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLazyLoad({
          state:       "error",
          page:        firstPage,
          message:     error instanceof Error ? error.message : runtimeListText.system.couldNotLoadNextRecords,
          ariaMessage: runtimeListText.system.couldNotLoadNextRecords,
        });
      })
      .finally(() => {
        pageRequestKeysRef.current.delete(requestKey);
        if (pageAbortRefs.current.get(requestKey) === controller) {
          pageAbortRefs.current.delete(requestKey);
        }
      });
  }, [
    adapter.recordsApiHref,
    hasActiveServerSearch,
    lazyList.controls.maxLoadedRows,
    lazyList.enabled,
    lazyList.pageSize,
    lazyList.rawSearchParams,
    listPagination,
    serverPagination,
    trimmedQuery,
  ]);

  const loadNextWindow = useCallback(() => {
    if (hasNextWindow && nextPage !== undefined) loadWindow(nextPage);
  }, [hasNextWindow, loadWindow, nextPage]);

  const loadPreviousWindow = useCallback(() => {
    if (hasPreviousWindow && previousWindowStartPage !== undefined) loadWindow(previousWindowStartPage);
  }, [hasPreviousWindow, loadWindow, previousWindowStartPage]);

  const saveScrollPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(scrollStorageKey(lazyList.cacheKey), String(window.scrollY));
    } catch {
      // sessionStorage can be unavailable in hardened browser contexts.
    }
  }, [lazyList.cacheKey]);

  const lazyListValue = useMemo<LazyListContextState>(() => ({
    enabled:              lazyList.enabled,
    controls:             lazyList.controls,
    loadedRows:           listRows,
    loadedRowCount:       listRows.length,
    loadedPageNumbers:    activeLoadedPageNumbers,
    pagination:           listPagination,
    isFullyLoaded:        baseFullyLoaded,
    activeRows,
    activePagination,
    activeIsFullyLoaded:  activeFullyLoaded,
    hasNextPage,
    nextPage,
    hasNextWindow,
    hasPreviousWindow,
    nextWindowStartPage:  hasNextWindow ? nextPage : undefined,
    previousWindowStartPage,
    loadingPage:          lazyLoad.state === "loading" ? lazyLoad.page : undefined,
    state:                lazyLoad.state,
    errorMessage:         lazyLoad.message,
    ariaMessage:          lazyLoad.ariaMessage,
    maxLoadedRowsReached: activeMaxLoadedRowsReached && !activeFullyLoaded,
    loadPage,
    loadNextPage,
    loadWindow,
    loadNextWindow,
    loadPreviousWindow,
    saveScrollPosition,
  }), [
    activeFullyLoaded,
    activeMaxLoadedRowsReached,
    activePagination,
    activeRows,
    activeLoadedPageNumbers,
    baseFullyLoaded,
    hasNextPage,
    hasNextWindow,
    hasPreviousWindow,
    lazyList.controls,
    lazyList.enabled,
    lazyLoad.ariaMessage,
    lazyLoad.message,
    lazyLoad.page,
    lazyLoad.state,
    listPagination,
    listRows,
    loadedPageNumbers,
    loadNextWindow,
    loadNextPage,
    loadPage,
    loadPreviousWindow,
    loadWindow,
    nextPage,
    previousWindowStartPage,
    saveScrollPosition,
  ]);

  const value = useMemo<RuntimeListClientContextValue>(() => ({
    adapter,
    search: dynamicSearch,
    lazyList: lazyListValue,
    query,
    setQuery,
    clearQuery,
    localMatchCount,
    setLocalMatchCount,
    serverSearch,
    serverRows,
    serverPagination,
    runSearchAll,
    resetServerSearch,
  }), [
    adapter,
    dynamicSearch,
    lazyListValue,
    query,
    setQuery,
    clearQuery,
    localMatchCount,
    serverSearch,
    serverRows,
    serverPagination,
    runSearchAll,
    resetServerSearch,
  ]);

  return (
    <RuntimeListClientCtx.Provider value={value}>
      {children}
    </RuntimeListClientCtx.Provider>
  );
}

export function useRuntimeListClient(): RuntimeListClientAdapter {
  return useRuntimeListSearch().adapter;
}

export function useRuntimeListSearch(): RuntimeListClientContextValue {
  const ctx = useContext(RuntimeListClientCtx);
  if (!ctx) throw new Error("useRuntimeListSearch must be inside <RuntimeListClientProvider>");
  return ctx;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function readRecords(value: unknown): RuntimeRecordRow[] {
  if (!isRecord(value)) return [];
  const records = Array.isArray(value["records"]) ? value["records"] : Array.isArray(value["data"]) ? value["data"] : [];
  return records.filter((item): item is RuntimeRecordRow => isRecord(item));
}

function readPagination(value: unknown): RuntimeListPagination | undefined {
  if (!isRecord(value) || !isRecord(value["pagination"])) return undefined;
  const pagination = value["pagination"];
  return {
    total:      readNumber(pagination["total"]),
    page:       readNumber(pagination["page"]),
    pageSize:   readNumber(pagination["pageSize"] ?? pagination["page_size"]),
    totalPages: readNumber(pagination["totalPages"] ?? pagination["total_pages"]),
  };
}

function readMessage(value: unknown): string | undefined {
  return isRecord(value) && typeof value["message"] === "string" ? value["message"] : undefined;
}

function readNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildInitialPageMap(lazyList: RuntimeListLazyPresenterState): Map<number, LoadedPage> {
  const pages = new Map<number, LoadedPage>();
  pages.set(lazyList.page, createLoadedPage(lazyList.initialRows, lazyList.initialPagination));
  return withPrunedPages(pages, lazyList.controls.maxLoadedRows);
}

function buildInitialServerPageMap(
  search:   RuntimeListSearchPresenterState,
  lazyList: RuntimeListLazyPresenterState,
): Map<number, LoadedPage> {
  if (!hasInitialServerSearch(search)) return new Map();
  const pages = new Map<number, LoadedPage>();
  pages.set(lazyList.page, createLoadedPage(lazyList.initialRows, lazyList.initialPagination));
  return withPrunedPages(pages, lazyList.controls.maxLoadedRows, lazyList.page);
}

function hasInitialServerSearch(search: RuntimeListSearchPresenterState): boolean {
  return search.initialScope === "all" && search.initialQuery.trim().length > 0;
}

function createLoadedPage(
  rows:        RuntimeRecordRow[],
  pagination?: RuntimeListPagination,
): LoadedPage {
  const now = Date.now();
  return {
    rows,
    pagination,
    savedAt: now,
    lastAccessed: now,
  };
}

function flattenPages(pages: Map<number, LoadedPage>): RuntimeRecordRow[] {
  const seen = new Set<string>();
  const rows: RuntimeRecordRow[] = [];
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    for (const row of pages.get(page)?.rows ?? []) {
      const key = rowIdentity(row);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function rowIdentity(row: RuntimeRecordRow): string | null {
  const id = row["id"];
  if (typeof id === "string" || typeof id === "number") return String(id);
  return null;
}

function inferFullyLoaded(
  rowCount:   number,
  pagination:RuntimeListPagination | undefined,
  pages:      Map<number, LoadedPage>,
): boolean {
  if (typeof pagination?.total === "number" && rowCount >= pagination.total) return true;
  if (typeof pagination?.totalPages === "number") {
    const loadedPages = [...pages.keys()];
    return loadedPages.length > 0 && Math.max(...loadedPages) >= pagination.totalPages;
  }
  const nextPage = resolveNextPage(pages);
  const lastPage = pages.get(nextPage - 1);
  if (typeof pagination?.pageSize === "number" && lastPage) {
    return lastPage.rows.length < pagination.pageSize;
  }
  return false;
}

function resolveNextPage(pages: Map<number, LoadedPage>): number {
  if (pages.size === 0) return 1;
  const loadedPages = [...pages.keys()].sort((a, b) => a - b);
  const firstPage = loadedPages[0] ?? 1;
  const lastPage = loadedPages.at(-1) ?? firstPage;
  for (let page = firstPage; page <= lastPage; page += 1) {
    if (!pages.has(page)) return page;
  }
  return lastPage + 1;
}

function resolveWindowPageCount(maxRows: number, pageSize: number): number {
  return Math.max(1, Math.floor(maxRows / Math.max(1, pageSize)));
}

function rangePages(firstPage: number, lastPage: number): number[] {
  const pages: number[] = [];
  for (let page = firstPage; page <= lastPage; page += 1) pages.push(page);
  return pages;
}

function withPrunedPage(
  pages:       Map<number, LoadedPage>,
  page:        number,
  loadedPage:  LoadedPage,
  maxRows:     number,
): Map<number, LoadedPage> {
  const next = new Map(pages);
  next.set(page, loadedPage);
  return withPrunedPages(next, maxRows, page);
}

function withPrunedPages(
  pages:          Map<number, LoadedPage>,
  maxRows:        number,
  protectedPage?: number,
): Map<number, LoadedPage> {
  const next = new Map(pages);
  let rowCount = countRows(next);
  while (rowCount > maxRows && next.size > 1) {
    const candidates = [...next.entries()]
      .filter(([page]) => page !== protectedPage)
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    const evictPage = candidates[0]?.[0];
    if (evictPage === undefined) break;
    rowCount -= next.get(evictPage)?.rows.length ?? 0;
    next.delete(evictPage);
  }
  return next;
}

function countRows(pages: Map<number, LoadedPage>): number {
  let count = 0;
  for (const page of pages.values()) count += page.rows.length;
  return count;
}

type StoredPageMapPayload = {
  savedAt: number;
  pages: Array<[number, {
    rows: RuntimeRecordRow[];
    pagination?: RuntimeListPagination;
    savedAt: number;
    lastAccessed: number;
  }]>;
};

function readStoredPageMap(
  cacheKey:    string,
  ttlSeconds:  number,
  maxRows:     number,
): Map<number, LoadedPage> {
  if (typeof window === "undefined" || ttlSeconds <= 0) return new Map();
  try {
    const raw = window.sessionStorage.getItem(pageStorageKey(cacheKey));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as StoredPageMapPayload;
    if (!parsed || Date.now() - parsed.savedAt > ttlSeconds * 1000) return new Map();
    const pages = new Map<number, LoadedPage>();
    for (const [page, value] of parsed.pages ?? []) {
      if (Number.isFinite(page) && Array.isArray(value.rows)) {
        pages.set(Number(page), {
          rows: value.rows,
          pagination: value.pagination,
          savedAt: value.savedAt,
          lastAccessed: value.lastAccessed,
        });
      }
    }
    return withPrunedPages(pages, maxRows);
  } catch {
    return new Map();
  }
}

function writeStoredPageMap(
  cacheKey:    string,
  pages:       Map<number, LoadedPage>,
  ttlSeconds:  number,
): void {
  if (typeof window === "undefined" || ttlSeconds <= 0 || pages.size === 0) return;
  try {
    const payload: StoredPageMapPayload = {
      savedAt: Date.now(),
      pages: [...pages.entries()],
    };
    window.sessionStorage.setItem(pageStorageKey(cacheKey), JSON.stringify(payload));
  } catch {
    // Ignore quota and privacy-mode failures.
  }
}

function pageStorageKey(cacheKey: string): string {
  return `${cacheKey}:pages`;
}

function scrollStorageKey(cacheKey: string): string {
  return `${cacheKey}:scroll`;
}

function restoreScrollPosition(cacheKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(scrollStorageKey(cacheKey));
    if (!raw) return;
    const y = Number(raw);
    if (!Number.isFinite(y) || y <= 0) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: y }));
    });
  } catch {
    // Best effort only.
  }
}

function abortPageRequests(
  controllers: Map<string, AbortController>,
  requestKeys: Set<string>,
): void {
  for (const controller of controllers.values()) {
    controller.abort();
  }
  controllers.clear();
  requestKeys.clear();
}

function scrollRuntimeListToTop(): void {
  if (typeof document === "undefined") return;
  const target = document.querySelector("[data-runtime-list-region]");
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ block: "start" });
  }
}
