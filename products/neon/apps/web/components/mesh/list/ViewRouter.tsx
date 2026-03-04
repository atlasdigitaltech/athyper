"use client";

// components/mesh/list/ViewRouter.tsx
//
// Central component that renders the active view mode + preview drawer.

import { CalendarRange } from "lucide-react";

import { AdaptFiltersSheet } from "./AdaptFiltersSheet";
import { AdjustableDataGrid } from "./AdjustableDataGrid";
import { EntityCardGrid } from "./EntityCardGrid";
import { EntityDataGrid } from "./EntityDataGrid";
import { EntityTreeView } from "./EntityTreeView";
import { InfiniteScrollSentinel } from "./InfiniteScrollSentinel";
import { KanbanBoard } from "./KanbanBoard";
import { useListPage } from "./ListPageContext";
import { PreviewDrawer } from "./PreviewDrawer";
import { ViewSettingsSheet } from "./ViewSettingsSheet";

export function ViewRouter<T>() {
  const { state, totalGroupCount, groupedItems } = useListPage<T>();
  const hasGroups = groupedItems.length > 0;

  let view: React.ReactNode;
  switch (state.viewMode) {
    case "table":
      view = <EntityDataGrid<T> />;
      break;
    case "table-columns":
      view = <AdjustableDataGrid<T> />;
      break;
    case "card-grid":
      view = <EntityCardGrid<T> />;
      break;
    case "kanban":
      view = <KanbanBoard<T> />;
      break;
    case "tree":
      view = <EntityTreeView<T> />;
      break;
    case "timeline":
      view = (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CalendarRange className="size-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">Timeline view coming soon</p>
          <p className="text-xs mt-1">This view is under development.</p>
        </div>
      );
      break;
  }

  return (
    <>
      {hasGroups && totalGroupCount > groupedItems.length && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 mb-2">
          Too many groups ({totalGroupCount}). Showing first{" "}
          {groupedItems.length}. Try filtering your data or choosing a different
          group field.
        </div>
      )}
      {view}
      <InfiniteScrollSentinel />
      <PreviewDrawer<T> />
      <ViewSettingsSheet<T> />
      <AdaptFiltersSheet<T> />
    </>
  );
}
