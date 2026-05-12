"use client";

import { useMemo } from "react";
import { AlignJustify, ArrowUpDown, Check, Columns3, Filter, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import {
  type LineOrganizerConfig,
  type LineOrganizerFilter,
  resolveLineOrganizer,
} from "./metaLineRuntime";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LinesOrganizePaletteProps {
  entity: CompiledEntity;
  activeSortKey: string;
  activeFilterKeys: Set<string>;
  activeGroupKey: string;
  activeDensity: string;
  columnOptions?: { key: string; label: string }[];
  activeColumnKeys?: Set<string>;
  defaultColumnKeys?: Set<string>;
  onSortChange: (key: string) => void;
  onFilterToggle: (key: string) => void;
  onFilterClear: () => void;
  onGroupChange: (key: string) => void;
  onDensityChange: (key: string) => void;
  onColumnToggle?: (key: string) => void;
  onColumnsReset?: () => void;
}

// ── Segment styling (mirrors EntityListPage OrganizerPalette tokens) ──────────

const SEG =
  "relative flex h-7 w-8 shrink-0 items-center justify-center rounded-md text-xs font-medium " +
  "transition-[background-color,color,box-shadow] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
  "data-[state=open]:bg-foreground data-[state=open]:text-background data-[state=open]:shadow-sm " +
  "data-[state=open]:hover:bg-foreground/90 data-[state=open]:hover:text-background";

function segCls(isActive: boolean): string {
  return cn(
    SEG,
    isActive
      ? "bg-background text-primary shadow-sm ring-1 ring-primary/20 hover:bg-primary/10 hover:text-primary"
      : "text-muted-foreground hover:bg-background hover:text-foreground",
  );
}

// ── Tone dot colours for filter items ────────────────────────────────────────

const TONE_DOT: Record<NonNullable<LineOrganizerFilter["tone"]>, string> = {
  danger:  "bg-destructive",
  warning: "bg-amber-500",
  info:    "bg-blue-500",
  neutral: "bg-muted-foreground/50",
};

// ── Shared option item (radio/checkbox row inside a dropdown) ─────────────────

function OptionItem({
  label,
  selected,
  dot,
  onClick,
}: {
  label: string;
  selected: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        selected && "font-semibold text-foreground",
      )}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {selected
          ? <Check className="h-3 w-3" />
          : dot
          ? <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
          : null}
      </span>
      {label}
    </button>
  );
}

// ── Filter segment ────────────────────────────────────────────────────────────

function FilterSegment({
  filters,
  activeFilterKeys,
  onFilterToggle,
  onFilterClear,
}: {
  filters: LineOrganizerFilter[];
  activeFilterKeys: Set<string>;
  onFilterToggle: (key: string) => void;
  onFilterClear: () => void;
}) {
  const isActive = activeFilterKeys.size > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={segCls(isActive)}
        aria-label={isActive ? `${activeFilterKeys.size} filter${activeFilterKeys.size !== 1 ? "s" : ""} active` : "Filter"}
      >
        <Filter className="h-3.5 w-3.5 shrink-0" />
        {isActive && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground">
            {activeFilterKeys.size}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Quick filters</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filters.map((filter) => (
          <OptionItem
            key={filter.key}
            label={filter.label}
            selected={activeFilterKeys.has(filter.key)}
            dot={TONE_DOT[filter.tone ?? "neutral"]}
            onClick={() => onFilterToggle(filter.key)}
          />
        ))}
        {isActive && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={onFilterClear}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Clear all filters
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Sort segment ──────────────────────────────────────────────────────────────

function SortSegment({
  sorts,
  activeSortKey,
  defaultSortKey,
  onSortChange,
}: {
  sorts: LineOrganizerConfig["sorts"];
  activeSortKey: string;
  defaultSortKey: string;
  onSortChange: (key: string) => void;
}) {
  const isActive = activeSortKey !== "" && activeSortKey !== defaultSortKey;
  const activeLabel = sorts.find((s) => s.key === activeSortKey)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={segCls(isActive)}
        aria-label={activeLabel ? `Sorted by ${activeLabel}` : "Sort"}
      >
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sorts.map((sort) => (
          <OptionItem
            key={sort.key}
            label={sort.label}
            selected={activeSortKey === sort.key}
            onClick={() => onSortChange(sort.key)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Group segment ─────────────────────────────────────────────────────────────

function GroupSegment({
  groups,
  activeGroupKey,
  defaultGroupKey,
  onGroupChange,
}: {
  groups: LineOrganizerConfig["groups"];
  activeGroupKey: string;
  defaultGroupKey: string;
  onGroupChange: (key: string) => void;
}) {
  const isActive = activeGroupKey !== "" && activeGroupKey !== defaultGroupKey;
  const activeLabel = groups.find((g) => g.key === activeGroupKey)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={segCls(isActive)}
        aria-label={isActive && activeLabel ? `Grouped by ${activeLabel}` : "Group"}
      >
        <Layers className="h-3.5 w-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Group by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups.map((group) => (
          <OptionItem
            key={group.key}
            label={group.label}
            selected={activeGroupKey === group.key}
            onClick={() => onGroupChange(group.key)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Density segment ───────────────────────────────────────────────────────────

function DensitySegment({
  densities,
  activeDensity,
  defaultDensity,
  onDensityChange,
}: {
  densities: LineOrganizerConfig["densities"];
  activeDensity: string;
  defaultDensity: string;
  onDensityChange: (key: string) => void;
}) {
  const isActive = activeDensity !== "" && activeDensity !== defaultDensity;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={segCls(isActive)}
        aria-label="Density"
      >
        <AlignJustify className="h-3.5 w-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Row density</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {densities.map((density) => (
          <OptionItem
            key={density.key}
            label={density.label}
            selected={activeDensity === density.key}
            onClick={() => onDensityChange(density.key)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function ColumnsSegment({
  columnOptions,
  activeColumnKeys,
  defaultColumnKeys,
  onColumnToggle,
  onColumnsReset,
}: {
  columnOptions: { key: string; label: string }[];
  activeColumnKeys: Set<string>;
  defaultColumnKeys: Set<string>;
  onColumnToggle: (key: string) => void;
  onColumnsReset: () => void;
}) {
  const isActive = !setEquals(activeColumnKeys, defaultColumnKeys);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={segCls(isActive)}
        aria-label={`${activeColumnKeys.size} of ${columnOptions.length} columns`}
      >
        <Columns3 className="h-3.5 w-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columnOptions.map((column) => (
          <OptionItem
            key={column.key}
            label={column.label}
            selected={activeColumnKeys.has(column.key)}
            onClick={() => onColumnToggle(column.key)}
          />
        ))}
        {isActive && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={onColumnsReset}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Reset columns
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── LinesOrganizePalette ──────────────────────────────────────────────────────

export function LinesOrganizePalette({
  entity,
  activeSortKey,
  activeFilterKeys,
  activeGroupKey,
  activeDensity,
  columnOptions,
  activeColumnKeys,
  defaultColumnKeys,
  onSortChange,
  onFilterToggle,
  onFilterClear,
  onGroupChange,
  onDensityChange,
  onColumnToggle,
  onColumnsReset,
}: LinesOrganizePaletteProps) {
  const organizer = useMemo(() => resolveLineOrganizer(entity), [entity]);

  if (!organizer) return null;

  const { defaultSort, defaultGroup, defaultDensity, filters, sorts, groups, densities } = organizer;

  const showFilter  = filters.length > 0;
  const showSort    = sorts.length > 0;
  const showGroup   = groups.length > 1;
  const showDensity = densities.length > 1;
  const showColumns = Boolean(
    columnOptions &&
    activeColumnKeys &&
    defaultColumnKeys &&
    onColumnToggle &&
    onColumnsReset &&
    columnOptions.length > 0,
  );

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-border/70 bg-muted/40 p-0.5 shadow-sm">
      {showFilter && (
        <FilterSegment
          filters={filters}
          activeFilterKeys={activeFilterKeys}
          onFilterToggle={onFilterToggle}
          onFilterClear={onFilterClear}
        />
      )}

      {showSort && (
        <SortSegment
          sorts={sorts}
          activeSortKey={activeSortKey}
          defaultSortKey={defaultSort}
          onSortChange={onSortChange}
        />
      )}

      {showGroup && (
        <GroupSegment
          groups={groups}
          activeGroupKey={activeGroupKey}
          defaultGroupKey={defaultGroup}
          onGroupChange={onGroupChange}
        />
      )}

      {showDensity && (
        <DensitySegment
          densities={densities}
          activeDensity={activeDensity}
          defaultDensity={defaultDensity}
          onDensityChange={onDensityChange}
        />
      )}

      {showColumns && columnOptions && activeColumnKeys && defaultColumnKeys && onColumnToggle && onColumnsReset && (
        <ColumnsSegment
          columnOptions={columnOptions}
          activeColumnKeys={activeColumnKeys}
          defaultColumnKeys={defaultColumnKeys}
          onColumnToggle={onColumnToggle}
          onColumnsReset={onColumnsReset}
        />
      )}
    </div>
  );
}
