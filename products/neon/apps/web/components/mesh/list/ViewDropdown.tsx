"use client";

// components/mesh/list/ViewDropdown.tsx
//
// View mode + density popover.
// Separated from SettingsDropdown for clearer command bar hierarchy.
//
// Behavioral rules:
//   - Primary views (List/Columns/Cards) always visible + enabled
//   - Advanced views (Board/Timeline) disabled when capability missing;
//     "Advanced" row hidden entirely if none in availableViews
//   - Density hidden when Board is active (board controls its own spacing)
//   - One ToggleGroup for views rendered in two visual rows (Primary + Advanced)

import {
  CalendarRange,
  Kanban,
  LayoutGrid,
  List,
  Monitor,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";
import { useCallback } from "react";

import { getUnavailableReason } from "./explorer-capabilities";
import { useListPage, useListPageActions } from "./ListPageContext";

import type { Density, ViewMode, ViewModeDef } from "./types";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── View Mode Definitions ──────────────────────────────────

const PRIMARY_VIEWS: ViewModeDef[] = [
  { mode: "table", label: "List", icon: List },
  { mode: "table-columns", label: "Columns", icon: SlidersHorizontal },
  { mode: "card-grid", label: "Cards", icon: LayoutGrid },
];

const ADVANCED_VIEWS: ViewModeDef[] = [
  { mode: "kanban", label: "Board", icon: Kanban },
  { mode: "timeline", label: "Timeline", icon: CalendarRange },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

const VIEW_LABEL_MAP: Record<string, string> = {
  table: "List",
  "table-columns": "Columns",
  "card-grid": "Cards",
  kanban: "Board",
  timeline: "Timeline",
};

// ─── Section Label ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">
      {children}
    </p>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function ViewDropdown<T>() {
  const { state, config, capabilities } = useListPage<T>();
  const actions = useListPageActions();

  // ── Available views ─────────────────────────────────────

  const available = config.availableViews ?? ["table", "card-grid"];

  const primaryModes = PRIMARY_VIEWS.filter((m) => available.includes(m.mode));
  const advancedModes = ADVANCED_VIEWS.filter((m) =>
    available.includes(m.mode),
  );
  const hasAnyAdvanced = advancedModes.length > 0;

  // Density is hidden when Board view is active
  const showDensity = state.viewMode !== "kanban";

  // ── Handlers ────────────────────────────────────────────

  const handleViewModeChange = useCallback(
    (value: string) => {
      if (value) {
        actions.setViewMode(value as ViewMode);
      }
    },
    [actions],
  );

  const handleDensityChange = useCallback(
    (value: string) => {
      if (value) {
        actions.setDensity(value as Density);
      }
    },
    [actions],
  );

  // ── Active view label for trigger button ────────────────

  const activeIcon = [...PRIMARY_VIEWS, ...ADVANCED_VIEWS].find(
    (m) => m.mode === state.viewMode,
  );
  const ActiveIcon = activeIcon?.icon ?? List;

  // ── Desktop / Mobile defaults for display ───────────────

  const desktopDefault =
    config.defaultViewModeDesktop ?? config.defaultViewMode ?? "table";
  const mobileDefault =
    config.defaultViewMode ?? config.availableViews?.[0] ?? "card-grid";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2.5">
          <ActiveIcon className="size-3.5" />
          <span className="text-xs">
            {VIEW_LABEL_MAP[state.viewMode] ?? state.viewMode}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[300px] p-0" sideOffset={8}>
        <TooltipProvider delayDuration={200}>
          {/* ── Header ────────────────────────────── */}
          <div className="border-b px-3 py-2">
            <span className="text-xs font-semibold">View</span>
          </div>

          <div className="p-3 space-y-4">
            {/* ── VIEW MODES ────────────────────────── */}
            <div>
              {/* Primary views — always visible, always enabled */}
              {primaryModes.length > 0 && (
                <div className={hasAnyAdvanced ? "mb-2" : ""}>
                  {hasAnyAdvanced && (
                    <p className="text-[9px] text-muted-foreground mb-1 px-1">
                      Primary
                    </p>
                  )}
                  <ToggleGroup
                    type="single"
                    value={state.viewMode}
                    onValueChange={handleViewModeChange}
                    className="w-full justify-start gap-0 rounded-md border"
                  >
                    {primaryModes.map((m) => (
                      <ToggleGroupItem
                        key={m.mode}
                        value={m.mode}
                        className="flex-1 gap-1.5 rounded-none text-xs first:rounded-l-md last:rounded-r-md data-[state=on]:bg-muted"
                      >
                        <m.icon className="size-3.5" />
                        {m.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              )}

              {/* Advanced views — disabled with tooltip when capability missing */}
              {hasAnyAdvanced && (
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1 px-1">
                    Advanced
                  </p>
                  <ToggleGroup
                    type="single"
                    value={state.viewMode}
                    onValueChange={handleViewModeChange}
                    className="w-full justify-start gap-0 rounded-md border"
                  >
                    {advancedModes.map((m) => {
                      const reason = getUnavailableReason(
                        m.mode,
                        config,
                        capabilities,
                      );
                      const disabled = !!reason;

                      if (disabled) {
                        return (
                          <Tooltip key={m.mode}>
                            <TooltipTrigger asChild>
                              <span className="flex-1">
                                <ToggleGroupItem
                                  value={m.mode}
                                  disabled
                                  className="w-full gap-1.5 rounded-none text-xs opacity-40 first:rounded-l-md last:rounded-r-md"
                                >
                                  <m.icon className="size-3.5" />
                                  {m.label}
                                </ToggleGroupItem>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              className="max-w-[200px] text-xs"
                            >
                              {reason}
                            </TooltipContent>
                          </Tooltip>
                        );
                      }

                      return (
                        <ToggleGroupItem
                          key={m.mode}
                          value={m.mode}
                          className="flex-1 gap-1.5 rounded-none text-xs first:rounded-l-md last:rounded-r-md data-[state=on]:bg-muted"
                        >
                          <m.icon className="size-3.5" />
                          {m.label}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </div>
              )}
            </div>

            {/* ── DENSITY ───────────────────────────── */}
            {showDensity && (
              <>
                <Separator />
                <div>
                  <SectionLabel>Density</SectionLabel>
                  <ToggleGroup
                    type="single"
                    value={state.density}
                    onValueChange={handleDensityChange}
                    className="w-full justify-start gap-0 rounded-md border"
                  >
                    {DENSITY_OPTIONS.map((opt) => (
                      <ToggleGroupItem
                        key={opt.value}
                        value={opt.value}
                        className="flex-1 rounded-none text-xs first:rounded-l-md last:rounded-r-md data-[state=on]:bg-muted"
                      >
                        {opt.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </>
            )}

            <Separator />

            {/* ── Default View info ──────────────────── */}
            <div className="rounded-md bg-muted/50 px-2.5 py-2 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground">
                Default View
              </p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Monitor className="size-3" />
                  {VIEW_LABEL_MAP[desktopDefault] ?? desktopDefault}
                </span>
                <span className="flex items-center gap-1">
                  <Smartphone className="size-3" />
                  {VIEW_LABEL_MAP[mobileDefault] ?? mobileDefault}
                </span>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
