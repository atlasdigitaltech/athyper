"use client";

// components/mesh/list/PreviewDrawer.tsx
//
// Side panel that shows a preview of the selected item.
// Uses shadcn Sheet (side="right").
// Supports next/previous navigation within the result set.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";

import { useListPage, useListPageActions } from "./ListPageContext";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";


export function PreviewDrawer<T>() {
    const { config, previewItem, state, sortedItems } = useListPage<T>();
    const actions = useListPageActions();

    if (!config.previewRenderer) return null;

    const isOpen = previewItem !== null;

    const handleClose = () => {
        actions.setPreviewItem(null);
    };

    // Build ordered ID list for navigation
    const itemIds = useMemo(
        () => sortedItems.map((item) => config.getId(item)),
        [sortedItems, config],
    );

    const currentIndex = state.previewItemId
        ? itemIds.indexOf(state.previewItemId)
        : -1;
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex >= 0 && currentIndex < itemIds.length - 1;

    const goNext = useCallback(() => {
        if (hasNext) {
            actions.setPreviewItem(itemIds[currentIndex + 1]);
        }
    }, [hasNext, currentIndex, itemIds, actions]);

    const goPrev = useCallback(() => {
        if (hasPrev) {
            actions.setPreviewItem(itemIds[currentIndex - 1]);
        }
    }, [hasPrev, currentIndex, itemIds, actions]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handler = (e: KeyboardEvent) => {
            if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                goNext();
            } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                goPrev();
            } else if (e.key === "Escape") {
                handleClose();
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, goNext, goPrev]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <SheetContent
                side="right"
                className="flex w-[400px] flex-col p-0 sm:w-[540px] sm:max-w-[540px]"
            >
                <SheetHeader className="sr-only">
                    <SheetTitle>Preview</SheetTitle>
                    <SheetDescription>Item details</SheetDescription>
                </SheetHeader>

                {/* Navigation bar */}
                {itemIds.length > 1 && (
                    <div className="flex items-center justify-between border-b px-4 py-2">
                        <span className="text-xs text-muted-foreground">
                            {currentIndex + 1} of {itemIds.length}
                        </span>
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={!hasPrev}
                                onClick={goPrev}
                            >
                                <ChevronLeft className="size-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={!hasNext}
                                onClick={goNext}
                            >
                                <ChevronRight className="size-4" />
                            </Button>
                        </div>
                    </div>
                )}

                <ScrollArea className="flex-1">
                    <div className="p-6">
                        {previewItem && config.previewRenderer(previewItem, handleClose)}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
