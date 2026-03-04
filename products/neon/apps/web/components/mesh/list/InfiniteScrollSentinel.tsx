"use client";

// components/mesh/list/InfiniteScrollSentinel.tsx
//
// Manual load-more controls at the bottom of the data view.
// Single row: page-size buttons | status text | Load More button.

import { Loader2 } from "lucide-react";

import { useListPage } from "./ListPageContext";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const INFINITE_ITEM_CAP = 500;

export function InfiniteScrollSentinel() {
  const { infiniteScroll } = useListPage();

  const scrollMode = infiniteScroll?.scrollMode;
  const loadMore = infiniteScroll?.loadMore ?? null;
  const hasMore = infiniteScroll?.hasMore ?? false;
  const loadingMore = infiniteScroll?.loadingMore ?? false;
  const loadMoreError = infiniteScroll?.loadMoreError ?? false;
  const loadedCount = infiniteScroll?.loadedCount ?? 0;
  const totalCount = infiniteScroll?.totalCount ?? 0;
  const pageSize = infiniteScroll?.pageSize ?? 20;
  const onPageSizeChange = infiniteScroll?.onPageSizeChange;

  if (!infiniteScroll || scrollMode !== "infinite") return null;

  // ── Center status text ──
  let centerContent: React.ReactNode = null;

  if (loadingMore) {
    centerContent = (
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Loading{totalCount > 0 ? ` (${loadedCount} of ${totalCount})` : ""}...
        </span>
      </div>
    );
  } else if (loadMoreError) {
    centerContent = (
      <span className="text-xs text-muted-foreground">
        Failed to load more.
      </span>
    );
  } else if (loadedCount >= INFINITE_ITEM_CAP) {
    centerContent = (
      <span className="text-xs text-muted-foreground">
        Showing first {loadedCount} items
      </span>
    );
  } else if (!hasMore && loadedCount > 0) {
    centerContent = (
      <span className="text-xs text-muted-foreground">
        All {loadedCount} items loaded
      </span>
    );
  }

  // ── Right side: retry or Load More ──
  let rightAction: React.ReactNode = null;

  if (loadMoreError && loadMore) {
    rightAction = (
      <Button variant="outline" size="sm" onClick={loadMore}>
        Retry
      </Button>
    );
  } else if (loadMore && !loadingMore) {
    rightAction = (
      <Button variant="outline" size="sm" onClick={loadMore}>
        Load More
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-between border-t px-4 py-3">
      {/* Page size selector */}
      <div className="flex items-center gap-1">
        {PAGE_SIZE_OPTIONS.map((size) => (
          <Button
            key={size}
            variant="outline"
            size="sm"
            className={cn(
              "h-7 min-w-[3rem] px-2 text-xs",
              size === pageSize &&
                "border-primary bg-primary/5 font-medium text-primary",
            )}
            onClick={() => onPageSizeChange?.(size)}
          >
            {size}
          </Button>
        ))}
      </div>

      {/* Center: status text */}
      {centerContent}

      {/* Right: Load More / Retry */}
      {rightAction ?? <div />}
    </div>
  );
}
