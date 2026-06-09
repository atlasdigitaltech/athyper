"use client";

import { useRouter } from "next/navigation";
import { Check, LayoutDashboard, LayoutGrid, List, Rows3, Table2 } from "lucide-react";
import type { ViewMode } from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { serializeOrganizeState } from "./organizeUrl";

interface ViewModeControlProps {
  viewMode:        ViewMode;
  viewModes:       ViewMode[];
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
}

const VIEW_LABELS: Record<ViewMode, string> = {
  list:      "List",
  compact:   "Compact",
  board:     "Board",
  dashboard: "Dashboard",
  excel:     "Spreadsheet",
};

const VIEW_ICONS = {
  list:      List,
  compact:   Rows3,
  board:     LayoutGrid,
  dashboard: LayoutDashboard,
  excel:     Table2,
} as const;

export function ViewModeControl({
  viewMode,
  viewModes,
  listBaseHref,
  rawSearchParams,
}: ViewModeControlProps) {
  const router = useRouter();
  if (viewModes.length <= 1) return null;

  const commit = (mode: ViewMode) => {
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.VIEW_MODE]: mode === "list" ? null : mode,
    }));
  };

  return (
    <div className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border bg-background p-1">
      {viewModes.map((mode) => {
        const Icon = VIEW_ICONS[mode];
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            title={VIEW_LABELS[mode]}
            aria-label={VIEW_LABELS[mode]}
            aria-pressed={active}
            onClick={() => commit(mode)}
            className={[
              "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {active ? <Check aria-hidden="true" className="size-4" /> : <Icon aria-hidden="true" className="size-4" />}
          </button>
        );
      })}
    </div>
  );
}
