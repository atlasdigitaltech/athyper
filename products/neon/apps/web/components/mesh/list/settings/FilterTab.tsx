"use client";

// components/mesh/list/settings/FilterTab.tsx
//
// Adapt Filters: choose which filter fields appear inline in the command bar.
// DnD reorder + checkbox include/exclude. Operates on a buffered draft.

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
import { useMemo } from "react";

import type { ColumnDef, QuickFilterDef } from "../types";
import type { DragEndEvent } from "@dnd-kit/core";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";


/** A filter field available for inclusion in the bar. */
interface FilterFieldOption {
    id: string;
    label: string;
    source: "quickFilter" | "column";
}

interface FilterTabProps<T> {
    quickFilters: QuickFilterDef[];
    columns: ColumnDef<T>[];
    filterBarFields: string[];
    onFilterBarFieldsChange: (fields: string[]) => void;
}

export function FilterTab<T>({
    quickFilters,
    columns,
    filterBarFields,
    onFilterBarFieldsChange,
}: FilterTabProps<T>) {
    // Build the master list of available filter fields
    const allFields = useMemo((): FilterFieldOption[] => {
        const fields: FilterFieldOption[] = [];

        for (const qf of quickFilters) {
            fields.push({ id: qf.id, label: qf.label, source: "quickFilter" });
        }

        for (const col of columns) {
            if (col.filterable && !fields.some((f) => f.id === col.id)) {
                fields.push({ id: col.id, label: col.header, source: "column" });
            }
        }

        return fields;
    }, [quickFilters, columns]);

    // Build ordered list: selected first (in order), then unselected
    const orderedFields = useMemo(() => {
        const selectedSet = new Set(filterBarFields);
        const selected = filterBarFields
            .map((id) => allFields.find((f) => f.id === id))
            .filter((f): f is FilterFieldOption => !!f);
        const unselected = allFields.filter((f) => !selectedSet.has(f.id));
        return [...selected, ...unselected];
    }, [allFields, filterBarFields]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = filterBarFields.indexOf(String(active.id));
        const newIndex = filterBarFields.indexOf(String(over.id));
        if (oldIndex === -1 || newIndex === -1) return;

        onFilterBarFieldsChange(arrayMove(filterBarFields, oldIndex, newIndex));
    }

    function toggleField(fieldId: string) {
        if (filterBarFields.includes(fieldId)) {
            onFilterBarFieldsChange(filterBarFields.filter((id) => id !== fieldId));
        } else {
            onFilterBarFieldsChange([...filterBarFields, fieldId]);
        }
    }

    const selectedCount = filterBarFields.length;
    const totalCount = allFields.length;

    return (
        <div className="flex flex-col gap-3 p-1">
            <p className="text-xs text-muted-foreground">
                Choose which filters appear in the toolbar. Drag to reorder.
            </p>

            <span className="text-[10px] text-muted-foreground">
                {selectedCount}/{totalCount} active
            </span>

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
                    <div className="space-y-0.5">
                        {orderedFields.map((field) => {
                            const isSelected = filterBarFields.includes(field.id);
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
