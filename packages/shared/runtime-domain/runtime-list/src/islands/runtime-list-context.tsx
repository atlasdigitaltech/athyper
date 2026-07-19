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
import {
  RUNTIME_LIST_PREFETCH_DIAGNOSTIC_EVENT,
  consumeRuntimeListPrefetchMeasurement,
} from "./runtime-list-intent-prefetch";
import {
  useRuntimeListBrowserCache,
} from "../browser-cache/runtime-list-browser-cache-provider";
import type {
  RuntimeListBrowserCacheRead,
  RuntimeListBrowserCacheIdentity,
  RuntimeListBrowserCacheState,
  RuntimeListCachedPage,
} from "../browser-cache/runtime-list-browser-cache";

type ServerSearchReason = "manual" | "enter" | "zeroLoadedMatches";
type ServerSearchState = "idle" | "pending" | "complete" | "error";
type LazyLoadState = "idle" | "loading" | "error";
type LazyLoadDirection = "next" | "previous";

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

type LoadedPage = RuntimeListCachedPage;

interface LazyListContextState {
  enabled:              boolean;
  controls:             RuntimeListLazyPresenterState["controls"];
  cachePolicy:          RuntimeListLazyPresenterState["cachePolicy"];
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
  errorDirection?:      LazyLoadDirection;
  errorMessage?:        string;
  ariaMessage:          string;
  maxLoadedRowsReached: boolean;
  cacheState:           RuntimeListBrowserCacheState;
  isRevalidating:       boolean;
  refreshErrorMessage?: string;
  loadPage:             (page: number) => void;
  refreshCurrentPage:   () => void;
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
export const RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT = "athyper:runtime-list-cache";

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
  const browserCache = useRuntimeListBrowserCache();
  const cacheIdentity = useMemo<RuntimeListBrowserCacheIdentity>(() => ({
    entityCode: adapter.entityCode,
    queryKey: lazyList.cacheKey,
    descriptorHash: lazyList.descriptorHash,
    scopeFingerprint: lazyList.scopeFingerprint,
    policy: lazyList.cachePolicy,
  }), [
    adapter.entityCode,
    lazyList.cacheKey,
    lazyList.cachePolicy,
    lazyList.descriptorHash,
    lazyList.scopeFingerprint,
  ]);
  browserCache.activateDescriptor(adapter.entityCode, lazyList.descriptorHash);
  const [initialCacheRead] = useState<RuntimeListBrowserCacheRead>(() => browserCache.read(cacheIdentity));
  const hasWarmSnapshot = hasUsableCacheSnapshot(initialCacheRead);
  const [query, setQueryState] = useState(search.initialQuery);
  const [pageMap, setPageMap] = useState(() => buildInitialPageMap(lazyList, initialCacheRead));
  const [listPagination, setListPagination] = useState<RuntimeListPagination | undefined>(
    () => cachePagination(initialCacheRead, lazyList.page) ?? lazyList.initialPagination,
  );
  const [localMatchCount, setLocalMatchCount] = useState(() =>
    hasWarmSnapshot ? flattenPages(new Map(initialCacheRead.snapshot?.pages ?? [])).length : search.loadedCount,
  );
  const [cacheState, setCacheState] = useState<RuntimeListBrowserCacheState>(initialCacheRead.state);
  const [isRevalidating, setIsRevalidating] = useState(hasWarmSnapshot);
  const [refreshErrorMessage, setRefreshErrorMessage] = useState<string>();
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
    direction?: LazyLoadDirection;
    message?: string;
    ariaMessage: string;
  }>({ state: "idle", ariaMessage: "" });

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageAbortRefs = useRef<Map<string, AbortController>>(new Map());
  const pageRequestKeysRef = useRef<Set<string>>(new Set());
  const pageCacheWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollYRef = useRef<number | undefined>(undefined);
  const initialWarmReconciliationRef = useRef(false);

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
    if (pageCacheWriteRef.current) {
      clearTimeout(pageCacheWriteRef.current);
      pageCacheWriteRef.current = null;
    }
  }, []);

  useEffect(() => {
    const reconcileServerResult = () => {
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
      setIsRevalidating(false);
      setRefreshErrorMessage(undefined);
    };

    if (hasWarmSnapshot && !initialWarmReconciliationRef.current) {
      initialWarmReconciliationRef.current = true;
      const frame = window.requestAnimationFrame(reconcileServerResult);
      return () => window.cancelAnimationFrame(frame);
    }

    reconcileServerResult();
    return undefined;
  }, [
    lazyList.cacheKey,
    lazyList.initialPagination,
    lazyList.initialRows,
    lazyList.page,
    lazyList.pageSize,
    search.initialQuery,
    search.initialScope,
    hasWarmSnapshot,
  ]);

  useEffect(() => {
    const cacheRead = initialCacheRead;
    setCacheState(cacheRead.state);
    reportBrowserCacheDiagnostic({
      cacheKey: lazyList.cacheKey,
      entityCode: adapter.entityCode,
      state: cacheRead.state,
      pageCount: cacheRead.snapshot?.pages.length ?? 0,
    });
    const prefetchMeasurement = consumeRuntimeListPrefetchMeasurement(adapter.entityCode);
    if (prefetchMeasurement) {
      const routeReadyLeadTimeMs = Math.max(0, Date.now() - prefetchMeasurement.startedAt);
      window.dispatchEvent(new CustomEvent(RUNTIME_LIST_PREFETCH_DIAGNOSTIC_EVENT, {
        detail: {
          stage: "consumed",
          entityCode: adapter.entityCode,
          href: prefetchMeasurement.href,
          intent: prefetchMeasurement.intent,
          routeReadyLeadTimeMs,
          browserCacheState: cacheRead.state,
          observedAt: Date.now(),
        },
      }));
      try {
        window.performance.mark(`athyper:runtime-list:prefetch:${adapter.entityCode}:consumed`);
        window.performance.measure(
          `athyper:runtime-list:prefetch:${adapter.entityCode}:intent-to-consumed`,
          `athyper:runtime-list:prefetch:${adapter.entityCode}:start`,
          `athyper:runtime-list:prefetch:${adapter.entityCode}:consumed`,
        );
      } catch {
        // Cross-navigation performance marks are diagnostic-only.
      }
    }
    if (!cacheRead.snapshot?.pages.length) return;
    scrollYRef.current = cacheRead.snapshot?.scrollY;
    if (lazyList.cachePolicy.restoreScroll) restoreScrollPosition(cacheRead.snapshot?.scrollY);
  }, [
    browserCache,
    cacheIdentity,
    lazyList.cacheKey,
    lazyList.controls.maxLoadedRows,
    lazyList.cachePolicy.restoreScroll,
    lazyList.initialPagination,
    lazyList.initialRows,
    lazyList.page,
    adapter.entityCode,
    initialCacheRead,
  ]);

  useEffect(() => {
    if (pageCacheWriteRef.current) {
      clearTimeout(pageCacheWriteRef.current);
      pageCacheWriteRef.current = null;
    }
    pageCacheWriteRef.current = setTimeout(() => {
      browserCache.write(cacheIdentity, {
        pages: [...pageMap.entries()],
        ...(scrollYRef.current !== undefined ? { scrollY: scrollYRef.current } : {}),
      }, { savedAt: oldestPageTimestamp(pageMap) });
      pageCacheWriteRef.current = null;
    }, 500);
    return () => {
      if (pageCacheWriteRef.current) {
        clearTimeout(pageCacheWriteRef.current);
        pageCacheWriteRef.current = null;
      }
    };
  }, [browserCache, cacheIdentity, pageMap]);

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

  const loadPage = useCallback((targetPage: number, options?: { replace?: boolean }) => {
    const page = Math.max(1, Math.floor(targetPage));
    const serverQuery = hasActiveServerSearch ? trimmedQuery : "";
    const requestKey = `${serverQuery || "loaded"}:${page}`;
    const replace = options?.replace === true;

    if (!lazyList.enabled || !adapter.recordsApiHref) return;
    if (pageRequestKeysRef.current.has(requestKey)) return;
    if (!replace && (serverQuery ? serverPageMap : pageMap).has(page)) return;
    if (!replace && activeMaxLoadedRowsReached) return;

    pageRequestKeysRef.current.add(requestKey);
    const controller = new AbortController();
    pageAbortRefs.current.set(requestKey, controller);
    let didTimeout = false;
    const requestTimeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, search.controls.serverSearchTimeoutMs);
    if (replace) {
      setRefreshErrorMessage(undefined);
      setIsRevalidating(true);
    }
    setLazyLoad({
      state: "loading",
      page,
      direction: "next",
      ariaMessage: runtimeListText.system.loadingPage(page),
    });

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
        if (replace) setCacheState("fresh");
      })
      .catch((error: unknown) => {
        pageRequestKeysRef.current.delete(requestKey);
        const isAbortError = error instanceof DOMException && error.name === "AbortError";
        const isCurrentTimedOutRequest = didTimeout && pageAbortRefs.current.get(requestKey) === controller;
        if (isAbortError && !isCurrentTimedOutRequest) return;
        const message = isCurrentTimedOutRequest
          ? runtimeListText.system.couldNotLoadMoreRecords
          : error instanceof Error ? error.message : runtimeListText.system.couldNotLoadMoreRecords;
        if (replace) {
          setRefreshErrorMessage(message);
          setLazyLoad({ state: "idle", ariaMessage: message });
        } else {
          setLazyLoad({
            state: "error",
            page,
            direction: "next",
            message,
            ariaMessage: message,
          });
        }
      })
      .finally(() => {
        clearTimeout(requestTimeout);
        if (replace) setIsRevalidating(false);
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
    search.controls.serverSearchTimeoutMs,
    serverPageMap,
    trimmedQuery,
  ]);

  const refreshCurrentPage = useCallback(() => {
    const page = activePagination?.page ?? lazyList.page;
    loadPage(page, { replace: true });
  }, [activePagination?.page, lazyList.page, loadPage]);

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
    const direction: LazyLoadDirection = firstPage < activeWindowStartPage ? "previous" : "next";
    const windowLoadFailureMessage = direction === "previous"
      ? runtimeListText.system.couldNotLoadPreviousRecords
      : runtimeListText.system.couldNotLoadNextRecords;

    if (!lazyList.enabled || !adapter.recordsApiHref || pageNumbers.length === 0) return;
    if (pageRequestKeysRef.current.has(requestKey)) return;

    abortPageRequests(pageAbortRefs.current, pageRequestKeysRef.current);
    pageRequestKeysRef.current.add(requestKey);
    const controller = new AbortController();
    pageAbortRefs.current.set(requestKey, controller);
    let didTimeout = false;
    const requestTimeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, search.controls.serverSearchTimeoutMs);
    setLazyLoad({
      state:       "loading",
      page:        firstPage,
      direction,
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
        const isAbortError = error instanceof DOMException && error.name === "AbortError";
        const isCurrentTimedOutRequest = didTimeout && pageAbortRefs.current.get(requestKey) === controller;
        if (isAbortError && !isCurrentTimedOutRequest) return;
        setLazyLoad({
          state:       "error",
          page:        firstPage,
          direction,
          message:     isCurrentTimedOutRequest
            ? windowLoadFailureMessage
            : error instanceof Error ? error.message : windowLoadFailureMessage,
          ariaMessage: windowLoadFailureMessage,
        });
      })
      .finally(() => {
        clearTimeout(requestTimeout);
        pageRequestKeysRef.current.delete(requestKey);
        if (pageAbortRefs.current.get(requestKey) === controller) {
          pageAbortRefs.current.delete(requestKey);
        }
      });
  }, [
    adapter.recordsApiHref,
    activeWindowStartPage,
    hasActiveServerSearch,
    lazyList.controls.maxLoadedRows,
    lazyList.enabled,
    lazyList.pageSize,
    lazyList.rawSearchParams,
    listPagination,
    search.controls.serverSearchTimeoutMs,
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
    scrollYRef.current = window.scrollY;
    browserCache.updateScroll(cacheIdentity, window.scrollY);
  }, [browserCache, cacheIdentity]);

  const lazyListValue = useMemo<LazyListContextState>(() => ({
    enabled:              lazyList.enabled,
    controls:             lazyList.controls,
    cachePolicy:          lazyList.cachePolicy,
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
    errorDirection:       lazyLoad.state === "error" ? lazyLoad.direction : undefined,
    errorMessage:         lazyLoad.message,
    ariaMessage:          lazyLoad.ariaMessage,
    maxLoadedRowsReached: activeMaxLoadedRowsReached && !activeFullyLoaded,
    cacheState,
    isRevalidating,
    refreshErrorMessage,
    loadPage,
    refreshCurrentPage,
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
    cacheState,
    hasNextPage,
    hasNextWindow,
    hasPreviousWindow,
    lazyList.controls,
    lazyList.cachePolicy,
    lazyList.enabled,
    lazyLoad.ariaMessage,
    lazyLoad.direction,
    lazyLoad.message,
    lazyLoad.page,
    lazyLoad.state,
    listPagination,
    listRows,
    isRevalidating,
    loadedPageNumbers,
    loadNextWindow,
    loadNextPage,
    loadPage,
    loadPreviousWindow,
    loadWindow,
    nextPage,
    previousWindowStartPage,
    refreshCurrentPage,
    refreshErrorMessage,
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

function buildInitialPageMap(
  lazyList: RuntimeListLazyPresenterState,
  cacheRead?: RuntimeListBrowserCacheRead,
): Map<number, LoadedPage> {
  if (hasUsableCacheSnapshot(cacheRead)) {
    return withPrunedPages(
      new Map(cacheRead.snapshot.pages),
      lazyList.controls.maxLoadedRows,
      lazyList.page,
    );
  }
  const pages = new Map<number, LoadedPage>();
  pages.set(lazyList.page, createLoadedPage(lazyList.initialRows, lazyList.initialPagination));
  return withPrunedPages(pages, lazyList.controls.maxLoadedRows);
}

function hasUsableCacheSnapshot(
  cacheRead: RuntimeListBrowserCacheRead | undefined,
): cacheRead is RuntimeListBrowserCacheRead & { snapshot: NonNullable<RuntimeListBrowserCacheRead["snapshot"]> } {
  return (cacheRead?.state === "fresh" || cacheRead?.state === "stale") &&
    Boolean(cacheRead.snapshot?.pages.length);
}

function cachePagination(
  cacheRead: RuntimeListBrowserCacheRead | undefined,
  preferredPage: number,
): RuntimeListPagination | undefined {
  if (!hasUsableCacheSnapshot(cacheRead)) return undefined;
  const pages = new Map(cacheRead.snapshot.pages);
  return pages.get(preferredPage)?.pagination ??
    [...pages.values()].sort((left, right) => right.lastAccessed - left.lastAccessed)[0]?.pagination;
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

function reportBrowserCacheDiagnostic(input: {
  cacheKey: string;
  entityCode: string;
  state: RuntimeListBrowserCacheState;
  pageCount: number;
}): void {
  if (typeof window === "undefined") return;
  const cache = input.state === "fresh"
    ? "hit"
    : input.state === "stale" || input.state === "expired"
      ? "stale"
      : input.state === "bypass"
        ? "bypass"
        : "miss";
  window.dispatchEvent(new CustomEvent(RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT, {
    detail: {
      cache,
      freshness: input.state,
      cacheKeyHash: hashDiagnosticKey(input.cacheKey),
      entityCode: input.entityCode,
      pageCount: input.pageCount,
      observedAt: Date.now(),
    },
  }));
  try {
    window.performance.mark(`athyper:runtime-list:browser-cache:${cache}`);
  } catch {
    // Performance marks are diagnostic-only and may be disabled by policy.
  }
}

function hashDiagnosticKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function restoreScrollPosition(scrollY: number | undefined): void {
  if (typeof window === "undefined" || !Number.isFinite(scrollY) || !scrollY || scrollY <= 0) return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
  });
}

function oldestPageTimestamp(pages: Map<number, LoadedPage>): number {
  let oldest = Date.now();
  for (const page of pages.values()) oldest = Math.min(oldest, page.savedAt);
  return oldest;
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
