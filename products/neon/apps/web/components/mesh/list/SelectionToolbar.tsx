"use client";

// components/mesh/list/SelectionToolbar.tsx
//
// Floating toolbar that appears when rows are selected.
// Shows count + bulk action buttons.

import { X } from "lucide-react";

import { useListPage, useListPageActions } from "./ListPageContext";

import { Button } from "@/components/ui/button";


export function SelectionToolbar<T>() {
    const { state, config, paginatedItems } = useListPage<T>();
    const actions = useListPageActions();

    const count = state.selectedIds.size;
    if (count === 0) return null;

    const selectedItems = paginatedItems.filter((item) =>
        state.selectedIds.has(config.getId(item)),
    );

    return (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-background p-2 shadow-lg">
            <span className="text-sm font-medium pl-2">
                {count} selected
            </span>

            <div className="h-4 w-px bg-border" />

            {config.bulkActions?.map((action) => (
                <Button
                    key={action.id}
                    variant={action.variant === "destructive" ? "destructive" : "outline"}
                    size="sm"
                    className="h-7"
                    onClick={() => action.onClick(selectedItems)}
                >
                    {action.icon && <action.icon className="mr-1.5 size-3.5" />}
                    {action.label}
                </Button>
            ))}

            <Button
                variant="ghost"
                size="sm"
                className="h-7 ml-auto"
                onClick={actions.deselectAll}
            >
                <X className="mr-1 size-3.5" />
                Deselect
            </Button>
        </div>
    );
}
