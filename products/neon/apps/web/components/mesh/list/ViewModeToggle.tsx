"use client";

// components/mesh/list/ViewModeToggle.tsx
//
// Adaptive view mode switcher.
// ≤ 3 views → inline icon ToggleGroup (fast, power-user friendly)
// 4+ views → single dropdown button with active view label (clean, scalable)

import {
  Check,
  ChevronDown,
  Kanban,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from "lucide-react";

import { useListPage, useListPageActions } from "./ListPageContext";

import type { ViewMode, ViewModeDef } from "./types";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ALL_VIEW_MODES: ViewModeDef[] = [
  { mode: "table", label: "List", icon: List },
  { mode: "table-columns", label: "Columns", icon: SlidersHorizontal },
  { mode: "card-grid", label: "Cards", icon: LayoutGrid },
  { mode: "kanban", label: "Board", icon: Kanban },
];

// ─── Inline Toggle (≤ 3 views) ─────────────────────────────

function InlineToggle({
  modes,
  current,
  onChange,
}: {
  modes: ViewModeDef[];
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <ToggleGroup
        type="single"
        variant="outline"
        value={current}
        onValueChange={(val) => {
          if (val) onChange(val as ViewMode);
        }}
      >
        {modes.map((m) => (
          <Tooltip key={m.mode}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={m.mode}
                aria-label={m.label}
                className="h-8 px-2"
              >
                <m.icon className="size-3.5" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {m.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  );
}

// ─── Dropdown Toggle (4+ views) ─────────────────────────────

function DropdownToggle({
  modes,
  current,
  onChange,
}: {
  modes: ViewModeDef[];
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const active = modes.find((m) => m.mode === current) ?? modes[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 px-3">
          <active.icon className="size-3.5" />
          <span className="text-xs">{active.label}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {modes.map((m) => (
          <DropdownMenuItem
            key={m.mode}
            className="gap-2 text-xs"
            onClick={() => onChange(m.mode)}
          >
            <span className="size-3.5 flex items-center justify-center">
              {m.mode === current ? <Check className="size-3.5" /> : null}
            </span>
            <m.icon className="size-3.5" />
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Adaptive View Mode Toggle ──────────────────────────────

export function ViewModeToggle<T>() {
  const { state, config } = useListPage<T>();
  const actions = useListPageActions();

  const available = config.availableViews ?? ["table", "card-grid"];

  // Smart availability: hide views that don't apply
  const modes = ALL_VIEW_MODES.filter((m) => {
    if (!available.includes(m.mode)) return false;
    if (m.mode === "kanban" && !config.kanban) return false;
    if (m.mode === "table-columns" && config.columns.length < 3) return false;
    return true;
  });

  if (modes.length <= 1) return null;

  const handleChange = (mode: ViewMode) => {
    actions.setViewMode(mode);
  };

  // Adaptive: inline toggle for ≤ 3 views, dropdown for 4+
  if (modes.length <= 3) {
    return (
      <InlineToggle
        modes={modes}
        current={state.viewMode}
        onChange={handleChange}
      />
    );
  }

  return (
    <DropdownToggle
      modes={modes}
      current={state.viewMode}
      onChange={handleChange}
    />
  );
}
