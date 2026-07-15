"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { formatRuntimeListCount, runtimeListText } from "../core/resources";
import { runtimeTableChrome } from "../core/table-chrome";
import { RuntimePaginationControls } from "../server/runtime-pagination-controls";
import { useRuntimeListSearch } from "./runtime-list-context";

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
}: RuntimeLazyLoadFooterProps) {
  const { lazyList, search, runSearchAll } = useRuntimeListSearch();
  const trimmedQuery = query.trim();
  const isLoadedSearch = Boolean(trimmedQuery) && !isServerSearch;

  useEffect(() => {
    const node = sentinelRef.current;
    if (isLoadedSearch || !node || !lazyList.hasNextPage || lazyList.state === "loading") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          lazyList.loadNextPage();
        }
      },
      { rootMargin: `0px 0px ${lazyList.controls.lazyPrefetchDistancePx}px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    isLoadedSearch,
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
  const start = rowCount > 0 ? (firstLoadedPage - 1) * pageSize + 1 : 0;
  const end = rowCount > 0
    ? total ? Math.min(start + loadedRowCount - 1, total) : start + loadedRowCount - 1
    : 0;
  const displayedPageSize = Math.max(pageSize, loadedRowCount);
  const displayPage = start > 0 ? Math.floor((start - 1) / displayedPageSize) + 1 : page;
  const displayPageCount = total !== undefined
    ? Math.max(1, Math.ceil(total / displayedPageSize))
    : undefined;
  const summary = resolveFooterSummary({
    isLoadedSearch,
    isServerSearch,
    rowCount,
    loadedRowCount,
    datasetLoadedRowCount,
    total,
    start,
    end,
  });
  const limitMessage = resolveFooterLimitMessage({
    isLoadedSearch,
    maxLoadedRowsReached: lazyList.maxLoadedRowsReached,
    datasetLoadedRowCount,
    total,
  });
  const showPageNavigation = !isLoadedSearch;
  const loadingLabel = resolveLoadingLabel({
    isWindowMode,
    loadingPage: lazyList.loadingPage,
    pageSize,
    maxRows: lazyList.controls.maxLoadedRows,
    total,
  });
  const runFooterSearchAll = () => {
    if (!isLoadedSearch || !trimmedQuery || !total) return;
    runSearchAll({
      rawSearchParams,
      pageSize,
      reason:     "manual",
      debounceMs: search.controls.manualSearchAllDebounceMs,
    });
  };

  return (
    <div className={runtimeTableChrome.footer}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span aria-live="polite">
          {summary}
        </span>
        {lazyList.state === "loading" && (
          <span>{loadingLabel}</span>
        )}
        {lazyList.state === "error" && lazyList.errorMessage && (
          <span className="text-destructive">{lazyList.errorMessage}</span>
        )}
        {limitMessage && (
          <span>{limitMessage}</span>
        )}
        {lazyList.ariaMessage && (
          <span className="sr-only" aria-live="polite">{lazyList.ariaMessage}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:ml-auto md:justify-end">
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

        {isLoadedSearch && total !== undefined && (
          <button
            type="button"
            onClick={runFooterSearchAll}
            className={runtimeTableChrome.footerButtonPrimary}
          >
            {runtimeListText.actions.searchInAllRecords(total)}
          </button>
        )}

        {lazyList.hasNextPage && !showPageNavigation && (
          <button
            type="button"
            onClick={lazyList.loadNextPage}
            disabled={lazyList.state === "loading"}
            className={`${runtimeTableChrome.footerButton} bg-background disabled:opacity-60`}
          >
            {runtimeListText.actions.loadMoreRows}
          </button>
        )}
      </div>
    </div>
  );
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
  isWindowMode,
  loadingPage,
  pageSize,
  maxRows,
  total,
}: {
  isWindowMode: boolean;
  loadingPage?: number;
  pageSize:    number;
  maxRows:     number;
  total?:      number;
}): string {
  if (isWindowMode && loadingPage) {
    return runtimeListText.system.loadingRows(formatWindowRange(loadingPage, pageSize, maxRows, total));
  }
  return runtimeListText.system.loadingMoreRows;
}

function formatWindowRange(
  startPage: number,
  pageSize:  number,
  maxRows:   number,
  total?:    number,
): string {
  const start = (startPage - 1) * pageSize + 1;
  const end = total ? Math.min(start + maxRows - 1, total) : start + maxRows - 1;
  return `${formatRuntimeListCount(start)}-${formatRuntimeListCount(end)}`;
}
