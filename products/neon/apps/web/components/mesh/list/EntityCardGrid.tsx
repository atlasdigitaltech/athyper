"use client";

// components/mesh/list/EntityCardGrid.tsx
//
// Zone 4 — Card grid view. Delegates card rendering to config.cardRenderer.
// Supports density modes and group-by headers.

import {
    ChevronDown,
    ChevronRight,
} from "lucide-react";

import { useListPage, useListPageActions } from "./ListPageContext";

import type { Density } from "./types";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";



const DENSITY_GAP: Record<Density, string> = {
    compact: "gap-1.5",
    comfortable: "gap-4",
    spacious: "gap-6",
};

const DENSITY_COLS: Record<Density, string> = {
    compact: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
    comfortable: "md:grid-cols-2 lg:grid-cols-3",
    spacious: "md:grid-cols-2 lg:grid-cols-3",
};

export function EntityCardGrid<T>() {
    const { state, config, paginatedItems, filteredItems, groupedItems, allItems, loading, isPendingQuery, infiniteScroll } =
        useListPage<T>();
    const actions = useListPageActions();
    const hasPreview = !!config.previewRenderer;
    const hasGroups = groupedItems.length > 0;

    // Only show full skeleton on initial load, not during load-more
    if (loading && (!infiniteScroll || infiniteScroll.loadedCount === 0)) {
        const skeletonCount = state.density === "compact" ? 8 : 6;
        return (
            <div className={cn("grid", DENSITY_COLS[state.density], DENSITY_GAP[state.density])}>
                {Array.from({ length: skeletonCount }).map((_, i) => (
                    <Skeleton key={i} className={cn("rounded-lg", state.density === "compact" ? "h-[90px]" : "h-[120px]")} />
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

    const isCompact = state.density === "compact";

    const renderCard = (item: T) => {
        const itemId = config.getId(item);
        return (
            <div
                key={itemId}
                className={cn(
                    hasPreview && "cursor-pointer",
                    state.previewItemId === itemId && "ring-2 ring-primary rounded-lg",
                    isCompact && "[&_[data-slot=card]]:p-2.5 [&_[data-slot=card]]:text-xs",
                )}
                onClick={hasPreview ? () => actions.setPreviewItem(itemId) : undefined}
            >
                {config.cardRenderer(item)}
            </div>
        );
    };

    const gridClass = cn(
        "grid",
        DENSITY_COLS[state.density],
        DENSITY_GAP[state.density],
        isPendingQuery && !loading && "opacity-50 transition-opacity duration-150",
    );

    if (hasGroups) {
        return (
            <div className="space-y-4">
                {groupedItems.map((group) => (
                    <div key={group.key} className="space-y-2">
                        <button
                            type="button"
                            className="flex items-center gap-2 text-sm"
                            onClick={() => actions.toggleGroupCollapse(group.key)}
                        >
                            {group.collapsed ? (
                                <ChevronRight className="size-4" />
                            ) : (
                                <ChevronDown className="size-4" />
                            )}
                            <span className="font-medium">{group.label}</span>
                            <Badge variant="secondary" className="text-[10px]">
                                {group.items.length}
                            </Badge>
                        </button>
                        {!group.collapsed && (
                            <div className={gridClass}>
                                {group.items.map((item) => renderCard(item))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={gridClass}>
            {paginatedItems.map((item) => renderCard(item))}
        </div>
    );
}
