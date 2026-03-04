"use client";

// components/mesh/list/EntityDataGrid.tsx
//
// Zone 4 — Data table with sortable columns, row selection, and row expansion.
// Uses <colgroup> for utility column widths; data columns auto-size from content.

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { DataGridRow } from "./DataGridRow";
import { GroupSection } from "./GroupSection";
import { useListPage, useListPageActions } from "./ListPageContext";
import { DENSITY_TABLE_CLASSES } from "./types";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function EntityDataGrid<T>() {
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

  // Use columnVisibility from state instead of hidden flag
  const visibleColumns = config.columns.filter(
    (c) => state.columnVisibility[c.id] !== false,
  );
  const hasExpand = !!config.expandRenderer;
  const hasPreview = !!config.previewRenderer;
  const hasRowActions = (config.rowActions?.length ?? 0) > 0;
  const totalCols =
    visibleColumns.length + 1 + (hasExpand ? 1 : 0) + (hasRowActions ? 1 : 0);
  const hasGroups = groupedItems.length > 0;

  // Select all logic
  const pageIds = paginatedItems.map((item) => config.getId(item));
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => state.selectedIds.has(id));
  const someSelected =
    !allSelected && pageIds.some((id) => state.selectedIds.has(id));

  const handleSelectAll = () => {
    if (allSelected) {
      actions.deselectAll();
    } else {
      actions.selectAll(pageIds);
    }
  };

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

  // Build sort index for multi-sort priority badges
  const sortIndex = new Map<string, number>();
  for (let i = 0; i < state.sortRules.length; i++) {
    sortIndex.set(state.sortRules[i].fieldId, i);
  }

  const renderRow = (item: T) => {
    const itemId = config.getId(item);
    return (
      <DataGridRow
        key={itemId}
        item={item}
        itemId={itemId}
        columns={visibleColumns}
        rowActions={config.rowActions}
        hasExpand={hasExpand}
        hasPreview={hasPreview}
        isSelected={state.selectedIds.has(itemId)}
        isExpanded={state.expandedIds.has(itemId)}
        expandRenderer={config.expandRenderer}
        href={config.getItemHref?.(item)}
      />
    );
  };

  return (
    <table
      className={cn(
        "w-full caption-bottom text-sm",
        DENSITY_TABLE_CLASSES[state.density],
        isPendingQuery &&
          !loading &&
          "opacity-50 transition-opacity duration-150",
      )}
    >
      {/* Fixed widths only for utility columns; data columns auto-size from content */}
      <colgroup>
        <col className="w-10" />
        {hasExpand && <col className="w-10" />}
        {visibleColumns.map((col) => (
          <col key={col.id} className={col.width} />
        ))}
        {hasRowActions && <col className="w-10" />}
      </colgroup>

      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          {/* Select all checkbox */}
          <TableHead>
            <Checkbox
              checked={
                allSelected ? true : someSelected ? "indeterminate" : false
              }
              onCheckedChange={handleSelectAll}
            />
          </TableHead>

          {/* Expand column */}
          {hasExpand && <TableHead />}

          {/* Data column headers */}
          {visibleColumns.map((col) => {
            const sortPriority = col.sortKey
              ? sortIndex.get(col.sortKey)
              : undefined;
            const isSorted = sortPriority !== undefined;
            const sortDir = isSorted
              ? state.sortRules[sortPriority].dir
              : undefined;
            const isSortable = !!col.sortKey;
            const multiSort = state.sortRules.length > 1;

            return (
              <TableHead
                key={col.id}
                className={cn(isSortable && "cursor-pointer select-none")}
                onClick={
                  isSortable ? () => actions.setSort(col.sortKey!) : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {isSortable && (
                    <>
                      {isSorted && sortDir === "asc" && (
                        <ArrowUp className="size-3" />
                      )}
                      {isSorted && sortDir === "desc" && (
                        <ArrowDown className="size-3" />
                      )}
                      {!isSorted && (
                        <ArrowUpDown className="size-3 text-muted-foreground/50" />
                      )}
                      {isSorted && multiSort && (
                        <span className="flex size-3.5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                          {sortPriority + 1}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </TableHead>
            );
          })}

          {/* Actions column */}
          {hasRowActions && <TableHead />}
        </TableRow>
      </TableHeader>

      <TableBody>
        {hasGroups
          ? groupedItems.map((group) => (
              <GroupSection
                key={group.key}
                label={group.label}
                count={group.items.length}
                collapsed={group.collapsed}
                totalCols={totalCols}
                onToggle={() => actions.toggleGroupCollapse(group.key)}
              >
                {!group.collapsed && group.items.map((item) => renderRow(item))}
              </GroupSection>
            ))
          : paginatedItems.map((item) => renderRow(item))}
      </TableBody>
    </table>
  );
}
