"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { LoaderCircle } from "lucide-react";
import { runtimeListText } from "../core/resources";
import { runtimeTableChrome } from "../core/table-chrome";
import { RuntimePaginationControls } from "../server/runtime-pagination-controls";
import { useRuntimeListSearch } from "./runtime-list-context";
import type { RuntimeListCachePolicy } from "../core/types";

const INTENT_PREFETCH_SETTLE_MS = 750;
const VIEWPORT_PREFETCH_SETTLE_MS = 5_000;
const EAGER_PREFETCH_SETTLE_MS = 1_500;
const AUTO_PREFETCH_IDLE_TIMEOUT_MS = 2_500;

interface RuntimeLazyLoadFooterProps {
  sentinelRef:            RefObject<HTMLDivElement | null>;
  query:                  string;
  isServerSearch:         boolean;
  page:                   number;
  pageSize:               number;
  rowCount:               number;
  loadedRowCount:         number;
  datasetLoadedRowCount:  number;
  total?:                 number;
  rawSearchParams:        Record<string, string | string[] | undefined>;
  attached?:              boolean;
}

export function RuntimeLazyLoadFooter({
  sentinelRef,
  query,
  isServerSearch,
  page,
  pageSize,
  rowCount,
  loadedRowCount,
  datasetLoadedRowCount,
  total,
  rawSearchParams,
  attached = false,
}: RuntimeLazyLoadFooterProps) {
  const { lazyList, search, runSearchAll } = useRuntimeListSearch();
  const trimmedQuery = query.trim();
  const isLoadedSearch = Boolean(trimmedQuery) && !isServerSearch;
  const visibleRowCount = rowCount;
  const visibleLoadedRowCount = isServerSearch ? loadedRowCount : lazyList.activeRows.length;
  const visibleTotal = isServerSearch ? total : lazyList.activePagination?.total ?? total;
  const canSearchAll = isLoadedSearch &&
    visibleTotal !== undefined &&
    datasetLoadedRowCount < visibleTotal;
  const actionsBusy = lazyList.state === "loading";

  useEffect(() => {
    const node = sentinelRef.current;
    const prefetchMode = lazyList.cachePolicy.prefetch;
    if (isLoadedSearch || !node || !lazyList.hasNextPage || lazyList.state !== "idle"
      || prefetchMode === "none") return;

    let nearViewport = false;
    let userIntentObserved = prefetchMode !== "intent";
    let settleTimer: number | null = null;
    let idleHandle: number | null = null;

    const cancelScheduledLoad = () => {
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = null;
      if (idleHandle !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      idleHandle = null;
    };

    const loadWhenIdle = () => {
      if (!nearViewport || !userIntentObserved || document.visibilityState !== "visible"
        || isConstrainedConnection()) return;
      if ("requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(() => {
          idleHandle = null;
          if (nearViewport) lazyList.loadNextPage();
        }, { timeout: AUTO_PREFETCH_IDLE_TIMEOUT_MS });
        return;
      }
      lazyList.loadNextPage();
    };

    const scheduleLoad = () => {
      cancelScheduledLoad();
      if (!nearViewport || !userIntentObserved || isConstrainedConnection()) return;
      settleTimer = window.setTimeout(
        loadWhenIdle,
        runtimeListPagePrefetchDelay(prefetchMode),
      );
    };

    const observeIntent = () => {
      if (userIntentObserved) return;
      userIntentObserved = true;
      scheduleLoad();
    };
    const observeKeyboardIntent = (event: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) observeIntent();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        nearViewport = entries.some((entry) => entry.isIntersecting);
        scheduleLoad();
      },
      { rootMargin: `0px 0px ${lazyList.controls.lazyPrefetchDistancePx}px 0px` },
    );
    if (prefetchMode === "intent") {
      window.addEventListener("wheel", observeIntent, { passive: true, once: true });
      window.addEventListener("touchmove", observeIntent, { passive: true, once: true });
      window.addEventListener("scroll", observeIntent, { passive: true, once: true });
      window.addEventListener("keydown", observeKeyboardIntent);
    }
    observer.observe(node);
    return () => {
      cancelScheduledLoad();
      observer.disconnect();
      window.removeEventListener("wheel", observeIntent);
      window.removeEventListener("touchmove", observeIntent);
      window.removeEventListener("scroll", observeIntent);
      window.removeEventListener("keydown", observeKeyboardIntent);
    };
  }, [
    isLoadedSearch,
    lazyList.cachePolicy.prefetch,
    lazyList.controls.lazyPrefetchDistancePx,
    lazyList.hasNextPage,
    lazyList.loadNextPage,
    lazyList.state,
    sentinelRef,
  ]);

  const firstLoadedPage = lazyList.loadedPageNumbers[0] ?? page;
  const isWindowMode = lazyList.hasNextWindow ||
    lazyList.hasPreviousWindow ||
    lazyList.maxLoadedRowsReached ||
    firstLoadedPage > 1;
  const start = visibleRowCount > 0 ? (firstLoadedPage - 1) * pageSize + 1 : 0;
  const end = visibleRowCount > 0
    ? visibleTotal ? Math.min(start + visibleLoadedRowCount - 1, visibleTotal) : start + visibleLoadedRowCount - 1
    : 0;
  const windowPageCount = Math.max(1, Math.floor(lazyList.controls.maxLoadedRows / Math.max(1, pageSize)));
  const windowRowCapacity = windowPageCount * pageSize;
  // Keep the window denominator stable on the final partial window. Using the
  // last window's 124 visible rows for a 324-row/200-row-window list incorrectly
  // produced `Page 2 of 3` instead of `Page 2 of 2`.
  const displayedPageSize = isWindowMode
    ? windowRowCapacity
    : Math.max(pageSize, visibleLoadedRowCount);
  const displayPage = start > 0 ? Math.floor((start - 1) / displayedPageSize) + 1 : page;
  const displayPageCount = visibleTotal !== undefined
    ? Math.max(1, Math.ceil(visibleTotal / displayedPageSize))
    : undefined;
  const reachedDatasetEnd = visibleTotal !== undefined &&
    end >= visibleTotal &&
    !lazyList.hasNextPage &&
    !lazyList.hasNextWindow;
  // A late next-window failure is stale once the complete terminal range is
  // already visible. Keep previous-window failures visible and retryable.
  const suppressTerminalNextError = lazyList.state === "error" &&
    reachedDatasetEnd &&
    lazyList.errorDirection !== "previous";
  const visibleErrorMessage = suppressTerminalNextError ? undefined : lazyList.errorMessage;
  const summary = resolveFooterSummary({
    isLoadedSearch,
    isServerSearch,
    rowCount: visibleRowCount,
    loadedRowCount: visibleLoadedRowCount,
    datasetLoadedRowCount,
    total: visibleTotal,
    start,
    end,
  });
  const limitMessage = resolveFooterLimitMessage({
    isLoadedSearch,
    maxLoadedRowsReached: lazyList.maxLoadedRowsReached,
    datasetLoadedRowCount,
    total: visibleTotal,
  });
  const isPersistentWindowGuidance = Boolean(limitMessage) &&
    !isLoadedSearch &&
    lazyList.maxLoadedRowsReached;
  const showPageNavigation = !isLoadedSearch;
  const loadingLabel = resolveLoadingLabel({
    isWindowMode,
    loadingPage: lazyList.loadingPage,
    pageSize,
    maxRows: lazyList.controls.maxLoadedRows,
    total: visibleTotal,
  });
  const runFooterSearchAll = () => {
    if (!canSearchAll || !trimmedQuery || actionsBusy) return;
    runSearchAll({
      rawSearchParams,
      pageSize,
      reason:     "manual",
      debounceMs: search.controls.manualSearchAllDebounceMs,
    });
  };
  const footerClassName = [
    runtimeTableChrome.footer,
    attached ? runtimeTableChrome.footerAttached : runtimeTableChrome.footerDetached,
  ].join(" ");

  return (
    <div
      className={footerClassName}
      data-runtime-data-footer
      data-attached={attached ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium leading-5 text-foreground" aria-live="polite">
          {summary}
        </span>
        {lazyList.state === "loading" && (
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            {loadingLabel}
          </span>
        )}
        {lazyList.state === "error" && visibleErrorMessage && (
          <span role="alert" className="text-destructive">{visibleErrorMessage}</span>
        )}
        {limitMessage && (
          <>
            <span aria-hidden="true" className="hidden size-1 rounded-full bg-muted-foreground/40 sm:inline-block" />
            <span className={isPersistentWindowGuidance ? "text-sm leading-5" : undefined}>
              {limitMessage}
            </span>
          </>
        )}
        {lazyList.ariaMessage && !suppressTerminalNextError && (
          <span className="sr-only" aria-live="polite">{lazyList.ariaMessage}</span>
        )}
      </div>

      <div className="grid w-full shrink-0 grid-cols-1 gap-2 md:ml-auto md:flex md:w-auto md:flex-wrap md:items-center md:justify-end">
        {showPageNavigation && (
          <RuntimePaginationControls
            previous={lazyList.hasPreviousWindow
              ? { kind: "button", onClick: lazyList.loadPreviousWindow, disabled: lazyList.state === "loading" }
              : { kind: "disabled" }}
            pageLabel={runtimeListText.summary.page(displayPage, displayPageCount)}
            next={lazyList.hasNextPage
              ? { kind: "button", onClick: lazyList.loadNextPage, disabled: lazyList.state === "loading" }
              : lazyList.hasNextWindow
                ? { kind: "button", onClick: lazyList.loadNextWindow, disabled: lazyList.state === "loading" }
                : { kind: "disabled" }}
          />
        )}

        {canSearchAll && (
          <button
            type="button"
            onClick={runFooterSearchAll}
            disabled={actionsBusy}
            className={`${runtimeTableChrome.footerButtonPrimary} w-full disabled:opacity-60 md:w-auto`}
          >
            {runtimeListText.actions.searchInAllRecords(visibleTotal)}
          </button>
        )}

        {lazyList.hasNextPage && !showPageNavigation && (
          <button
            type="button"
            onClick={lazyList.loadNextPage}
            disabled={lazyList.state === "loading"}
            className={`${runtimeTableChrome.footerButton} w-full bg-background disabled:opacity-60 md:w-auto`}
          >
            {lazyList.state === "error"
              ? runtimeListText.actions.tryAgain
              : runtimeListText.actions.loadMoreRows}
          </button>
        )}
      </div>
    </div>
  );
}

export function runtimeListPagePrefetchDelay(
  mode: RuntimeListCachePolicy["prefetch"],
): number {
  if (mode === "eager") return EAGER_PREFETCH_SETTLE_MS;
  if (mode === "viewport") return VIEWPORT_PREFETCH_SETTLE_MS;
  return INTENT_PREFETCH_SETTLE_MS;
}

function isConstrainedConnection(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return connection?.saveData === true || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g";
}

function resolveFooterSummary({
  isLoadedSearch,
  isServerSearch,
  rowCount,
  loadedRowCount,
  datasetLoadedRowCount,
  total,
  start,
  end,
}: {
  isLoadedSearch:        boolean;
  isServerSearch:        boolean;
  rowCount:              number;
  loadedRowCount:        number;
  datasetLoadedRowCount: number;
  total?:                number;
  start:                 number;
  end:                   number;
}): string {
  if (isLoadedSearch) {
    return runtimeListText.summary.matchesInLoadedRows(rowCount);
  }

  if (isServerSearch) {
    if (total !== undefined) {
      return runtimeListText.summary.showingMatchRange(start, end, total);
    }
    return runtimeListText.summary.showingMatchCount(rowCount);
  }

  if (total !== undefined) {
    return runtimeListText.summary.showingRecordRange(start, end, total);
  }
  return runtimeListText.summary.loadedRecords(loadedRowCount);
}

function resolveFooterLimitMessage({
  isLoadedSearch,
  maxLoadedRowsReached,
  datasetLoadedRowCount,
  total,
}: {
  isLoadedSearch:        boolean;
  maxLoadedRowsReached:  boolean;
  datasetLoadedRowCount: number;
  total?:                number;
}): string {
  if (isLoadedSearch && total !== undefined && datasetLoadedRowCount >= total) {
    return runtimeListText.search.searchedAllRecords;
  }
  if (isLoadedSearch && total !== undefined && datasetLoadedRowCount < total) {
    return runtimeListText.summary.moreMatchesMayExist;
  }
  if (!maxLoadedRowsReached) return "";
  if (isLoadedSearch) {
    return runtimeListText.summary.searchInAllForCompleteResults(total);
  }
  return runtimeListText.summary.loadedRowsUseFilters(datasetLoadedRowCount);
}

function resolveLoadingLabel({
  isWindowMode: _isWindowMode,
  loadingPage: _loadingPage,
  pageSize: _pageSize,
  maxRows: _maxRows,
  total: _total,
}: {
  isWindowMode: boolean;
  loadingPage?: number;
  pageSize:    number;
  maxRows:     number;
  total?:      number;
}): string {
  return runtimeListText.system.loadingMoreRows;
}
