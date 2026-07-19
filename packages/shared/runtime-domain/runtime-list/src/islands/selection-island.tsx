"use client";

// SelectionIsland - client table with:
//   - Server-side sort via URL (next/navigation useRouter)
//   - Server-side pagination wired (no client-side pagination layered on top)
//   - Row click to detail navigation
//   - Optional bulk selection + floating bar when features.bulkActions = true
//
// Phase 2: replace the plain HTML table with the @athyper/ui DataTable
//          once it is moved to packages/shared or injected via the app adapter.

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, ArrowDown, ArrowUp, ArrowUpDown, Check, ExternalLink } from "lucide-react";
import type { ActiveFilterEntry, ResolvedColumn, RuntimeRecordRow, SortEntry, ViewDensity } from "../core/types";
import type { RuntimeListFeatures } from "../adapter/types";
import { formatRuntimeColumnValue, humanizeToken, resolveRecordId } from "../core/formatters";
import { buildGroupedRuntimeRows } from "../core/grouping";
import { runtimeListText } from "../core/resources";
import { serializeListState } from "../core/url-state";
import { filterRuntimeRows } from "../core/search";
import {
  runtimeStickyHeaderCellStyle,
  runtimeTableCellPadding,
  runtimeTableChrome,
  runtimeTableScrollStyle,
} from "../core/table-chrome";
import { useRuntimeListSearch } from "./runtime-list-context";
import { RuntimeLazyLoadFooter } from "./runtime-lazy-load-footer";
import { useRuntimeBookmarkState } from "./runtime-bookmark-toggle";
import { RuntimeRowMetaStrip } from "./runtime-row-meta-strip";
import { useCommentCounts } from "@athyper/query";
import { RuntimeSelectionBar } from "./runtime-selection-bar";
import { RuntimeColumnFilterButton } from "./runtime-column-filter-button";
import { RuntimeRowContextMenu } from "./runtime-row-context-menu";

interface SelectionIslandProps {
  entityCode:      string;
  rows:            RuntimeRecordRow[];
  columns:         ResolvedColumn[];
  features:        RuntimeListFeatures;
  detailHrefBase:  string;
  activeFilters?:  ActiveFilterEntry[];
  activeSort:      SortEntry[];
  groupField?:     string;
  density:         ViewDensity;
  page:            number;
  pageSize:        number;
  total?:          number;
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
}

export function SelectionIsland({
  entityCode,
  rows,
  columns,
  features,
  detailHrefBase,
  activeFilters = [],
  activeSort,
  groupField,
  density,
  page,
  pageSize,
  total,
  listBaseHref,
  rawSearchParams,
}: SelectionIslandProps) {
  const router = useRouter();
  const {
    search,
    query,
    setLocalMatchCount,
    serverSearch,
    serverRows,
    serverPagination,
    runSearchAll,
    lazyList,
  } = useRuntimeListSearch();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ row: RuntimeRecordRow; id: string | null; x: number; y: number } | null>(null);
  const [ctxCopied, setCtxCopied] = useState<string | null>(null);
  const lazyLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const activeFilterNames = useMemo(
    () => new Set(activeFilters.map((filter) => filter.fieldName)),
    [activeFilters],
  );

  const rowSource = lazyList.enabled ? lazyList.loadedRows : rows;
  const loadedRows = useMemo(() => (
    search.enabled ? filterRuntimeRows(rowSource, search.fields, query) : rowSource
  ), [query, rowSource, search.enabled, search.fields]);
  // Guard with Boolean(serverSearch.query) to prevent stale server results from
  // briefly appearing when both serverSearch.query and query.trim() are "".
  const useServerRows = search.enabled &&
    serverSearch.state === "complete" &&
    Boolean(serverSearch.query) &&
    serverSearch.query === query.trim() &&
    serverRows !== null;
  const displayRows = useServerRows ? serverRows : loadedRows;
  const groupColumn = groupField ? columns.find((column) => column.name === groupField) : undefined;
  const groupedRows = useMemo(
    () => buildGroupedRuntimeRows(displayRows, groupColumn),
    [displayRows, groupColumn],
  );
  const footerTotal = useServerRows
    ? serverPagination?.total
    : lazyList.pagination?.total ?? total;
  const bookmarkState = useRuntimeBookmarkState(entityCode, displayRows, columns);
  const displayRowIds = useMemo(
    () => displayRows.map((r) => resolveRecordId(r)).filter((id): id is string => Boolean(id)),
    [displayRows],
  );
  const { counts: commentCountMap } = useCommentCounts(entityCode, displayRowIds);
  const extraColumnCount = (features.bulkActions ? 1 : 0) + 1;
  const hasDataFooter = lazyList.enabled || !search.enabled || !query.trim();

  useEffect(() => {
    setLocalMatchCount(loadedRows.length);
  }, [loadedRows.length, setLocalMatchCount]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!search.enabled || !search.controls.autoSearchAllOnEmpty) return;
    if (!trimmedQuery || trimmedQuery.length < search.controls.minQueryLength) return;
    if (search.isFullyLoaded || loadedRows.length > 0) return;
    if (serverSearch.state === "pending" && serverSearch.query === trimmedQuery) return;
    if (serverSearch.state === "complete" && serverSearch.query === trimmedQuery) return;

    runSearchAll({
      rawSearchParams,
      pageSize,
      reason: "zeroLoadedMatches",
      debounceMs: search.controls.autoSearchAllDebounceMs + search.controls.queryStabilityMs,
    });
  }, [
    loadedRows.length,
    pageSize,
    query,
    rawSearchParams,
    runSearchAll,
    search.controls.autoSearchAllDebounceMs,
    search.controls.autoSearchAllOnEmpty,
    search.controls.minQueryLength,
    search.controls.queryStabilityMs,
    search.enabled,
    search.isFullyLoaded,
    serverSearch.query,
    serverSearch.state,
  ]);

  const allIds = useMemo(
    () => displayRows.map((r) => resolveRecordId(r)).filter((id): id is string => Boolean(id)),
    [displayRows],
  );
  const allChecked = useMemo(
    () => allIds.length > 0 && allIds.every((id) => selected.has(id)),
    [allIds, selected],
  );
  const someChecked = useMemo(
    () => allIds.some((id) => selected.has(id)),
    [allIds, selected],
  );
  const selectedRows = useMemo(
    () => displayRows.filter((row) => {
      const id = resolveRecordId(row);
      return Boolean(id && selected.has(id));
    }),
    [displayRows, selected],
  );
  const hasSelectedRowsToFavourite = useMemo(
    () => selectedRows.some((row) => {
      const id = resolveRecordId(row);
      return Boolean(id && !bookmarkState.bookmarkedIds.has(id));
    }),
    [bookmarkState.bookmarkedIds, selectedRows],
  );
  const hasSelectedRowsToUnfavourite = useMemo(
    () => selectedRows.some((row) => {
      const id = resolveRecordId(row);
      return Boolean(id && bookmarkState.bookmarkedIds.has(id));
    }),
    [bookmarkState.bookmarkedIds, selectedRows],
  );

  const toggleAll = useCallback(() => {
    setSelected(allChecked ? new Set() : new Set(allIds));
  }, [allChecked, allIds]);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const allowed = new Set(allIds);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [allIds]);

  const handleRowClick = useCallback(
    (row: RuntimeRecordRow, e: React.MouseEvent) => {
      // Ignore clicks inside row controls.
      if ((e.target as HTMLElement).closest("[data-checkbox],[data-row-action]")) return;
      const id = resolveRecordId(row);
      if (id) {
        lazyList.saveScrollPosition();
        router.push(`${detailHrefBase}/${id}`);
      }
    },
    [detailHrefBase, lazyList, router],
  );

  const handleSortClick = useCallback(
    (e: React.MouseEvent, fieldName: string) => {
      e.preventDefault();
      const existing = activeSort.find((s) => s.key === fieldName);
      const nextDir = existing?.dir === "asc" ? "desc" : "asc";

      // When multiSort is enabled, update only the clicked field and keep all other
      // sort levels intact. Without this, clicking any header replaced the full sort.
      const nextSort = features.multiSort
        ? [{ key: fieldName, dir: nextDir }, ...activeSort.filter((s) => s.key !== fieldName)]
        : [{ key: fieldName, dir: nextDir }];

      const href = serializeListState(listBaseHref, rawSearchParams, {
        sort: nextSort.map((s) => `${s.key}:${s.dir}`).join(","),
        page: null,
      });
      router.push(href);
    },
    [activeSort, features.multiSort, listBaseHref, rawSearchParams, router],
  );

  const handleRowContextMenu = useCallback((row: RuntimeRecordRow, id: string | null, e: React.MouseEvent) => {
    e.preventDefault();
    setCtxCopied(null);
    setCtxMenu({ row, id, x: e.clientX, y: e.clientY });
  }, []);

  const ctxCopyItems = useMemo(() => {
    if (!ctxMenu) return [];
    return columns.flatMap((col) => {
      const { display } = formatRuntimeColumnValue(ctxMenu.row, col);
      return display ? [{ key: col.name, label: col.label, value: display }] : [];
    });
  }, [ctxMenu, columns]);

  const cellPadding = runtimeTableCellPadding(density);

  return (
    <div className="relative" data-runtime-list-region>
      <div
        className={`${runtimeTableChrome.shell} ${hasDataFooter ? runtimeTableChrome.shellWithFooter : ""}`}
        style={runtimeTableScrollStyle}
      >
        <table className={runtimeTableChrome.table}>
          <thead className={runtimeTableChrome.head}>
            <tr>
              {features.bulkActions && (
                <th scope="col" className={runtimeTableChrome.selectHeaderCell} style={runtimeStickyHeaderCellStyle}>
                  <RuntimeSelectionCheckbox
                    checked={allChecked}
                    mixed={!allChecked && someChecked}
                    ariaLabel={runtimeListText.aria.selectAllRows}
                    onToggle={toggleAll}
                  />
                </th>
              )}
              {columns.map((col) => {
                const sortEntry = activeSort.find((s) => s.key === col.name);
                return (
                  <th
                    key={col.name}
                    scope="col"
                    aria-sort={ariaSort(sortEntry?.dir)}
                    className={runtimeTableChrome.headerCell}
                    style={runtimeStickyHeaderCellStyle}
                  >
                    <div className={runtimeTableChrome.headerContent}>
                      {col.isSortable ? (
                        <button
                          type="button"
                          onClick={(e) => handleSortClick(e, col.name)}
                          className={runtimeTableChrome.headerButton}
                        >
                          {col.label}
                          <RuntimeSortIcon dir={sortEntry?.dir} />
                        </button>
                      ) : (
                        <span>{col.label}</span>
                      )}
                      {col.isFilterable && (
                        <RuntimeColumnFilterButton
                          fieldName={col.name}
                          fieldLabel={col.label}
                          active={activeFilterNames.has(col.name)}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
              <th
                scope="col"
                aria-label="Activity"
                className={runtimeTableChrome.metaHeaderCell}
                style={runtimeStickyHeaderCellStyle}
              />
            </tr>
          </thead>
          <tbody className={runtimeTableChrome.body}>
            {displayRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + extraColumnCount}
                  className={runtimeTableChrome.emptyCell}
                >
                  {resolveEmptySearchMessage({
                    query,
                    serverState: serverSearch.state,
                    serverMessage: serverSearch.message,
                    isFullyLoaded: search.isFullyLoaded,
                  })}
                </td>
              </tr>
            )}
            {groupedRows.map((entry) => {
              if (entry.kind === "group") {
                return (
                  <tr key={entry.key} className={runtimeTableChrome.groupRow}>
                    <td
                      colSpan={columns.length + extraColumnCount}
                      className={runtimeTableChrome.groupHeaderCell}
                    >
                      {entry.label}: {entry.value}
                      <span className={runtimeTableChrome.groupCount}>{entry.count}</span>
                    </td>
                  </tr>
                );
              }

              const { row, rowIndex } = entry;
              const id       = resolveRecordId(row);
              const isChecked = Boolean(id && selected.has(id));
              return (
                <tr
                  key={id ?? `row-${rowIndex}`}
                  onClick={(e) => handleRowClick(row, e)}
                  onContextMenu={(e) => handleRowContextMenu(row, id, e)}
                  className={cx(
                    runtimeTableChrome.row,
                    id ? runtimeTableChrome.clickableRow : "",
                    isChecked ? runtimeTableChrome.selectedRowSoft : "",
                  )}
                >
                  {features.bulkActions && (
                    <td className={`${runtimeTableChrome.selectCell} ${cellPadding}`} onClick={(e) => e.stopPropagation()}>
                      <RuntimeSelectionCheckbox
                        checked={isChecked}
                        disabled={!id}
                        ariaLabel={runtimeListText.aria.selectRow(id ?? rowIndex)}
                        onToggle={() => id && toggleRow(id)}
                      />
                    </td>
                  )}
                  {columns.map((col, colIndex) => {
                    const cell = formatRuntimeColumnValue(row, col);
                    return (
                      <td
                        key={col.name}
                        className={`${runtimeTableChrome.cell} ${cellPadding}`}
                      >
                        {renderRuntimeCell(col, colIndex, id, cell.display, cell.title)}
                      </td>
                    );
                  })}
                  <td
                    className={`${runtimeTableChrome.metaCell} ${cellPadding}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {id ? (
                      <RuntimeRowMetaStrip
                        row={row}
                        detailHref={`${detailHrefBase}/${id}`}
                        bookmarked={bookmarkState.bookmarkedIds.has(id)}
                        bookmarkPending={bookmarkState.isPending}
                        onBookmarkToggle={() => bookmarkState.toggle(row)}
                        commentCount={commentCountMap[id]?.total ?? 0}
                        commentHasOpen={commentCountMap[id]?.hasOpen ?? false}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lazyList.enabled && (
          <div
            ref={lazyLoadSentinelRef}
            tabIndex={lazyList.hasNextPage ? 0 : -1}
            aria-label={runtimeListText.aria.loadMoreRecords}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && lazyList.hasNextPage) {
                event.preventDefault();
                lazyList.loadNextPage();
              }
            }}
            className="h-px w-full overflow-hidden"
          />
        )}
      </div>

      {lazyList.enabled && (
        <RuntimeLazyLoadFooter
          sentinelRef={lazyLoadSentinelRef}
          query={query}
          isServerSearch={useServerRows}
          page={page}
          pageSize={pageSize}
          rowCount={displayRows.length}
          loadedRowCount={useServerRows ? displayRows.length : lazyList.activeRows.length}
          datasetLoadedRowCount={lazyList.loadedRowCount}
          total={footerTotal}
          rawSearchParams={rawSearchParams}
          attached
        />
      )}

      {/* Floating bulk action bar */}
      {features.bulkActions && selected.size > 0 && (
        <RuntimeSelectionBar
          count={selected.size}
          markFavouriteDisabled={bookmarkState.isPending || !hasSelectedRowsToFavourite}
          onMarkFavourite={() => bookmarkState.markRowsAsFavourite(selectedRows)}
          removeFavouriteDisabled={bookmarkState.isPending || !hasSelectedRowsToUnfavourite}
          onRemoveFavourite={() => bookmarkState.removeRowsFromFavourite(selectedRows)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {ctxMenu && (
        <RuntimeRowContextMenu
          open
          x={ctxMenu.x}
          y={ctxMenu.y}
          actions={[
            {
              label: "Open in new tab",
              icon: ExternalLink,
              onSelect: () => {
                if (ctxMenu.id) window.open(`${detailHrefBase}/${ctxMenu.id}`, "_blank", "noopener,noreferrer");
                setCtxMenu(null);
              },
            },
            {
              label: "Open in new window",
              icon: AppWindow,
              onSelect: () => {
                if (ctxMenu.id) window.open(`${detailHrefBase}/${ctxMenu.id}`, "_blank", "noopener,noreferrer,width=1280,height=800");
                setCtxMenu(null);
              },
            },
          ]}
          copyItems={ctxCopyItems}
          copiedKey={ctxCopied}
          onCopy={(item) => {
            void navigator.clipboard.writeText(item.value);
            setCtxCopied(item.key);
            setCtxMenu(null);
            window.setTimeout(() => setCtxCopied(null), 1200);
          }}
          onOpenChange={(next) => {
            if (!next) setCtxMenu(null);
          }}
        />
      )}
    </div>
  );
}

function RuntimeSortIcon({ dir }: { dir?: SortEntry["dir"] }) {
  if (dir === "asc") {
    return <ArrowUp aria-hidden="true" className={runtimeTableChrome.activeSortIcon} />;
  }
  if (dir === "desc") {
    return <ArrowDown aria-hidden="true" className={runtimeTableChrome.activeSortIcon} />;
  }
  return <ArrowUpDown aria-hidden="true" className={runtimeTableChrome.sortIcon} />;
}

function RuntimeSelectionCheckbox({
  checked,
  mixed,
  disabled,
  ariaLabel,
  onToggle,
}: {
  checked:   boolean;
  mixed?:    boolean;
  disabled?: boolean;
  ariaLabel: string;
  onToggle:  () => void;
}) {
  return (
    <button
      data-checkbox
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onToggle();
      }}
      className={cx(
        "inline-flex size-3.5 items-center justify-center rounded-[3px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        checked || mixed
          ? "border-foreground bg-foreground text-background shadow-sm"
          : "border-border bg-background text-transparent hover:border-muted-foreground/60",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      {mixed ? (
        <span aria-hidden="true" className="h-0.5 w-2 rounded-full bg-current" />
      ) : checked ? (
        <Check aria-hidden="true" className="size-2.5 stroke-[3]" />
      ) : null}
    </button>
  );
}

function ariaSort(dir?: SortEntry["dir"]): "ascending" | "descending" | "none" {
  if (dir === "asc") return "ascending";
  if (dir === "desc") return "descending";
  return "none";
}

function renderRuntimeCell(
  col:      ResolvedColumn,
  colIndex: number,
  id:       string | null,
  display:  string,
  title?:   string,
) {
  if (!display) {
    return <span className={runtimeTableChrome.mutedValue}>-</span>;
  }

  if (isStatusColumn(col)) {
    return (
      <span title={title} className={runtimeTableChrome.statusCell}>
        <span aria-hidden="true" className={runtimeTableChrome.statusDot} />
        <span className="truncate">{humanizeToken(display)}</span>
      </span>
    );
  }

  if (colIndex === 0 && id) {
    return (
      <span title={title} className={runtimeTableChrome.identityCell}>
        {display}
      </span>
    );
  }

  return (
    <span title={title} className={runtimeTableChrome.valueCell}>
      {display}
    </span>
  );
}

function isStatusColumn(col: ResolvedColumn): boolean {
  return col.uiType === "status";
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function resolveEmptySearchMessage({
  query,
  serverState,
  serverMessage,
  isFullyLoaded,
}: {
  query:         string;
  serverState:   "idle" | "pending" | "complete" | "error";
  serverMessage?:string;
  isFullyLoaded: boolean;
}): string {
  const trimmed = query.trim();
  if (!trimmed) return runtimeListText.search.noRecordsToDisplay;
  if (serverState === "pending") return runtimeListText.search.checkingAllRecords;
  if (serverState === "error") return serverMessage ?? runtimeListText.search.couldNotSearchInAllRecords;
  if (serverState === "complete" || isFullyLoaded) return runtimeListText.search.noRecordsMatch(trimmed);
  return runtimeListText.search.noMatchesInLoadedRows;
}
