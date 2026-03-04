"use client";

// components/mesh/list/AdjustableDataGrid.tsx
//
// Zone 4 — Adjustable data table powered by @tanstack/react-table.
// Supports column resizing, visibility toggle, and reordering.

import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";

import { toTanStackColumns } from "./column-helpers";
import { GroupSection } from "./GroupSection";
import { useListPage, useListPageActions } from "./ListPageContext";

import { DENSITY_TABLE_CLASSES } from "./types";
import type {
    ColumnOrderState,
    ColumnSizingState,
    VisibilityState,
} from "@tanstack/react-table";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function AdjustableDataGrid<T>() {
    const {
        state,
        config,
        paginatedItems,
        filteredItems,
        groupedItems,
        allItems,
        loading,
        isPendingQuery,
    } = useListPage<T>();
    const actions = useListPageActions();

    // Convert our ColumnDef<T> to TanStack format
    const tanstackColumns = useMemo(
        () => toTanStackColumns(config.columns),
        [config.columns],
    );

    const table = useReactTable({
        data: paginatedItems,
        columns: tanstackColumns,
        state: {
            columnVisibility: state.columnVisibility as VisibilityState,
            columnOrder: state.columnOrder as ColumnOrderState,
            columnSizing: state.columnSizing as ColumnSizingState,
        },
        onColumnVisibilityChange: (updater) => {
            const next =
                typeof updater === "function"
                    ? updater(state.columnVisibility as VisibilityState)
                    : updater;
            actions.setColumnVisibility(next);
        },
        onColumnOrderChange: (updater) => {
            const next =
                typeof updater === "function"
                    ? updater(state.columnOrder as ColumnOrderState)
                    : updater;
            actions.setColumnOrder(next);
        },
        onColumnSizingChange: (updater) => {
            const next =
                typeof updater === "function"
                    ? updater(state.columnSizing as ColumnSizingState)
                    : updater;
            actions.setColumnSizing(next);
        },
        getCoreRowModel: getCoreRowModel(),
        enableColumnResizing: true,
        columnResizeMode: "onChange",
    });

    const rows = table.getRowModel().rows;
    const hasGroups = groupedItems.length > 0;

    // Build Map once for O(n) group-item lookup instead of O(n²) find()
    const rowById = useMemo(() => {
        if (!hasGroups) return null;
        return new Map(rows.map((r) => [config.getId(r.original), r]));
    }, [hasGroups, rows, config]);

    if (loading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
            </div>
        );
    }

    if (filteredItems.length === 0) {
        return (
            <EmptyState
                icon={config.icon}
                title={`No ${config.entityLabelPlural} found`}
                description={
                    allItems.length === 0
                        ? `Get started by creating your first ${config.entityLabel}.`
                        : `No ${config.entityLabelPlural} match your current filters. Try adjusting your search.`
                }
                actionLabel={
                    allItems.length === 0 && config.primaryAction
                        ? config.primaryAction.label
                        : undefined
                }
                onAction={
                    allItems.length === 0 ? config.primaryAction?.onClick : undefined
                }
            />
        );
    }

    const renderRow = (row: (typeof rows)[number]) => {
        const item = row.original;
        const itemId = config.getId(item);
        const hasPreview = !!config.previewRenderer;
        const href = config.getItemHref?.(item);

        return (
            <TableRow
                key={row.id}
                className={cn(
                    (hasPreview || href) && "cursor-pointer",
                    state.previewItemId === itemId && "bg-primary/5",
                )}
                onClick={() => {
                    if (hasPreview) {
                        actions.setPreviewItem(itemId);
                    }
                }}
            >
                {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                        | { align?: string }
                        | undefined;

                    return (
                        <TableCell
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                            className={cn(
                                "overflow-hidden text-ellipsis",
                                meta?.align === "center" && "text-center",
                                meta?.align === "right" && "text-right",
                            )}
                        >
                            {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                            )}
                        </TableCell>
                    );
                })}
            </TableRow>
        );
    };

    return (
        <table className={cn(
            "w-full caption-bottom text-sm",
            DENSITY_TABLE_CLASSES[state.density],
            isPendingQuery && !loading && "opacity-50 transition-opacity duration-150",
        )}>
            <TableHeader className="sticky top-0 z-10 bg-background">
                {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                            const meta = header.column.columnDef.meta as
                                | { align?: string; sortKey?: string }
                                | undefined;

                            return (
                                <TableHead
                                    key={header.id}
                                    style={{ width: header.getSize() }}
                                    className={cn(
                                        "relative group select-none",
                                        meta?.sortKey && "cursor-pointer",
                                    )}
                                    onClick={() => {
                                        if (meta?.sortKey) {
                                            actions.setSort(meta.sortKey);
                                        }
                                    }}
                                >
                                    <span className="inline-flex items-center gap-1 text-xs">
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                  header.column.columnDef.header,
                                                  header.getContext(),
                                              )}
                                    </span>

                                    {/* Resize handle */}
                                    <div
                                        onMouseDown={header.getResizeHandler()}
                                        onTouchStart={header.getResizeHandler()}
                                        onDoubleClick={() => header.column.resetSize()}
                                        className={cn(
                                            "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
                                            "opacity-0 group-hover:opacity-100 bg-border",
                                            header.column.getIsResizing() &&
                                                "opacity-100 bg-primary",
                                        )}
                                    />
                                </TableHead>
                            );
                        })}
                    </TableRow>
                ))}
            </TableHeader>

            <TableBody>
                {hasGroups
                    ? groupedItems.map((group) => (
                          <GroupSection
                              key={group.key}
                              label={group.label}
                              count={group.items.length}
                              collapsed={group.collapsed}
                              totalCols={table.getVisibleLeafColumns().length}
                              onToggle={() =>
                                  actions.toggleGroupCollapse(group.key)
                              }
                          >
                              {!group.collapsed &&
                                  group.items.map((item) => {
                                      const row = rowById!.get(
                                          config.getId(item),
                                      );
                                      return row ? renderRow(row) : null;
                                  })}
                          </GroupSection>
                      ))
                    : rows.map((row) => renderRow(row))}
            </TableBody>
        </table>
    );
}
