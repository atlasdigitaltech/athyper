"use client";

import { useMemo, type ReactNode } from "react";
import { Clock3, ExternalLink, GripHorizontal, List, Loader2, X, Zap } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { SearchInput } from "./SearchInput";

export type AdvancedEntityChooserDensity = "mini" | "compact" | "comfortable" | "mobile";
export type AdvancedEntityChooserTone =
  | "default"
  | "muted"
  | "success"
  | "warning"
  | "destructive"
  | "info";

export interface AdvancedEntityChooserBadge {
  label: string;
  tone?: AdvancedEntityChooserTone;
  title?: string;
}

export interface AdvancedEntityChooserOption {
  value: string;
  label: string;
  code?: string;
  description?: string;
  href?: string;
  section?: string;
  badges?: AdvancedEntityChooserBadge[];
  disabled?: boolean;
}

export interface AdvancedEntityChooserControl {
  id: string;
  label: string;
  value: string;
  count?: number;
  disabled?: boolean;
}

export interface AdvancedEntityChooserSection {
  id: string;
  label: string;
}

export interface AdvancedEntityChooserFooterAction {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
  onSelect?: () => void;
}

export interface AdvancedEntityChooserMetaConfig {
  density?: AdvancedEntityChooserDensity;
  placeholder?: string;
  width?: number | string;
  listHeight?: number | string;
  maxListHeight?: number | string;
  controls?: AdvancedEntityChooserControl[];
  sections?: AdvancedEntityChooserSection[];
  footerActions?: AdvancedEntityChooserFooterAction[];
  showKeyboardHints?: boolean;
  optionActionLabel?: string;
}

export interface AdvancedEntityChooserPanelProps {
  query?: string;
  onQueryChange?: (query: string) => void;
  activeControlValue?: string | null;
  onControlChange?: (control: AdvancedEntityChooserControl) => void;
  selectedValue?: string | null;
  onSelect?: (option: AdvancedEntityChooserOption) => void;
  options: AdvancedEntityChooserOption[];
  loading?: boolean;
  meta?: AdvancedEntityChooserMetaConfig;
  optionActionLabel?: string;
  instantSearch?: boolean;
  onInstantSearchToggle?: () => void;
  loadedCount?: number;
  totalCount?: number;
  resultLabel?: string;
  onLoadMore?: () => void;
  loadMoreLoading?: boolean;
  title?: string;
  onClose?: () => void;
  emptyMessage?: string;
  className?: string;
  /** Show a drag-grip strip at the top so the panel can be repositioned. */
  draggable?: boolean;
  onDragHandleMouseDown?: (e: React.MouseEvent) => void;
  /** Show a resize handle at the bottom-right corner. */
  resizable?: boolean;
  onResizeHandleMouseDown?: (e: React.MouseEvent) => void;
}

const DENSITY = {
  mini: {
    panel: "rounded-md shadow-lg",
    header: "p-1.5",
    search: "h-8",
    controls: "mt-1.5 gap-1",
    control: "h-5 px-1.5 text-2xs",
    section: "px-2 py-1.5 text-2xs",
    row: "gap-2 px-2 py-1.5",
    label: "text-xs",
    meta: "text-2xs",
    badge: "h-4 px-1 text-2xs",
    footer: "px-2 py-1 text-2xs",
    defaultWidth: 300,
    defaultMaxHeight: 190,
  },
  compact: {
    panel: "rounded-md shadow-xl",
    header: "p-2",
    search: "h-8",
    controls: "mt-2 gap-1",
    control: "h-5 px-1.5 text-2xs",
    section: "px-2.5 py-1.5 text-2xs",
    row: "gap-2.5 px-2.5 py-2",
    label: "text-xs",
    meta: "text-2xs",
    badge: "h-4 px-1 text-2xs",
    footer: "px-2 py-1.5 text-2xs",
    defaultWidth: 340,
    defaultMaxHeight: 250,
  },
  comfortable: {
    panel: "rounded-md shadow-xl",
    header: "p-2.5",
    search: "h-9",
    controls: "mt-2 gap-1.5",
    control: "h-6 px-2 text-xs",
    section: "px-3 py-2 text-2xs",
    row: "gap-3 px-3 py-2.5",
    label: "text-xs",
    meta: "text-2xs",
    badge: "h-5 px-1.5 text-2xs",
    footer: "px-2.5 py-1.5 text-2xs",
    defaultWidth: 390,
    defaultMaxHeight: 310,
  },
  mobile: {
    panel: "rounded-t-xl shadow-2xl",
    header: "p-2.5",
    search: "h-9",
    controls: "mt-2 gap-1",
    control: "h-6 px-2 text-2xs",
    section: "px-3 py-2 text-2xs",
    row: "gap-2.5 px-3 py-2.5",
    label: "text-xs",
    meta: "text-2xs",
    badge: "h-5 px-1.5 text-2xs",
    footer: "px-3 py-2 text-2xs",
    defaultWidth: "100%",
    defaultMaxHeight: 300,
  },
} satisfies Record<AdvancedEntityChooserDensity, Record<string, string | number>>;

const BADGE_TONE: Record<AdvancedEntityChooserTone, string> = {
  default: "border-border bg-background text-foreground",
  muted: "border-border bg-muted text-muted-foreground",
  success: "border-success/20 bg-success/15 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/20 bg-destructive/15 text-destructive",
  info: "border-info/20 bg-info/15 text-info",
};

function cssLength(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export function AdvancedEntityChooserPanel({
  query = "",
  onQueryChange,
  activeControlValue,
  onControlChange,
  selectedValue,
  onSelect,
  options,
  loading = false,
  meta,
  optionActionLabel,
  instantSearch = false,
  onInstantSearchToggle,
  loadedCount,
  totalCount,
  resultLabel,
  onLoadMore,
  loadMoreLoading = false,
  title,
  onClose,
  emptyMessage = "No matches",
  className,
  draggable,
  onDragHandleMouseDown,
  resizable,
  onResizeHandleMouseDown,
}: AdvancedEntityChooserPanelProps) {
  const density = meta?.density ?? "compact";
  const d = DENSITY[density];
  const controls = meta?.controls ?? [];
  const displayOptions = useMemo(
    () => instantSearch ? options.filter((option) => optionMatchesQuery(option, query)) : options,
    [instantSearch, options, query],
  );
  const sections = meta?.sections ?? deriveSections(displayOptions);
  const width = meta?.width ?? d.defaultWidth;
  const listHeight = meta?.listHeight;
  const maxListHeight = meta?.maxListHeight ?? d.defaultMaxHeight;
  const hasHeaderTitle = !!title || !!onClose;
  const resolvedOptionActionLabel = optionActionLabel ?? meta?.optionActionLabel ?? "View record";
  const summaryLoadedCount = instantSearch ? displayOptions.length : (loadedCount ?? displayOptions.length);
  const hasResultSummary = totalCount !== undefined || resultLabel !== undefined;
  const hasFooter = hasResultSummary || !!onLoadMore || (meta?.footerActions?.length ?? 0) > 0;

  return (
    <div
      data-advanced-entity-chooser-panel="true"
      className={cn("relative overflow-hidden border bg-popover font-sans text-popover-foreground", d.panel, className)}
      style={{ width: cssLength(width) }}
    >
      {draggable && (
        <div
          onMouseDown={onDragHandleMouseDown}
          title="Drag to reposition"
          className="group flex cursor-grab items-center justify-center border-b py-0.5 select-none transition-colors duration-150 hover:bg-muted/50 active:cursor-grabbing active:bg-muted/70"
        >
          <GripHorizontal className="size-3 text-muted-foreground/30 transition-all duration-150 group-hover:scale-110 group-hover:text-muted-foreground/70 group-active:scale-90 group-active:text-muted-foreground/90" />
        </div>
      )}

      {hasHeaderTitle && (
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{title}</p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close chooser"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      <div className={cn("border-b", d.header)}>
        <SearchInput
          value={query}
          onSearch={(value) => onQueryChange?.(value)}
          debounceMs={0}
          loading={loading}
          placeholder={meta?.placeholder ?? "Search..."}
          aria-label={meta?.placeholder ?? "Search"}
          className={cn("w-full", d.search)}
          modeToggle={onInstantSearchToggle ? {
            active: instantSearch,
            onToggle: onInstantSearchToggle,
            activeLabel: "In view",
            inactiveLabel: "All",
            icon: <Zap className="size-3" />,
            title: instantSearch
              ? "Instant search: filtering loaded chooser results - click to search all records"
              : "Server search: querying all records - click to filter loaded chooser results instantly",
          } : undefined}
        />

        {controls.length > 0 && (
          <div className={cn("flex overflow-x-auto pb-0.5", d.controls)}>
            {controls.map((control) => {
              const active = activeControlValue === control.value;
              return (
                <button
                  key={control.id}
                  type="button"
                  disabled={control.disabled}
                  onClick={() => onControlChange?.(control)}
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full border font-semibold leading-none transition-colors disabled:opacity-50",
                    d.control,
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  <span>{control.label}</span>
                  {typeof control.count === "number" && (
                    <span className="ml-0.5 font-mono tabular-nums">-{control.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        data-advanced-entity-chooser-list="true"
        className="overflow-y-auto"
        style={{
          height: cssLength(listHeight),
          maxHeight: cssLength(maxListHeight),
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center px-3 py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : displayOptions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{emptyMessage}</div>
        ) : (
          sections.map((section) => {
            const sectionOptions = displayOptions.filter((option) => (option.section ?? "matches") === section.id);
            if (sectionOptions.length === 0) return null;

            return (
              <div key={section.id}>
                <div className={cn("flex items-center gap-2 border-b bg-muted/20 font-semibold uppercase text-muted-foreground", d.section)}>
                  <SectionIcon id={section.id} />
                  {section.label}
                </div>
                {sectionOptions.map((option) => (
                  <ChooserOptionRow
                    key={option.value}
                    option={option}
                    selected={selectedValue === option.value}
                    density={density}
                    optionActionLabel={resolvedOptionActionLabel}
                    onSelect={() => onSelect?.(option)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      {hasFooter && (
        <div className={cn("flex items-center justify-between border-t bg-muted/30 text-muted-foreground", d.footer)}>
          {hasResultSummary ? (
            <p className="min-w-0 truncate">
              Showing <span className="font-semibold text-foreground">{summaryLoadedCount.toLocaleString()}</span>
              {typeof totalCount === "number" && (
                <>
                  {" "}of <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span>
                </>
              )}
              {resultLabel && <> {resultLabel}</>}
            </p>
          ) : <span />}
          <div className="flex shrink-0 items-center gap-1.5">
            {onLoadMore && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loading || loadMoreLoading}
                className="inline-flex items-center rounded-sm border border-border bg-background px-1.5 py-0.5 font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading || loadMoreLoading ? "Loading..." : "Load more"}
              </button>
            )}
            {meta?.footerActions?.map((action) => {
              const content = (
                <>
                  {action.icon ?? <ExternalLink className="size-3" />}
                  {action.label}
                </>
              );

              if (action.href) {
                return (
                  <a
                    key={action.id}
                    href={action.href}
                    className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-background hover:text-foreground"
                  >
                    {content}
                  </a>
                );
              }

              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onSelect}
                  className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-background hover:text-foreground"
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {resizable && (
        <div
          onMouseDown={onResizeHandleMouseDown}
          title="Drag to resize"
          className="group absolute bottom-0 right-0 size-5 cursor-se-resize select-none flex items-end justify-end p-1"
        >
          <svg
            width="9" height="9" viewBox="0 0 9 9"
            className="text-muted-foreground/35 transition-all duration-150 group-hover:scale-125 group-hover:text-primary/60 group-active:scale-110 group-active:text-primary/80"
          >
            <circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" />
            <circle cx="4"   cy="7.5" r="1.1" fill="currentColor" />
            <circle cx="7.5" cy="4"   r="1.1" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}

function ChooserOptionRow({
  option,
  selected,
  density,
  optionActionLabel,
  onSelect,
}: {
  option: AdvancedEntityChooserOption;
  selected: boolean;
  density: AdvancedEntityChooserDensity;
  optionActionLabel: string;
  onSelect: () => void;
}) {
  const d = DENSITY[density];
  const metaLine = [option.code, option.description].filter(Boolean).join(" - ");

  return (
    <div
      className={cn(
        "group flex w-full items-stretch border-b border-l-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
        selected ? "border-l-primary bg-primary/10" : "border-l-transparent bg-popover",
      )}
    >
      <button
        type="button"
        disabled={option.disabled}
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center text-left disabled:cursor-not-allowed disabled:opacity-50",
          d.row,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-semibold leading-tight", d.label)}>{option.label}</p>
          {metaLine && (
            <p className={cn("mt-0.5 truncate font-mono text-muted-foreground", d.meta)}>
              {metaLine}
            </p>
          )}
        </div>
        {option.badges && option.badges.length > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            {option.badges.map((badge) => (
              <span
                key={`${option.value}-${badge.label}`}
                title={badge.title}
                className={cn(
                  "inline-flex items-center rounded-sm border font-mono font-semibold leading-none",
                  d.badge,
                  BADGE_TONE[badge.tone ?? "muted"],
                )}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </button>
      {option.href && (
        <a
          href={option.href}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          title={optionActionLabel}
          aria-label={`${optionActionLabel}: ${option.label}`}
          className="flex w-9 shrink-0 items-center justify-center text-muted-foreground opacity-70 transition hover:bg-background/70 hover:text-foreground hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function SectionIcon({ id }: { id: string }) {
  if (id === "recent") return <Clock3 className="size-3" />;
  if (id === "matches") return <List className="size-3" />;
  return <span className="h-1.5 w-1.5 rounded-full border border-muted-foreground/40" />;
}

function optionMatchesQuery(option: AdvancedEntityChooserOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    option.label,
    option.code,
    option.description,
    ...(option.badges ?? []).map((badge) => badge.label),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(needle));
}

function deriveSections(options: AdvancedEntityChooserOption[]): AdvancedEntityChooserSection[] {
  const ids = Array.from(new Set(options.map((option) => option.section ?? "matches")));
  return ids.map((id) => ({ id, label: id === "matches" ? "All matches" : labelFromId(id) }));
}

function labelFromId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
