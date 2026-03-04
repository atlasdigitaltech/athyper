"use client";

// components/mesh/list/AdaptFiltersSheet.tsx
//
// Right-side Sheet for choosing which filter fields appear inline
// in the command bar. DnD reorder + checkbox include/exclude.

import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useListPage, useListPageActions } from "./ListPageContext";

import type { DragEndEvent } from "@dnd-kit/core";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";


/** A filter field available for inclusion in the bar. */
interface FilterFieldOption {
    id: string;
    label: string;
    source: "quickFilter" | "column";
}

export function AdaptFiltersSheet<T>() {
    const { state, config } = useListPage<T>();
    const actions = useListPageActions();

    // Build the master list of available filter fields
    const allFields = useMemo((): FilterFieldOption[] => {
        const fields: FilterFieldOption[] = [];

        // Quick filters
        for (const qf of config.quickFilters) {
            fields.push({ id: qf.id, label: qf.label, source: "quickFilter" });
        }

        // Columns marked as filterable
        for (const col of config.columns) {
            if (col.filterable && !fields.some((f) => f.id === col.id)) {
                fields.push({ id: col.id, label: col.header, source: "column" });
            }
        }

        return fields;
    }, [config.quickFilters, config.columns]);

    // Local draft of selected field IDs (ordered)
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Sync from state when sheet opens
    useEffect(() => {
        if (state.adaptFiltersOpen) {
            setSelectedIds([...state.filterBarFields]);
        }
    }, [state.adaptFiltersOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Build ordered list: selected first (in order), then unselected
    const orderedFields = useMemo(() => {
        const selectedSet = new Set(selectedIds);
        const selected = selectedIds
            .map((id) => allFields.find((f) => f.id === id))
            .filter((f): f is FilterFieldOption => !!f);
        const unselected = allFields.filter((f) => !selectedSet.has(f.id));
        return [...selected, ...unselected];
    }, [allFields, selectedIds]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Only reorder within selected items
        const oldIndex = selectedIds.indexOf(String(active.id));
        const newIndex = selectedIds.indexOf(String(over.id));
        if (oldIndex === -1 || newIndex === -1) return;

        setSelectedIds(arrayMove(selectedIds, oldIndex, newIndex));
    }

    function toggleField(fieldId: string) {
        setSelectedIds((prev) => {
            if (prev.includes(fieldId)) {
                return prev.filter((id) => id !== fieldId);
            }
            return [...prev, fieldId];
        });
    }

    const handleOk = useCallback(() => {
        actions.setFilterBar(selectedIds);
        actions.closeAdaptFilters();
    }, [selectedIds, actions]);

    const handleCancel = useCallback(() => {
        actions.closeAdaptFilters();
    }, [actions]);

    return (
        <Sheet
            open={state.adaptFiltersOpen}
            onOpenChange={(open) => {
                if (!open) handleCancel();
            }}
        >
            <SheetContent side="right" className="flex w-full flex-col sm:max-w-sm" showCloseButton={false}>
                <SheetHeader>
                    <SheetTitle className="text-base">Adapt Filters</SheetTitle>
                    <SheetDescription className="text-xs">
                        Choose which filters appear in the toolbar. Drag to reorder.
                    </SheetDescription>
                </SheetHeader>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis]}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={orderedFields.map((f) => f.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-0.5 p-1">
                                {orderedFields.map((field) => {
                                    const isSelected = selectedIds.includes(field.id);
                                    return (
                                        <SortableFilterRow
                                            key={field.id}
                                            field={field}
                                            selected={isSelected}
                                            onToggle={() => toggleField(field.id)}
                                            draggable={isSelected}
                                        />
                                    );
                                })}
                            </div>
                        </SortableContext>
                    </DndContext>

                    {allFields.length === 0 && (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                            No filter fields available.
                        </p>
                    )}
                </div>

                <SheetFooter className="flex-row justify-end gap-2 border-t pt-4">
                    <Button variant="outline" size="sm" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleOk}>
                        OK
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

// ─── Sortable Filter Row ──────────────────────────────────

interface SortableFilterRowProps {
    field: FilterFieldOption;
    selected: boolean;
    onToggle: () => void;
    draggable: boolean;
}

function SortableFilterRow({
    field,
    selected,
    onToggle,
    draggable,
}: SortableFilterRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: field.id, disabled: !draggable });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                isDragging && "z-10 bg-muted shadow-sm",
                !isDragging && "hover:bg-muted/50",
            )}
        >
            <button
                type="button"
                className={cn(
                    "cursor-grab touch-none text-muted-foreground",
                    !draggable && "cursor-default opacity-30",
                )}
                {...attributes}
                {...listeners}
            >
                <GripVertical className="size-3.5" />
            </button>

            <Checkbox
                checked={selected}
                onCheckedChange={onToggle}
                className="size-3.5"
            />

            <span className={cn("flex-1", !selected && "text-muted-foreground")}>
                {field.label}
            </span>

            <span className="text-[10px] text-muted-foreground">
                {field.source === "quickFilter" ? "Filter" : "Column"}
            </span>
        </div>
    );
}
