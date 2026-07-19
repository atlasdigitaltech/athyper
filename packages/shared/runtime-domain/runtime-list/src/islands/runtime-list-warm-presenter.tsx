"use client";

import type { RuntimeListPresenterProps, RuntimeListSlots } from "../adapter/types";
import { RuntimeListPresenter } from "../server/runtime-list-presenter";
import { useRuntimeListSearch } from "./runtime-list-context";

/**
 * Projects the provider's synchronously hydrated cache snapshot into the list
 * presenter. The server props remain authoritative and replace the snapshot
 * as soon as the provider's background reconciliation effect runs.
 */
export function RuntimeListWarmPresenter({
  presenterProps,
  slots,
}: {
  presenterProps: RuntimeListPresenterProps;
  slots?: RuntimeListSlots;
}) {
  const { lazyList } = useRuntimeListSearch();
  const pagination = lazyList.activePagination ?? presenterProps.pagination;
  const hydratedProps: RuntimeListPresenterProps = {
    ...presenterProps,
    rows: lazyList.activeRows,
    pagination,
    page: pagination?.page ?? presenterProps.page,
    pageSize: pagination?.pageSize ?? presenterProps.pageSize,
  };

  return (
    <>
      {lazyList.cacheState === "stale" && lazyList.isRevalidating ? (
        <div
          aria-live="polite"
          className="flex items-center justify-end gap-1.5 px-1 text-xs text-muted-foreground"
          data-runtime-list-refresh-indicator
          role="status"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
          Refreshing…
        </div>
      ) : null}
      {lazyList.refreshErrorMessage ? (
        <div
          aria-live="polite"
          className="flex items-center justify-end px-1 text-xs text-amber-700 dark:text-amber-300"
          data-runtime-list-refresh-warning
          role="status"
        >
          Refresh failed. Cached rows remain available.
        </div>
      ) : null}
      <RuntimeListPresenter {...hydratedProps} slots={slots} />
    </>
  );
}
