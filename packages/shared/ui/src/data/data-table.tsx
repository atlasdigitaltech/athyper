"use client";

/**
 * @athyper/ui — DataTable
 *
 * Generic data table built on TanStack Table.
 * Runtime list surfaces feed columns from compiled descriptors;
 * this component handles rendering, sorting, selection, and pagination.
 */
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Fragment, type CSSProperties, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ListPlus } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button } from "../primitives/button";
import { Checkbox } from "../primitives/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../primitives/select";

const ROW_CLICK_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[data-row-click-ignore='true']",
].join(",");

function isInteractiveRowClick(event: ReactMouseEvent<HTMLElement>): boolean {
  const target = event.target;
  return target instanceof HTMLElement && Boolean(target.closest(ROW_CLICK_INTERACTIVE_SELECTOR));
}

type DataTableColumnMeta = {
  align?: "left" | "center" | "right";
  filtered?: boolean;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
};

function cssSize(value: number | string | undefined): string | number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() && value !== "auto") return value;
  return undefined;
}

function columnSizeStyle(columnDef: { meta?: unknown }, fallbackSize?: number): CSSProperties {
  const meta = columnDef.meta as DataTableColumnMeta | undefined;
  const width = meta?.width === "auto"
    ? undefined
    : cssSize(meta?.width) ?? (fallbackSize !== undefined && fallbackSize !== 150 ? fallbackSize : undefined);
  return {
    width,
    minWidth: cssSize(meta?.minWidth),
    maxWidth: cssSize(meta?.maxWidth),
  };
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void;
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  /**
   * Class names applied to the inner `div.rounded-md.border` table container.
   * Use this to add `overflow-auto` + a max-height for inner-scroll mode,
   * which keeps the sticky thead clean (rows scroll behind it, never above it).
   * Example: "overflow-auto max-h-[calc(100dvh-14rem)]"
   */
  tableContainerClassName?: string;
  /**
   * Controlled sort state for server-side sorting.
   * When provided alongside onSortingChange, the table operates in
   * manual-sort mode: it renders the sort indicator but does NOT
   * reorder data client-side (the server already returned sorted rows).
   */
  sortingState?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /**
   * Server-side pagination.
   * When all three are provided, the table uses manualPagination mode:
   * prev/next call onPageChange instead of moving a client-side page index.
   * Client-side getPaginationRowModel is disabled in this mode.
   */
  totalCount?: number;
  currentPage?: number;   // 1-based
  totalPages?: number;
  onPageChange?: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  loadMoreSize?: number;
  maxPageSize?: number;
  onLoadMore?: () => void;
  /**
   * Row density — controls cell padding and header height.
   * "compact"     → tight rows (py-1, h-7 header)
   * "comfortable" → default (py-2.5, h-9 header)
   * "spacious"    → relaxed (py-4, h-11 header)
   */
  density?: "compact" | "comfortable" | "spacious";
  /**
   * Optional per-row action renderer.
   * When provided, appends a sticky right column with the returned node as content.
   * Use this for context action menus (⋯ dropdown) without coupling to operation logic.
   */
  rowActions?: (row: TData) => ReactNode;
  /**
   * Optional per-row class hook for states owned by the calling surface, such
   * as a selected row mirrored in a side panel.
   */
  getRowClassName?: (row: TData) => string | undefined;
  /**
   * Fired when the user right-clicks a row.
   * Use this to render a custom context menu positioned at the mouse cursor.
   */
  onRowContextMenu?: (row: TData, event: React.MouseEvent<HTMLTableRowElement>) => void;
  /**
   * Aggregation footer values keyed by column accessorKey.
   * When provided and non-empty, renders a sticky tfoot row with formatted totals.
   * Pass null for a column to render an empty cell (column is aggregatable but has no value).
   * Columns with no entry in this map get no footer cell content.
   */
  aggregations?: Record<string, number | null>;
  /**
   * Column keys (accessorKey / id) that should be pinned (sticky left).
   * Columns are pinned in the order they appear in the rendered column list.
   * The select checkbox column ("select") is always first; include it here to pin it too.
   */
  pinnedColumns?: string[];
  tableContainerRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * Opt-in row virtualization for large in-memory datasets. Callers should
   * pair this with a bounded, scrollable table container class such as
   * `overflow-auto max-h-[calc(100dvh-14rem)]`.
   */
  virtualized?: boolean;
  /** Estimated row height in px for virtualized rendering. */
  virtualRowEstimate?: number;
  /** Extra rows rendered above/below the visible viewport. */
  virtualOverscan?: number;
  /**
   * Stable row identity. When provided, TanStack keys selection state by
   * the returned id instead of row index — selection survives sort and
   * filter changes. Without it, sorting a selected list shuffles which
   * rows appear selected.
   */
  getRowId?: (row: TData, index: number) => string;
  /**
   * Inline row-expansion content renderer. When `getIsRowExpanded(row)`
   * returns `true`, a full-width row is rendered below the matching
   * `<tr>` containing the node returned here. Both props must be
   * supplied together; either one alone is a no-op.
   *
   * Caller owns the expansion state (single-row vs multi-row, click
   * affordance, etc.). DataTable just renders.
   *
   * Virtualization caveat: expansion content increases real row height
   * beyond `virtualRowEstimate`, so the virtualizer's total-size estimate
   * drifts. Practical impact is minimal for short grids (the typical use
   * case for expansion); pair `virtualized` with `renderRowExpansion`
   * only when rows are bounded.
   */
  renderRowExpansion?: (row: TData) => ReactNode;
  getIsRowExpanded?: (row: TData) => boolean;
}

export function DataTable<TData>({
  columns,
  data,
  selectable = false,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  pageSize = 25,
  onRowClick,
  loading = false,
  emptyMessage = "No results found",
  className,
  sortingState,
  onSortingChange,
  totalCount,
  currentPage,
  totalPages,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  loadMoreSize,
  maxPageSize,
  onLoadMore,
  rowActions,
  tableContainerClassName,
  tableContainerRef,
  virtualized = false,
  virtualRowEstimate,
  virtualOverscan = 8,
  density = "comfortable",
  aggregations,
  pinnedColumns,
  onRowContextMenu,
  getRowClassName,
  getRowId,
  renderRowExpansion,
  getIsRowExpanded,
}: DataTableProps<TData>) {
  // Row density maps
  const CELL_PAD: Record<string, string> = {
    compact:     "px-3 py-1",
    comfortable: "px-3 py-2.5",
    spacious:    "px-3 py-4",
  };
  const HEADER_H: Record<string, string> = {
    compact:     "h-7",
    comfortable: "h-9",
    spacious:    "h-11",
  };
  const cellPad  = CELL_PAD[density] ?? CELL_PAD.comfortable;
  const headerH  = HEADER_H[density] ?? HEADER_H.comfortable;
  const ROW_ESTIMATE: Record<string, number> = {
    compact:     36,
    comfortable: 44,
    spacious:    56,
  };
  const estimatedRowHeight = virtualRowEstimate ?? ROW_ESTIMATE[density] ?? 44;
  const internalTableContainerRef = useRef<HTMLDivElement | null>(null);
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});

  // Controlled sort when sortingState + onSortingChange are provided (server-side sort)
  const isServerSort = sortingState !== undefined && onSortingChange !== undefined;
  const sorting    = isServerSort ? sortingState : internalSorting;
  // TanStack Table may pass either a SortingState array or a functional updater.
  // Resolve the updater before forwarding to the prop callback so callers always
  // receive a plain SortingState array (not a function).
  const setSorting = isServerSort
    ? (updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
        const next = typeof updaterOrValue === "function"
          ? updaterOrValue(sortingState!)
          : updaterOrValue;
        onSortingChange!(next);
      }
    : setInternalSorting;

  // Server-side pagination when all three pagination props are provided
  const isServerPage = totalCount !== undefined && currentPage !== undefined && totalPages !== undefined && onPageChange !== undefined;
  const resolvedMaxPageSize = maxPageSize && maxPageSize > 0 ? maxPageSize : undefined;
  const normalizedPageSizeOptions = Array.from(
    new Set(
      [...(pageSizeOptions ?? []), pageSize]
        .filter((value) => Number.isFinite(value) && value > 0)
        .filter((value) => !resolvedMaxPageSize || value <= resolvedMaxPageSize),
    ),
  ).sort((a, b) => a - b);
  const showPageSizeControl = normalizedPageSizeOptions.length > 0 && !!onPageSizeChange;
  const loadMoreLimit = Math.min(
    resolvedMaxPageSize ?? Number.POSITIVE_INFINITY,
    totalCount ?? Number.POSITIVE_INFINITY,
  );
  const canLoadMore = !!onLoadMore
    && pageSize < loadMoreLimit;
  const remainingLoadMore = Number.isFinite(loadMoreLimit)
    ? Math.max(0, loadMoreLimit - pageSize)
    : undefined;
  const displayedLoadMoreSize = loadMoreSize && remainingLoadMore !== undefined
    ? Math.min(loadMoreSize, remainingLoadMore)
    : loadMoreSize;
  const loadMoreTitle = !canLoadMore && resolvedMaxPageSize && pageSize >= resolvedMaxPageSize && (totalCount ?? 0) > pageSize
    ? `Maximum ${resolvedMaxPageSize} rows loaded. Use Next to continue.`
    : displayedLoadMoreSize
      ? `Load ${displayedLoadMoreSize} more records`
      : "Load more records";
  const loadMoreLabel = displayedLoadMoreSize ? `Load ${displayedLoadMoreSize} More` : "Load More";

  const rowSelection    = controlledSelection ?? internalSelection;
  const setRowSelection = onRowSelectionChange ?? setInternalSelection;

  const selectColumn: ColumnDef<TData, unknown> = {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    size: 40,
  };

  const actionsColumn: ColumnDef<TData, unknown> | null = rowActions
    ? {
        id: "_actions",
        header: () => null,
        cell: ({ row }) => (
          // Stop click propagation so the row-click handler doesn't fire when the menu is opened
          <div onClick={(e) => e.stopPropagation()}>
            {rowActions(row.original)}
          </div>
        ),
        enableSorting: false,
        size: 48,
      }
    : null;

  const allColumns: ColumnDef<TData, unknown>[] = [
    ...(selectable ? [selectColumn] : []),
    ...columns,
    ...(actionsColumn ? [actionsColumn] : []),
  ];

  // Pinned column sticky offsets — cumulative left positions for each pinned column.
  // Map: column id/accessorKey → { left: number (px), isPinned: true }
  const pinnedSet = new Set(pinnedColumns ?? []);
  const pinOffsets: Record<string, number> = {};
  if (pinnedSet.size > 0) {
    let offset = 0;
    for (const col of allColumns) {
      const key = "accessorKey" in col
        ? String((col as { accessorKey: unknown }).accessorKey)
        : (col.id ?? "");
      if (pinnedSet.has(key)) {
        pinOffsets[key] = offset;
        offset += col.size ?? 150;
      }
    }
  }
  const getPinStyle = (colId: string): CSSProperties | undefined => {
    if (colId in pinOffsets) {
      return { position: "sticky", left: pinOffsets[colId], zIndex: 1, background: "inherit" };
    }
    return undefined;
  };

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, rowSelection },
    getRowId,
    onSortingChange: setSorting as (s: SortingState | ((old: SortingState) => SortingState)) => void,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    // In server-sort mode: don't reorder data client-side (rows are already sorted by server)
    getSortedRowModel: isServerSort ? undefined : getSortedRowModel(),
    manualSorting:     isServerSort,
    // In server-page mode: disable client pagination row model (server delivers one page at a time)
    getPaginationRowModel: isServerPage ? undefined : (pageSize > 0 ? getPaginationRowModel() : undefined),
    manualPagination:  isServerPage,
    pageCount:         isServerPage ? (totalPages ?? -1) : undefined,
    initialState: { pagination: { pageSize: pageSize || 9999 } },
    enableRowSelection: selectable,
  });

  const tableRows = table.getRowModel().rows;
  const shouldVirtualizeRows = virtualized && !loading && tableRows.length > 0;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualizeRows ? tableRows.length : 0,
    getScrollElement: () => internalTableContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: virtualOverscan,
  });
  const virtualItems = shouldVirtualizeRows ? rowVirtualizer.getVirtualItems() : [];
  const fallbackVirtualCount = shouldVirtualizeRows && virtualItems.length === 0
    ? Math.min(tableRows.length, Math.max(1, virtualOverscan * 2 + 1))
    : 0;
  const virtualTopPad = virtualItems[0]?.start ?? 0;
  const virtualBottomPad = virtualItems.length > 0
    ? Math.max(0, rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0))
    : 0;
  const setTableContainerNode = (node: HTMLDivElement | null) => {
    internalTableContainerRef.current = node;
    if (tableContainerRef) {
      (tableContainerRef as MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  const expansionEnabled = Boolean(renderRowExpansion && getIsRowExpanded);
  const renderTableRow = (row: typeof tableRows[number]) => {
    const isExpanded = expansionEnabled && getIsRowExpanded!(row.original);
    return (
      <Fragment key={row.id}>
        <tr
          className={cn(
            "border-b transition-colors hover:bg-muted/50",
            row.getIsSelected() && "bg-muted",
            onRowClick && "cursor-pointer",
            isExpanded && "bg-muted/40",
            getRowClassName?.(row.original),
          )}
          onClick={(event) => {
            if (isInteractiveRowClick(event)) return;
            onRowClick?.(row.original);
          }}
          onContextMenu={(e) => onRowContextMenu?.(row.original, e)}
          data-state={row.getIsSelected() ? "selected" : undefined}
        >
          {row.getVisibleCells().map((cell) => {
            const cKey = "accessorKey" in cell.column.columnDef
              ? String((cell.column.columnDef as { accessorKey: unknown }).accessorKey)
              : cell.column.id;
            const cPin = getPinStyle(cKey);
            const cMeta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
            const cAlign = cMeta?.align;
            return (
              <td
                key={cell.id}
                className={cn(
                  cellPad,
                  "align-middle",
                  cAlign === "right"  && "text-right",
                  cAlign === "center" && "text-center",
                  cPin && "border-r shadow-[1px_0_0_0_var(--border)]",
                )}
                style={{ ...columnSizeStyle(cell.column.columnDef, cell.column.getSize()), ...cPin }}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            );
          })}
        </tr>
        {isExpanded && (
          <tr className="border-b bg-muted/20" data-row-expansion="true">
            <td colSpan={allColumns.length} className="p-0">
              {renderRowExpansion!(row.original)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div ref={setTableContainerNode} className={cn("rounded-md border", tableContainerClassName)}>
        <table className="w-full caption-bottom text-sm">
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col
                key={column.id}
                style={columnSizeStyle(column.columnDef, column.getSize())}
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 border-b bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const colKey = "accessorKey" in header.column.columnDef
                    ? String((header.column.columnDef as { accessorKey: unknown }).accessorKey)
                    : header.column.id;
                  const pinStyle = getPinStyle(colKey);
                  const headerMeta = header.column.columnDef.meta as DataTableColumnMeta | undefined;
                  const hAlign = headerMeta?.align;
                  return (
                  <th
                    key={header.id}
                    className={cn(
                      headerH,
                      "px-3 align-middle text-sm font-medium text-muted-foreground",
                      hAlign === "right"  ? "text-right"
                        : hAlign === "center" ? "text-center"
                        : "text-left",
                      pinStyle && "border-r shadow-[1px_0_0_0_var(--border)]",
                      headerMeta?.filtered && "bg-primary/5",
                    )}
                    style={{ ...columnSizeStyle(header.column.columnDef, header.getSize()), ...pinStyle }}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className={cn(
                          "inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground transition-colors",
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp   className="size-3.5 text-primary" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="size-3.5 text-primary" />
                        ) : null}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={allColumns.length} className="h-24 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : tableRows.length === 0 ? (
              <tr>
                <td colSpan={allColumns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : shouldVirtualizeRows && virtualItems.length > 0 ? (
              <>
                {virtualTopPad > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={allColumns.length} style={{ height: virtualTopPad, padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  return row ? renderTableRow(row) : null;
                })}
                {virtualBottomPad > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={allColumns.length} style={{ height: virtualBottomPad, padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            ) : shouldVirtualizeRows && fallbackVirtualCount > 0 ? (
              tableRows.slice(0, fallbackVirtualCount).map(renderTableRow)
            ) : (
              tableRows.map(renderTableRow)
            )}
          </tbody>

          {/* Aggregation footer — rendered only when aggregations map is non-empty */}
          {aggregations && Object.keys(aggregations).length > 0 && !loading && tableRows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 border-t-2 bg-muted font-medium">
              <tr>
                {allColumns.map((col) => {
                  const key = "accessorKey" in col
                    ? String((col as { accessorKey: unknown }).accessorKey)
                    : col.id ?? "";
                  const val = aggregations[key];
                  const fPin = getPinStyle(key);
                  return (
                    <td
                      key={col.id ?? key}
                      className={cn(cellPad, "align-middle text-right text-sm tabular-nums", fPin && "border-r")}
                      style={fPin}
                    >
                      {val != null
                        ? val.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : null}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Server-side pagination controls */}
      {isServerPage && totalCount! > 0 && (
        <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {selectable && Object.keys(rowSelection).length > 0
                ? `${Object.keys(rowSelection).length} of ${totalCount} selected`
                : `${totalCount} records`}
            </p>
            {showPageSizeControl && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Rows</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => onPageSizeChange?.(Number(value))}
                >
                  <SelectTrigger className="h-8 w-[5.25rem] px-2 text-xs text-muted-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {normalizedPageSizeOptions.map((option) => (
                      <SelectItem key={option} value={String(option)} className="text-xs text-muted-foreground">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {onLoadMore && (
              <Button
                variant="outline"
                size="sm"
                className="text-sm"
                onClick={onLoadMore}
                disabled={!canLoadMore}
                title={loadMoreTitle}
              >
                <ListPlus className="size-4" />
                {loadMoreLabel}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => onPageChange!(currentPage! - 1)}
              disabled={currentPage! <= 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => onPageChange!(currentPage! + 1)}
              disabled={currentPage! >= totalPages!}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Client-side pagination controls (fallback when server props not provided) */}
      {!isServerPage && pageSize > 0 && data.length > pageSize && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            {selectable && Object.keys(rowSelection).length > 0
              ? `${Object.keys(rowSelection).length} of ${data.length} selected`
              : `${data.length} records`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function textColumn<TData>(
  accessorKey: string,
  header: string,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    cell: ({ getValue }) => <span>{String(getValue() ?? "")}</span>,
  };
}

export { type ColumnDef, type SortingState, type RowSelectionState };

