"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AppWindow, ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, ExternalLink } from "lucide-react";
import type { ResolvedColumn, RuntimeRecordRow, SortEntry, ViewDensity } from "../core/types";
import { formatRuntimeColumnValue, humanizeToken, resolveRecordId } from "../core/formatters";
import { buildGroupedRuntimeRows } from "../core/grouping";
import { filterRuntimeRows } from "../core/search";
import { runtimeListText } from "../core/resources";
import { firstParam, serializeListState } from "../core/urlState";
import { LIST_URL_PARAMS as P } from "../core/types";
import {
  runtimeExcelCellDensity,
  runtimeStickyHeaderCellStyle,
  runtimeTableChrome,
  runtimeTableScrollStyle,
} from "../core/tableChrome";
import { RuntimeLazyLoadFooter } from "./RuntimeLazyLoadFooter";
import { useRuntimeListSearch } from "./RuntimeListContext";
import { useRuntimeBookmarkState } from "./RuntimeBookmarkToggle";
import { RuntimeRowMetaStrip } from "./RuntimeRowMetaStrip";
import { useCommentCounts } from "@athyper/query";
import { RuntimeSelectionBar } from "./RuntimeSelectionBar";

const MIN_COLUMN_WIDTH = 96;
const MAX_COLUMN_WIDTH = 720;
const EXCEL_SELECT_COLUMN_WIDTH = 32;
const EXCEL_META_COLUMN_WIDTH = 130;

interface RuntimeExcelTableIslandProps {
  entityCode:      string;
  columns:         ResolvedColumn[];
  rows:            RuntimeRecordRow[];
  density:         ViewDensity;
  activeSort:      SortEntry[];
  groupColumn?:    ResolvedColumn;
  selectable:      boolean;
  listBaseHref:    string;
  page:            number;
  pageSize:        number;
  total?:          number;
  rawSearchParams: Record<string, string | string[] | undefined>;
}

interface ResizeState {
  columnName: string;
  startX:     number;
  startWidth: number;
}

export function RuntimeExcelTableIsland({
  entityCode,
  columns,
  rows,
  density,
  activeSort,
  groupColumn,
  selectable,
  listBaseHref,
  page,
  pageSize,
  total,
  rawSearchParams,
}: RuntimeExcelTableIslandProps) {
  const {
    lazyList,
    query,
    runSearchAll,
    search,
    serverPagination,
    serverRows,
    serverSearch,
    setLocalMatchCount,
  } = useRuntimeListSearch();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [widthsLoaded, setWidthsLoaded] = useState(false);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ row: RuntimeRecordRow; href: string | null; x: number; y: number } | null>(null);
  const [ctxCopied, setCtxCopied] = useState<string | null>(null);
  const lazyLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const cellDensity = runtimeExcelCellDensity(density);
  const rowSource = lazyList.enabled ? lazyList.loadedRows : rows;
  const loadedRows = useMemo(() => (
    search.enabled ? filterRuntimeRows(rowSource, search.fields, query) : rowSource
  ), [query, rowSource, search.enabled, search.fields]);
  const useServerRows = search.enabled &&
    serverSearch.state === "complete" &&
    Boolean(serverSearch.query) &&
    serverSearch.query === query.trim() &&
    serverRows !== null;
  const displayRows = useServerRows ? serverRows : loadedRows;
  const footerTotal = useServerRows
    ? serverPagination?.total
    : lazyList.pagination?.total ?? total;
  const groupedRows = useMemo(
    () => buildGroupedRuntimeRows(displayRows, groupColumn),
    [displayRows, groupColumn],
  );
  const columnKey = useMemo(() => columns.map((column) => column.name).join("|"), [columns]);
  const columnNames = useMemo(() => new Set(columns.map((column) => column.name)), [columns]);
  const storageKey = useMemo(
    () => `runtime-list:excel-widths:${listBaseHref}:${columnKey}`,
    [columnKey, listBaseHref],
  );
  const resolvedWidths = useMemo(
    () => columns.map((column) => columnWidths[column.name] ?? defaultColumnWidth(column)),
    [columnWidths, columns],
  );
  const totalWidth = resolvedWidths.reduce((sum, width) => sum + width, 0);
  const tableWidth = totalWidth + EXCEL_META_COLUMN_WIDTH + (selectable ? EXCEL_SELECT_COLUMN_WIDTH : 0);
  const allIds = useMemo(
    () => displayRows.map((row) => resolveRecordId(row)).filter((id): id is string => Boolean(id)),
    [displayRows],
  );
  const bookmarkState = useRuntimeBookmarkState(entityCode, displayRows, columns);
  const { counts: commentCountMap } = useCommentCounts(entityCode, allIds);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someChecked = allIds.some((id) => selected.has(id));
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

  useEffect(() => {
    setWidthsLoaded(false);
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      setColumnWidths(normalizeStoredWidths(parsed, columnNames));
    } catch {
      setColumnWidths({});
    } finally {
      setWidthsLoaded(true);
    }
  }, [columnNames, storageKey]);

  useEffect(() => {
    if (!widthsLoaded) return;
    if (resizeState) return;
    const next = normalizeStoredWidths(columnWidths, columnNames);
    try {
      if (Object.keys(next).length > 0) {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Storage availability should not block the resize interaction.
    }
  }, [columnNames, columnWidths, resizeState, storageKey, widthsLoaded]);

  useEffect(() => {
    if (!resizeState) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const delta = event.clientX - resizeState.startX;
      const nextWidth = clampWidth(resizeState.startWidth + delta);
      setColumnWidths((previous) => ({
        ...previous,
        [resizeState.columnName]: nextWidth,
      }));
    };
    const handlePointerUp = () => setResizeState(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [resizeState]);

  useEffect(() => {
    const allowed = new Set(allIds);
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => allowed.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [allIds]);

  const startResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    column: ResolvedColumn,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setResizeState({
      columnName: column.name,
      startX:     event.clientX,
      startWidth: columnWidths[column.name] ?? defaultColumnWidth(column),
    });
  };

  const resetColumnWidth = (columnName: string) => {
    setColumnWidths((previous) => {
      const next = { ...previous };
      delete next[columnName];
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(allIds));
  };

  const handleRowContextMenu = useCallback((row: RuntimeRecordRow, href: string | null, e: React.MouseEvent) => {
    e.preventDefault();
    setCtxCopied(null);
    const x = Math.min(e.clientX, window.innerWidth - 340);
    const y = Math.min(e.clientY, window.innerHeight - 320);
    setCtxMenu({ row, href, x, y });
  }, []);

  const ctxCopyItems = useMemo(() => {
    if (!ctxMenu) return [];
    return columns.flatMap((col) => {
      const { display } = formatRuntimeColumnValue(ctxMenu.row, col);
      return display ? [{ key: col.name, label: col.label, value: display }] : [];
    });
  }, [ctxMenu, columns]);

  const toggleRow = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="relative" data-runtime-list-region>
      <div
        className={runtimeTableChrome.shell}
        style={{ ...runtimeTableScrollStyle, minWidth: "100%", width: tableWidth }}
      >
        <table
          className="w-max min-w-full table-fixed border-separate border-spacing-0 text-left text-sm"
          style={{ minWidth: "100%", tableLayout: "fixed", width: "100%" }}
        >
          <colgroup>
            {selectable && <col style={{ width: EXCEL_SELECT_COLUMN_WIDTH }} />}
            {columns.map((column, index) => (
              <col key={column.name} style={{ width: resolvedWidths[index] }} />
            ))}
            <col style={{ width: EXCEL_META_COLUMN_WIDTH }} />
          </colgroup>
          <thead className="bg-muted">
            <tr>
              {selectable && (
                <th
                  scope="col"
                  style={{ ...runtimeStickyHeaderCellStyle, width: EXCEL_SELECT_COLUMN_WIDTH }}
                  className="sticky top-0 z-20 bg-muted px-2 py-1.5 align-middle shadow-[inset_0_-1px_0_hsl(var(--border))]"
                >
                  <ExcelSelectionCheckbox
                    checked={allChecked}
                    mixed={!allChecked && someChecked}
                    ariaLabel={runtimeListText.aria.selectAllRows}
                    onToggle={toggleAll}
                  />
                </th>
              )}
              {columns.map((column, index) => {
                const sortEntry = activeSort.find((entry) => entry.key === column.name);
                const isResizing = resizeState?.columnName === column.name;
                return (
                  <th
                    key={column.name}
                    scope="col"
                    aria-sort={ariaSort(sortEntry?.dir)}
                    style={runtimeStickyHeaderCellStyle}
                    className={[
                      runtimeTableChrome.headerCell,
                      "group/header relative select-none border-r border-border shadow-none",
                      index === 0 ? "border-l-0" : "",
                    ].join(" ")}
                  >
                    {column.isSortable ? (
                      <a
                        href={sortHref(listBaseHref, rawSearchParams, column.name)}
                        className={`${runtimeTableChrome.headerButton} min-w-0 pr-3`}
                      >
                        <span className="truncate">{column.label}</span>
                        <RuntimeSortIcon dir={sortEntry?.dir} />
                      </a>
                    ) : (
                      <span className="block truncate pr-3">{column.label}</span>
                    )}
                    <button
                      type="button"
                      aria-label={`Resize ${column.label} column`}
                      title="Drag to resize. Double-click to reset."
                      onPointerDown={(event) => startResize(event, column)}
                      onDoubleClick={() => resetColumnWidth(column.name)}
                      className="absolute inset-y-0 right-0 z-30 flex w-3 translate-x-1/2 cursor-col-resize touch-none items-center justify-center outline-none"
                    >
                      <span
                        className={[
                          "h-5 w-px rounded-full transition-all",
                          isResizing
                            ? "bg-primary opacity-100"
                            : "bg-muted-foreground/60 opacity-0 group-hover/header:opacity-100",
                        ].join(" ")}
                      />
                    </button>
                  </th>
                );
              })}
              <th
                scope="col"
                aria-label="Activity"
                style={{ ...runtimeStickyHeaderCellStyle, width: EXCEL_META_COLUMN_WIDTH }}
                className="sticky top-0 z-20 bg-muted px-2 py-1.5 text-right align-middle shadow-[inset_0_-1px_0_hsl(var(--border))]"
              />
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((entry) => {
              if (entry.kind === "group") {
                return (
                  <tr key={entry.key} className="bg-muted/80">
                    <td
                      colSpan={columns.length + (selectable ? 1 : 0) + 1}
                      className="border-b border-border px-2.5 py-1.5 text-sm font-medium text-foreground"
                    >
                      {entry.label}: {entry.value}
                      <span className={runtimeTableChrome.groupCount}>{entry.count}</span>
                    </td>
                  </tr>
                );
              }

              const { row, rowIndex } = entry;
              const id = resolveRecordId(row);
              const href = id ? `${listBaseHref}/${id}` : null;
              const isChecked = Boolean(id && selected.has(id));
              return (
                <tr
                  key={id ?? `row-${rowIndex}`}
                  onContextMenu={(e) => handleRowContextMenu(row, href, e)}
                  className={`group hover:bg-muted/40 ${isChecked ? "bg-primary/5" : ""}`}
                >
                  {selectable && (
                    <td
                      style={{ width: EXCEL_SELECT_COLUMN_WIDTH }}
                      className="border-b border-border px-2 py-1 align-middle"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ExcelSelectionCheckbox
                        checked={isChecked}
                        disabled={!id}
                        ariaLabel={runtimeListText.aria.selectRow(id ?? rowIndex)}
                        onToggle={() => id && toggleRow(id)}
                      />
                    </td>
                  )}
                  {columns.map((column, index) => {
                    const cell = formatRuntimeColumnValue(row, column);
                    return (
                      <td
                        key={column.name}
                        className={[
                          "overflow-hidden whitespace-nowrap border-b border-r border-border align-middle text-foreground",
                          cellDensity,
                        ].join(" ")}
                      >
                        {renderExcelCell(
                          column,
                          index,
                          href,
                          cell.display,
                          cell.title,
                          lazyList.enabled ? lazyList.saveScrollPosition : undefined,
                        )}
                      </td>
                    );
                  })}
                  <td
                    style={{ width: EXCEL_META_COLUMN_WIDTH }}
                    className="border-b border-border px-2 py-1 align-middle"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {id ? (
                      <RuntimeRowMetaStrip
                        row={row}
                        detailHref={`${listBaseHref}/${id}`}
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
        />
      )}

      {selectable && selected.size > 0 && (
        <RuntimeSelectionBar
          count={selected.size}
          markFavouriteDisabled={bookmarkState.isPending || !hasSelectedRowsToFavourite}
          onMarkFavourite={() => bookmarkState.markRowsAsFavourite(selectedRows)}
          removeFavouriteDisabled={bookmarkState.isPending || !hasSelectedRowsToUnfavourite}
          onRemoveFavourite={() => bookmarkState.removeRowsFromFavourite(selectedRows)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* Right-click context menu */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
          />
          <div
            className="fixed z-50 min-w-[260px] max-w-[320px] overflow-hidden rounded-lg border bg-popover py-1 shadow-md"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              onClick={() => {
                if (ctxMenu.href) window.open(ctxMenu.href, "_blank", "noopener,noreferrer");
                setCtxMenu(null);
              }}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              Open in new tab
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              onClick={() => {
                if (ctxMenu.href) window.open(ctxMenu.href, "_blank", "noopener,noreferrer,width=1280,height=800");
                setCtxMenu(null);
              }}
            >
              <AppWindow className="h-4 w-4 shrink-0" />
              Open in new window
            </button>
            {ctxCopyItems.length > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <div className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground/60">
                  Copy field
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  {ctxCopyItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="grid w-full grid-cols-[7.5rem_minmax(0,1fr)_1rem] items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted"
                      onClick={() => {
                        void navigator.clipboard.writeText(item.value);
                        setCtxCopied(item.key);
                        window.setTimeout(() => setCtxCopied(null), 1200);
                      }}
                    >
                      <span className="truncate text-sm text-muted-foreground">{item.label}</span>
                      <span className="truncate text-sm font-medium text-foreground">{item.value}</span>
                      {ctxCopied === item.key ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ExcelSelectionCheckbox({
  checked,
  mixed,
  disabled,
  ariaLabel,
  onToggle,
}: {
  checked:    boolean;
  mixed?:     boolean;
  disabled?:  boolean;
  ariaLabel:  string;
  onToggle:   () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onToggle();
      }}
      className={[
        "inline-flex size-3.5 items-center justify-center rounded-[3px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        checked || mixed
          ? "border-foreground bg-foreground text-background shadow-sm"
          : "border-border bg-background text-transparent hover:border-muted-foreground/60",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
      ].join(" ")}
    >
      {mixed ? (
        <span aria-hidden="true" className="h-0.5 w-2 rounded-full bg-current" />
      ) : (
        <Check aria-hidden="true" className="size-2.5 stroke-[3]" />
      )}
    </button>
  );
}

function RuntimeSortIcon({ dir }: { dir?: "asc" | "desc" }) {
  if (dir === "asc") {
    return <ArrowUp aria-hidden="true" className={runtimeTableChrome.activeSortIcon} />;
  }
  if (dir === "desc") {
    return <ArrowDown aria-hidden="true" className={runtimeTableChrome.activeSortIcon} />;
  }
  return <ArrowUpDown aria-hidden="true" className={runtimeTableChrome.sortIcon} />;
}

function renderExcelCell(
  column:  ResolvedColumn,
  index:   number,
  href:    string | null,
  display: string,
  title?:  string,
  onNavigate?: () => void,
) {
  if (!display) {
    return <span className={runtimeTableChrome.mutedValue}>-</span>;
  }

  if (isStatusColumn(column)) {
    return (
      <span title={title} className={runtimeTableChrome.statusCell}>
        <span aria-hidden="true" className={runtimeTableChrome.statusDot} />
        <span className="truncate">{humanizeToken(display)}</span>
      </span>
    );
  }

  if (index === 0 && href) {
    return (
      <a href={href} title={title} onClick={onNavigate} className={runtimeTableChrome.identityCell}>
        {display}
      </a>
    );
  }

  return (
    <span title={title} className={runtimeTableChrome.valueCell}>
      {display}
    </span>
  );
}

function isStatusColumn(column: ResolvedColumn): boolean {
  const name = column.name.toLowerCase();
  return column.uiType === "status" || name === "status" || name.endsWith("_status");
}

function currentSort(raw: Record<string, string | string[] | undefined>): { key: string; dir: "asc" | "desc" } | null {
  const val = firstParam(raw[P.SORT]);
  if (!val) return null;
  const [key, dir] = val.split(":");
  if (!key?.trim()) return null;
  return { key: key.trim(), dir: dir === "desc" ? "desc" : "asc" };
}

function sortHref(
  base:  string,
  raw:   Record<string, string | string[] | undefined>,
  field: string,
): string {
  const cur = currentSort(raw);
  const nextDir = cur?.key === field && cur.dir === "asc" ? "desc" : "asc";
  return serializeListState(base, raw, { sort: `${field}:${nextDir}`, page: null });
}

function ariaSort(dir?: "asc" | "desc"): "ascending" | "descending" | "none" {
  if (dir === "asc") return "ascending";
  if (dir === "desc") return "descending";
  return "none";
}

function defaultColumnWidth(column: ResolvedColumn): number {
  const name = column.name.toLowerCase();
  if (name === "status" || name.endsWith("_status") || column.uiType === "status") return 120;
  if (name === "code" || name.endsWith("_code")) return 220;
  if (name === "name" || name.endsWith("_name")) return 300;
  if (name.includes("date") || column.dataType === "timestamp" || column.dataType === "timestamptz") return 190;
  if (name === "id" || name.endsWith("_id") || name.includes("uuid")) return 280;
  return 180;
}

function clampWidth(width: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

function normalizeStoredWidths(
  value: unknown,
  allowedColumns: Set<string>,
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, number> = {};
  for (const [name, rawWidth] of Object.entries(value)) {
    if (!allowedColumns.has(name) || typeof rawWidth !== "number" || !Number.isFinite(rawWidth)) continue;
    next[name] = clampWidth(rawWidth);
  }
  return next;
}
