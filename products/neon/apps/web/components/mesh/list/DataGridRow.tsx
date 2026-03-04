"use client";

// components/mesh/list/DataGridRow.tsx
//
// Individual expandable row for EntityDataGrid.
// Handles selection checkbox, row click navigation, expand/collapse, and inline actions.

import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { useListPageActions } from "./ListPageContext";

import type { ColumnDef, RowAction } from "./types";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DataGridRowProps<T> {
  item: T;
  itemId: string;
  columns: ColumnDef<T>[];
  rowActions?: RowAction<T>[];
  hasExpand: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  expandRenderer?: (item: T) => React.ReactNode;
  href?: string;
  hasPreview?: boolean;
}

export function DataGridRow<T>({
  item,
  itemId,
  columns,
  rowActions,
  hasExpand,
  isSelected,
  isExpanded,
  expandRenderer,
  href,
  hasPreview,
}: DataGridRowProps<T>) {
  const router = useRouter();
  const actions = useListPageActions();

  const visibleActions = rowActions?.filter((a) => !a.hidden?.(item)) ?? [];

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't navigate if clicking checkbox, expand button, or actions
      const target = e.target as HTMLElement;
      if (
        target.closest("[data-slot=checkbox]") ||
        target.closest("[data-slot=expand-btn]") ||
        target.closest("[data-slot=row-actions]")
      ) {
        return;
      }
      // If preview is available: click opens preview, Shift+click navigates
      if (hasPreview && !e.shiftKey) {
        actions.setPreviewItem(itemId);
        return;
      }
      if (href) router.push(href);
    },
    [href, router, hasPreview, itemId, actions],
  );

  return (
    <>
      <TableRow
        className={cn(href && "cursor-pointer", isSelected && "bg-primary/5")}
        onClick={handleRowClick}
      >
        {/* Selection checkbox */}
        <TableCell className="w-[40px]">
          <Checkbox
            data-slot="checkbox"
            checked={isSelected}
            onCheckedChange={() => actions.toggleSelect(itemId)}
          />
        </TableCell>

        {/* Expand toggle */}
        {hasExpand && (
          <TableCell className="w-[40px]">
            <Button
              data-slot="expand-btn"
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              onClick={() => actions.toggleExpand(itemId)}
            >
              {isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Button>
          </TableCell>
        )}

        {/* Data columns */}
        {columns.map((col) => (
          <TableCell
            key={col.id}
            className={cn(
              "overflow-hidden text-ellipsis",
              col.align === "center" && "text-center",
              col.align === "right" && "text-right",
            )}
          >
            {col.accessor(item)}
          </TableCell>
        ))}

        {/* Row actions */}
        {visibleActions.length > 0 && (
          <TableCell className="w-[40px]" data-slot="row-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="size-7 p-0">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {visibleActions.map((action) => {
                  const isDisabled = action.disabled?.(item) ?? false;
                  const reason = isDisabled
                    ? action.disabledReason?.(item)
                    : undefined;

                  const menuItem = (
                    <DropdownMenuItem
                      key={action.id}
                      disabled={isDisabled}
                      className={
                        action.variant === "destructive"
                          ? "text-destructive focus:text-destructive"
                          : undefined
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        action.onClick(item);
                      }}
                    >
                      {action.icon && <action.icon className="mr-2 size-3.5" />}
                      {action.label}
                    </DropdownMenuItem>
                  );

                  if (reason) {
                    return (
                      <TooltipProvider key={action.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>{menuItem}</TooltipTrigger>
                          <TooltipContent>{reason}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }

                  return menuItem;
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        )}
      </TableRow>

      {/* Expansion panel */}
      {hasExpand && isExpanded && expandRenderer && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell
            colSpan={
              columns.length +
              1 + // checkbox
              1 + // expand button
              (visibleActions.length > 0 ? 1 : 0)
            }
            className="p-4"
          >
            {expandRenderer(item)}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
