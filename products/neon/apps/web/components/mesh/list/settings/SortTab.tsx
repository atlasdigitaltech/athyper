"use client";

// components/mesh/list/settings/SortTab.tsx
//
// Multi-sort configuration: ordered list of sort rules.
// Each row: [Field dropdown] [Asc/Desc toggle] [Remove].
// Drag-and-drop priority reorder.

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
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";

import type { ColumnDef, SortRule } from "../types";
import type { DragEndEvent } from "@dnd-kit/core";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SortTabProps<T> {
  columns: ColumnDef<T>[];
  sortRules: SortRule[];
  onSortRulesChange: (rules: SortRule[]) => void;
}

export function SortTab<T>({
  columns,
  sortRules,
  onSortRulesChange,
}: SortTabProps<T>) {
  const sortableColumns = useMemo(
    () => columns.filter((c) => c.sortKey),
    [columns],
  );

  const usedFieldIds = new Set(sortRules.map((r) => r.fieldId));
  const availableColumns = sortableColumns.filter(
    (c) => !usedFieldIds.has(c.sortKey!),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortRules.findIndex(
      (r) => r.fieldId === String(active.id),
    );
    const newIndex = sortRules.findIndex((r) => r.fieldId === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    onSortRulesChange(arrayMove(sortRules, oldIndex, newIndex));
  }

  function addRule() {
    if (availableColumns.length === 0) return;
    const col = availableColumns[0];
    onSortRulesChange([...sortRules, { fieldId: col.sortKey!, dir: "asc" }]);
  }

  function removeRule(fieldId: string) {
    onSortRulesChange(sortRules.filter((r) => r.fieldId !== fieldId));
  }

  function updateRuleField(oldFieldId: string, newFieldId: string) {
    onSortRulesChange(
      sortRules.map((r) =>
        r.fieldId === oldFieldId ? { ...r, fieldId: newFieldId } : r,
      ),
    );
  }

  function toggleDir(fieldId: string) {
    onSortRulesChange(
      sortRules.map((r) =>
        r.fieldId === fieldId
          ? { ...r, dir: r.dir === "asc" ? "desc" : "asc" }
          : r,
      ),
    );
  }

  // For DnD, use fieldId as the item key
  const sortRuleIds = sortRules.map((r) => r.fieldId);

  return (
    <div className="flex flex-col gap-3 p-1">
      {sortRules.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No sort rules configured. Add one to sort results.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortRuleIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {sortRules.map((rule, idx) => (
              <SortableRuleRow
                key={rule.fieldId}
                rule={rule}
                index={idx}
                columns={sortableColumns}
                usedFieldIds={usedFieldIds}
                onChangeField={(newFieldId) =>
                  updateRuleField(rule.fieldId, newFieldId)
                }
                onToggleDir={() => toggleDir(rule.fieldId)}
                onRemove={() => removeRule(rule.fieldId)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 self-start text-xs"
        onClick={addRule}
        disabled={availableColumns.length === 0}
      >
        <Plus className="size-3" />
        Add Sort
      </Button>
    </div>
  );
}

// ─── Sortable Rule Row ──────────────────────────────────────

interface SortableRuleRowProps<T> {
  rule: SortRule;
  index: number;
  columns: ColumnDef<T>[];
  usedFieldIds: Set<string>;
  onChangeField: (newFieldId: string) => void;
  onToggleDir: () => void;
  onRemove: () => void;
}

function SortableRuleRow<T>({
  rule,
  index,
  columns,
  usedFieldIds,
  onChangeField,
  onToggleDir,
  onRemove,
}: SortableRuleRowProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.fieldId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const col = columns.find((c) => c.sortKey === rule.fieldId);

  // Available options for this row: current + all unused
  const availableForThisRow = columns.filter(
    (c) => c.sortKey === rule.fieldId || !usedFieldIds.has(c.sortKey!),
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1.5",
        isDragging && "z-10 bg-muted shadow-sm",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      <span className="w-4 text-center text-[10px] font-medium text-muted-foreground">
        {index + 1}
      </span>

      <Select value={rule.fieldId} onValueChange={onChangeField}>
        <SelectTrigger className="h-7 flex-1 text-xs">
          <SelectValue>{col?.header ?? rule.fieldId}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {availableForThisRow.map((c) => (
            <SelectItem key={c.sortKey!} value={c.sortKey!} className="text-xs">
              {c.header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={onToggleDir}
        title={rule.dir === "asc" ? "Ascending" : "Descending"}
      >
        {rule.dir === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={onRemove}
      >
        <Trash2 className="size-3 text-destructive" />
      </Button>
    </div>
  );
}
