"use client";

/**
 * ViewModeSwitcher — icon-button group for switching between entity list views.
 *
 * Supports four modes: table / kanban / dashboard / spreadsheet.
 * Only renders buttons for the modes listed in `available` (defaults to all four).
 * Active mode is highlighted; inactive modes show on hover.
 *
 * Usage:
 *   <ViewModeSwitcher
 *     value={viewMode}
 *     onChange={setViewMode}
 *     available={["table", "kanban"]}
 *   />
 */

import { BarChart3, LayoutGrid, Sheet, Table2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export type ViewMode = "table" | "kanban" | "dashboard" | "spreadsheet";

const VIEW_META: Record<ViewMode, { Icon: typeof Table2; label: string }> = {
  table:       { Icon: Table2,     label: "Table" },
  kanban:      { Icon: LayoutGrid, label: "Kanban" },
  dashboard:   { Icon: BarChart3,  label: "Dashboard" },
  spreadsheet: { Icon: Sheet,      label: "Spreadsheet" },
};

export interface ViewModeSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Which modes to render. Defaults to all four. */
  available?: ViewMode[];
  className?: string;
}

export function ViewModeSwitcher({
  value,
  onChange,
  available = ["table", "kanban", "dashboard", "spreadsheet"],
  className,
}: ViewModeSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className={cn(
        "flex h-8 items-center gap-0.5 rounded-md border border-input bg-background p-0.5",
        className,
      )}
    >
      {available.map((mode) => {
        const { Icon, label } = VIEW_META[mode];
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={cn(
              "flex h-full items-center justify-center rounded px-2 text-muted-foreground transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent text-accent-foreground shadow-sm"
                : "hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
