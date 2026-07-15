"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  Columns3,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  List,
  Rows3,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import type {
  ResolvedColumn,
  RuntimeField,
  SortEntry,
  ViewDensity,
  ViewMode,
} from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import type { RuntimeListFeatures } from "../../adapter/types";
import { PaletteButton } from "./palette-button";
import { PalettePanel } from "./palette-panel";
import { serializeOrganizeState } from "./organize-url";
import { useOrganizePanel } from "./organize-state";

interface OrganizeSettingsControlProps {
  activeSort:       SortEntry[];
  sortableFields:   RuntimeField[];
  groupField?:      string;
  groupableFields:  RuntimeField[];
  visibleColumns:   ResolvedColumn[];
  allColumns:       ResolvedColumn[];
  density:          ViewDensity;
  viewMode:         ViewMode;
  features:         RuntimeListFeatures;
  listBaseHref:     string;
  rawSearchParams:  Record<string, string | string[] | undefined>;
  buttonSize?:      "default" | "compact";
}

const DENSITIES: Array<{ value: ViewDensity; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

const VIEW_LABELS: Record<ViewMode, string> = {
  list:      "List",
  compact:   "Compact cards",
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

export function OrganizeSettingsControl({
  activeSort,
  sortableFields,
  groupField,
  groupableFields,
  visibleColumns,
  allColumns,
  density,
  viewMode,
  features,
  listBaseHref,
  rawSearchParams,
  buttonSize = "default",
}: OrganizeSettingsControlProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const sortPanel = useOrganizePanel("sort");
  const groupPanel = useOrganizePanel("group");
  const columnPanel = useOrganizePanel("columns");
  const sortableByName = new Map(sortableFields.map((field) => [field.name, field]));
  const groupableByName = new Map(groupableFields.map((field) => [field.name, field]));
  const showSort = sortableFields.length > 0;
  const showGroup = features.grouping && groupableFields.length > 0;
  const showColumns = features.columnCustomization && allColumns.length > 0;
  const showView = features.viewModes.length > 1;

  const commitDensity = (value: ViewDensity) => {
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.DENSITY]: value === "compact" ? null : value,
    }));
    setOpen(false);
  };

  const commitViewMode = (mode: ViewMode) => {
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.VIEW_MODE]: mode === "list" ? null : mode,
    }));
    setOpen(false);
  };

  const openPanel = (show: () => void) => {
    setOpen(false);
    show();
  };

  return (
    <>
      <PaletteButton
        ref={buttonRef}
        icon={SlidersHorizontal}
        label="Organize settings"
        expanded={open}
        size={buttonSize}
        chrome="default"
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <PalettePanel anchorRef={buttonRef} title="Organize" width={404} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {(showSort || showGroup || showColumns) && (
              <section className="space-y-1.5">
                <h3 className="px-0.5 text-xs font-medium text-muted-foreground">Arrange</h3>
                <div className="overflow-hidden rounded-md border bg-background">
                  {showSort && (
                    <SettingsRow
                      icon={ArrowUpDown}
                      label="Sort by"
                      value={sortSummary(activeSort, sortableByName)}
                      onClick={() => openPanel(sortPanel.show)}
                    />
                  )}
                  {showGroup && (
                    <SettingsRow
                      icon={Layers}
                      label="Group by"
                      value={groupSummary(groupField, groupableByName)}
                      onClick={() => openPanel(groupPanel.show)}
                    />
                  )}
                  {showColumns && (
                    <SettingsRow
                      icon={Columns3}
                      label="Columns"
                      value={`${visibleColumns.length} shown`}
                      onClick={() => openPanel(columnPanel.show)}
                    />
                  )}
                </div>
              </section>
            )}

            <section className="space-y-1.5">
              <h3 className="px-0.5 text-xs font-medium text-muted-foreground">Density</h3>
              <div className="grid grid-cols-3 overflow-hidden rounded-md border bg-muted/30 p-1">
                {DENSITIES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={density === option.value}
                    onClick={() => commitDensity(option.value)}
                    className={[
                      "h-9 rounded px-2 text-sm font-medium transition-colors",
                      density === option.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            {showView && (
              <section className="space-y-1.5">
                <h3 className="px-0.5 text-xs font-medium text-muted-foreground">View</h3>
                <div className="overflow-hidden rounded-md border bg-background">
                  {features.viewModes.map((mode) => {
                    const Icon = VIEW_ICONS[mode];
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={viewMode === mode}
                        onClick={() => commitViewMode(mode)}
                        className="flex min-h-11 w-full items-center gap-3 border-t px-3 text-left text-sm font-medium first:border-t-0 hover:bg-muted/70"
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{VIEW_LABELS[mode]}</span>
                        {viewMode === mode && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </PalettePanel>
      )}
    </>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon:    typeof ArrowUpDown;
  label:   string;
  value:   string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 border-t px-3 text-left text-sm first:border-t-0 hover:bg-muted/70"
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 font-medium text-foreground">{label}</span>
      <span className="max-w-36 truncate text-muted-foreground">{value}</span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function sortSummary(activeSort: SortEntry[], fieldByName: Map<string, RuntimeField>): string {
  if (activeSort.length === 0) return "None";
  const [first] = activeSort;
  if (!first) return "None";
  const label = fieldByName.get(first.key)?.label ?? first.key;
  const suffix = activeSort.length > 1 ? ` +${activeSort.length - 1}` : "";
  return `${label}${suffix}`;
}

function groupSummary(groupField: string | undefined, fieldByName: Map<string, RuntimeField>): string {
  if (!groupField) return "None";
  return fieldByName.get(groupField)?.label ?? groupField;
}
