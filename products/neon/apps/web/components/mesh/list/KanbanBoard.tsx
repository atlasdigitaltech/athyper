"use client";

// components/mesh/list/KanbanBoard.tsx
//
// Zone 4 — Kanban swimlane board view.
// Groups items by config.kanban.getLaneId, renders cards in vertical lanes.

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";

import { useListPage, useListPageActions } from "./ListPageContext";

import type { Density } from "./types";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { StatusDot } from "@/components/mesh/shared/StatusDot";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DENSITY_SPACING: Record<Density, string> = {
  compact: "p-1 space-y-1",
  comfortable: "p-2 space-y-2",
  spacious: "p-3 space-y-3",
};

// ─── Sortable Card Wrapper ──────────────────────────────────

function SortableCard<T>({
  item,
  itemId,
  renderCard,
  onClick,
  isActive,
}: {
  item: T;
  itemId: string;
  renderCard: (item: T) => React.ReactNode;
  onClick: () => void;
  isActive: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-pointer transition-shadow",
        isDragging && "opacity-50",
        isActive && "ring-2 ring-primary",
      )}
      onClick={onClick}
    >
      {renderCard(item)}
    </div>
  );
}

// ─── Static Card (no DnD) ──────────────────────────────────

function StaticCard<T>({
  item,
  renderCard,
  onClick,
  isActive,
}: {
  item: T;
  renderCard: (item: T) => React.ReactNode;
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <div
      className={cn(
        "cursor-pointer transition-shadow",
        isActive && "ring-2 ring-primary",
      )}
      onClick={onClick}
    >
      {renderCard(item)}
    </div>
  );
}

// ─── Kanban Board ───────────────────────────────────────────

export function KanbanBoard<T>() {
  const { state, config, filteredItems, allItems, loading } = useListPage<T>();
  const actions = useListPageActions();
  const [activeId, setActiveId] = useState<string | null>(null);

  const kanban = config.kanban;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // Group items by lane (unknown lanes collect into "Other")
  const { laneItems, effectiveLanes } = useMemo(() => {
    if (!kanban)
      return { laneItems: new Map<string, T[]>(), effectiveLanes: [] };

    const map = new Map<string, T[]>();
    for (const lane of kanban.lanes) {
      map.set(lane.id, []);
    }

    let hasOther = false;
    for (const item of filteredItems) {
      const laneId = kanban.getLaneId(item);
      const arr = map.get(laneId);
      if (arr) {
        arr.push(item);
      } else {
        // Unknown lane — collect into "Other"
        if (!map.has("__other__")) {
          map.set("__other__", []);
        }
        map.get("__other__")!.push(item);
        hasOther = true;
      }
    }

    const lanes = hasOther
      ? [...kanban.lanes, { id: "__other__", label: "Other" }]
      : kanban.lanes;

    return { laneItems: map, effectiveLanes: lanes };
  }, [filteredItems, kanban]);

  const renderCard = kanban?.cardRenderer ?? config.cardRenderer;

  const handleCardClick = (item: T) => {
    const itemId = config.getId(item);
    if (config.previewRenderer) {
      actions.setPreviewItem(itemId);
    } else if (config.getItemHref) {
      window.location.href = config.getItemHref(item);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!kanban?.onDrop || !event.over) return;

    const draggedId = String(event.active.id);
    const overId = String(event.over.id);

    // Find which lane the dragged item was in and which it's going to
    const item = filteredItems.find((i) => config.getId(i) === draggedId);
    if (!item) return;

    const fromLane = kanban.getLaneId(item);

    // The over ID might be a lane ID or another card ID
    let toLane: string | null = null;
    if (kanban.lanes.some((l) => l.id === overId)) {
      toLane = overId;
    } else {
      // Find which lane contains the target card
      const overItem = filteredItems.find((i) => config.getId(i) === overId);
      if (overItem) {
        toLane = kanban.getLaneId(overItem);
      }
    }

    if (toLane && fromLane !== toLane) {
      kanban.onDrop(item, fromLane, toLane);
    }
  };

  if (!kanban) return null;

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {kanban.lanes.map((lane) => (
          <div key={lane.id} className="min-w-[280px] flex-1 space-y-3">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (filteredItems.length === 0 && allItems.length === 0) {
    return (
      <EmptyState
        icon={config.icon}
        title={`No ${config.entityLabelPlural} found`}
        description={`Get started by creating your first ${config.entityLabel}.`}
        actionLabel={config.primaryAction?.label}
        onAction={config.primaryAction?.onClick}
      />
    );
  }

  const draggableItem = activeId
    ? filteredItems.find((i) => config.getId(i) === activeId)
    : null;

  const board = (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {effectiveLanes.map((lane) => {
        const items = laneItems.get(lane.id) ?? [];
        const laneIds = items.map((i) => config.getId(i));
        const isHighlighted =
          state.filters[
            Object.keys(state.filters).find(
              (k) => state.filters[k] === lane.id,
            ) ?? ""
          ] === lane.id;

        return (
          <div
            key={lane.id}
            className={cn(
              "min-w-[280px] flex-1 rounded-lg border bg-muted/30 flex flex-col",
              isHighlighted && "ring-2 ring-primary/30",
            )}
          >
            {/* Lane header */}
            <div className="flex items-center gap-2 p-3 border-b">
              <StatusDot status={lane.id} />
              {lane.icon && (
                <lane.icon className="size-3.5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{lane.label}</span>
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {items.length}
              </Badge>
            </div>

            {/* Lane body — min 3 cards visible, then scroll */}
            <ScrollArea className="flex-1 min-h-[360px] max-h-[calc(100vh-280px)]">
              <div className={DENSITY_SPACING[state.density]}>
                {items.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-muted-foreground">
                      No {lane.label.toLowerCase()} {config.entityLabelPlural}
                    </p>
                  </div>
                ) : kanban.draggable ? (
                  <SortableContext
                    items={laneIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {items.map((item) => {
                      const itemId = config.getId(item);
                      return (
                        <SortableCard
                          key={itemId}
                          item={item}
                          itemId={itemId}
                          renderCard={renderCard}
                          onClick={() => handleCardClick(item)}
                          isActive={state.previewItemId === itemId}
                        />
                      );
                    })}
                  </SortableContext>
                ) : (
                  items.map((item) => {
                    const itemId = config.getId(item);
                    return (
                      <StaticCard
                        key={itemId}
                        item={item}
                        renderCard={renderCard}
                        onClick={() => handleCardClick(item)}
                        isActive={state.previewItemId === itemId}
                      />
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );

  // Only wrap in DndContext if draggable
  if (kanban.draggable) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {board}
        <DragOverlay>
          {draggableItem ? (
            <div className="opacity-80 rotate-2 scale-105">
              {renderCard(draggableItem)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  }

  return board;
}
