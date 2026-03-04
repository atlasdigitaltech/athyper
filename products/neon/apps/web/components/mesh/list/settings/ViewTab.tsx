"use client";

// components/mesh/list/settings/ViewTab.tsx
//
// View mode + density selection tab for the ViewSettingsSheet.
// Single row of all view modes, second row for density.

import {
  CalendarRange,
  GitBranch,
  Kanban,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from "lucide-react";

import { getUnavailableReason } from "../explorer-capabilities";

import type {
  Density,
  ExplorerCapabilities,
  ListPageConfig,
  ViewMode,
  ViewModeDef,
} from "../types";

import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── View Mode Definitions ──────────────────────────────────

const ALL_VIEWS: ViewModeDef[] = [
  { mode: "table", label: "List", icon: List },
  { mode: "table-columns", label: "Columns", icon: SlidersHorizontal },
  { mode: "card-grid", label: "Cards", icon: LayoutGrid },
  { mode: "kanban", label: "Board", icon: Kanban },
  { mode: "timeline", label: "Timeline", icon: CalendarRange },
  { mode: "tree", label: "Tree", icon: GitBranch },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

const _VIEW_LABEL_MAP: Record<string, string> = {
  table: "List",
  "table-columns": "Columns",
  "card-grid": "Cards",
  kanban: "Board",
  timeline: "Timeline",
  tree: "Tree",
};

// ─── Section Label ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">
      {children}
    </p>
  );
}

// ─── Props ──────────────────────────────────────────────────

interface ViewTabProps<T> {
  viewMode: ViewMode;
  density: Density;
  config: ListPageConfig<T>;
  capabilities: ExplorerCapabilities;
  onViewModeChange: (mode: ViewMode) => void;
  onDensityChange: (density: Density) => void;
}

// ─── Component ──────────────────────────────────────────────

export function ViewTab<T>({
  viewMode,
  density,
  config,
  capabilities,
  onViewModeChange,
  onDensityChange,
}: ViewTabProps<T>) {
  const available = config.availableViews ?? ["table", "card-grid"];
  const viewModes = ALL_VIEWS.filter((m) => available.includes(m.mode));

  // Density is hidden when Board view is selected
  const showDensity = viewMode !== "kanban";

  // Desktop / Mobile defaults — cards for mobile/tablet, list for desktop
  const _desktopDefault = config.defaultViewModeDesktop ?? "table";
  const _mobileDefault = config.defaultViewMode ?? "card-grid";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4 p-1">
        {/* ── VIEW MODES (single row) ─────────── */}
        <div>
          <SectionLabel>View</SectionLabel>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => {
              if (v) onViewModeChange(v as ViewMode);
            }}
            className="w-full justify-start gap-0 rounded-md border"
          >
            {viewModes.map((m) => {
              const reason = getUnavailableReason(m.mode, config, capabilities);
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

        {/* ── DENSITY ──────────────────────────── */}
        {showDensity && (
          <>
            <Separator />
            <div>
              <SectionLabel>Density</SectionLabel>
              <ToggleGroup
                type="single"
                value={density}
                onValueChange={(v) => {
                  if (v) onDensityChange(v as Density);
                }}
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
      </div>
    </TooltipProvider>
  );
}
