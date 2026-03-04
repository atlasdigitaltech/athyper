"use client";

// components/mesh/list/settings/ColumnsTab.tsx
//
// Column management: visibility toggles, search, drag-and-drop reorder.

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
import { GripVertical, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { ColumnDef } from "../types";
import type { DragEndEvent } from "@dnd-kit/core";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ColumnsTabProps<T> {
  columns: ColumnDef<T>[];
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  onVisibilityChange: (vis: Record<string, boolean>) => void;
  onOrderChange: (order: string[]) => void;
}

export function ColumnsTab<T>({
  columns,
  columnVisibility,
  columnOrder,
  onVisibilityChange,
  onOrderChange,
}: ColumnsTabProps<T>) {
  const [search, setSearch] = useState("");

  // Ordered columns based on current order, filtered by search
  const orderedColumns = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c]));
    const ordered = columnOrder
      .map((id) => byId.get(id))
      .filter((c): c is ColumnDef<T> => !!c);

    // Add any columns not in the order list (safety net)
    for (const col of columns) {
      if (!columnOrder.includes(col.id)) {
        ordered.push(col);
      }
    }

    if (!search) return ordered;

    const q = search.toLowerCase();
    return ordered.filter((c) => c.header.toLowerCase().includes(q));
  }, [columns, columnOrder, search]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = columnOrder.indexOf(String(active.id));
    const newIndex = columnOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    onOrderChange(arrayMove(columnOrder, oldIndex, newIndex));
  }

  function toggleVisibility(colId: string) {
    onVisibilityChange({
      ...columnVisibility,
      [colId]: !columnVisibility[colId],
    });
  }

  const visibleCount = Object.values(columnVisibility).filter(Boolean).length;
  const totalCount = columns.length;

  return (
    <div className="flex flex-col gap-3 p-1">
      {/* Search + counter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search columns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {visibleCount}/{totalCount}
        </span>
      </div>

      {/* DnD Column List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedColumns.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0.5">
            {orderedColumns.map((col, idx) => (
              <SortableColumnRow
                key={col.id}
                col={col}
                index={idx}
                visible={columnVisibility[col.id] ?? true}
                onToggle={() => toggleVisibility(col.id)}
                disabled={!!search} // Disable drag when searching
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {orderedColumns.length === 0 && search && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No columns match &quot;{search}&quot;
        </p>
      )}
    </div>
  );
}

// ─── Sortable Row ─────────────────────────────────────────

interface SortableColumnRowProps<T> {
  col: ColumnDef<T>;
  index: number;
  visible: boolean;
  onToggle: () => void;
  disabled: boolean;
}

function SortableColumnRow<T>({
  col,
  index,
  visible,
  onToggle,
  disabled,
}: SortableColumnRowProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id, disabled });

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
          disabled && "cursor-default opacity-30",
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      <span className="w-5 text-center text-[10px] text-muted-foreground">
        {index + 1}
      </span>

      <Checkbox
        checked={visible}
        onCheckedChange={onToggle}
        className="size-3.5"
      />

      <span
        className={cn(
          "flex-1",
          !visible && "text-muted-foreground line-through",
        )}
      >
        {col.header}
      </span>

      {col.sortKey && (
        <span className="text-[10px] text-muted-foreground" title="Sortable">
          S
        </span>
      )}
      {col.groupable && (
        <span className="text-[10px] text-muted-foreground" title="Groupable">
          G
        </span>
      )}
    </div>
  );
}
