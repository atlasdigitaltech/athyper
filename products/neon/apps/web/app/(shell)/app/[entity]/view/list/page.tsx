"use client";

/**
 * Entity List Page
 *
 * Meta-driven list page that works for all 99+ entity types.
 * Uses field metadata + capabilities to auto-generate the ListPageConfig,
 * then renders the full mesh/list component system (data grid, card grid,
 * filters, pagination, etc.).
 *
 * Server-delegated query flow:
 *   ListPageProvider dispatches filter/sort/search/page state changes
 *   → onServerQueryChange callback updates serverQuery state here
 *   → useEntityData re-fetches from the API with server-side WHERE/ORDER BY
 *   → ListPageProvider receives isServerFiltered/isServerSorted flags
 *     and skips redundant client-side filtering/sorting
 *
 * Manual load-more (all viewports):
 *   Items accumulate across pages at this level. The provider receives
 *   the full accumulated set and treats it as one large page.
 *   Page advancement is triggered by the user clicking "Load More".
 */

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  InfiniteScrollState,
  ScrollMode,
} from "@/components/mesh/list/types";
import type { UseEntityDataOptions } from "@/lib/use-entity-data";

import {
  ListPageProvider,
  ListScrollContainer,
  ListContentHeader,
  ViewRouter,
  ListPageFooter,
  SelectionToolbar,
  BackToTopButton,
} from "@/components/mesh/list";
import { EntityCard } from "@/components/mesh/list/EntityCard";
import { useEntityCapabilities } from "@/lib/entity-capabilities";
import { useEntityListActions } from "@/lib/entity-list-actions";
import { buildEntityListConfig } from "@/lib/entity-list-config";
import {
  slugToEntityName,
  entityNameToDisplayName,
} from "@/lib/entity-meta-utils";
import { useEntityData } from "@/lib/use-entity-data";
import { useEntityFields } from "@/lib/use-entity-fields";

// ============================================================================
// Constants
// ============================================================================

const INFINITE_ITEM_CAP = 500;

/** Derive a stable unique key for an entity record (mirrors buildEntityListConfig getId). */
function getItemKey(item: Record<string, unknown>): string {
  if (item.id != null && item.id !== "") return String(item.id);
  const fallback = Object.values(item)
    .filter((v) => v != null)
    .slice(0, 3)
    .join(":");
  return fallback || "";
}

// ============================================================================
// Page Component
// ============================================================================

export default function ListViewPage() {
  const params = useParams<{ entity: string }>();
  const entitySlug = params.entity;
  const entityName = slugToEntityName(entitySlug);

  // Fetch metadata
  const {
    fields,
    entityMeta,
    loading: fieldsLoading,
  } = useEntityFields(entitySlug);
  const { capabilities, loading: capsLoading } =
    useEntityCapabilities(entityName);
  const {
    primaryAction,
    rowActions,
    bulkActions,
    loading: actionsLoading,
  } = useEntityListActions(entityName);

  // ── Server-delegated query state ──
  const [serverQuery, setServerQuery] = useState<UseEntityDataOptions>({
    page: 1,
    pageSize: 20,
  });

  // ── Scroll mode: always infinite (lazy-load on all viewports) ──
  const scrollMode: ScrollMode = "infinite";

  // ── Infinite scroll accumulation ──
  const infinitePage = useRef(1);
  const [accumulatedItems, setAccumulatedItems] = useState<
    Record<string, unknown>[]
  >([]);
  const [loadingMore, setLoadingMore] = useState(false);
  // Ref mirror of loadingMore — synchronously guards against multiple calls
  // before React processes the state update (scroll events can fire rapidly)
  const loadingMoreRef = useRef(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const lastResetKeyRef = useRef("");
  // Track accumulated items in a ref for sessionStorage save on unmount
  const accumulatedItemsRef = useRef(accumulatedItems);
  accumulatedItemsRef.current = accumulatedItems;

  // ── handleServerQueryChange — intercepts provider's query changes ──
  const handleServerQueryChange = useCallback(
    (query: UseEntityDataOptions) => {
      if (scrollMode === "infinite") {
        // Build identity key for filter/search/sort — detect real changes
        const resetKey = JSON.stringify({
          search: query.search,
          filters: query.filters,
          sort: query.sort,
          dir: query.dir,
          columns: query.columns,
        });

        const prevResetKey = lastResetKeyRef.current;
        lastResetKeyRef.current = resetKey;

        if (prevResetKey === "") {
          // First call after mount/scrollMode change — provider is syncing
          // initial state (e.g. adding columns for FK resolution).
          // Update serverQuery but DON'T clear accumulated data to avoid
          // a flash of empty state between the initial fetch and re-fetch.
          infinitePage.current = 1;
          loadingMoreRef.current = false;
          setLoadingMore(false);
          setServerQuery((prev) => ({
            ...query,
            page: 1,
            pageSize: prev.pageSize,
          }));
          return;
        }

        if (resetKey !== prevResetKey) {
          // Filter/search/sort actually changed: full reset
          infinitePage.current = 1;
          loadingMoreRef.current = false;
          setAccumulatedItems([]);
          setLoadingMore(false);
          setLoadMoreError(false);
          setServerQuery((prev) => ({
            ...query,
            page: 1,
            pageSize: prev.pageSize,
          }));

          // Scroll to top on filter/search reset
          const container = document.querySelector(
            '[data-slot="list-scroll-container"]',
          );
          container?.scrollTo({ top: 0 });
        }
        // In infinite mode, page changes from the provider are ignored.
        // Page advancement is handled by loadMore below.
      } else {
        setServerQuery(query);
      }
    },
    [scrollMode],
  );

  // Fetch data with server-side params
  const {
    data,
    meta: paginationMeta,
    loading: dataLoading,
    error,
    refresh,
  } = useEntityData(entitySlug, serverQuery);

  // ── Accumulate items across pages ──
  const prevDataRef = useRef<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (scrollMode !== "infinite") {
      // Paginated mode: just track the ref for when we switch to infinite
      prevDataRef.current = data;
      return;
    }

    const isNewData = data !== prevDataRef.current;
    prevDataRef.current = data;

    if (infinitePage.current === 1) {
      // For page 1: always sync (handles new data, scroll mode switch,
      // and re-fetch after filter reset). Safe even if data is the same
      // reference because React skips re-render when state is identical.
      setAccumulatedItems(data);
    } else if (isNewData && data.length > 0) {
      // For page > 1: append new data, dedup by stable key
      setAccumulatedItems((prev) => {
        const existingKeys = new Set(prev.map(getItemKey));
        const newItems = data.filter(
          (item) => !existingKeys.has(getItemKey(item)),
        );
        return newItems.length > 0 ? [...prev, ...newItems] : prev;
      });
    }

    if (isNewData) {
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoadMoreError(false);
    }
  }, [data, scrollMode]);

  // ── Error handling for load-more ──
  useEffect(() => {
    if (error && loadingMore) {
      setLoadMoreError(true);
      loadingMoreRef.current = false;
      setLoadingMore(false);
      // Revert page so retry fetches the same page
      infinitePage.current = Math.max(1, infinitePage.current - 1);
    }
  }, [error, loadingMore]);

  // ── Derived hasMore — robust across both API response formats ──
  const hasMoreItems =
    paginationMeta.hasNext ||
    (paginationMeta.total > 0 &&
      accumulatedItems.length < paginationMeta.total);

  // ── onLoadMore — advances to the next page ──
  const onLoadMore = useCallback(() => {
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    infinitePage.current += 1;
    setServerQuery((prev) => ({ ...prev, page: infinitePage.current }));
  }, []);

  // ── Manual loadMore (for Load More button in sentinel) ──
  const manualLoadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    onLoadMore();
  }, [onLoadMore]);

  // ── Page size change — re-fetches page 1 with new size ──
  // Keep old items visible during fetch to prevent column width reset.
  // The accumulation effect replaces them when new data arrives
  // (infinitePage.current === 1 → setAccumulatedItems(data)).
  const onPageSizeChange = useCallback((size: number) => {
    infinitePage.current = 1;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setLoadMoreError(false);
    setServerQuery((prev) => ({ ...prev, page: 1, pageSize: size }));
    const container = document.querySelector(
      '[data-slot="list-scroll-container"]',
    );
    container?.scrollTo({ top: 0 });
  }, []);

  // ── scrollToTop helper ──
  const scrollToTop = useCallback(() => {
    const container = document.querySelector(
      '[data-slot="list-scroll-container"]',
    );
    container?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Items and meta for the provider ──
  const itemsForProvider = scrollMode === "infinite" ? accumulatedItems : data;

  const metaForProvider = useMemo(() => {
    if (scrollMode !== "infinite") return paginationMeta;
    // Tell provider this is one big "page" containing all accumulated items
    return {
      ...paginationMeta,
      page: 1,
      pageSize: accumulatedItems.length || (serverQuery.pageSize ?? 20),
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }, [
    scrollMode,
    paginationMeta,
    accumulatedItems.length,
    serverQuery.pageSize,
  ]);

  // ── Infinite scroll state for context ──
  const infiniteScrollState = useMemo<InfiniteScrollState | undefined>(() => {
    if (scrollMode !== "infinite") return undefined;
    return {
      scrollMode,
      loadMore:
        hasMoreItems && accumulatedItems.length < INFINITE_ITEM_CAP
          ? manualLoadMore
          : null,
      hasMore: hasMoreItems,
      loadingMore,
      loadMoreError,
      loadedCount: accumulatedItems.length,
      totalCount: paginationMeta.total,
      scrollToTop,
      pageSize: serverQuery.pageSize ?? 20,
      onPageSizeChange,
    };
  }, [
    scrollMode,
    hasMoreItems,
    accumulatedItems.length,
    manualLoadMore,
    loadingMore,
    loadMoreError,
    paginationMeta.total,
    scrollToTop,
    serverQuery.pageSize,
    onPageSizeChange,
  ]);

  // ── Scroll position memory (sessionStorage) ──
  useEffect(() => {
    const key = `neon:scrollPos:${entitySlug}`;

    // Restore on mount
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          scrollTop?: number;
          items?: Record<string, unknown>[];
          page?: number;
        };
        if (parsed.items && parsed.items.length > 0) {
          setAccumulatedItems(parsed.items);
          infinitePage.current = parsed.page ?? 1;
          // Update server query page so hasMore is correct on refresh
          setServerQuery((prev) => ({
            ...prev,
            page: parsed.page ?? 1,
          }));
          // Restore scroll position after render
          requestAnimationFrame(() => {
            const container = document.querySelector(
              '[data-slot="list-scroll-container"]',
            );
            if (container && parsed.scrollTop) {
              container.scrollTop = parsed.scrollTop;
            }
          });
        }
      } catch {
        /* ignore corrupt data */
      }
      sessionStorage.removeItem(key);
    }

    // Save on unmount
    return () => {
      const items = accumulatedItemsRef.current;
      if (items.length > 0) {
        const container = document.querySelector(
          '[data-slot="list-scroll-container"]',
        );
        const payload = JSON.stringify({
          scrollTop: container?.scrollTop ?? 0,
          items,
          page: infinitePage.current,
        });
        // Only save if payload is under 500KB
        if (payload.length < 500_000) {
          sessionStorage.setItem(key, payload);
        }
      }
    };
    // Only run on mount/unmount for this entity
  }, [entitySlug]);

  // Derive server filtering/sorting flags from response meta.
  // In infinite scroll mode, always trust the server — client-side re-filter/sort
  // on the accumulated array is expensive and causes cards to visually reorder.
  const isServerFiltered =
    paginationMeta.serverFiltered === true || scrollMode === "infinite";
  const isServerSorted =
    paginationMeta.serverSorted === true || scrollMode === "infinite";

  // Build config once metadata is ready
  const config = useMemo(() => {
    if (!fields || fields.length === 0) return null;

    const cfg = buildEntityListConfig({
      entityKey: entityName,
      entityName: entityMeta?.entityName ?? entityName,
      fields,
      capabilities,
      featureFlags: entityMeta?.featureFlags,
      primaryAction,
      rowActions,
      bulkActions,
    });

    // Override cardRenderer with EntityCard that has access to fields
    cfg.cardRenderer = (item: Record<string, unknown>) => (
      <EntityCard item={item} basePath={`/app/${entitySlug}`} fields={fields} />
    );

    return cfg;
  }, [
    fields,
    entityMeta,
    entityName,
    entitySlug,
    capabilities,
    primaryAction,
    rowActions,
    bulkActions,
  ]);

  // ── Loading state ──
  const metaLoading = fieldsLoading || capsLoading || actionsLoading;
  if (metaLoading && !config) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading entity metadata...
        </span>
      </div>
    );
  }

  // ── No config / fallback ──
  if (!config) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">
          {entityNameToDisplayName(entityName)}
        </h1>
        <div className="rounded-md border border-border bg-muted/50 p-8 text-center text-sm text-muted-foreground">
          {error
            ? error
            : "No field metadata available for this entity. Records may still exist in the database."}
        </div>
      </div>
    );
  }

  return (
    <ListPageProvider
      config={config}
      items={itemsForProvider}
      loading={dataLoading && accumulatedItems.length === 0}
      error={accumulatedItems.length === 0 ? error : null}
      refresh={refresh}
      serverPagination={metaForProvider}
      isServerFiltered={isServerFiltered}
      isServerSorted={isServerSorted}
      onServerQueryChange={handleServerQueryChange}
      infiniteScroll={infiniteScrollState}
    >
      {/* Negative vertical margins reclaim shell padding for data density */}
      <div className="relative -my-2 md:-my-3 flex h-[calc(100%+1rem)] md:h-[calc(100%+1.5rem)] flex-col">
        {/* Section 1: Fixed, Collapsible header area */}
        <ListContentHeader />

        {/* Section 2 + 3: Scrollable data area (table headers sticky inside) */}
        <ListScrollContainer className="min-h-0 flex-1 overflow-auto">
          <ViewRouter />
        </ListScrollContainer>

        {/* Footer: Fixed at bottom (hidden in infinite scroll mode) */}
        <ListPageFooter />

        {/* Floating selection toolbar */}
        <SelectionToolbar />

        {/* Floating back-to-top (absolute within this relative parent) */}
        <BackToTopButton />
      </div>
    </ListPageProvider>
  );
}
