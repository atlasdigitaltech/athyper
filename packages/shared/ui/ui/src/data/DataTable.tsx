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
import { useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
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
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});

  const rowSelection = controlledSelection ?? internalSelection;
  const setRowSelection = onRowSelectionChange ?? setInternalSelection;

  const allColumns: ColumnDef<TData, unknown>[] = selectable
    ? [
        {
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
        },
        ...columns,
      ]
    : columns;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: pageSize > 0 ? getPaginationRowModel() : undefined,
    initialState: { pagination: { pageSize: pageSize || 9999 } },
    enableRowSelection: selectable,
  });

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-md border">
        <table className="w-full caption-bottom text-sm">
          <thead className="border-b bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="h-10 px-3 text-left align-middle font-medium text-muted-foreground"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
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
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize > 0 && data.length > pageSize && (
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
              <ChevronLeft className="h-4 w-4" />
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
              <ChevronRight className="h-4 w-4" />
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
