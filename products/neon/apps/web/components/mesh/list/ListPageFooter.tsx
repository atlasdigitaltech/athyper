"use client";

// components/mesh/list/ListPageFooter.tsx
//
// Pagination controls + item count summary.

import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from "lucide-react";

import { useListPage, useListPageActions } from "./ListPageContext";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";


const PAGE_SIZES = [10, 25, 50, 100];

export function ListPageFooter<T>() {
    const { state, config, totalFilteredCount, totalPages, groupedItems, totalGroupCount, infiniteScroll } = useListPage<T>();
    const actions = useListPageActions();

    // Hide pagination controls in infinite scroll mode
    if (infiniteScroll?.scrollMode === "infinite") return null;

    const total = totalFilteredCount;
    if (total === 0) return null;

    // In kanban mode, hide pagination unless config opts in
    if (state.viewMode === "kanban" && !config.kanban?.paginate) return null;

    const hasGroups = groupedItems.length > 0;

    // Grouped summary — replace pagination with group info + dataset hint
    if (hasGroups) {
        const groupItemCount = groupedItems.reduce((sum, g) => sum + g.items.length, 0);
        return (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-1 py-1">
                <p className="text-xs text-muted-foreground">
                    {groupItemCount} {config.entityLabelPlural} in {totalGroupCount} group{totalGroupCount !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground/70">
                    Grouping uses in-memory dataset (max 1,000 records). Filter to narrow results.
                </p>
            </div>
        );
    }

    const start = (state.page - 1) * state.pageSize + 1;
    const end = Math.min(state.page * state.pageSize, total);

    return (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-1 py-1">
            {/* Item range — desktop only */}
            <p className="hidden sm:block text-xs text-muted-foreground">
                Showing {start}–{end} of {total} {config.entityLabelPlural}
            </p>

            {/* Page navigation — compact on mobile, full on desktop */}
            <div className="flex flex-1 items-center justify-center gap-1 sm:flex-none">
                {/* First page — desktop only */}
                <Button
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex size-7 p-0"
                    disabled={state.page <= 1}
                    onClick={() => actions.setPage(1)}
                >
                    <ChevronsLeft className="size-3.5" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="size-7 p-0"
                    disabled={state.page <= 1}
                    onClick={() => actions.setPage(state.page - 1)}
                >
                    <ChevronLeft className="size-3.5" />
                </Button>

                <span className="px-2 text-xs text-muted-foreground">
                    <span className="sm:hidden">{state.page} / {totalPages}</span>
                    <span className="hidden sm:inline">Page {state.page} of {totalPages}</span>
                </span>

                <Button
                    variant="outline"
                    size="sm"
                    className="size-7 p-0"
                    disabled={state.page >= totalPages}
                    onClick={() => actions.setPage(state.page + 1)}
                >
                    <ChevronRight className="size-3.5" />
                </Button>
                {/* Last page — desktop only */}
                <Button
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex size-7 p-0"
                    disabled={state.page >= totalPages}
                    onClick={() => actions.setPage(totalPages)}
                >
                    <ChevronsRight className="size-3.5" />
                </Button>
            </div>

            {/* Page size selector — desktop only */}
            <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Per page:</span>
                <Select
                    value={String(state.pageSize)}
                    onValueChange={(v) => actions.setPageSize(Number(v))}
                >
                    <SelectTrigger className="h-7 w-[72px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PAGE_SIZES.map((size) => (
                            <SelectItem key={size} value={String(size)}>
                                {size}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
