/**
 * @athyper/ui — DataTable
 *
 * Generic data table built on TanStack Table.
 * The entity-runtime feeds columns from compiled descriptors;
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
import { type CSSProperties, type ReactNode, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button } from "../primitives/Button";
import { Checkbox } from "../primitives/Checkbox";

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
  rowActions,
  tableContainerClassName,
  density = "comfortable",
  aggregations,
  pinnedColumns,
  onRowContextMenu,
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
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});

  // Controlled sort when sortingState + onSortingChange are provided (server-side sort)
  const isServerSort = sortingState !== undefined && onSortingChange !== undefined;
  const sorting    = isServerSort ? sortingState : internalSorting;
  const setSorting = isServerSort ? onSortingChange : setInternalSorting;

  // Server-side pagination when all three pagination props are provided
  const isServerPage = totalCount !== undefined && currentPage !== undefined && totalPages !== undefined && onPageChange !== undefined;

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

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("rounded-md border", tableContainerClassName)}>
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const colKey = "accessorKey" in header.column.columnDef
                    ? String((header.column.columnDef as { accessorKey: unknown }).accessorKey)
                    : header.column.id;
                  const pinStyle = getPinStyle(colKey);
                  return (
                  <th
                    key={header.id}
                    className={cn(
                      headerH,
                      "px-3 text-left align-middle font-medium text-muted-foreground",
                      pinStyle && "border-r shadow-[1px_0_0_0_hsl(var(--border))]",
                      (header.column.columnDef.meta as { filtered?: boolean } | undefined)?.filtered && "bg-primary/5",
                    )}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined, ...pinStyle }}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc"  ? (
                          <ArrowUp   className="size-3.5 text-primary" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="size-3.5 text-primary" />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" />
                        )}
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
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={allColumns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/50",
                    row.getIsSelected() && "bg-muted",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={() => onRowClick?.(row.original)}
                  onContextMenu={(e) => onRowContextMenu?.(row.original, e)}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const cKey = "accessorKey" in cell.column.columnDef
                      ? String((cell.column.columnDef as { accessorKey: unknown }).accessorKey)
                      : cell.column.id;
                    const cPin = getPinStyle(cKey);
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          cellPad,
                          "align-middle",
                          cPin && "border-r shadow-[1px_0_0_0_hsl(var(--border))]",
                        )}
                        style={cPin}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>

          {/* Aggregation footer — rendered only when aggregations map is non-empty */}
          {aggregations && Object.keys(aggregations).length > 0 && !loading && table.getRowModel().rows.length > 0 && (
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
                      className={cn(cellPad, "align-middle text-right tabular-nums text-sm", fPin && "border-r")}
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
      {isServerPage && totalPages! > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            {selectable && Object.keys(rowSelection).length > 0
              ? `${Object.keys(rowSelection).length} of ${totalCount} selected`
              : `${totalCount} records`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange!(currentPage! - 1)}
              disabled={currentPage! <= 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
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
          <p className="text-sm text-muted-foreground">
            {selectable && Object.keys(rowSelection).length > 0
              ? `${Object.keys(rowSelection).length} of ${data.length} selected`
              : `${data.length} records`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
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
